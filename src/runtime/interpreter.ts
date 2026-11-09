import type {
  BinaryExpression,
  CallExpression,
  Expression,
  ForEachLoop,
  ForLoop,
  MethodDeclaration,
  Program,
  Statement,
  TryExceptStatement,
  UnaryExpression,
  WhileLoop,
} from '../ast/nodes';
import { Scope } from './scope';
import { add, compare, dateFromBsl, equals, toBoolean, toNumber, toStringValue } from './values';
import type { Value } from './values';
import type { RuntimeEnvironment } from './context';

interface Ctx {
  methods: Map<string, MethodDeclaration>;
  moduleScope: Scope;
  moduleVars: Set<string>;
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

const key = (name: string): string => name.toLowerCase();

/** Tree-walking интерпретатор BSL. */
export class Interpreter {
  constructor(private readonly env: RuntimeEnvironment) {}

  /** Оценивает константное выражение (для препроцессора). */
  static evaluate(expr: Expression): Value {
    const ctx: Ctx = {
      methods: new Map(),
      moduleScope: new Scope(),
      moduleVars: new Set(),
      currentError: null,
    };
    return new Interpreter({ call: () => undefined }).eval(expr, ctx.moduleScope, ctx);
  }

  run(program: Program): void {
    const ctx: Ctx = {
      methods: new Map(),
      moduleScope: new Scope(),
      moduleVars: new Set(),
      currentError: null,
    };
    for (const stmt of program.body) {
      if (stmt.kind === 'MethodDeclaration') ctx.methods.set(key(stmt.name), stmt);
      else if (stmt.kind === 'VariableDeclaration') {
        ctx.moduleVars.add(key(stmt.name));
        ctx.moduleScope.set(stmt.name, undefined);
      }
    }
    for (const stmt of program.body) {
      if (stmt.kind === 'MethodDeclaration' || stmt.kind === 'VariableDeclaration') continue;
      this.exec(stmt, ctx.moduleScope, ctx);
    }
  }

  private execBlock(body: Statement[], scope: Scope, ctx: Ctx): void {
    for (const stmt of body) this.exec(stmt, scope, ctx);
  }

  private exec(stmt: Statement, scope: Scope, ctx: Ctx): void {
    switch (stmt.kind) {
      case 'Assignment':
        this.setVariable(stmt.target, this.eval(stmt.value, scope, ctx), scope, ctx);
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
      case 'RaiseStatement':
        throw new BslRuntimeError(toStringValue(this.eval(stmt.value, scope, ctx)));
    }
  }

  private execForLoop(stmt: ForLoop, scope: Scope, ctx: Ctx): void {
    const from = toNumber(this.eval(stmt.from, scope, ctx));
    const to = toNumber(this.eval(stmt.to, scope, ctx));
    for (let i = from; i <= to; i++) {
      this.setVariable(stmt.variable, i, scope, ctx);
      try {
        this.execBlock(stmt.body, scope, ctx);
      } catch (e) {
        if (e instanceof BreakSignal) break;
        if (e instanceof ContinueSignal) continue;
        throw e;
      }
    }
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
    // shortcut: коллекции (Массив) появятся в T15; пока итерируем только JS-массивы.
    if (!Array.isArray(collection)) {
      throw new Error('Для Каждого: значение не является коллекцией');
    }
    for (const item of collection as unknown as Value[]) {
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
      if (e instanceof BslRuntimeError) {
        const prev = ctx.currentError;
        ctx.currentError = e.description;
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
      case 'Identifier':
        return scope.get(expr.name);
      case 'BinaryExpression':
        return this.evalBinary(expr, scope, ctx);
      case 'UnaryExpression':
        return this.evalUnary(expr, scope, ctx);
      case 'CallExpression':
        return this.evalCall(expr, scope, ctx);
      case 'TernaryExpression':
        return toBoolean(this.eval(expr.condition, scope, ctx))
          ? this.eval(expr.then, scope, ctx)
          : this.eval(expr.else, scope, ctx);
      case 'NewObjectExpression':
        // shortcut: реестр типов появится в T15.
        throw new Error(`Тип '${expr.typeName}' не найден (появится в T15)`);
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
      case '/':
        return toNumber(left) / toNumber(right);
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
    const lower = key(expr.callee);
    // shortcut: ОписаниеОшибки живёт здесь, т.к. нужен доступ к текущему исключению;
    // ИнформацияОбОшибке() (объект) появится в T15 вместе с обращением к свойствам.
    if (lower === 'описаниеошибки' || lower === 'errordescription') {
      return ctx.currentError ?? '';
    }
    const method = ctx.methods.get(lower);
    if (method) {
      const args = expr.args.map((a) => this.eval(a, scope, ctx));
      return this.callMethod(method, args, ctx);
    }
    return this.env.call(expr.callee, expr.args.map((a) => this.eval(a, scope, ctx)));
  }

  private callMethod(method: MethodDeclaration, args: Value[], ctx: Ctx): Value {
    const localScope = new Scope(ctx.moduleScope);
    method.params.forEach((p, i) => {
      const value =
        i < args.length ? args[i] : p.defaultValue ? this.eval(p.defaultValue, ctx.moduleScope, ctx) : undefined;
      localScope.set(p.name, value);
    });
    try {
      this.execBlock(method.body, localScope, ctx);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
    return undefined;
  }

  private setVariable(name: string, value: Value, scope: Scope, ctx: Ctx): void {
    if (ctx.moduleVars.has(key(name))) ctx.moduleScope.set(name, value);
    else scope.set(name, value);
  }
}
