import type {
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

interface Ctx {
  methods: Map<string, MethodDeclaration>;
  moduleScope: Scope;
  moduleVars: Set<string>;
  exportedVars: Set<string>;
  currentError: string | null;
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

/** Tree-walking интерпретатор BSL. */
export class Interpreter {
  private moduleCtx: Ctx | null = null;
  /** Объект текущего модуля; у загруженного сценария подменяется на `BslScript`. */
  ownerObject?: BslObject;
  private moduleObject?: ScriptModuleObject;

  constructor(readonly env: RuntimeEnvironment) {}

  /** `ЭтотОбъект` — объект текущего модуля (лениво создаётся). */
  getThisObject(): BslObject {
    if (this.ownerObject) return this.ownerObject;
    this.moduleObject ??= new ScriptModuleObject(this);
    return this.moduleObject;
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
    return new Interpreter(env).eval(expr, ctx.moduleScope, ctx);
  }

  run(program: Program): void {
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
    this.execGotoBlock(executable, ctx.moduleScope, ctx);
  }

  /** Вызывает метод модуля по имени с готовыми значениями (для тестового раннера). */
  invokeMethod(name: string, values: Value[]): Value {
    const ctx = this.moduleCtx;
    if (!ctx) throw new Error('Модуль ещё не выполнен');
    const method = ctx.methods.get(key(name));
    if (!method) throw new Error(`Метод '${name}' не найден`);
    const localScope = new Scope(ctx.moduleScope);
    method.params.forEach((p, i) => {
      const value =
        i < values.length ? values[i] : p.defaultValue ? this.eval(p.defaultValue, ctx.moduleScope, ctx) : undefined;
      localScope.set(p.name, value);
    });
    try {
      this.execGotoBlock(method.body, localScope, ctx);
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
  executeInModule(source: string, vars?: Record<string, Value>): void {
    const ctx = this.moduleCtx;
    if (!ctx) throw new Error('Модуль ещё не выполнен');
    const scope = new Scope(ctx.moduleScope);
    if (vars) for (const [name, value] of Object.entries(vars)) scope.set(name, value);
    this.execDynamic(source, scope, ctx);
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
  callExportedMethod(name: string, values: Value[]): Value {
    if (!this.hasExportedMethod(name)) throw new Error(`Метод '${name}' не найден`);
    return this.invokeMethod(name, values);
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
  invokeMethodWithOutputs(name: string, values: Value[]): Value[] {
    const ctx = this.moduleCtx;
    if (!ctx) throw new Error('Модуль ещё не выполнен');
    const method = ctx.methods.get(key(name));
    if (!method) throw new Error(`Метод '${name}' не найден`);
    const boxes: Value[] = method.params.map((p, i) =>
      i < values.length ? values[i] : p.defaultValue ? this.eval(p.defaultValue, ctx.moduleScope, ctx) : undefined,
    );
    const localScope = new Scope(ctx.moduleScope);
    method.params.forEach((p, i) => {
      localScope.bindRef(p.name, new Ref(() => boxes[i], (v) => { boxes[i] = v; }));
    });
    try {
      this.execGotoBlock(method.body, localScope, ctx);
    } catch (e) {
      if (!(e instanceof ReturnSignal)) throw e;
    }
    return boxes;
  }

  private execBlock(body: Statement[], scope: Scope, ctx: Ctx): void {
    for (const stmt of body) this.exec(stmt, scope, ctx);
  }

  private execGotoBlock(body: Statement[], scope: Scope, ctx: Ctx): void {
    const labels = new Map<string, number>();
    body.forEach((s, i) => {
      if (s.kind === 'LabelStatement') labels.set(key(s.name), i);
    });

    let i = 0;
    while (i < body.length) {
      const stmt = body[i]!;
      try {
        this.exec(stmt, scope, ctx);
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

  private exec(stmt: Statement, scope: Scope, ctx: Ctx): void {
    switch (stmt.kind) {
      case 'Assignment':
        this.assign(stmt.target, this.eval(stmt.value, scope, ctx), scope, ctx);
        break;
      case 'IfStatement':
        if (toBoolean(this.eval(stmt.condition, scope, ctx))) {
          this.execBlock(stmt.thenBranch, scope, ctx);
        } else if (stmt.elseBranch) {
          if (Array.isArray(stmt.elseBranch)) {
            this.execBlock(stmt.elseBranch, scope, ctx);
          } else {
            this.exec(stmt.elseBranch, scope, ctx);
          }
        }
        break;
      case 'ExpressionStatement':
        this.eval(stmt.expression, scope, ctx);
        break;
      case 'ReturnStatement':
        throw new ReturnSignal(stmt.value ? this.eval(stmt.value, scope, ctx) : undefined);
      case 'MethodDeclaration':
      case 'VariableDeclaration':
        break; // собираются в run()
      case 'ForLoop':
        this.execForLoop(stmt, scope, ctx);
        break;
      case 'WhileLoop':
        this.execWhileLoop(stmt, scope, ctx);
        break;
      case 'ForEachLoop':
        this.execForEachLoop(stmt, scope, ctx);
        break;
      case 'BreakStatement':
        throw new BreakSignal();
      case 'ContinueStatement':
        throw new ContinueSignal();
      case 'TryExceptStatement':
        this.execTryExcept(stmt, scope, ctx);
        break;
      case 'RaiseStatement': {
        const value = stmt.value === undefined ? undefined : this.eval(stmt.value, scope, ctx);
        // Без аргумента `ВызватьИсключение;` перевыбрасывает текущее исключение.
        const description =
          value === undefined
            ? (ctx.currentError ?? '')
            : value instanceof BslErrorInfo
              ? value.description
              : toStringValue(value);
        throw new BslRuntimeError(description);
      }
      case 'ExecuteStatement':
        this.execDynamic(toStringValue(this.eval(stmt.value, scope, ctx)), scope, ctx);
        break;
      case 'LabelStatement':
        break; // маркер — no-op
      case 'GotoStatement':
        throw new GotoSignal(key(stmt.label));
    }
  }

  private execForLoop(stmt: ForLoop, scope: Scope, ctx: Ctx): void {
    const from = toNumber(this.eval(stmt.from, scope, ctx));
    const to = toNumber(this.eval(stmt.to, scope, ctx));
    let completed = true;
    for (let i = from; i <= to; i++) {
      this.setVariable(stmt.variable, i, scope, ctx);
      try {
        this.execBlock(stmt.body, scope, ctx);
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

  private execWhileLoop(stmt: WhileLoop, scope: Scope, ctx: Ctx): void {
    while (toBoolean(this.eval(stmt.condition, scope, ctx))) {
      try {
        this.execBlock(stmt.body, scope, ctx);
      } catch (e) {
        if (e instanceof BreakSignal) break;
        if (e instanceof ContinueSignal) continue;
        throw e;
      }
    }
  }

  private execForEachLoop(stmt: ForEachLoop, scope: Scope, ctx: Ctx): void {
    const collection = this.eval(stmt.collection, scope, ctx);
    if (!isBslObject(collection) || !collection.iterate) {
      throw new Error('Для Каждого: значение не является коллекцией');
    }
    for (const item of collection.iterate()) {
      this.setVariable(stmt.variable, item, scope, ctx);
      try {
        this.execBlock(stmt.body, scope, ctx);
      } catch (e) {
        if (e instanceof BreakSignal) break;
        if (e instanceof ContinueSignal) continue;
        throw e;
      }
    }
  }

  private execTryExcept(stmt: TryExceptStatement, scope: Scope, ctx: Ctx): void {
    try {
      this.execBlock(stmt.tryBody, scope, ctx);
    } catch (e) {
      // BSL: Попытка/Исключение ловит любые ошибки рантайма, в т.ч. ошибки stdlib
      // (обычный Error), а не только ВызватьИсключение. Сигналы управления
      // (Return/Break/Continue/Goto) — не Error, пропускаются.
      if (e instanceof Error) {
        const prev = ctx.currentError;
        ctx.currentError = e instanceof BslRuntimeError ? e.description : e.message;
        try {
          this.execBlock(stmt.exceptBody, scope, ctx);
        } finally {
          ctx.currentError = prev;
        }
      } else {
        throw e;
      }
    }
  }

  private eval(expr: Expression, scope: Scope, ctx: Ctx): Value {
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
        if (key(expr.name) === 'этотобъект') return this.getThisObject();
        return undefined;
      }
      case 'BinaryExpression':
        return this.evalBinary(expr, scope, ctx);
      case 'UnaryExpression':
        return this.evalUnary(expr, scope, ctx);
      case 'CallExpression':
        return this.evalCall(expr, scope, ctx);
      case 'MemberExpression':
        return this.evalMember(expr, scope, ctx);
      case 'IndexExpression':
        return this.evalIndex(expr, scope, ctx);
      case 'TernaryExpression':
        return toBoolean(this.eval(expr.condition, scope, ctx))
          ? this.eval(expr.then, scope, ctx)
          : this.eval(expr.else, scope, ctx);
      case 'NewObjectExpression':
        return this.env.construct(expr.typeName, expr.args.map((a) => this.eval(a, scope, ctx)));
    }
  }

  private evalBinary(expr: BinaryExpression, scope: Scope, ctx: Ctx): Value {
    // и/или — с коротким замыканием.
    if (expr.operator === 'и') {
      return toBoolean(this.eval(expr.left, scope, ctx)) && toBoolean(this.eval(expr.right, scope, ctx));
    }
    if (expr.operator === 'или') {
      return toBoolean(this.eval(expr.left, scope, ctx)) || toBoolean(this.eval(expr.right, scope, ctx));
    }

    const left = this.eval(expr.left, scope, ctx);
    const right = this.eval(expr.right, scope, ctx);
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

  private evalUnary(expr: UnaryExpression, scope: Scope, ctx: Ctx): Value {
    const operand = this.eval(expr.operand, scope, ctx);
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

  private evalCall(expr: CallExpression, scope: Scope, ctx: Ctx): Value {
    if (expr.callee.kind === 'Identifier') {
      const lower = key(expr.callee.name);
      // shortcut: Вычислить живёт здесь — нужен доступ к текущей области видимости.
      if (lower === 'вычислить' || lower === 'eval') {
        const code = toStringValue(this.eval(expr.args[0]!, scope, ctx));
        return this.evalDynamicExpression(code, scope, ctx);
      }
      // shortcut: ОписаниеОшибки/ИнформацияОбОшибке живут здесь — нужен доступ к текущему исключению.
      if (lower === 'описаниеошибки' || lower === 'errordescription') {
        return ctx.currentError ?? '';
      }
      if (lower === 'информацияобошибке' || lower === 'errorinfo') {
        return new BslErrorInfo(ctx.currentError ?? '');
      }
      // shortcut: ВызватьСобытие живёт здесь — событие объявляется на объекте текущего модуля.
      if (lower === 'вызватьсобытие') {
        const name = toStringValue(this.eval(expr.args[0]!, scope, ctx));
        const value = expr.args[1] === undefined ? undefined : this.eval(expr.args[1]!, scope, ctx);
        const params = isBslObject(value) && value.iterate ? value.iterate() : [];
        this.env.events?.raise(this.getThisObject(), name, params);
        return undefined;
      }
      const method = ctx.methods.get(lower);
      if (method) return this.callMethod(method, expr.args, scope, ctx);
      return this.env.call(expr.callee.name, expr.args.map((a) => this.eval(a, scope, ctx)));
    }

    if (expr.callee.kind === 'MemberExpression') {
      const obj = this.eval(expr.callee.object, scope, ctx);
      if (!isBslObject(obj)) {
        throw new Error(`Метод '${expr.callee.property}' недоступен для ${typeName(obj)}`);
      }
      return obj.callMethod(expr.callee.property, expr.args.map((a) => this.eval(a, scope, ctx)));
    }

    throw new Error('Недопустимый вызов функции');
  }

  private evalMember(expr: MemberExpression, scope: Scope, ctx: Ctx): Value {
    const obj = this.eval(expr.object, scope, ctx);
    if (!isBslObject(obj)) {
      throw new Error(`Свойство '${expr.property}' недоступно для ${typeName(obj)}`);
    }
    return obj.getProp(expr.property);
  }

  private evalIndex(expr: IndexExpression, scope: Scope, ctx: Ctx): Value {
    const obj = this.eval(expr.object, scope, ctx);
    const index = this.eval(expr.index, scope, ctx);
    if (!isBslObject(obj)) {
      throw new Error(`Индексация недоступна для ${typeName(obj)}`);
    }
    return obj.getIndex(index);
  }

  private callMethod(method: MethodDeclaration, argExprs: Expression[], scope: Scope, ctx: Ctx): Value {
    const localScope = new Scope(ctx.moduleScope);
    method.params.forEach((p, i) => {
      const argExpr = argExprs[i];
      if (p.byValue || argExpr === undefined) {
        const value =
          argExpr !== undefined
            ? this.eval(argExpr, scope, ctx)
            : p.defaultValue
              ? this.eval(p.defaultValue, ctx.moduleScope, ctx)
              : undefined;
        localScope.set(p.name, value);
      } else {
        localScope.bindRef(p.name, this.resolveRef(argExpr, scope, ctx));
      }
    });
    try {
      this.execGotoBlock(method.body, localScope, ctx);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
    return undefined;
  }

  /** Разрешает выражение-аргумент в ссылку (по ссылке); для не-lvalue — временная ячейка. */
  private resolveRef(expr: Expression, scope: Scope, ctx: Ctx): Ref {
    if (expr.kind === 'Identifier') {
      const name = expr.name;
      return new Ref(
        () => scope.get(name),
        (v) => this.setVariable(name, v, scope, ctx),
      );
    }
    if (expr.kind === 'IndexExpression') {
      const obj = this.eval(expr.object, scope, ctx);
      const index = this.eval(expr.index, scope, ctx);
      if (!isBslObject(obj)) throw new Error(`Индексация недоступна для ${typeName(obj)}`);
      return new Ref(
        () => obj.getIndex(index),
        (v) => obj.setIndex(index, v),
      );
    }
    if (expr.kind === 'MemberExpression') {
      const obj = this.eval(expr.object, scope, ctx);
      if (!isBslObject(obj)) throw new Error(`Свойство '${expr.property}' недоступно для ${typeName(obj)}`);
      return new Ref(
        () => obj.getProp(expr.property),
        (v) => obj.setProp(expr.property, v),
      );
    }
    // выражение (не переменная): изменения отбрасываются после вызова
    let temp = this.eval(expr, scope, ctx);
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
  private evalDynamicExpression(code: string, scope: Scope, ctx: Ctx): Value {
    // оборачиваем в вызов, чтобы разобрать именно выражение (как препроцессор)
    const program = Interpreter.compileDynamic(`сообщить(${code});`);
    const stmt = program.body[0] as ExpressionStatement;
    const call = stmt.expression as CallExpression;
    return this.eval(call.args[0]!, scope, ctx);
  }

  /** `Выполнить строка` — исполняет операторы в текущей области видимости. */
  private execDynamic(source: string, scope: Scope, ctx: Ctx): void {
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
      this.execGotoBlock(executable, scope, ctx);
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

  private assign(target: LValue, value: Value, scope: Scope, ctx: Ctx): void {
    if (target.kind === 'Identifier') {
      this.setVariable(target.name, value, scope, ctx);
    } else if (target.kind === 'IndexExpression') {
      const obj = this.eval(target.object, scope, ctx);
      const index = this.eval(target.index, scope, ctx);
      if (!isBslObject(obj)) throw new Error(`Индексация недоступна для ${typeName(obj)}`);
      obj.setIndex(index, value);
    } else {
      const obj = this.eval(target.object, scope, ctx);
      if (!isBslObject(obj)) throw new Error(`Свойство '${target.property}' недоступно для ${typeName(obj)}`);
      obj.setProp(target.property, value);
    }
  }
}
