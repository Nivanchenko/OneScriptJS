import type {
  AddHandlerStatement,
  BinaryExpression,
  CallExpression,
  Expression,
  ExpressionStatement,
  ForEachLoop,
  ForLoop,
  IndexExpression,
  LValue,
  MemberExpression,
  MethodDeclaration,
  Program,
  RemoveHandlerStatement,
  Statement,
  TryExceptStatement,
  UnaryExpression,
  WhileLoop,
} from '../ast/nodes';
import { stripBom, tokenize } from '../lexer/lexer';
import { parse } from '../parser/parser';
import { preprocess } from '../parser/preprocessor';
import { Ref, Scope } from './scope';
import { add, compare, dateFromBsl, equals, toBoolean, toNumber, toStringValue, typeName } from './values';
import type { Value } from './values';
import type { RuntimeEnvironment } from './context';
import { isBslObject } from './object';
import type { BslObject } from './object';
import { ScriptModuleObject } from './script-object';
import { BslErrorInfo } from './error-info';
import {
  DEFAULT_SOURCE_ID,
  EVAL_FRAME,
  EXECUTE_FRAME,
  HANDLER_FRAME,
  MODULE_FRAME,
  annotateError,
  getErrorSnapshot,
  setErrorSnapshot,
  sourceLineAt,
  splitSourceLines,
} from './error-snapshot';
import type { ErrorSnapshot, FrameSnapshot } from './error-snapshot';
import { checkDynamicExpression, checkDynamicNames, collectFrameLocals } from './dynamic-names';
import { BslPromise } from './promise';
import type { BslGenerator, DriveOptions, MaybePromise, SliceController } from './async';
import { TimeSlicer, drive, isThenable, yieldMaybe, yieldToHost } from './async';

interface Ctx {
  methods: Map<string, MethodDeclaration>;
  /** Область, в которой объявлен метод; нужна динамическим методам из `Выполнить`. */
  methodScopes: Map<string, Scope>;
  moduleScope: Scope;
  moduleVars: Set<string>;
  exportedVars: Set<string>;
  /** Источники методов из `Выполнить`/`Вычислить`/обработчиков (иначе — модуль). */
  methodSources: Map<string, MethodSource>;
  currentError: ErrorSnapshot | null;
  /** Фоновое задание, в котором исполняется этот контекст (для `ПолучитьТекущее`). */
  currentJob?: unknown;
}

/** Источник метода, объявленного в динамическом фрагменте. */
interface MethodSource {
  module: string;
  lines: readonly string[];
}

/** Кадр активного BSL-стека (изнутри наружу — при снятии снимка переворачивается). */
interface ActiveFrame {
  method: string;
  module: string;
  line: number;
  /** Строки исходника этого кадра — для `ИсходнаяСтрока` верхнего кадра. */
  lines: readonly string[];
}

/** Описание источника для `Interpreter` (модуль/фрагмент). */
export interface InterpreterSource {
  /** Идентификатор источника (`ИмяМодуля`); по умолчанию `<скрипт>`. */
  id?: string;
  /** Текст исходника — для `ИсходнаяСтрока`. */
  text?: string;
}

/**
 * Кадры вызывающего кода при переходе в другой `Interpreter` (модуль/класс):
 * у каждого интерпретатора свой стек, но ошибка должна видеть цепочку вызовов.
 * Живёт только на время синхронного входа в вызываемый интерпретатор; ссылка
 * на массив, без копирования — кадры читаются вызываемым синхронно при входе.
 */
let callerFrames: readonly ActiveFrame[] | undefined;

function withCallerFrames<T>(frames: readonly ActiveFrame[], action: () => T): T {
  const previous = callerFrames;
  callerFrames = frames;
  try {
    return action();
  } finally {
    callerFrames = previous;
  }
}

class ReturnSignal {
  constructor(readonly value: Value) {}
}
class BreakSignal {}
class ContinueSignal {}
class BslRuntimeError extends Error {
  constructor(
    readonly description: string,
    snapshot?: ErrorSnapshot,
  ) {
    super(description);
    this.name = 'BslRuntimeError';
    if (snapshot) setErrorSnapshot(this, snapshot);
  }
}
class GotoSignal {
  constructor(readonly label: string) {}
}

const key = (name: string): string => name.toLowerCase();

/**
 * Tree-walking интерпретатор BSL на генераторах.
 *
 * Синхронный скрипт драйвер исполняет до первого `yield` и возвращает обычное значение;
 * приостановка (`Приостановить`, ожидания фоновых заданий) делает исполнение асинхронным.
 * Управляющие сигналы — исключения, поэтому они проходят через `yield*`/`gen.throw` так же,
 * как в синхронной версии.
 */
export class Interpreter {
  private moduleCtx: Ctx | null = null;
  /** Объект текущего модуля; у загруженного сценария подменяется на `BslScript`. */
  ownerObject?: BslObject;
  private moduleObject?: ScriptModuleObject;
  /** Срез квантов: включается только у фоновых заданий. */
  slicer?: SliceController;
  /** Идентификатор источника модуля (для `ИмяМодуля`). */
  sourceId = DEFAULT_SOURCE_ID;
  /** Текст модуля (для `ИсходнаяСтрока`). */
  sourceText = '';
  private moduleLines?: readonly string[];
  /** Активный BSL-стек текущего invocation-а (устанавливается на каждом шаге drive). */
  private frames: ActiveFrame[] = [];

  constructor(
    readonly env: RuntimeEnvironment,
    source?: InterpreterSource,
  ) {
    if (source?.id !== undefined) this.sourceId = source.id;
    if (source?.text !== undefined) this.sourceText = source.text;
  }

  /** Строки исходника модуля (лениво). */
  private get lines(): readonly string[] {
    return (this.moduleLines ??= splitSourceLines(this.sourceText));
  }

