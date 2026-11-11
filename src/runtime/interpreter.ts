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
import { tokenize } from '../lexer/lexer';
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
import type { BslGenerator, DriveOptions, MaybePromise, SliceController } from './async';
import { TimeSlicer, drive, isThenable, yieldMaybe, yieldToHost } from './async';

interface Ctx {
  methods: Map<string, MethodDeclaration>;
  moduleScope: Scope;
  moduleVars: Set<string>;
  exportedVars: Set<string>;
  currentError: string | null;
  /** Фоновое задание, в котором исполняется этот контекст (для `ПолучитьТекущее`). */
  currentJob?: unknown;
}

class ReturnSignal {
  constructor(readonly value: Value) {}
}
class BreakSignal {}
class ContinueSignal {}
class BslRuntimeError extends Error {
  constructor(readonly description: string) {
    super(description);
    this.name = 'BslRuntimeError';
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

  constructor(readonly env: RuntimeEnvironment) {}

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
      moduleScope: source.moduleScope,
      moduleVars: source.moduleVars,
      exportedVars: source.exportedVars,
      currentError: null,
      currentJob: task,
    };
    fork.ownerObject = this.ownerObject;
    fork.moduleObject = this.moduleObject;
    fork.slicer = new TimeSlicer();
    return fork;
  }

  /** Оценивает константное выражение (для препроцессора). */
  static evaluate(expr: Expression): Value {
    const ctx: Ctx = {
      methods: new Map(),
      moduleScope: new Scope(),
      moduleVars: new Set(),
      exportedVars: new Set(),
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
      moduleScope: new Scope(),
      moduleVars: new Set(),
      exportedVars: new Set(),
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
    return drive(this.runGen(executable, ctx.moduleScope, ctx));
  }

  private *runGen(executable: Statement[], scope: Scope, ctx: Ctx): BslGenerator<void> {
    yield* this.execGotoBlock(executable, scope, ctx);
  }

  /** Вызывает метод модуля по имени с готовыми значениями (для тестового раннера). */
  invokeMethod(name: string, values: Value[]): MaybePromise<Value> {
    return drive(this.invokeMethodGen(name, values));
  }

  private *invokeMethodGen(name: string, values: Value[]): BslGenerator<Value> {
    const ctx = this.moduleCtx;
    if (!ctx) throw new Error('Модуль ещё не выполнен');
    const method = ctx.methods.get(key(name));
    if (!method) throw new Error(`Метод '${name}' не найден`);
    const localScope = new Scope(ctx.moduleScope);
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
    try {
      yield* this.execGotoBlock(method.body, localScope, ctx);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
    return undefined;
  }

  /**
   * Исполняет код в области видимости модуля (обработчики событий, REPL и т.п.).
   * Дополнительные переменные (`vars`) видны коду и не меняют модуль.
   */
  executeInModule(source: string, vars?: Record<string, Value>): MaybePromise<void> {
    return drive(this.executeInModuleGen(source, vars));
  }

  private *executeInModuleGen(source: string, vars?: Record<string, Value>): BslGenerator<void> {
    const ctx = this.moduleCtx;
    if (!ctx) throw new Error('Модуль ещё не выполнен');
    const scope = new Scope(ctx.moduleScope);
    if (vars) for (const [name, value] of Object.entries(vars)) scope.set(name, value);
    yield* this.execDynamic(source, scope, ctx);
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
    return drive(this.invokeMethodGen(name, values), options);
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
    return drive(this.invokeMethodWithOutputsGen(name, values));
  }

  private *invokeMethodWithOutputsGen(name: string, values: Value[]): BslGenerator<Value[]> {
    const ctx = this.moduleCtx;
    if (!ctx) throw new Error('Модуль ещё не выполнен');
    const method = ctx.methods.get(key(name));
    if (!method) throw new Error(`Метод '${name}' не найден`);
    const boxes: Value[] = [];
    for (let i = 0; i < method.params.length; i++) {
      const p = method.params[i]!;
      if (i < values.length) boxes.push(values[i]);
      else if (p.defaultValue) boxes.push(yield* this.eval(p.defaultValue, ctx.moduleScope, ctx));
      else boxes.push(undefined);
    }
    const localScope = new Scope(ctx.moduleScope);
    method.params.forEach((p, i) => {
      localScope.bindRef(p.name, new Ref(() => boxes[i], (v) => { boxes[i] = v; }));
    });
    try {
      yield* this.execGotoBlock(method.body, localScope, ctx);
    } catch (e) {
      if (!(e instanceof ReturnSignal)) throw e;
    }
    return boxes;
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
          if (target === undefined) throw new Error(`Метка '~${e.label}' не найдена`);
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
        // Без аргумента `ВызватьИсключение;` перевыбрасывает текущее исключение.
        const description =
          value === undefined
            ? (ctx.currentError ?? '')
            : value instanceof BslErrorInfo
              ? value.description
              : toStringValue(value);
        throw new BslRuntimeError(description);
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
        ctx.currentError = e instanceof BslRuntimeError ? e.description : e.message;
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
      case 'NewObjectExpression': {
        const args = yield* this.evalArgs(expr.args, scope, ctx);
        return yield* yieldMaybe(this.env.construct(expr.typeName, args));
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
        return ctx.currentError ?? '';
      }
      if (lower === 'информацияобошибке' || lower === 'errorinfo') {
        return new BslErrorInfo(ctx.currentError ?? '');
      }
      // shortcut: ВызватьСобытие живёт здесь — событие объявляется на объекте текущего модуля.
      if (lower === 'вызватьсобытие' || lower === 'raiseevent') {
        const name = toStringValue(yield* this.eval(expr.args[0]!, scope, ctx));
        const value = expr.args[1] === undefined ? undefined : yield* this.eval(expr.args[1]!, scope, ctx);
        const params = isBslObject(value) && value.iterate ? value.iterate() : [];
        yield* yieldMaybe(this.env.events?.raise(this.getThisObject(), name, params));
        return undefined;
      }
      const method = ctx.methods.get(lower);
      if (method) return yield* this.callMethod(method, expr.args, scope, ctx);
      const args = yield* this.evalArgs(expr.args, scope, ctx);
      return yield* yieldMaybe(this.env.call(expr.callee.name, args));
    }

    if (expr.callee.kind === 'MemberExpression') {
      const obj = yield* this.eval(expr.callee.object, scope, ctx);
      if (!isBslObject(obj)) {
        throw new Error(`Метод '${expr.callee.property}' недоступен для ${typeName(obj)}`);
      }
      const args = yield* this.evalArgs(expr.args, scope, ctx);
      return yield* yieldMaybe(obj.callMethod(expr.callee.property, args));
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
    const localScope = new Scope(ctx.moduleScope);
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
    try {
      yield* this.execGotoBlock(method.body, localScope, ctx);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
    return undefined;
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
    return yield* this.eval(call.args[0]!, scope, ctx);
  }

  /** `Выполнить строка` — исполняет операторы в текущей области видимости. */
  private *execDynamic(source: string, scope: Scope, ctx: Ctx): BslGenerator<void> {
    let program: Program;
    try {
      program = Interpreter.compileDynamic(source);
    } catch (e) {
      throw new BslRuntimeError(e instanceof Error ? e.message : String(e));
    }
    // объявленные в динамическом коде методы попадают в модуль
    const executable: Statement[] = [];
    for (const stmt of program.body) {
      if (stmt.kind === 'MethodDeclaration') ctx.methods.set(key(stmt.name), stmt);
      else executable.push(stmt);
    }
    try {
      yield* this.execGotoBlock(executable, scope, ctx);
    } catch (e) {
      if (e instanceof ReturnSignal) {
        throw new BslRuntimeError('Оператор "Возврат" может использоваться только внутри метода');
      }
      throw e;
    }
  }

  private setVariable(name: string, value: Value, scope: Scope, ctx: Ctx): void {
    const binding = scope.findBinding(key(name));
    if (binding instanceof Ref) {
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
