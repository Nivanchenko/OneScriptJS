import { TokenType } from '../lexer/token';
import type { Token } from '../lexer/token';
import type { Expression, IfStatement, LValue, MethodParameter, Pos, Program, Statement } from '../ast/nodes';

// Ключевые слова распознаются регистронезависимо (RU/EN).
const KW_IF = new Set(['если', 'if']);
const KW_THEN = new Set(['тогда', 'then']);
const KW_ENDIF = new Set(['конецесли', 'endif']);
const KW_ELSIF = new Set(['иначеесли', 'elsif']);
const KW_ELSE = new Set(['иначе', 'else']);
const KW_AND = new Set(['и', 'and']);
const KW_OR = new Set(['или', 'or']);
const KW_NOT = new Set(['не', 'not']);
const KW_PROCEDURE = new Set(['процедура', 'procedure']);
const KW_FUNCTION = new Set(['функция', 'function']);
const KW_ENDPROCEDURE = new Set(['конецпроцедуры', 'endprocedure']);
const KW_ENDFUNCTION = new Set(['конецфункции', 'endfunction']);
const KW_RETURN = new Set(['возврат', 'return']);
const KW_VAR = new Set(['перем', 'var']);
const KW_EXPORT = new Set(['экспорт', 'export']);
const KW_VALUE = new Set(['знач', 'val']);
const KW_FOR = new Set(['для', 'for']);
const KW_EACH = new Set(['каждого', 'each']);
const KW_IN = new Set(['из', 'in']);
const KW_TO = new Set(['по', 'to']);
const KW_WHILE = new Set(['пока', 'while']);
const KW_LOOP = new Set(['цикл', 'do']);
const KW_ENDLOOP = new Set(['конеццикла', 'enddo']);
const KW_BREAK = new Set(['прервать', 'break']);
const KW_CONTINUE = new Set(['продолжить', 'continue']);
const KW_TRY = new Set(['попытка', 'try']);
const KW_EXCEPT = new Set(['исключение', 'except']);
const KW_ENDTRY = new Set(['конецпопытки', 'endtry']);
const KW_RAISE = new Set(['вызватьисключение', 'raise']);
const KW_NEW = new Set(['новый', 'new']);
const KW_GOTO = new Set(['перейти', 'goto']);
const KW_EXECUTE = new Set(['выполнить', 'execute']);

// Ключевые слова конца блока: завершают оператор без ';'.
const END_OF_BLOCK = new Set([
  'конецесли', 'endif',
  'конецпроцедуры', 'endprocedure',
  'конецфункции', 'endfunction',
  'иначе', 'else',
  'иначеесли', 'elsif',
  'конеццикла', 'enddo',
  'конецпопытки', 'endtry',
  'исключение', 'except',
]);

const COMPARISON_OPS = new Set(['=', '<>', '<', '>', '<=', '>=']);

/** Строит AST из потока токенов лексера. */
export function parse(tokens: Token[]): Program {
  return new Parser(tokens).parse();
}

