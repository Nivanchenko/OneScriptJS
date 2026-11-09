import { TokenType } from '../lexer/token';
import type { Token } from '../lexer/token';
import type { Expression, Pos, Program, Statement } from '../ast/nodes';

// Ключевые слова распознаются регистронезависимо (RU/EN).
const KW_IF = new Set(['если', 'if']);
const KW_THEN = new Set(['тогда', 'then']);
const KW_ENDIF = new Set(['конецесли', 'endif']);
const KW_AND = new Set(['и', 'and']);
const KW_OR = new Set(['или', 'or']);
const KW_NOT = new Set(['не', 'not']);

const COMPARISON_OPS = new Set(['=', '<>', '<', '>', '<=', '>=']);

/** Строит AST из потока токенов лексера. */
export function parse(tokens: Token[]): Program {
  return new Parser(tokens).parse();
}

class Parser {
  private current = 0;
  private readonly eof: Token;

  constructor(private readonly tokens: Token[]) {
    this.eof = tokens[tokens.length - 1]!;
  }

  parse(): Program {
    const start = this.peek();
    const body: Statement[] = [];
    while (!this.isEnd()) body.push(this.parseStatement());
    return { kind: 'Program', pos: this.posOf(start), body };
  }

  // --- операторы ---

  private parseStatement(): Statement {
    if (this.isKeyword(KW_IF)) return this.parseIf();

    const next = this.peek(1);
    if (
      this.peek().type === TokenType.Identifier &&
      next.type === TokenType.Operator &&
      next.lexeme === '='
    ) {
      return this.parseAssignment();
    }

    const expr = this.parseExpression();
    this.expectEndOfStatement();
    return { kind: 'ExpressionStatement', pos: expr.pos, expression: expr };
  }

  private parseAssignment(): Statement {
    const target = this.advance();
    this.advance(); // '='
    const value = this.parseExpression();
    this.expectEndOfStatement();
    return { kind: 'Assignment', pos: this.posOf(target), target: target.lexeme, value };
  }

  private parseIf(): Statement {
    const start = this.expectKeyword(KW_IF);
    const condition = this.parseExpression();
    this.expectKeyword(KW_THEN);
    const thenBranch: Statement[] = [];
    while (!this.isEnd() && !this.isKeyword(KW_ENDIF)) {
      thenBranch.push(this.parseStatement());
    }
    this.expectKeyword(KW_ENDIF);
    this.matchEndOfStatement(); // опциональный ;
    return {
      kind: 'IfStatement',
      pos: this.posOf(start),
      condition,
      thenBranch,
      elseBranch: null,
    };
  }

  // --- выражения (по убыванию приоритета) ---

  private parseExpression(): Expression {
    return this.parseOr();
  }

  private parseOr(): Expression {
    let left = this.parseAnd();
    while (this.isKeyword(KW_OR)) {
      this.advance();
      const right = this.parseAnd();
      left = this.bin('или', left, right);
    }
    return left;
  }

  private parseAnd(): Expression {
    let left = this.parseComparison();
    while (this.isKeyword(KW_AND)) {
      this.advance();
      const right = this.parseComparison();
      left = this.bin('и', left, right);
    }
    return left;
  }

  private parseComparison(): Expression {
    let left = this.parseAdditive();
    while (this.peek().type === TokenType.Operator && COMPARISON_OPS.has(this.peek().lexeme)) {
      const op = this.advance().lexeme;
      const right = this.parseAdditive();
      left = this.bin(op, left, right);
    }
    return left;
  }

  private parseAdditive(): Expression {
    let left = this.parseMultiplicative();
    while (this.checkOp('+') || this.checkOp('-')) {
      const op = this.advance().lexeme;
      const right = this.parseMultiplicative();
      left = this.bin(op, left, right);
    }
    return left;
  }

  private parseMultiplicative(): Expression {
    let left = this.parseUnary();
    while (this.checkOp('*') || this.checkOp('/') || this.checkOp('%')) {
      const op = this.advance().lexeme;
      const right = this.parseUnary();
      left = this.bin(op, left, right);
    }
    return left;
  }

