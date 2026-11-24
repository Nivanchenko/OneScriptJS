import type { MaybePromise } from '../async';
import { isThenable } from '../async';
import type { ActiveFrame, Ctx, Interpreter } from '../interpreter';
import type { Scope } from '../scope';
import type { Value } from '../values';
import { toBoolean, typeName } from '../values';
import type { VariableInfo } from './values';
import {
  MAX_VARIABLES,
  childCount,
  childrenOf,
  isExpandable,
  isIndexedCollection,
  presentValue,
} from './values';

export type { VariableInfo } from './values';

/** Причина остановки (DAP `stopped.reason`). */
export type StopReason = 'entry' | 'breakpoint' | 'step' | 'pause' | 'exception';

/** Режим возобновления исполнения. */
export type StepMode = 'continue' | 'next' | 'stepIn' | 'stepOut';

/** Фильтр исключений (P2: учёт; полная семантика — W4). */
export type ExceptionFilter = 'uncaught' | 'all';

export interface DebugBreakpointSpec {
  /** Строка 1-based — начало исполняемого оператора. */
  line: number;
  condition?: string;
  logMessage?: string;
}

/** Источник для DAP `Source`; регистрируется адаптером/page-agent. */
export interface DebugSource {
  id: string;
  path?: string;
  url?: string;
  text: string;
  kind: 'file' | 'inline-html' | 'dynamic' | 'stdin';
}

export interface ThreadInfo {
  id: number;
  name: string;
  state: 'running' | 'paused' | 'terminated';
}

export interface FrameInfo {
  id: number;
  method: string;
  sourceId: string;
  line: number;
}

export interface ScopeInfo {
  name: string;
  variablesReference: number;
  expensive?: boolean;
}

/** События контроллера наружу (DAP-адаптер / page-agent). */
export interface DebugSink {
  stopped(threadId: number, reason: StopReason, frames: FrameInfo[], description?: string): void;
  continued(threadId: number, allThreads: boolean): void;
  output(category: 'stdout' | 'stderr' | 'console', text: string): void;
  threads(threads: ThreadInfo[]): void;
  terminated(exitCode?: number): void;
}

/** Снимок кадра на остановке: ссылки на область/контекст/интерпретатор живы. */
interface DebugFrameSnapshot {
  id: number;
  method: string;
  sourceId: string;
  line: number;
  scope: Scope;
  ctx: Ctx;
  interp: Interpreter;
}

interface DebugThread {
  id: number;
  name: string;
  state: 'running' | 'paused' | 'terminated';
  frames: DebugFrameSnapshot[];
  stepMode: StepMode;
  /** Глубина стека и ключ локации последней остановки — для семантики шагов. */
  stopDepth: number;
  stopKey?: string;
}

/** Ленивый контейнер переменных: область видимости или значение-коллекция. */
type RefContainer =
  | { kind: 'scope'; scope: Scope }
  | { kind: 'value'; value: Value; ancestors: ReadonlySet<object> };

const EMPTY_ANCESTORS: ReadonlySet<object> = new Set<object>();

export interface DebugControllerOptions {
  /** Остановиться на первом операторе (DAP `stopOnEntry`). */
  stopOnEntry?: boolean;
}

/**
 * Контроллер отладки BSL: брейкпоинты, шаги, пауза, потоки и снимок кадров.
 *
 * Пауза — `Promise`-гейт, который генератор интерпретатора отдаёт драйверу: стек
 * сохраняется нативно, страница не блокируется. Живёт на `RuntimeEnvironment`
 * (`env.debug`), поэтому форки заданий видят тот же контроллер.
 */
export class DebugController {
  private readonly sink: DebugSink;
  private readonly stopOnEntry: boolean;

  private readonly breakpoints = new Map<string, DebugBreakpointSpec[]>();
  private readonly sources = new Map<string, DebugSource>();
  private readonly exceptionFilters = new Set<ExceptionFilter>(['uncaught']);
  private readonly gates = new Set<() => void>();

