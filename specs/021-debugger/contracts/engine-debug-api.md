# Contract: внутренний API отладки в runtime

**Feature**: `specs/021-debugger` | **Тип**: внутренний TypeScript-контракт (не BSL-API)

Все имена и типы живут в `src/runtime/debug/` и не содержат `node:*`/DOM. Публичный
BSL-API отладчика в MVP **не появляется** (Q5), поэтому `docs/reference.md` и каталог
API не меняются.

## Точка подключения

`RuntimeEnvironment` (`src/runtime/context.ts`) получает необязательное поле:

```ts
interface RuntimeEnvironment {
  // ...
  /** Контроллер отладки; отсутствует — движок работает как раньше. */
  debug?: DebugController;
}
```

`GlobalContext` получает сеттер/поле `debug`; хост (адаптер, page agent) выставляет его
**до** `run()`. Интерпретатор читает `this.env.debug` через getter, поэтому форки заданий
и контексты блоков браузера видят один и тот же контроллер.

## Хук интерпретатора

В `exec` (`src/runtime/interpreter.ts`) после обновления `frame.line`:

```ts
const debug = this.env.debug;
if (debug !== undefined) {
  const gate = debug.onStatement(this, frame, stmt.pos.line);
  if (gate !== undefined) yield gate;
}
```

- `gate === undefined` — продолжать синхронно (обычный случай: нет остановки).
- `gate` — `Promise<void>`: пауза, шаг, уступка хосту (для обработки `pause`).
- Хук не бросает исключений в нормальном режиме; ошибки отладчика не должны ломать
  исполнение скрипта (логируются в `output`).

`ActiveFrame` расширяется полями `scope: Scope`, `ctx: Ctx`, `interp: Interpreter`
(заполняются во всех сайтах `pushFrame`); `startFrames` копирует их между
интерпретаторами модулей.

`Scope` получает перечисление собственных переменных:

```ts
interface ScopeEntry { name: string; value: Value }
ownEntries(): ScopeEntry[]   // только своя область, без parent; исходное написание имени
```

## DebugController

```ts
type StopReason = 'entry' | 'breakpoint' | 'step' | 'pause' | 'exception';
type StepMode = 'continue' | 'next' | 'stepIn' | 'stepOut';
type ExceptionFilter = 'uncaught' | 'all';

interface DebugBreakpointSpec {
  line: number;              // 1-based
  condition?: string;
  logMessage?: string;
}

interface DebugSink {
  stopped(threadId: number, reason: StopReason, frames: FrameInfo[], description?: string): void;
  continued(threadId: number, allThreads: boolean): void;
  output(category: 'stdout' | 'stderr' | 'console', text: string): void;
  threads(threads: ThreadInfo[]): void;
  terminated(exitCode?: number): void;
}

class DebugController {
  constructor(sink: DebugSink);
  readonly enabled: boolean;

  setBreakpoints(sourceId: string, breakpoints: DebugBreakpointSpec[]): void;
  setExceptionFilters(filters: ExceptionFilter[]): void;
  registerSource(source: DebugSource): void;

  /** Хук на операторе. undefined — продолжать синхронно; Promise — пауза/уступка. */
  onStatement(interp: Interpreter, frame: ActiveFrame, line: number): Promise<void> | undefined;

  requestPause(): void;
  resume(mode: StepMode): void;      // continue/next/stepIn/stepOut
  stop(): void;                      // снять все гейты, terminated

  threads(): ThreadInfo[];
  stackTrace(threadId: number): FrameInfo[];
  scopes(frameId: number): ScopeInfo[];
  variables(ref: number): VariableInfo[];
  evaluate(frameId: number, expression: string): MaybePromise<VariableInfo>;
}
```

Правила:

- `next`: остановка на глубине `<= stopDepth`, но не на той же (sourceId, line, depth).
- `stepIn`: любой следующий оператор.
- `stepOut`: глубина `< stopDepth`.
- `continue`: до брейкпоинта/исключения/`pause`.
- `stopOnEntry`: первый оператор останавливается с `reason: 'entry'`.
- Брейкпоинт: `sourceId` текущего кадра + `line`; условие вычисляется в области кадра,
  ошибка условия — не останавливаться, `output`.
- Исключение: `uncaught` — только при `tryDepth === 0`; `all` — каждый; повторный стоп на
  том же объекте ошибки подавляется (`WeakSet`).
- `stop()`/`disconnect` резолвят все гейты; ни один промис не остаётся висеть.

## Evaluate

```ts
class Interpreter {
  /** Вычисляет BSL-выражение в области снимка кадра, не возобновляя исполнение. */
  evaluateInFrame(scope: Scope, ctx: Ctx, source: string): MaybePromise<Value>;
}
```

Реализация переиспользует `compileDynamic` + `checkDynamicExpression` +
`evalDynamicExpression`; ошибка разбора/имени/исполнения возвращается вызывающему как
DAP error, сессия остаётся жива.
