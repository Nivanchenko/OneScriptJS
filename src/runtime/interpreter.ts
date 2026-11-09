import type {
  BinaryExpression,
  Expression,
  Program,
  Statement,
  UnaryExpression,
} from '../ast/nodes';
import { Scope } from './scope';
import { add, compare, dateFromBsl, equals, toBoolean, toNumber } from './values';
import type { Value } from './values';
import type { RuntimeEnvironment } from './context';

/** Tree-walking интерпретатор BSL. */
export class Interpreter {
  constructor(private readonly env: RuntimeEnvironment) {}

  run(program: Program): void {
    this.execBlock(program.body, new Scope());
  }

  private execBlock(body: Statement[], scope: Scope): void {
    for (const stmt of body) this.exec(stmt, scope);
  }

  private exec(stmt: Statement, scope: Scope): void {
    switch (stmt.kind) {
      case 'Assignment':
        scope.set(stmt.target, this.eval(stmt.value, scope));
        break;
      case 'IfStatement':
        if (toBoolean(this.eval(stmt.condition, scope))) {
          this.execBlock(stmt.thenBranch, scope);
        } else if (stmt.elseBranch) {
          this.execBlock(stmt.elseBranch, scope);
        }
        break;
      case 'ExpressionStatement':
        this.eval(stmt.expression, scope);
        break;
    }
  }

  private eval(expr: Expression, scope: Scope): Value {
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
        return this.evalBinary(expr, scope);
      case 'UnaryExpression':
        return this.evalUnary(expr, scope);
      case 'CallExpression':
        return this.env.call(expr.callee, expr.args.map((a) => this.eval(a, scope)));
    }
  }

  private evalBinary(expr: BinaryExpression, scope: Scope): Value {
    // и/или — с коротким замыканием.
    if (expr.operator === 'и') {
      return toBoolean(this.eval(expr.left, scope)) && toBoolean(this.eval(expr.right, scope));
    }
    if (expr.operator === 'или') {
      return toBoolean(this.eval(expr.left, scope)) || toBoolean(this.eval(expr.right, scope));
    }

    const left = this.eval(expr.left, scope);
    const right = this.eval(expr.right, scope);
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

  private evalUnary(expr: UnaryExpression, scope: Scope): Value {
    const operand = this.eval(expr.operand, scope);
    switch (expr.operator) {
      case '-':
        return -toNumber(operand);
      case 'не':
        return !toBoolean(operand);
      default:
        throw new Error(`Неизвестный унарный оператор: ${expr.operator}`);
    }
  }
}