function isLValue(expr: Expression): expr is LValue {
  return expr.kind === 'Identifier' || expr.kind === 'MemberExpression' || expr.kind === 'IndexExpression';
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
    while (this.checkOp('&')) this.skipAnnotation();
    while (this.matchEndOfStatement()) { /* пустой оператор `;;` */ }

    if (this.isKeyword(KW_IF)) return this.parseIf();
    if (this.isKeyword(KW_PROCEDURE) || this.isKeyword(KW_FUNCTION)) return this.parseMethod();
    if (this.isKeyword(KW_RETURN)) return this.parseReturn();
    if (this.isKeyword(KW_VAR)) return this.parseVariableDeclaration();
    if (this.isKeyword(KW_FOR)) return this.parseFor();
    if (this.isKeyword(KW_WHILE)) return this.parseWhile();
    if (this.isKeyword(KW_BREAK)) return this.parseBreak();
    if (this.isKeyword(KW_CONTINUE)) return this.parseContinue();
    if (this.isKeyword(KW_TRY)) return this.parseTry();
    if (this.isKeyword(KW_RAISE)) return this.parseRaise();
    if (this.isKeyword(KW_GOTO)) return this.parseGoto();
    if (this.isKeyword(KW_EXECUTE)) return this.parseExecute();
    if (this.checkOp('~')) return this.parseLabel();

    const save = this.current;
    const left = this.parseUnary();
    if (this.checkOp('=') && isLValue(left)) {
      this.advance(); // '='
      const value = this.parseExpression();
      this.expectEndOfStatement();
      return { kind: 'Assignment', pos: left.pos, target: left, value };
    }

    // не присваивание — откат и разбор полного выражения
    this.current = save;
    const expr = this.parseExpression();
    this.expectEndOfStatement();
    return { kind: 'ExpressionStatement', pos: expr.pos, expression: expr };
  }

  private parseIf(): Statement {
    const start = this.expectKeyword(KW_IF);
    const node = this.parseIfBranches(start);
    this.expectKeyword(KW_ENDIF);
    this.matchEndOfStatement();
    return node;
  }

  private parseIfBranches(start: Token): IfStatement {
    const condition = this.parseExpression();
    this.expectKeyword(KW_THEN);
    const thenBranch = this.parseStatementsUntil(KW_ELSIF, KW_ELSE, KW_ENDIF);

    let elseBranch: Statement[] | IfStatement | null = null;
    if (this.isKeyword(KW_ELSIF)) {
      const elsifStart = this.advance();
      elseBranch = this.parseIfBranches(elsifStart);
    } else if (this.matchKeyword(KW_ELSE)) {
      elseBranch = this.parseStatementsUntil(KW_ENDIF);
    }

    return { kind: 'IfStatement', pos: this.posOf(start), condition, thenBranch, elseBranch };
  }

  private parseStatementsUntil(...stops: Set<string>[]): Statement[] {
    const body: Statement[] = [];
    while (!this.isEnd() && !stops.some((s) => this.isKeyword(s))) {
      body.push(this.parseStatement());
    }
    return body;
  }

  private parseMethod(): Statement {
    const start = this.advance(); // 'процедура' | 'функция'
    const isFunction = KW_FUNCTION.has(start.lexeme.toLowerCase());
    const name = this.expectIdentifier();
    this.expectOp('(');
    const params: MethodParameter[] = [];
    if (!this.checkOp(')')) {
      do {
        params.push(this.parseParameter());
      } while (this.matchOp(','));
    }
    this.expectOp(')');
    const exported = this.matchKeyword(KW_EXPORT);
    const endKw = isFunction ? KW_ENDFUNCTION : KW_ENDPROCEDURE;
    const body: Statement[] = [];
    while (!this.isEnd() && !this.isKeyword(endKw)) body.push(this.parseStatement());
    this.expectKeyword(endKw);
    this.matchEndOfStatement();
    return {
      kind: 'MethodDeclaration',
      pos: this.posOf(start),
      name: name.lexeme,
      isFunction,
      exported,
      params,
      body,
    };
  }

  private parseParameter(): MethodParameter {
    const byValue = this.matchKeyword(KW_VALUE);
    const name = this.expectIdentifier().lexeme;
    let defaultValue: Expression | undefined;
    if (this.matchOp('=')) defaultValue = this.parseExpression();
    return { name, byValue, defaultValue };
  }

  private parseReturn(): Statement {
    const start = this.advance(); // 'возврат'
    let value: Expression | undefined;
    if (this.peek().type !== TokenType.EndOfStatement) value = this.parseExpression();
    this.expectEndOfStatement();
    return { kind: 'ReturnStatement', pos: this.posOf(start), value };
  }

  private parseVariableDeclaration(): Statement {
    const start = this.advance(); // 'перем'
    const names: string[] = [];
    do {
      names.push(this.expectIdentifier().lexeme);
      this.matchKeyword(KW_EXPORT);
    } while (this.matchOp(','));
    this.expectEndOfStatement();
    return { kind: 'VariableDeclaration', pos: this.posOf(start), names };
  }

  private parseFor(): Statement {
    const start = this.advance(); // 'для'
    if (this.matchKeyword(KW_EACH)) {
      return this.parseForEach(start);
    }
    const variable = this.expectIdentifier().lexeme;
    this.expectOp('=');
    const from = this.parseExpression();
    this.expectKeyword(KW_TO);
    const to = this.parseExpression();
    this.expectKeyword(KW_LOOP);
    const body = this.parseLoopBody();
    return { kind: 'ForLoop', pos: this.posOf(start), variable, from, to, body };
  }

  private parseForEach(start: Token): Statement {
    const variable = this.expectIdentifier().lexeme;
    this.expectKeyword(KW_IN);
    const collection = this.parseExpression();
    this.expectKeyword(KW_LOOP);
    const body = this.parseLoopBody();
    return { kind: 'ForEachLoop', pos: this.posOf(start), variable, collection, body };
  }

  private parseWhile(): Statement {
    const start = this.advance(); // 'пока'
    const condition = this.parseExpression();
    this.expectKeyword(KW_LOOP);
    const body = this.parseLoopBody();
    return { kind: 'WhileLoop', pos: this.posOf(start), condition, body };
  }

  private parseBreak(): Statement {
    const start = this.advance();
    this.expectEndOfStatement();
    return { kind: 'BreakStatement', pos: this.posOf(start) };
  }

  private parseContinue(): Statement {
    const start = this.advance();
    this.expectEndOfStatement();
    return { kind: 'ContinueStatement', pos: this.posOf(start) };
  }

  private parseTry(): Statement {
    const start = this.expectKeyword(KW_TRY);
    const tryBody = this.parseStatementsUntil(KW_EXCEPT);
    this.expectKeyword(KW_EXCEPT);
    const exceptBody = this.parseStatementsUntil(KW_ENDTRY);
    this.expectKeyword(KW_ENDTRY);
    this.matchEndOfStatement();
    return { kind: 'TryExceptStatement', pos: this.posOf(start), tryBody, exceptBody };
  }

  private parseRaise(): Statement {
    const start = this.advance(); // 'вызватьисключение'
    let value: Expression | undefined;
    if (this.peek().type !== TokenType.EndOfStatement) value = this.parseExpression();
    this.expectEndOfStatement();
    return { kind: 'RaiseStatement', pos: this.posOf(start), value };
  }

  private parseExecute(): Statement {
    const start = this.advance(); // 'выполнить'
    const value = this.parseExpression();
    this.expectEndOfStatement();
    return { kind: 'ExecuteStatement', pos: this.posOf(start), value };
  }

  private parseLoopBody(): Statement[] {
    const body: Statement[] = [];
    while (!this.isEnd() && !this.isKeyword(KW_ENDLOOP)) body.push(this.parseStatement());
    this.expectKeyword(KW_ENDLOOP);
    this.matchEndOfStatement();
    return body;
  }

  private parseLabel(): Statement {
    const start = this.advance(); // '~'
    const name = this.expectIdentifier().lexeme;
    this.expectOp(':');
    return { kind: 'LabelStatement', pos: this.posOf(start), name };
  }

  private parseGoto(): Statement {
    const start = this.advance(); // 'перейти'
    this.expectOp('~');
    const label = this.expectIdentifier().lexeme;
    this.expectEndOfStatement();
    return { kind: 'GotoStatement', pos: this.posOf(start), label };
  }

  private skipAnnotation(): void {
    this.advance(); // '&'
    this.expectIdentifier();
    if (this.matchOp('(')) {
      if (!this.checkOp(')')) {
        do {
          this.parseExpression();
        } while (this.matchOp(','));
      }
      this.expectOp(')');
    }
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
    let left = this.parseNot();
    while (this.isKeyword(KW_AND)) {
      this.advance();
      const right = this.parseNot();
      left = this.bin('и', left, right);
    }
    return left;
  }

  /** `Не` — унарный оператор с приоритетом ниже сравнения (`Не a = b` → `Не (a = b)`). */
  private parseNot(): Expression {
    if (this.isKeyword(KW_NOT)) {
      const op = this.advance();
      return { kind: 'UnaryExpression', pos: this.posOf(op), operator: 'не', operand: this.parseNot() };
    }
    return this.parseComparison();
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
    if (this.checkOp('+')) {
      const op = this.advance();
      return { kind: 'UnaryExpression', pos: this.posOf(op), operator: '+', operand: this.parseUnary() };
    }
    if (this.checkOp('-')) {
      const op = this.advance();
      return { kind: 'UnaryExpression', pos: this.posOf(op), operator: '-', operand: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePrimary(): Expression {
    const token = this.peek();
    switch (token.type) {
      case TokenType.Number:
        this.advance();
        return { kind: 'NumberLiteral', pos: this.posOf(token), value: token.value as number };
      case TokenType.String:
        this.advance();
        {
          // Конкатенация смежных строковых литералов (`"a" "b"` → `"ab"`).
          let value = token.value as string;
          while (this.peek().type === TokenType.String) {
            value += this.peek().value as string;
            this.advance();
          }
          return { kind: 'StringLiteral', pos: this.posOf(token), value };
        }
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
        // `Новый(Тип, …)` — вызов глобальной функции; `Новый Тип` — оператор.
        if (this.isKeyword(KW_NEW) && !this.checkNextOp('(')) return this.parseNew();
        this.advance();
        return { kind: 'Identifier', pos: this.posOf(token), name: token.lexeme };
      case TokenType.Operator:
        if (token.lexeme === '(') {
          this.advance();
          const expr = this.parseExpression();
          this.expectOp(')');
          return expr;
        }
        if (token.lexeme === '?') {
          return this.parseTernary();
        }
        break;
      default:
        break;
    }
    this.error(`неожиданный токен '${token.lexeme}'`);
  }

  private parsePostfix(): Expression {
    let expr = this.parsePrimary();
    for (;;) {
      if (this.checkOp('(')) {
        expr = this.parseCallArgs(expr);
      } else if (this.checkOp('[')) {
        this.advance();
        const index = this.parseExpression();
        this.expectOp(']');
        expr = { kind: 'IndexExpression', pos: expr.pos, object: expr, index };
      } else if (this.checkOp('.')) {
        this.advance();
        const property = this.expectPropertyName();
        expr = { kind: 'MemberExpression', pos: expr.pos, object: expr, property };
      } else {
        break;
      }
    }
    return expr;
  }

  private parseCallArgs(callee: Expression): Expression {
    this.expectOp('(');
    const args: Expression[] = [];
    if (!this.checkOp(')')) {
      do {
        args.push(this.parseArgument());
      } while (this.matchOp(','));
    }
    this.expectOp(')');
    return { kind: 'CallExpression', pos: callee.pos, callee, args };
  }

  /** Аргумент вызова: пропущенный параметр (`f(,23)`) даёт Неопределено. */
  private parseArgument(): Expression {
    if (this.checkOp(',') || this.checkOp(')')) {
      return { kind: 'UndefinedLiteral', pos: this.posOf(this.peek()) };
    }
    return this.parseExpression();
  }

  private parseTernary(): Expression {
    const start = this.advance(); // '?'
    this.expectOp('(');
    const condition = this.parseExpression();
    this.expectOp(',');
    const thenExpr = this.parseExpression();
    this.expectOp(',');
    const elseExpr = this.parseExpression();
    this.expectOp(')');
    return { kind: 'TernaryExpression', pos: this.posOf(start), condition, then: thenExpr, else: elseExpr };
  }

  private parseNew(): Expression {
    const start = this.advance(); // 'новый'
    const typeName = this.expectIdentifier().lexeme;
    const args: Expression[] = [];
    if (this.matchOp('(')) {
      if (!this.checkOp(')')) {
        do {
          args.push(this.parseArgument());
        } while (this.matchOp(','));
      }
      this.expectOp(')');
    }
    return { kind: 'NewObjectExpression', pos: this.posOf(start), typeName, args };
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

  private matchKeyword(set: Set<string>): boolean {
    if (this.isKeyword(set)) {
      this.advance();
      return true;
    }
    return false;
  }

  private expectIdentifier(): Token {
    if (this.peek().type !== TokenType.Identifier) this.error('ожидается идентификатор');
    return this.advance();
  }

  /** Имя свойства допускает ключевые литералы (`Структура.Истина`, `.Null`). */
  private expectPropertyName(): string {
    const t = this.peek();
    if (
      t.type === TokenType.Identifier ||
      t.type === TokenType.Boolean ||
      t.type === TokenType.Null ||
      t.type === TokenType.Undefined
    ) {
      this.advance();
      return t.lexeme;
    }
    this.error('ожидается имя свойства');
  }

  private checkOp(op: string): boolean {
    return this.peek().type === TokenType.Operator && this.peek().lexeme === op;
  }

  private checkNextOp(op: string): boolean {
    return this.peek(1).type === TokenType.Operator && this.peek(1).lexeme === op;
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
    if (!this.isEndOfStatement()) this.error("ожидается ';'");
    this.matchEndOfStatement();
  }

  /** Оператор завершается `;`, концом блока (КонецЕсли и т.п.) или концом файла. */
  private isEndOfStatement(): boolean {
    if (this.peek().type === TokenType.EndOfStatement) return true;
    if (this.isEnd()) return true;
    const t = this.peek();
    return t.type === TokenType.Identifier && END_OF_BLOCK.has(t.lexeme.toLowerCase());
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