  private parseUnary(): Expression {
    if (this.checkOp('-')) {
      const op = this.advance();
      return { kind: 'UnaryExpression', pos: this.posOf(op), operator: '-', operand: this.parseUnary() };
    }
    if (this.isKeyword(KW_NOT)) {
      const op = this.advance();
      return { kind: 'UnaryExpression', pos: this.posOf(op), operator: 'не', operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expression {
    const token = this.peek();
    switch (token.type) {
      case TokenType.Number:
        this.advance();
        return { kind: 'NumberLiteral', pos: this.posOf(token), value: token.value as number };
      case TokenType.String:
        this.advance();
        return { kind: 'StringLiteral', pos: this.posOf(token), value: token.value as string };
      case TokenType.Boolean:
        this.advance();
        return { kind: 'BooleanLiteral', pos: this.posOf(token), value: token.value as boolean };
      case TokenType.Date:
        this.advance();
        return { kind: 'DateLiteral', pos: this.posOf(token), value: token.value as string };
      case TokenType.Null:
        this.advance();
        return { kind: 'NullLiteral', pos: this.posOf(token) };
      case TokenType.Undefined:
        this.advance();
        return { kind: 'UndefinedLiteral', pos: this.posOf(token) };
      case TokenType.Identifier:
        if (this.peek(1).type === TokenType.Operator && this.peek(1).lexeme === '(') {
          return this.parseCall();
        }
        this.advance();
        return { kind: 'Identifier', pos: this.posOf(token), name: token.lexeme };
      case TokenType.Operator:
        if (token.lexeme === '(') {
          this.advance();
          const expr = this.parseExpression();
          this.expectOp(')');
          return expr;
        }
        break;
      default:
        break;
    }
    this.error(`неожиданный токен '${token.lexeme}'`);
  }

  private parseCall(): Expression {
    const name = this.advance(); // Identifier
    this.expectOp('(');
    const args: Expression[] = [];
    if (!this.checkOp(')')) {
      do {
        args.push(this.parseExpression());
      } while (this.matchOp(','));
    }
    this.expectOp(')');
    return { kind: 'CallExpression', pos: this.posOf(name), callee: name.lexeme, args };
  }

  // --- служебные ---

  private bin(operator: string, left: Expression, right: Expression): Expression {
    return { kind: 'BinaryExpression', pos: left.pos, operator, left, right };
  }

  private peek(ahead = 0): Token {
    return this.tokens[this.current + ahead] ?? this.eof;
  }

  private isEnd(): boolean {
    return this.peek().type === TokenType.EndOfFile;
  }

  private isKeyword(set: Set<string>): boolean {
    const t = this.peek();
    return t.type === TokenType.Identifier && set.has(t.lexeme.toLowerCase());
  }

  private expectKeyword(set: Set<string>): Token {
    if (!this.isKeyword(set)) this.error(`ожидается ключевое слово`);
    return this.advance();
  }

  private checkOp(op: string): boolean {
    return this.peek().type === TokenType.Operator && this.peek().lexeme === op;
  }

  private matchOp(op: string): boolean {
    if (this.checkOp(op)) {
      this.advance();
      return true;
    }
    return false;
  }

  private expectOp(op: string): void {
    if (!this.matchOp(op)) this.error(`ожидается '${op}'`);
  }

  private matchEndOfStatement(): boolean {
    if (this.peek().type === TokenType.EndOfStatement) {
      this.advance();
      return true;
    }
    return false;
  }

  private expectEndOfStatement(): void {
    if (!this.matchEndOfStatement()) this.error("ожидается ';'");
  }

  private advance(): Token {
    const t = this.tokens[this.current];
    if (t === undefined) this.error('неожиданный конец файла');
    this.current += 1;
    return t;
  }

  private posOf(t: Token): Pos {
    return { line: t.line, column: t.column };
  }

  private error(message: string): never {
    const t = this.peek();
    throw new Error(`Ошибка разбора: ${message} (строка ${t.line}, колонка ${t.column})`);
  }
}