  /** Кадры активного invocation-а изнутри наружу (первый — текущий). */
  private snapshotFrames(): FrameSnapshot[] {
    const result: FrameSnapshot[] = [];
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const frame = this.frames[i]!;
      result.push({ method: frame.method, module: frame.module, line: frame.line });
    }
    return result;
  }

  private pushFrame(method: string, module: string, lines: readonly string[]): void {
    this.frames.push({ method, module, line: 0, lines });
  }

  private popFrame(): void {
    this.frames.pop();
  }

  /** Кадр метода: для динамически объявленных — источник фрагмента, иначе — модуля. */
  private pushMethodFrame(method: MethodDeclaration): void {
    const source = this.moduleCtx?.methodSources.get(key(method.name));
    this.pushFrame(method.name, source?.module ?? this.sourceId, source?.lines ?? this.lines);
  }

  /**
   * Кадры нового invocation-а: при вызове из другого интерпретатора — копия
   * кадров вызывающего (чтобы стек переживал границу модулей), иначе — свои.
   */
  private startFrames(): ActiveFrame[] {
    if (this.frames.length > 0) return this.frames.map((frame) => ({ ...frame }));
    if (callerFrames && callerFrames.length > 0) {
      return callerFrames.map((frame) => ({ ...frame }));
    }
    return [];
  }

  /**
   * Запускает генератор invocation-а, устанавливая его собственный стек кадров
   * на каждом шаге: конкурентные async-вызовы на одном интерпретаторе не склеивают стеки.
   */
  private driveInvocation<T>(
    generator: BslGenerator<T>,
    frames: ActiveFrame[],
    options: DriveOptions = {},
  ): MaybePromise<T> {
    const saved = this.frames;
    this.frames = frames;
    try {
      return drive(generator, {
        beforeStep: () => {
          this.frames = frames;
          options.beforeStep?.();
        },
        afterStep: () => {
          options.afterStep?.();
          this.frames = saved;
        },
      });
    } finally {
      this.frames = saved;
    }
  }

  /** Аннотирует ошибку снимком текущего кадра (если снимка ещё нет). */
  private annotateAtCurrent(error: unknown): void {
    if (!(error instanceof Error) || getErrorSnapshot(error)) return;
    const frame = this.frames[this.frames.length - 1];
    annotateError(
      error,
      {
        module: frame?.module ?? this.sourceId,
        line: frame?.line ?? 0,
        sourceLine: frame ? sourceLineAt(frame.lines, frame.line) : '',
      },
      this.snapshotFrames(),
    );
  }

  /** Вызов объекта BSL с передачей кадров вызывающего в другой интерпретатор. */
  private callObject<T>(action: () => MaybePromise<T>): MaybePromise<T> {
    return withCallerFrames(this.frames, action);
  }

  /** `ЭтотОбъект` — объект текущего модуля (лениво создаётся). */
  getThisObject(): BslObject {
    if (this.ownerObject) return this.ownerObject;
    this.moduleObject ??= new ScriptModuleObject(this);
    return this.moduleObject;
  }

  /** Фоновое задание, в котором исполняется этот контекст (или `Неопределено`). */
  get currentJob(): unknown {
    return this.moduleCtx?.currentJob;
  }

  /**
   * Форкает интерпретатор для фонового задания: общие данные модуля (методы, переменные,
   * `ЭтотОбъект`) и собственный `Ctx` (вложенность ошибок, текущее задание, срез квантов).
   */
  forkForJob(task: unknown): Interpreter {
    const source = this.requireCtx();
    if (!this.ownerObject) this.getThisObject();
    const fork = new Interpreter(this.env);
    fork.moduleCtx = {
      methods: source.methods,
      methodScopes: source.methodScopes,
      moduleScope: source.moduleScope,
      moduleVars: source.moduleVars,
      exportedVars: source.exportedVars,
      methodSources: source.methodSources,
      currentError: null,
      currentJob: task,
    };
    fork.ownerObject = this.ownerObject;
    fork.moduleObject = this.moduleObject;
    fork.slicer = new TimeSlicer();
    fork.sourceId = this.sourceId;
    fork.sourceText = this.sourceText;
    return fork;
  }

  /** Оценивает константное выражение (для препроцессора). */
  static evaluate(expr: Expression): Value {
    const ctx: Ctx = {
      methods: new Map(),
      methodScopes: new Map(),
      moduleScope: new Scope(),
      moduleVars: new Set(),
      exportedVars: new Set(),
      methodSources: new Map(),
      currentError: null,
    };
    const env: RuntimeEnvironment = {
      call: () => undefined,
      construct: (typeName) => {
        throw new Error(`Тип '${typeName}' не найден`);
      },
    };
    const interpreter = new Interpreter(env);
    const result = drive(interpreter.eval(expr, ctx.moduleScope, ctx));
    if (isThenable(result)) throw new Error('Константное выражение не может быть асинхронным');
    return result;
  }

  run(program: Program): MaybePromise<void> {
    const ctx: Ctx = {
      methods: new Map(),
      methodScopes: new Map(),
      moduleScope: new Scope(),
      moduleVars: new Set(),
      exportedVars: new Set(),
      methodSources: new Map(),
      currentError: null,
    };
    for (const stmt of program.body) {
      if (stmt.kind === 'MethodDeclaration') ctx.methods.set(key(stmt.name), stmt);
      else if (stmt.kind === 'VariableDeclaration') {
        const exported = new Set((stmt.exportedNames ?? []).map(key));
        for (const name of stmt.names) {
          ctx.moduleVars.add(key(name));
          ctx.moduleScope.set(name, undefined);
          if (exported.has(key(name))) ctx.exportedVars.add(key(name));
        }
      }
    }
    const executable = program.body.filter(
      (s) => s.kind !== 'MethodDeclaration' && s.kind !== 'VariableDeclaration',
    );
    // Модуль «существует» уже во время исполнения своего тела: `ЭтотОбъект` и
    // события должны работать в том числе из инициализирующего кода.
    this.moduleCtx = ctx;
    // Слоты локалей кадра — до исполнения, чтобы динамический код видел их как
    // `Неопределено` даже до присваивания (как `_currentFrame.Locals` в эталоне).
    this.declareFrameLocals(executable, ctx.moduleScope);
    return this.driveInvocation(
      this.runGen(executable, ctx.moduleScope, ctx),
      this.startFrames(),
    );
  }

  private *runGen(executable: Statement[], scope: Scope, ctx: Ctx): BslGenerator<void> {
    this.pushFrame(MODULE_FRAME, this.sourceId, this.lines);
    try {
      yield* this.execGotoBlock(executable, scope, ctx);
    } finally {
      this.popFrame();
    }
  }

  /**
   * Материализует локальные имена кадра до исполнения тела: эталон выделяет слоты
   * всех локалей на компиляции, поэтому динамический код видит их как `Неопределено`.
   */
  private declareFrameLocals(body: Statement[], scope: Scope): void {
    const { declared, assigned } = collectFrameLocals(body);
    // Явные `Перем` — локальные этого кадра (тень внешних имён, как в эталоне).
    for (const name of declared) scope.declare(name);
    // Присваивание создаёт локаль, только если имя не видно из внешних областей
    // (иначе это запись в переменную модуля/вызывающего) — как VisitVariableWrite.
    for (const name of assigned) {
      if (scope.findBinding(name) === undefined) scope.declare(name);
    }
  }

  /** Вызывает метод модуля по имени с готовыми значениями (для тестового раннера). */
  invokeMethod(name: string, values: Value[]): MaybePromise<Value> {
    return this.driveInvocation(this.invokeMethodGen(name, values), this.startFrames());
  }

  private *invokeMethodGen(name: string, values: Value[]): BslGenerator<Value> {
    const ctx = this.moduleCtx;
    if (!ctx) throw new Error('Модуль ещё не выполнен');
    const method = ctx.methods.get(key(name));
    if (!method) throw new Error(`Метод '${name}' не найден`);
    const localScope = new Scope(ctx.methodScopes.get(key(name)) ?? ctx.moduleScope);
    this.declareFrameLocals(method.body, localScope);
    for (let i = 0; i < method.params.length; i++) {
      const p = method.params[i]!;
      if (i < values.length) {
        localScope.set(p.name, values[i]);
      } else if (p.defaultValue) {
        localScope.set(p.name, yield* this.eval(p.defaultValue, ctx.moduleScope, ctx));
      } else {
        localScope.set(p.name, undefined);
      }
    }
    this.pushMethodFrame(method);
    try {
      try {
        yield* this.execGotoBlock(method.body, localScope, ctx);
      } catch (e) {
        if (e instanceof ReturnSignal) return e.value;
        throw e;
      }
      return undefined;
    } finally {
      this.popFrame();
    }
  }

  /**
   * Исполняет код в области видимости модуля (обработчики событий, REPL и т.п.).
   * Дополнительные переменные (`vars`) видны коду и не меняют модуль.
   */
  executeInModule(
    source: string,
    vars?: Record<string, Value>,
    frame?: { method?: string; module?: string },
  ): MaybePromise<void> {
    return this.driveInvocation(
      this.executeInModuleGen(source, vars, frame),
      this.startFrames(),
    );
  }

  private *executeInModuleGen(
    source: string,
    vars?: Record<string, Value>,
    frame?: { method?: string; module?: string },
  ): BslGenerator<void> {
    const ctx = this.moduleCtx;
    if (!ctx) throw new Error('Модуль ещё не выполнен');
    const scope = new Scope(ctx.moduleScope);
    if (vars) for (const [name, value] of Object.entries(vars)) scope.set(name, value);
    yield* this.execDynamic(source, scope, ctx, {
      method: frame?.method ?? HANDLER_FRAME,
      module: frame?.module ?? this.sourceId,
    });
  }

  /** Есть ли у модуля метод с таким именем. */
  hasMethod(name: string): boolean {
    return this.moduleCtx?.methods.has(key(name)) ?? false;
  }

  /** Есть ли у модуля экспортный метод с таким именем. */
  hasExportedMethod(name: string): boolean {
    return this.moduleCtx?.methods.get(key(name))?.exported ?? false;
  }

  /** Вызывает экспортный метод модуля; неэкспортный снаружи недоступен. */
  callExportedMethod(name: string, values: Value[], options?: DriveOptions): MaybePromise<Value> {
    if (!this.hasExportedMethod(name)) throw new Error(`Метод '${name}' не найден`);
    const method = this.requireCtx().methods.get(key(name));
    if (method?.isAsync) return this.startAsyncMethod(method, values);
    return this.driveInvocation(this.invokeMethodGen(name, values), this.startFrames(), options);
  }

  /**
   * Запускает async-метод: исполнение идёт до первой приостановки, результат/ошибка
   * попадают в `Обещание` (синхронно вызывающему не бросаются).
   */
  private startAsyncMethod(method: MethodDeclaration, values: Value[]): BslPromise {
    // Async-исполнение уступает хост по квантам, чтобы страница не замирала.
    this.slicer ??= new TimeSlicer();
    const promise = new BslPromise(this.env);
    let driven: MaybePromise<Value>;
    try {
      driven = this.driveInvocation(this.invokeAsyncGen(method, values), this.startFrames());
    } catch (error) {
      promise.reject(error);
      return promise;
    }
    if (isThenable(driven)) {
      void driven.then(
        (value) => promise.resolve(value),
        (error: unknown) => promise.reject(error),
      );
    } else {
      promise.resolve(driven);
    }
    return promise;
  }

  private *invokeAsyncGen(method: MethodDeclaration, values: Value[]): BslGenerator<Value> {
    const ctx = this.requireCtx();
    const localScope = new Scope(ctx.methodScopes.get(key(method.name)) ?? ctx.moduleScope);
    this.declareFrameLocals(method.body, localScope);
    for (let i = 0; i < method.params.length; i++) {
      const p = method.params[i]!;
      let value: Value;
      if (i < values.length) value = values[i];
      else if (p.defaultValue) value = yield* this.eval(p.defaultValue, ctx.moduleScope, ctx);
      else value = undefined;
      // Параметры async-методов передаются только по значению (как в 1C).
      localScope.set(p.name, value);
    }
    this.pushMethodFrame(method);
    try {
      try {
        yield* this.execGotoBlock(method.body, localScope, ctx);
      } catch (e) {
        if (e instanceof ReturnSignal) return e.value;
        throw e;
      }
      return undefined;
    } finally {
      this.popFrame();
    }
  }

  /** Объявлена ли переменная с таким именем как экспортная. */
  hasExportedVar(name: string): boolean {
    return this.moduleCtx?.exportedVars.has(key(name)) ?? false;
  }

  getExportedVar(name: string): Value {
    const ctx = this.requireCtx();
    if (!ctx.exportedVars.has(key(name))) throw new Error(`Свойство '${name}' не найдено`);
    return ctx.moduleScope.get(name);
  }

  setExportedVar(name: string, value: Value): void {
    const ctx = this.requireCtx();
    if (!ctx.exportedVars.has(key(name))) throw new Error(`Свойство '${name}' не найдено`);
    ctx.moduleScope.set(name, value);
  }

  /** Есть ли в модуле конструктор `ПриСозданииОбъекта`/`OnObjectCreate`. */
  hasConstructor(): boolean {
    return this.getConstructor() !== undefined;
  }

  getConstructor(): MethodDeclaration | undefined {
    const ctx = this.moduleCtx;
    if (!ctx) return undefined;
    return ctx.methods.get(key('ПриСозданииОбъекта')) ?? ctx.methods.get(key('OnObjectCreate'));
  }

  getMethod(name: string): MethodDeclaration | undefined {
    return this.moduleCtx?.methods.get(key(name));
  }

  private requireCtx(): Ctx {
    if (!this.moduleCtx) throw new Error('Модуль ещё не выполнен');
    return this.moduleCtx;
  }

  /**
   * Вызывает метод модуля, связывая все параметры по ссылке, и возвращает их
   * значения после вызова (поддержка out-параметров вроде
   * `ОбработкаПолученияПредставления(Представление, СтандартнаяОбработка)`).
   */
  invokeMethodWithOutputs(name: string, values: Value[]): MaybePromise<Value[]> {
    return this.driveInvocation(
      this.invokeMethodWithOutputsGen(name, values),
      this.startFrames(),
    );
  }

  private *invokeMethodWithOutputsGen(name: string, values: Value[]): BslGenerator<Value[]> {
    const ctx = this.moduleCtx;
    if (!ctx) throw new Error('Модуль ещё не выполнен');
    const method = ctx.methods.get(key(name));
    if (!method) throw new Error(`Метод '${name}' не найден`);
    const localScope = new Scope(ctx.moduleScope);
    this.declareFrameLocals(method.body, localScope);
    const boxes: Value[] = [];
    for (let i = 0; i < method.params.length; i++) {
      const p = method.params[i]!;
      if (i < values.length) boxes.push(values[i]);
      else if (p.defaultValue) boxes.push(yield* this.eval(p.defaultValue, ctx.moduleScope, ctx));
      else boxes.push(undefined);
    }
    method.params.forEach((p, i) => {
      localScope.bindRef(p.name, new Ref(() => boxes[i], (v) => { boxes[i] = v; }));
    });
    this.pushMethodFrame(method);
    try {
      try {
        yield* this.execGotoBlock(method.body, localScope, ctx);
      } catch (e) {
        if (!(e instanceof ReturnSignal)) throw e;
      }
      return boxes;
    } finally {
      this.popFrame();
    }
  }

  private *execBlock(body: Statement[], scope: Scope, ctx: Ctx): BslGenerator<void> {
    for (const stmt of body) yield* this.exec(stmt, scope, ctx);
  }

  private *execGotoBlock(body: Statement[], scope: Scope, ctx: Ctx): BslGenerator<void> {
    const labels = new Map<string, number>();
    body.forEach((s, i) => {
      if (s.kind === 'LabelStatement') labels.set(key(s.name), i);
    });

    let i = 0;
    while (i < body.length) {
      const stmt = body[i]!;
      try {
        yield* this.exec(stmt, scope, ctx);
      } catch (e) {
        if (e instanceof GotoSignal) {
          const target = labels.get(e.label);
          if (target === undefined) {
            const error = new BslRuntimeError(`Метка '~${e.label}' не найдена`);
            this.annotateAtCurrent(error);
            throw error;
          }
          i = target;
          continue;
        }
        throw e;
      }
      i++;
    }
  }

  private *exec(stmt: Statement, scope: Scope, ctx: Ctx): BslGenerator<void> {
    if (this.slicer?.due()) yield yieldToHost();
    // Позиция текущего кадра — строка оператора; снимок снимается при ошибке.
    const frame = this.frames[this.frames.length - 1];
    if (frame) frame.line = stmt.pos.line;
    try {
      yield* this.execStatement(stmt, scope, ctx);
    } catch (e) {
      this.annotateAtCurrent(e);
      throw e;
    }
  }

  private *execStatement(stmt: Statement, scope: Scope, ctx: Ctx): BslGenerator<void> {
    switch (stmt.kind) {
      case 'Assignment': {
        const value = yield* this.eval(stmt.value, scope, ctx);
        yield* this.assign(stmt.target, value, scope, ctx);
        break;
      }
      case 'IfStatement': {
        const condition = yield* this.eval(stmt.condition, scope, ctx);
        if (toBoolean(condition)) {
          yield* this.execBlock(stmt.thenBranch, scope, ctx);
        } else if (stmt.elseBranch) {
          if (Array.isArray(stmt.elseBranch)) {
            yield* this.execBlock(stmt.elseBranch, scope, ctx);
          } else {
            yield* this.exec(stmt.elseBranch, scope, ctx);
          }
        }
        break;
      }
      case 'ExpressionStatement':
        yield* this.eval(stmt.expression, scope, ctx);
        break;
      case 'ReturnStatement': {
        const value =
          stmt.value === undefined ? undefined : (yield* this.eval(stmt.value, scope, ctx));
        throw new ReturnSignal(value);
      }
      case 'MethodDeclaration':
      case 'VariableDeclaration':
        break; // собираются в run()
      case 'ForLoop':
        yield* this.execForLoop(stmt, scope, ctx);
        break;
      case 'WhileLoop':
        yield* this.execWhileLoop(stmt, scope, ctx);
        break;
      case 'ForEachLoop':
        yield* this.execForEachLoop(stmt, scope, ctx);
        break;
      case 'BreakStatement':
        throw new BreakSignal();
      case 'ContinueStatement':
        throw new ContinueSignal();
      case 'TryExceptStatement':
        yield* this.execTryExcept(stmt, scope, ctx);
        break;
      case 'RaiseStatement': {
        const value =
          stmt.value === undefined ? undefined : (yield* this.eval(stmt.value, scope, ctx));
        // Без аргумента `ВызватьИсключение;` перевыбрасывает текущее исключение
        // с исходным снимком: позиция и стек остаются от места возникновения.
        if (value === undefined) {
          const previous = ctx.currentError;
          throw new BslRuntimeError(previous?.description ?? '', previous ?? undefined);
        }
        // `ВызватьИсключение ИнформацияОбОшибке()` сохраняет исходный снимок (R5).
        if (value instanceof BslErrorInfo) {
          throw new BslRuntimeError(value.description, value.snapshot);
        }
        // Новое значение — новый снимок в позиции строки перевыброса.
        throw new BslRuntimeError(toStringValue(value));
      }
      case 'ExecuteStatement': {
        const source = toStringValue(yield* this.eval(stmt.value, scope, ctx));
        yield* this.execDynamic(source, scope, ctx);
        break;
      }
      case 'AddHandlerStatement':
        yield* this.execAddHandler(stmt, scope, ctx);
        break;
      case 'RemoveHandlerStatement':
        yield* this.execRemoveHandler(stmt, scope, ctx);
        break;
      case 'LabelStatement':
        break; // маркер — no-op
      case 'GotoStatement':
        throw new GotoSignal(key(stmt.label));
    }
  }

  /** Подписка: `ДобавитьОбработчик <источник>.<событие>, <обработчик>`. */
  private *execAddHandler(stmt: AddHandlerStatement, scope: Scope, ctx: Ctx): BslGenerator<void> {
    const events = this.env.events;
    if (!events) throw new Error('Реестр событий недоступен в этом окружении');
    const source = yield* this.eval(stmt.eventSource, scope, ctx);
    if (!isBslObject(source)) {
      throw new Error(`Источник события должен быть объектом, а не ${typeName(source)}`);
    }
    const eventName = toStringValue(yield* this.eval(stmt.eventName, scope, ctx));
    const method = toStringValue(yield* this.eval(stmt.handlerMethod, scope, ctx));
    if (stmt.handlerTarget === null) {
      // Локальная форма: метод текущего модуля, проверка экспорта не нужна.
      events.add(source, eventName, this.getThisObject(), method, true, (args) =>
        this.invokeMethod(method, args),
      );
      return;
    }
    const target = yield* this.eval(stmt.handlerTarget, scope, ctx);
    if (!isBslObject(target)) {
      throw new Error(`Обработчик должен быть объектом, а не ${typeName(target)}`);
    }
    events.add(source, eventName, target, method, false);
  }

  /** Отписка: `УдалитьОбработчик <источник>.<событие>, <обработчик>`. */
  private *execRemoveHandler(stmt: RemoveHandlerStatement, scope: Scope, ctx: Ctx): BslGenerator<void> {
    const events = this.env.events;
    if (!events) throw new Error('Реестр событий недоступен в этом окружении');
    const source = yield* this.eval(stmt.eventSource, scope, ctx);
    if (!isBslObject(source)) {
      throw new Error(`Источник события должен быть объектом, а не ${typeName(source)}`);
    }
    const eventName = toStringValue(yield* this.eval(stmt.eventName, scope, ctx));
    const method = toStringValue(yield* this.eval(stmt.handlerMethod, scope, ctx));
    const target =
      stmt.handlerTarget === null
        ? this.getThisObject()
        : (yield* this.eval(stmt.handlerTarget, scope, ctx));
    if (!isBslObject(target)) {
      throw new Error(`Обработчик должен быть объектом, а не ${typeName(target)}`);
    }
    events.remove(source, eventName, target, method);
  }

  private *execForLoop(stmt: ForLoop, scope: Scope, ctx: Ctx): BslGenerator<void> {
    const from = toNumber(yield* this.eval(stmt.from, scope, ctx));
    const to = toNumber(yield* this.eval(stmt.to, scope, ctx));
    let completed = true;
    for (let i = from; i <= to; i++) {
      this.setVariable(stmt.variable, i, scope, ctx);
      try {
        yield* this.execBlock(stmt.body, scope, ctx);
      } catch (e) {
        if (e instanceof BreakSignal) {
          completed = false;
          break;
        }
        if (e instanceof ContinueSignal) continue;
        throw e;
      }
    }
    // Как в 1С: после нормального завершения переменная цикла равна «по + 1».
    if (completed) this.setVariable(stmt.variable, to + 1, scope, ctx);
  }

  private *execWhileLoop(stmt: WhileLoop, scope: Scope, ctx: Ctx): BslGenerator<void> {
    while (toBoolean(yield* this.eval(stmt.condition, scope, ctx))) {
      try {
        yield* this.execBlock(stmt.body, scope, ctx);
      } catch (e) {
        if (e instanceof BreakSignal) break;
        if (e instanceof ContinueSignal) continue;
        throw e;
      }
    }
  }

  private *execForEachLoop(stmt: ForEachLoop, scope: Scope, ctx: Ctx): BslGenerator<void> {
    const collection = yield* this.eval(stmt.collection, scope, ctx);
    if (!isBslObject(collection) || !collection.iterate) {
      throw new Error('Для Каждого: значение не является коллекцией');
    }
    for (const item of collection.iterate()) {
      this.setVariable(stmt.variable, item, scope, ctx);
      try {
        yield* this.execBlock(stmt.body, scope, ctx);
      } catch (e) {
        if (e instanceof BreakSignal) break;
        if (e instanceof ContinueSignal) continue;
        throw e;
      }
    }
  }

  private *execTryExcept(stmt: TryExceptStatement, scope: Scope, ctx: Ctx): BslGenerator<void> {
    try {
      yield* this.execBlock(stmt.tryBody, scope, ctx);
    } catch (e) {
      // BSL: Попытка/Исключение ловит любые ошибки рантайма, в т.ч. ошибки stdlib
      // (обычный Error), а не только ВызватьИсключение. Сигналы управления
      // (Return/Break/Continue/Goto) — не Error, пропускаются.
      if (e instanceof Error) {
        const prev = ctx.currentError;
        // Снимок уже снят на границе оператора возникновения; здесь — страховка.
        this.annotateAtCurrent(e);
        ctx.currentError = getErrorSnapshot(e) ?? null;
        try {
          yield* this.execBlock(stmt.exceptBody, scope, ctx);
        } finally {
          ctx.currentError = prev;
        }
      } else {
        throw e;
      }
    }
  }

  private *eval(expr: Expression, scope: Scope, ctx: Ctx): BslGenerator<Value> {
    switch (expr.kind) {
      case 'NumberLiteral':
      case 'StringLiteral':
      case 'BooleanLiteral':
        return expr.value;
      case 'DateLiteral':
        return dateFromBsl(expr.value);
      case 'NullLiteral':
        return null;
      case 'UndefinedLiteral':
        return undefined;
      case 'Identifier': {
        const value = scope.get(expr.name);
        if (value !== undefined) return value;
        const global = this.env.resolveGlobal?.(expr.name);
        if (global !== undefined) return global;
        // Встроенное имя: разрешается после области видимости и глобалов.
        if (key(expr.name) === 'этотобъект' || key(expr.name) === 'thisobject') {
          return this.getThisObject();
        }
        return undefined;
      }
      case 'BinaryExpression':
        return yield* this.evalBinary(expr, scope, ctx);
      case 'UnaryExpression':
        return yield* this.evalUnary(expr, scope, ctx);
      case 'CallExpression':
        return yield* this.evalCall(expr, scope, ctx);
      case 'MemberExpression':
        return yield* this.evalMember(expr, scope, ctx);
      case 'IndexExpression':
        return yield* this.evalIndex(expr, scope, ctx);
      case 'TernaryExpression': {
        const condition = yield* this.eval(expr.condition, scope, ctx);
        if (toBoolean(condition)) return yield* this.eval(expr.then, scope, ctx);
        return yield* this.eval(expr.else, scope, ctx);
      }
      case 'AwaitExpression': {
        const value = yield* this.eval(expr.operand, scope, ctx);
        if (value instanceof BslPromise) return yield* yieldMaybe(value.await());
        // Ожидание не-Обещания возвращает значение как есть.
        return value;
      }
      case 'NewObjectExpression': {
        const args = yield* this.evalArgs(expr.args, scope, ctx);
        return yield* yieldMaybe(this.callObject(() => this.env.construct(expr.typeName, args)));
      }
    }
  }

  private *evalArgs(exprs: Expression[], scope: Scope, ctx: Ctx): BslGenerator<Value[]> {
    const values: Value[] = [];
    for (const expr of exprs) values.push(yield* this.eval(expr, scope, ctx));
    return values;
  }

  private *evalBinary(expr: BinaryExpression, scope: Scope, ctx: Ctx): BslGenerator<Value> {
    // и/или — с коротким замыканием.
    if (expr.operator === 'и') {
      const left = yield* this.eval(expr.left, scope, ctx);
      return toBoolean(left) && toBoolean(yield* this.eval(expr.right, scope, ctx));
    }
    if (expr.operator === 'или') {
      const left = yield* this.eval(expr.left, scope, ctx);
      return toBoolean(left) || toBoolean(yield* this.eval(expr.right, scope, ctx));
    }

    const left = yield* this.eval(expr.left, scope, ctx);
    const right = yield* this.eval(expr.right, scope, ctx);
    switch (expr.operator) {
      case '+':
        return add(left, right);
      case '-':
        return toNumber(left) - toNumber(right);
      case '*':
        return toNumber(left) * toNumber(right);
      case '/': {
        const divisor = toNumber(right);
        if (divisor === 0) throw new BslRuntimeError('Деление на ноль');
        return toNumber(left) / divisor;
      }
      case '%':
        return toNumber(left) % toNumber(right);
      case '=':
        return equals(left, right);
      case '<>':
        return !equals(left, right);
      case '<':
        return compare(left, right) < 0;
      case '>':
        return compare(left, right) > 0;
      case '<=':
        return compare(left, right) <= 0;
      case '>=':
        return compare(left, right) >= 0;
      default:
        throw new Error(`Неизвестный оператор: ${expr.operator}`);
    }
  }

  private *evalUnary(expr: UnaryExpression, scope: Scope, ctx: Ctx): BslGenerator<Value> {
    const operand = yield* this.eval(expr.operand, scope, ctx);
    switch (expr.operator) {
      case '+':
        return toNumber(operand);
      case '-':
        return -toNumber(operand);
      case 'не':
        return !toBoolean(operand);
      default:
        throw new Error(`Неизвестный унарный оператор: ${expr.operator}`);
    }
  }

  private *evalCall(expr: CallExpression, scope: Scope, ctx: Ctx): BslGenerator<Value> {
    if (expr.callee.kind === 'Identifier') {
      const lower = key(expr.callee.name);
      // shortcut: Вычислить живёт здесь — нужен доступ к текущей области видимости.
      if (lower === 'вычислить' || lower === 'eval') {
        const code = toStringValue(yield* this.eval(expr.args[0]!, scope, ctx));
        return yield* this.evalDynamicExpression(code, scope, ctx);
      }
      // shortcut: ОписаниеОшибки/ИнформацияОбОшибке живут здесь — нужен доступ к текущему исключению.
      if (lower === 'описаниеошибки' || lower === 'errordescription') {
        return ctx.currentError?.description ?? '';
      }
      if (lower === 'информацияобошибке' || lower === 'errorinfo') {
        return new BslErrorInfo(ctx.currentError ?? undefined);
      }
      // shortcut: ВызватьСобытие живёт здесь — событие объявляется на объекте текущего модуля.
      if (lower === 'вызватьсобытие' || lower === 'raiseevent') {
        const name = toStringValue(yield* this.eval(expr.args[0]!, scope, ctx));
        const value = expr.args[1] === undefined ? undefined : yield* this.eval(expr.args[1]!, scope, ctx);
        const params = isBslObject(value) && value.iterate ? value.iterate() : [];
        yield* yieldMaybe(
          this.callObject(() => this.env.events?.raise(this.getThisObject(), name, params)),
        );
        return undefined;
      }
      const method = ctx.methods.get(lower);
      if (method) {
        if (method.isAsync) {
          const values = yield* this.evalArgs(expr.args, scope, ctx);
          return this.startAsyncMethod(method, values);
        }
        return yield* this.callMethod(method, expr.args, scope, ctx);
      }
      const args = yield* this.evalArgs(expr.args, scope, ctx);
      return yield* yieldMaybe(this.env.call(expr.callee.name, args));
    }

    if (expr.callee.kind === 'MemberExpression') {
      const obj = yield* this.eval(expr.callee.object, scope, ctx);
      if (!isBslObject(obj)) {
        throw new Error(`Метод '${expr.callee.property}' недоступен для ${typeName(obj)}`);
      }
      const property = expr.callee.property;
      const args = yield* this.evalArgs(expr.args, scope, ctx);
      return yield* yieldMaybe(this.callObject(() => obj.callMethod(property, args)));
    }

    throw new Error('Недопустимый вызов функции');
  }

  private *evalMember(expr: MemberExpression, scope: Scope, ctx: Ctx): BslGenerator<Value> {
    const obj = yield* this.eval(expr.object, scope, ctx);
    if (!isBslObject(obj)) {
      throw new Error(`Свойство '${expr.property}' недоступно для ${typeName(obj)}`);
    }
    return yield* yieldMaybe(obj.getProp(expr.property));
  }

  private *evalIndex(expr: IndexExpression, scope: Scope, ctx: Ctx): BslGenerator<Value> {
    const obj = yield* this.eval(expr.object, scope, ctx);
    const index = yield* this.eval(expr.index, scope, ctx);
    if (!isBslObject(obj)) {
      throw new Error(`Индексация недоступна для ${typeName(obj)}`);
    }
    return yield* yieldMaybe(obj.getIndex(index));
  }

  private *callMethod(
    method: MethodDeclaration,
    argExprs: Expression[],
    scope: Scope,
    ctx: Ctx,
  ): BslGenerator<Value> {
    const localScope = new Scope(ctx.methodScopes.get(key(method.name)) ?? ctx.moduleScope);
    this.declareFrameLocals(method.body, localScope);
    for (let i = 0; i < method.params.length; i++) {
      const p = method.params[i]!;
      const argExpr = argExprs[i];
      if (p.byValue || argExpr === undefined) {
        if (argExpr !== undefined) {
          localScope.set(p.name, yield* this.eval(argExpr, scope, ctx));
        } else if (p.defaultValue) {
          localScope.set(p.name, yield* this.eval(p.defaultValue, ctx.moduleScope, ctx));
        } else {
          localScope.set(p.name, undefined);
        }
      } else {
        localScope.bindRef(p.name, yield* this.resolveRef(argExpr, scope, ctx));
      }
    }
    this.pushMethodFrame(method);
    try {
      try {
        yield* this.execGotoBlock(method.body, localScope, ctx);
      } catch (e) {
        if (e instanceof ReturnSignal) return e.value;
        throw e;
      }
      return undefined;
    } finally {
      this.popFrame();
    }
  }

  /** Разрешает выражение-аргумент в ссылку (по ссылке); для не-lvalue — временная ячейка. */
  private *resolveRef(expr: Expression, scope: Scope, ctx: Ctx): BslGenerator<Ref> {
    if (expr.kind === 'Identifier') {
      const name = expr.name;
      return new Ref(
        () => scope.get(name),
        (v) => this.setVariable(name, v, scope, ctx),
      );
    }
    if (expr.kind === 'IndexExpression') {
      const obj = yield* this.eval(expr.object, scope, ctx);
      const index = yield* this.eval(expr.index, scope, ctx);
      if (!isBslObject(obj)) throw new Error(`Индексация недоступна для ${typeName(obj)}`);
      return new Ref(
        () => obj.getIndex(index) as Value,
        (v) => obj.setIndex(index, v),
      );
    }
    if (expr.kind === 'MemberExpression') {
      const obj = yield* this.eval(expr.object, scope, ctx);
      if (!isBslObject(obj)) throw new Error(`Свойство '${expr.property}' недоступно для ${typeName(obj)}`);
      return new Ref(
        () => obj.getProp(expr.property) as Value,
        (v) => obj.setProp(expr.property, v),
      );
    }
    // выражение (не переменная): изменения отбрасываются после вызова
    let temp = yield* this.eval(expr, scope, ctx);
    return new Ref(
      () => temp,
      (v) => {
        temp = v;
      },
    );
  }

  // --- динамическое исполнение (`Выполнить` / `Вычислить`) ---

  // shortcut: динамический код не проходит препроцессор (директивы `#` в нём не
  // поддерживаются) — чтобы не тянуть цикл interpreter → preprocessor → interpreter.
  private static compileDynamic(source: string): Program {
    return parse(tokenize(source));
  }

  /** `Вычислить(строка)` — вычисляет выражение в текущей области видимости. */
  private *evalDynamicExpression(code: string, scope: Scope, ctx: Ctx): BslGenerator<Value> {
    // оборачиваем в вызов, чтобы разобрать именно выражение (как препроцессор)
    const program = Interpreter.compileDynamic(`сообщить(${code});`);
    const stmt = program.body[0] as ExpressionStatement;
    const call = stmt.expression as CallExpression;
    const expr = call.args[0]!;
    // Проверка до `eval`: неразрешённое имя — ошибка, а не `Неопределено`.
    try {
      checkDynamicExpression(expr, { scope, methods: ctx.methods, env: this.env });
    } catch (e) {
      throw new BslRuntimeError(e instanceof Error ? e.message : String(e));
    }
    // Кадр динамического фрагмента: своя строка исходника и маркер `<Вычислить>`.
    this.pushFrame(EVAL_FRAME, EVAL_FRAME, splitSourceLines(stripBom(code)));
    const frame = this.frames[this.frames.length - 1];
    if (frame) frame.line = expr.pos.line;
    try {
      return yield* this.eval(expr, scope, ctx);
    } catch (e) {
      this.annotateAtCurrent(e);
      throw e;
    } finally {
      this.popFrame();
    }
  }

  /** `Выполнить строка` — исполняет операторы в области текущего контекста. */
  private *execDynamic(
    source: string,
    scope: Scope,
    ctx: Ctx,
    frame?: { method?: string; module?: string },
  ): BslGenerator<void> {
    let program: Program;
    try {
      program = Interpreter.compileDynamic(source);
    } catch (e) {
      throw new BslRuntimeError(e instanceof Error ? e.message : String(e));
    }
    // Проверка имён — до регистрации методов/`Перем`: при ошибке фрагмент не должен
    // оставлять следов ни в `ctx`, ни в области видимости.
    try {
      checkDynamicNames(program, { scope, methods: ctx.methods, env: this.env });
    } catch (e) {
      throw new BslRuntimeError(e instanceof Error ? e.message : String(e));
    }
    // Фрагмент исполняется как отдельный модуль (как `Выполнить` в OneScript):
    // его `Перем` — модульные переменные фрагмента, а объявленные в нём методы
    // видят эту область. Родитель — текущая область, поэтому локальные
    // переменные вызывающего кода по-прежнему доступны.
    const dynamicScope = new Scope(scope);
    const dynamicLines = splitSourceLines(stripBom(source));
    const dynamicModule = frame?.module ?? EXECUTE_FRAME;
    const executable: Statement[] = [];
    for (const stmt of program.body) {
      if (stmt.kind === 'MethodDeclaration') {
        const name = key(stmt.name);
        ctx.methods.set(name, stmt);
        ctx.methodScopes.set(name, dynamicScope);
        ctx.methodSources.set(name, { module: dynamicModule, lines: dynamicLines });
      } else if (stmt.kind === 'VariableDeclaration') {
        for (const name of stmt.names) dynamicScope.declare(name);
      } else {
        executable.push(stmt);
      }
    }
    // Слоты локалей фрагмента — до исполнения: вложенный код видит их как
    // `Неопределено`, а присваивание видимой локали меняет её, а не создаёт тень.
    this.declareFrameLocals(executable, dynamicScope);
    this.pushFrame(
      frame?.method ?? EXECUTE_FRAME,
      frame?.module ?? EXECUTE_FRAME,
      dynamicLines,
    );
    try {
      yield* this.execGotoBlock(executable, dynamicScope, ctx);
    } catch (e) {
      const error =
        e instanceof ReturnSignal
          ? new BslRuntimeError('Оператор "Возврат" может использоваться только внутри метода')
          : e;
      this.annotateAtCurrent(error);
      throw error;
    } finally {
      this.popFrame();
    }
  }

  private setVariable(name: string, value: Value, scope: Scope, ctx: Ctx): void {
    const binding = scope.findBinding(key(name));
    if (binding !== undefined) {
      binding.set(value);
      return;
    }
    if (ctx.moduleVars.has(key(name))) ctx.moduleScope.set(name, value);
    else scope.set(name, value);
  }

  private *assign(target: LValue, value: Value, scope: Scope, ctx: Ctx): BslGenerator<void> {
    if (target.kind === 'Identifier') {
      this.setVariable(target.name, value, scope, ctx);
    } else if (target.kind === 'IndexExpression') {
      const obj = yield* this.eval(target.object, scope, ctx);
      const index = yield* this.eval(target.index, scope, ctx);
      if (!isBslObject(obj)) throw new Error(`Индексация недоступна для ${typeName(obj)}`);
      yield* yieldMaybe(obj.setIndex(index, value));
    } else {
      const obj = yield* this.eval(target.object, scope, ctx);
      if (!isBslObject(obj)) throw new Error(`Свойство '${target.property}' недоступно для ${typeName(obj)}`);
      yield* yieldMaybe(obj.setProp(target.property, value));
    }
  }
}