  private readonly threadsById = new Map<number, DebugThread>();
  // Ключ потока — корневой интерпретатор invocation-а: массив кадров пересоздаётся
  // на каждый invocation, а интерпретатор импортированного модуля — не новый поток.
  private readonly threadIds = new WeakMap<object, number>();
  private readonly framesById = new Map<number, DebugFrameSnapshot>();
  private readonly refs = new Map<number, RefContainer>();

  private nextThreadId = 2;
  private nextFrameId = 0;
  private nextRef = 1;
  private paused = false;
  private pauseRequested = false;
  private entrySeen = false;
  private disabled = false;
  private evaluating = false;
  private lastPausedThread?: number;
  /** Главный поток заведён заранее; первый корневой интерпретатор занимает его id. */
  private mainThreadBound = false;
  /** Ошибки, на которых уже стояли: всплытие через внешние кадры не стопит повторно. */
  private stoppedErrors = new WeakSet<Error>();
  /** Ошибка, с паузы на которой продолжается всплытие после `resume`. */
  private unwindingError?: Error;

  constructor(sink: DebugSink, options?: DebugControllerOptions) {
    this.sink = sink;
    this.stopOnEntry = options?.stopOnEntry ?? false;
    // `threads` до первого останова показывает главный поток, а не пустой список.
    this.threadsById.set(1, {
      id: 1,
      name: 'Главный поток',
      state: 'running',
      frames: [],
      stepMode: 'continue',
      stopDepth: 0,
    });
  }

  /** Отладчик выключен после `stop()`. */
  get enabled(): boolean {
    return !this.disabled;
  }

  setBreakpoints(sourceId: string, breakpoints: DebugBreakpointSpec[]): void {
    if (breakpoints.length === 0) this.breakpoints.delete(sourceId);
    else this.breakpoints.set(sourceId, breakpoints.map((spec) => ({ ...spec })));
  }

  setExceptionFilters(filters: ExceptionFilter[]): void {
    this.exceptionFilters.clear();
    for (const filter of filters) this.exceptionFilters.add(filter);
  }

  registerSource(source: DebugSource): void {
    this.sources.set(source.id, source);
  }

  /** Хук на операторе. `undefined` — продолжать синхронно; Promise — пауза/уступка. */
  onStatement(
    interp: Interpreter,
    frame: ActiveFrame,
    line: number,
  ): Promise<void> | undefined {
    // Выражение `evaluate` исполняется в паузе и не должно само останавливать отладчик.
    if (this.disabled || this.evaluating) return undefined;
    try {
      return this.handleStatement(interp, frame, line);
    } catch (error) {
      // Ошибка отладчика не должна ломать исполнение скрипта.
      this.output('console', `Отладчик: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  requestPause(): void {
    if (this.disabled) return;
    this.pauseRequested = true;
  }

  /**
   * Хук на исключении. `undefined` — продолжать; Promise — пауза на исключении.
   * Вызывается из `exec` на каждом уровне всплытия, поэтому повторный стоп на том
   * же объекте ошибки подавляется.
   */
  onException(
    interp: Interpreter,
    frame: ActiveFrame,
    error: unknown,
  ): Promise<void> | undefined {
    if (this.disabled || this.evaluating) return undefined;
    // Сигналы управления (Возврат/Прервать/Продолжить/Перейти) — не Error.
    if (!(error instanceof Error)) return undefined;
    if (!this.exceptionFilters.has('all')) {
      if (!this.exceptionFilters.has('uncaught')) return undefined;
      // Внутри `Попытка` ошибка обработана; в блоке `Исключение` глубина уже 0.
      if (frame.guard.tryDepth !== 0) return undefined;
    }
    if (this.stoppedErrors.has(error)) return undefined;
    this.stoppedErrors.add(error);
    try {
      const thread = this.threadFor(interp);
      thread.stopDepth = interp.activeFrames.length;
      thread.stopKey = `${frame.module}\u0000${frame.line}\u0000${thread.stopDepth}`;
      this.unwindingError = error;
      return this.suspend(thread, 'exception', interp, error.message);
    } catch (failure) {
      // Ошибка отладчика не должна ломать исполнение скрипта.
      this.output(
        'console',
        `Отладчик: ${failure instanceof Error ? failure.message : String(failure)}`,
      );
      return undefined;
    }
  }

  /** Возобновляет все остановленные потоки в заданном режиме. */
  resume(mode: StepMode): void {
    if (this.disabled || !this.paused) return;
    const threadId = this.lastPausedThread ?? 1;
    for (const thread of this.threadsById.values()) {
      if (thread.state !== 'paused') continue;
      thread.stepMode = mode;
      if (mode === 'continue') thread.stopKey = undefined;
      thread.state = 'running';
    }
    this.paused = false;
    this.lastPausedThread = undefined;
    this.framesById.clear();
    this.refs.clear();
    this.stoppedErrors = new WeakSet();
    // Ошибка паузы ещё всплывает через внешние catch: без метки она стопит повторно.
    if (this.unwindingError !== undefined) this.stoppedErrors.add(this.unwindingError);
    this.unwindingError = undefined;
    this.sink.continued(threadId, true);
    this.releaseGates();
  }

  /** Снимает все гейты и выключает отладчик: ни один промис не остаётся висеть. */
  stop(): void {
    if (this.disabled) return;
    this.disabled = true;
    this.paused = false;
    this.pauseRequested = false;
    this.stoppedErrors = new WeakSet();
    this.unwindingError = undefined;
    for (const thread of this.threadsById.values()) thread.state = 'terminated';
    this.framesById.clear();
    this.refs.clear();
    this.releaseGates();
    this.sink.terminated();
  }

  threads(): ThreadInfo[] {
    return [...this.threadsById.values()].map((thread) => ({
      id: thread.id,
      name: thread.name,
      state: thread.state,
    }));
  }

  stackTrace(threadId: number): FrameInfo[] {
    return this.threadsById.get(threadId)?.frames.map(toFrameInfo) ?? [];
  }

  scopes(frameId: number): ScopeInfo[] {
    const frame = this.framesById.get(frameId);
    if (frame === undefined) return [];
    return [
      {
        name: 'Локальные',
        variablesReference: this.addRef({ kind: 'scope', scope: frame.scope }),
      },
      {
        name: 'Модуль',
        variablesReference: this.addRef({ kind: 'scope', scope: frame.ctx.moduleScope }),
      },
    ];
  }

  variables(ref: number): VariableInfo[] {
    const container = this.refs.get(ref);
    if (container === undefined) return [];
    if (container.kind === 'scope') {
      return container.scope
        .ownEntries()
        .slice(0, MAX_VARIABLES)
        .map((entry) => this.describe(entry.name, entry.value, EMPTY_ANCESTORS));
    }
    const nextAncestors = withAncestor(container.ancestors, container.value);
    return childrenOf(container.value)
      .slice(0, MAX_VARIABLES)
      .map((child) => this.describe(child.name, child.value, nextAncestors));
  }

  /** Вычисляет выражение в области остановленного кадра, не возобновляя исполнение. */
  evaluate(frameId: number, expression: string): MaybePromise<VariableInfo> {
    const frame = this.framesById.get(frameId);
    if (frame === undefined) throw new Error(`Кадр ${frameId} не найден`);
    const describe = (value: Value): VariableInfo =>
      this.describe(expression, value, EMPTY_ANCESTORS);
    this.evaluating = true;
    let result: MaybePromise<Value>;
    try {
      result = frame.interp.evaluateInFrame(frame.scope, frame.ctx, expression);
    } catch (error) {
      this.evaluating = false;
      throw error;
    }
    if (isThenable(result)) {
      return result.then(
        (value) => {
          this.evaluating = false;
          return describe(value);
        },
        (error: unknown) => {
          this.evaluating = false;
          throw error;
        },
      );
    }
    this.evaluating = false;
    return describe(result);
  }

  /** Вывод в DAP `output` (например, ошибка условия брейкпоинта). */
  output(category: 'stdout' | 'stderr' | 'console', text: string): void {
    try {
      this.sink.output(category, text);
    } catch {
      // Сбой транспорта не должен влиять на исполнение.
    }
  }

  private handleStatement(
    interp: Interpreter,
    frame: ActiveFrame,
    line: number,
  ): Promise<void> | undefined {
    const thread = this.threadFor(interp);
    // Пауза глобальна: новый BSL-вход (например, DOM-обработчик того же блока) или
    // другой поток не должен исполняться, пока идёт пауза. Повторный stopped не
    // нужен — поток просто держится гейтом до resume.
    if (this.paused) {
      thread.state = 'paused';
      return this.gate();
    }
    const depth = interp.activeFrames.length;
    const sourceId = frame.module;
    const locationKey = `${sourceId}\u0000${line}\u0000${depth}`;
    // Повторная остановка на той же (модуль, строка, глубина) подавляется: шаг по
    // операторам одной строки не должен останавливаться дважды.
    const sameLocation = thread.stopKey === locationKey;

    let reason: StopReason | undefined;
    let breakpointHit = false;
    if (!sameLocation && this.matchBreakpoint(sourceId, line, frame)) {
      reason = 'breakpoint';
      breakpointHit = true;
    }
    if (reason === undefined && !sameLocation && this.pauseRequested) {
      reason = 'pause';
      this.pauseRequested = false;
    }
    if (reason === undefined && this.stopOnEntry && !this.entrySeen) {
      reason = 'entry';
      this.entrySeen = true;
    }
    if (reason === undefined && !sameLocation) {
      switch (thread.stepMode) {
        case 'next':
          if (depth <= thread.stopDepth) reason = 'step';
          break;
        case 'stepIn':
          reason = 'step';
          break;
        case 'stepOut':
          if (depth < thread.stopDepth) reason = 'step';
          break;
        case 'continue':
          break;
      }
    }
    if (reason === undefined) return undefined;

    // Брейкпоинт, встреченный по пути шага, выигрывает и сбрасывает режим шага.
    if (breakpointHit) thread.stepMode = 'continue';
    thread.stopDepth = depth;
    thread.stopKey = locationKey;
    return this.suspend(thread, reason, interp);
  }

  private matchBreakpoint(sourceId: string, line: number, frame: ActiveFrame): boolean {
    const specs = this.breakpoints.get(sourceId);
    if (specs === undefined) return false;
    for (const spec of specs) {
      if (spec.line !== line) continue;
      if (spec.logMessage !== undefined) {
        // Logpoint: печать без остановки; условие, как у брейкпоинта, гейтит печать.
        if (spec.condition === undefined || this.conditionHolds(spec.condition, frame)) {
          this.logpoint(spec.logMessage, frame);
        }
        continue;
      }
      if (spec.condition === undefined || this.conditionHolds(spec.condition, frame)) {
        return true;
      }
    }
    return false;
  }

  /** Подставляет `{выражение}` в области кадра и печатает; пауза тут невозможна. */
  private logpoint(template: string, frame: ActiveFrame): void {
    const text = template.replace(/\{([^{}]*)\}/g, (_match, expression: string) => {
      // Ошибка в условии/интерполяции — не исключение отладки: иначе runtime-ошибка
      // всплывает в onException и даёт лишний стоп.
      this.evaluating = true;
      try {
        const value = frame.interp.evaluateInFrame(frame.scope, frame.ctx, expression);
        if (isThenable(value)) {
          // Хук оператора синхронный: асинхронное выражение не ждём, но и не роняем.
          value.catch(() => {});
          this.output('console', `Logpoint не может быть асинхронным: ${expression}`);
          return '';
        }
        return presentValue(value);
      } catch (error) {
        this.output(
          'console',
          `Ошибка logpoint: ${error instanceof Error ? error.message : String(error)}`,
        );
        return '';
      } finally {
        this.evaluating = false;
      }
    });
    this.output('console', text);
  }

  private conditionHolds(condition: string, frame: ActiveFrame): boolean {
    // Ошибка в условии — не исключение отладки: иначе runtime-ошибка всплывает в
    // onException и даёт лишний стоп.
    this.evaluating = true;
    try {
      const result = frame.interp.evaluateInFrame(frame.scope, frame.ctx, condition);
      if (isThenable(result)) {
        this.output('console', `Условие брейкпоинта не может быть асинхронным: ${condition}`);
        return false;
      }
      return toBoolean(result);
    } catch (error) {
      this.output(
        'console',
        `Ошибка условия брейкпоинта: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    } finally {
      this.evaluating = false;
    }
  }

  private suspend(
    thread: DebugThread,
    reason: StopReason,
    interp: Interpreter,
    description?: string,
  ): Promise<void> {
    // Первая остановка цикла «пауза» начинает новый набор кадров и ссылок.
    if (!this.paused) {
      this.framesById.clear();
      this.refs.clear();
      this.nextFrameId = 0;
      this.nextRef = 1;
    }
    thread.frames = this.captureFrames(interp);
    this.sink.stopped(thread.id, reason, thread.frames.map(toFrameInfo), description);
    thread.state = 'paused';
    this.paused = true;
    this.lastPausedThread = thread.id;
    return this.gate();
  }

  /** Promise-гейт паузы: `resume`/`stop` резолвят все накопленные гейты. */
  private gate(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.gates.add(resolve);
    });
  }

  private captureFrames(interp: Interpreter): DebugFrameSnapshot[] {
    const active = interp.activeFrames;
    const frames: DebugFrameSnapshot[] = [];
    // Кадры движка лежат изнутри наружу (первый — текущий).
    for (let i = active.length - 1; i >= 0; i--) {
      const frame = active[i]!;
      const snapshot: DebugFrameSnapshot = {
        id: this.nextFrameId++,
        method: frame.method,
        sourceId: frame.module,
        line: frame.line,
        scope: frame.scope,
        ctx: frame.ctx,
        interp: frame.interp,
      };
      this.framesById.set(snapshot.id, snapshot);
      frames.push(snapshot);
    }
    return frames;
  }

  private threadFor(interp: Interpreter): DebugThread {
    // Поток принадлежит корневому invocation-у: при вызове импортированного
    // модуля кадры вызывающего скопированы в новый интерпретатор, и его
    // `activeFrames[0]` — кадр главного интерпретатора. У фонового задания свой корень.
    const root = interp.activeFrames[0]?.interp ?? interp;
    const knownId = this.threadIds.get(root);
    if (knownId !== undefined) return this.threadsById.get(knownId)!;
    // Первый корневой интерпретатор — главный поток 1; форки заданий получают 2+.
    const isMain = !this.mainThreadBound;
    const id = isMain ? 1 : this.nextThreadId++;
    if (isMain) this.mainThreadBound = true;
    const thread: DebugThread = {
      id,
      name: id === 1 ? 'Главный поток' : `Фоновое задание ${id - 1}`,
      state: 'running',
      frames: [],
      stepMode: 'continue',
      stopDepth: 0,
    };
    this.threadIds.set(root, id);
    this.threadsById.set(id, thread);
    this.sink.threads(this.threads());
    return thread;
  }

  private addRef(container: RefContainer): number {
    const ref = this.nextRef++;
    this.refs.set(ref, container);
    return ref;
  }

  private describe(
    name: string,
    value: Value,
    ancestors: ReadonlySet<object>,
  ): VariableInfo {
    const variablesReference = this.childRef(value, ancestors);
    const info: VariableInfo = {
      name,
      value: presentValue(value),
      type: typeName(value),
      variablesReference,
    };
    if (variablesReference > 0 && isExpandable(value)) {
      if (isIndexedCollection(value)) info.indexedVariables = childCount(value);
      else info.namedVariables = childCount(value);
    }
    return info;
  }

  private childRef(value: Value, ancestors: ReadonlySet<object>): number {
    if (!isExpandable(value) || ancestors.has(value)) return 0;
    return this.addRef({ kind: 'value', value, ancestors });
  }

  private releaseGates(): void {
    const gates = [...this.gates];
    this.gates.clear();
    for (const resolve of gates) resolve();
  }
}

function toFrameInfo(frame: DebugFrameSnapshot): FrameInfo {
  return {
    id: frame.id,
    method: frame.method,
    sourceId: frame.sourceId,
    line: frame.line,
  };
}

function withAncestor(ancestors: ReadonlySet<object>, value: Value): ReadonlySet<object> {
  if (!isExpandable(value)) return ancestors;
  const next = new Set(ancestors);
  next.add(value);
  return next;
}
