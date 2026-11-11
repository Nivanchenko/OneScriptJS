import { TokenType } from '../lexer/token';
import type { Token } from '../lexer/token';
import type { Expression, IfStatement, LValue, MethodParameter, Pos, Program, Statement } from '../ast/nodes';

import {
  COMPARISON_OPS,
  END_OF_BLOCK,
  KW_ADD_HANDLER,
  KW_AND,
  KW_ASYNC,
  KW_AWAIT,
  KW_BREAK,
  KW_CONTINUE,
  KW_EACH,
  KW_ELSE,
  KW_ELSIF,
  KW_ENDIF,
  KW_ENDFUNCTION,
  KW_ENDLOOP,
  KW_ENDPROCEDURE,
  KW_ENDTRY,
  KW_EXCEPT,
  KW_EXECUTE,
  KW_EXPORT,
  KW_FOR,
  KW_FUNCTION,
  KW_GOTO,
  KW_IF,
  KW_IN,
  KW_LOOP,
  KW_NEW,
  KW_NOT,
  KW_OR,
  KW_PROCEDURE,
  KW_RAISE,
  KW_REMOVE_HANDLER,
  KW_RETURN,
  KW_THEN,
  KW_TO,
  KW_TRY,
  KW_VALUE,
  KW_VAR,
  KW_WHILE,
} from './keywords';

/** Ошибка разбора с диапазоном; при толерантном разборе не прерывает анализ. */
export interface ParseDiagnostic {
  readonly message: string;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface ParseTolerantResult {
  program: Program;
  errors: ParseDiagnostic[];
}

/** Строит AST из потока токенов лексера. Бросает на первой ошибке. */
export function parse(tokens: Token[]): Program {
  return new Parser(tokens).parse();
}

/** Собирает несколько ошибок с диапазонами и отдаёт частичный AST. */
export function parseTolerant(tokens: Token[]): ParseTolerantResult {
  return new Parser(tokens).parseTolerant();
}

/** Внутренний сигнал раскрутки до ближайшей точки восстановления. */
class RecoverableParseError extends Error {}

function isLValue(expr: Expression): expr is LValue {
  return expr.kind === 'Identifier' || expr.kind === 'MemberExpression' || expr.kind === 'IndexExpression';
}

class Parser {
  private current = 0;
  private readonly eof: Token;
  /** Контекст исполнения для проверок `Возврат`/`Прервать`/`Продолжить`/`ВызватьИсключение`. */
  private methodKind: 'procedure' | 'function' | null = null;
  /** Тело асинхронного метода: внутри разрешён `Ждать`. */
  private inAsync = false;
  private loopDepth = 0;
  private exceptDepth = 0;
  /** Толерантный режим: ошибки копятся в `diagnostics`, а не бросаются наружу. */
  private tolerant = false;
  private readonly diagnostics: ParseDiagnostic[] = [];

  constructor(private readonly tokens: Token[]) {
    this.eof = tokens[tokens.length - 1]!;
  }

  parse(): Program {
    const start = this.peek();
    const body: Statement[] = [];

    // Канонический порядок секций модуля: переменные → методы → исполняемый код
    // (DefaultBslParser: BuildVariablesSection → BuildMethodsSection → BuildModuleBody).
    this.skipModuleSeparators();
    while (this.isKeyword(KW_VAR)) {
      body.push(this.parseVariableDeclaration());
      this.skipModuleSeparators();
    }

    while (this.isMethodStart()) {
      body.push(this.parseMethod());
      this.skipModuleSeparators();
    }

    while (!this.isEnd()) {
      if (this.isKeyword(KW_VAR)) {
        this.error(
          'объявления переменных должны быть расположены в начале модуля, процедуры или функции',
        );
      }
      if (this.isMethodStart()) {
        this.error('объявление метода должно быть расположено до исполняемого кода');
      }
      body.push(this.parseStatement());
      this.skipModuleSeparators();
    }

    return { kind: 'Program', pos: this.posOf(start), body };
  }

  /**
   * Паник-режим: ошибки не прерывают модуль, а операторы/секции восстанавливаются
   * на `;`, закрывающем ключевом слове или начале метода.
   */
  parseTolerant(): ParseTolerantResult {
    this.tolerant = true;
    const start = this.peek();
    const body: Statement[] = [];

    this.skipModuleSeparators();
    while (this.isKeyword(KW_VAR)) {
      this.attempt(() => body.push(this.parseVariableDeclaration()));
      this.skipModuleSeparators();
    }

    while (this.isMethodStart()) {
      this.attemptMethod(body);
      this.skipModuleSeparators();
    }

    while (!this.isEnd()) {
      if (this.isKeyword(KW_VAR)) {
        this.report(
          'объявления переменных должны быть расположены в начале модуля, процедуры или функции',
        );
        this.attempt(() => body.push(this.parseVariableDeclaration()));
        this.skipModuleSeparators();
        continue;
      }
      if (this.isMethodStart()) {
        this.report('объявление метода должно быть расположено до исполняемого кода');
        this.attemptMethod(body);
        this.skipModuleSeparators();
        continue;
      }
      this.attempt(() => body.push(this.parseStatement()));
      this.skipModuleSeparators();
    }

    return {
      program: { kind: 'Program', pos: this.posOf(start), body },
      errors: this.diagnostics,
    };
  }

  /** Разбирает оператор; в толерантном режиме ошибка не выходит из цикла. */
  private attempt(parse: () => void): void {
    const from = this.current;
    try {
      parse();
    } catch (error) {
      if (!(error instanceof RecoverableParseError)) throw error;
      this.recoverStatement(from);
    }
  }

  private attemptMethod(body: Statement[]): void {
    const from = this.current;
    try {
      body.push(this.parseMethod());
    } catch (error) {
      if (!(error instanceof RecoverableParseError)) throw error;
      this.recoverMethod(from);
    }
  }

  /** Пропускает `;`, пустые операторы и аннотации между секциями модуля. */
  private skipModuleSeparators(): void {
    for (;;) {
      if (this.matchEndOfStatement()) continue;
      if (this.checkOp('&')) {
        const from = this.current;
        try {
          this.skipAnnotation();
        } catch (error) {
          if (!(error instanceof RecoverableParseError)) throw error;
          this.recoverStatement(from);
        }
        continue;
      }
      break;
    }
  }

  // --- операторы ---

  private parseStatement(): Statement {
    while (this.checkOp('&')) this.skipAnnotation();
    while (this.matchEndOfStatement()) { /* пустой оператор `;;` */ }

    if (this.isKeyword(KW_IF)) return this.parseIf();
    if (this.isMethodStart()) {
      this.error('объявление метода должно быть расположено до исполняемого кода');
    }
    if (this.isKeyword(KW_RETURN)) return this.parseReturn();
    if (this.isKeyword(KW_VAR)) {
      this.error(
        'объявления переменных должны быть расположены в начале модуля, процедуры или функции',
      );
    }
    if (this.isKeyword(KW_FOR)) return this.parseFor();
    if (this.isKeyword(KW_WHILE)) return this.parseWhile();
    if (this.isKeyword(KW_BREAK)) return this.parseBreak();
    if (this.isKeyword(KW_CONTINUE)) return this.parseContinue();
    if (this.isKeyword(KW_TRY)) return this.parseTry();
    if (this.isKeyword(KW_RAISE)) return this.parseRaise();
    if (this.isKeyword(KW_GOTO)) return this.parseGoto();
    if (this.isKeyword(KW_EXECUTE)) return this.parseExecute();
    if (this.isKeyword(KW_ADD_HANDLER)) return this.parseHandler('add');
    if (this.isKeyword(KW_REMOVE_HANDLER)) return this.parseHandler('remove');
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
      this.attempt(() => body.push(this.parseStatement()));
    }
    return body;
  }

  private parseMethod(): Statement {
    const isAsync = this.isAsyncModifier();
    const asyncToken = isAsync ? this.advance() : undefined;
    const start = this.advance(); // 'процедура' | 'функция'
    const isFunction = KW_FUNCTION.has(start.lexeme.toLowerCase());
    const previousMethod = this.methodKind;
    const previousAsync = this.inAsync;
    this.methodKind = isFunction ? 'function' : 'procedure';
    this.inAsync = isAsync;
    // try/finally — состояние контекста не должно утекать в следующий метод при ошибке.
    try {
      const name = this.expectIdentifier();
      if (isAsync && ['присозданииобъекта', 'onobjectcreate'].includes(name.lexeme.toLowerCase())) {
        this.error('Асинхронный конструктор не поддерживается');
      }
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
      this.skipModuleSeparators();
      while (this.isKeyword(KW_VAR)) {
        this.attempt(() => body.push(this.parseVariableDeclaration()));
        this.skipModuleSeparators();
      }
      while (!this.isEnd() && !this.isKeyword(endKw)) {
        this.attempt(() => body.push(this.parseStatement()));
      }

      this.expectKeyword(endKw);
      this.matchEndOfStatement();
      return {
        kind: 'MethodDeclaration',
        pos: this.posOf(asyncToken ?? start),
        name: name.lexeme,
        isFunction,
        isAsync,
        exported,
        params,
        body,
      };
    } finally {
      this.methodKind = previousMethod;
      this.inAsync = previousAsync;
    }
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

    if (this.methodKind === null) {
      this.error('Оператор "Возврат" может использоваться только внутри метода');
    } else if (this.methodKind === 'function' && value === undefined) {
      this.error('Функция должна возвращать значение');
    } else if (this.methodKind === 'procedure' && value !== undefined) {
      this.error('Процедуры не могут возвращать значение');
    }

    this.expectEndOfStatement();
    return { kind: 'ReturnStatement', pos: this.posOf(start), value };
  }

  private parseVariableDeclaration(): Statement {
    const start = this.advance(); // 'перем'
    const names: string[] = [];
    const exportedNames: string[] = [];
    do {
      const name = this.expectIdentifier().lexeme;
      names.push(name);
      if (this.matchKeyword(KW_EXPORT)) exportedNames.push(name);
    } while (this.matchOp(','));
    this.expectEndOfStatement();
    return {
      kind: 'VariableDeclaration',
      pos: this.posOf(start),
      names,
      ...(exportedNames.length > 0 ? { exportedNames } : {}),
    };
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
    if (this.loopDepth === 0) {
      this.error('Оператор "Прервать" может использоваться только внутри цикла');
    }
    this.expectEndOfStatement();
    return { kind: 'BreakStatement', pos: this.posOf(start) };
  }

  private parseContinue(): Statement {
    const start = this.advance();
    if (this.loopDepth === 0) {
      this.error('Оператор "Продолжить" может использоваться только внутри цикла');
    }
    this.expectEndOfStatement();
    return { kind: 'ContinueStatement', pos: this.posOf(start) };
  }

  private parseTry(): Statement {
    const start = this.expectKeyword(KW_TRY);
    const tryBody = this.parseStatementsUntil(KW_EXCEPT);
    this.expectKeyword(KW_EXCEPT);
    this.exceptDepth += 1;
    let exceptBody: Statement[];
    try {
      exceptBody = this.parseStatementsUntil(KW_ENDTRY);
    } finally {
      this.exceptDepth -= 1;
    }
    this.expectKeyword(KW_ENDTRY);
    this.matchEndOfStatement();
    return { kind: 'TryExceptStatement', pos: this.posOf(start), tryBody, exceptBody };
  }

  private parseRaise(): Statement {
    const start = this.advance(); // 'вызватьисключение'
    let value: Expression | undefined;
    if (this.peek().type !== TokenType.EndOfStatement) value = this.parseExpression();
    if (value === undefined && this.exceptDepth === 0) {
      this.error(
        'Оператор "ВызватьИсключение" без параметров может использоваться только в блоке "Исключение"',
      );
    }
    this.expectEndOfStatement();
    return { kind: 'RaiseStatement', pos: this.posOf(start), value };
  }

  private parseExecute(): Statement {
    const start = this.advance(); // 'выполнить'
    const value = this.parseExpression();
    this.expectEndOfStatement();
    return { kind: 'ExecuteStatement', pos: this.posOf(start), value };
  }

  /**
   * `ДобавитьОбработчик <источник>, <обработчик>`: форма разбирается структурно —
   * обработчик не вычисляется как значение (это ссылка на метод).
   */
  private parseHandler(kind: 'add' | 'remove'): Statement {
    const start = this.advance(); // ключевое слово
    const eventRef = this.parsePostfix();
    let eventSource: Expression;
    let eventName: Expression;
    if (eventRef.kind === 'MemberExpression') {
      eventSource = eventRef.object;
      eventName = { kind: 'StringLiteral', pos: eventRef.pos, value: eventRef.property };
    } else if (eventRef.kind === 'IndexExpression') {
      eventSource = eventRef.object;
      eventName = eventRef.index;
    } else {
      this.error('Ожидается имя события');
    }

    this.expectOp(',');
    const handlerRef = this.parsePostfix();
    let handlerTarget: Expression | null;
    let handlerMethod: Expression;
    if (handlerRef.kind === 'Identifier') {
      handlerTarget = null;
      handlerMethod = { kind: 'StringLiteral', pos: handlerRef.pos, value: handlerRef.name };
    } else if (handlerRef.kind === 'MemberExpression') {
      handlerTarget = handlerRef.object;
      handlerMethod = { kind: 'StringLiteral', pos: handlerRef.pos, value: handlerRef.property };
    } else if (handlerRef.kind === 'IndexExpression') {
      handlerTarget = handlerRef.object;
      handlerMethod = handlerRef.index;
    } else {
      this.error('Ожидается имя обработчика события');
    }

    this.expectEndOfStatement();
    return {
      kind: kind === 'add' ? 'AddHandlerStatement' : 'RemoveHandlerStatement',
      pos: this.posOf(start),
      eventSource,
      eventName,
      handlerTarget,
      handlerMethod,
    };
  }

  private parseLoopBody(): Statement[] {
    const body: Statement[] = [];
    this.loopDepth += 1;
    try {
      while (!this.isEnd() && !this.isKeyword(KW_ENDLOOP)) {
        this.attempt(() => body.push(this.parseStatement()));
      }
    } finally {
      this.loopDepth -= 1;
    }
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
    const awaitExpr = this.tryParseAwait();
    if (awaitExpr) return awaitExpr;
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

  // --- контекстные Асинх/Ждать ---

  private isAsyncModifier(): boolean {
    const token = this.peek();
    return token.type === TokenType.Identifier && KW_ASYNC.has(token.lexeme.toLowerCase());
  }

  private isKeywordAt(offset: number, keywords: Set<string>): boolean {
    const token = this.tokens[this.current + offset];
    return (
      token !== undefined &&
      token.type === TokenType.Identifier &&
      keywords.has(token.lexeme.toLowerCase())
    );
  }

  /** Начало объявления метода, в т.ч. с модификатором `Асинх`. */
  private isMethodStart(): boolean {
    if (this.isKeyword(KW_PROCEDURE) || this.isKeyword(KW_FUNCTION)) return true;
    return (
      this.isAsyncModifier() &&
      (this.isKeywordAt(1, KW_PROCEDURE) || this.isKeywordAt(1, KW_FUNCTION))
    );
  }

  private isAwaitKeyword(): boolean {
    const token = this.peek();
    return token.type === TokenType.Identifier && KW_AWAIT.has(token.lexeme.toLowerCase());
  }

  /** Начинается ли с токена выражение (для отличия `Ждать X` от имени `Ждать`). */
  private startsExpression(token: Token | undefined): boolean {
    if (!token) return false;
    switch (token.type) {
      case TokenType.Number:
      case TokenType.String:
      case TokenType.Boolean:
      case TokenType.Date:
      case TokenType.Null:
      case TokenType.Undefined:
        return true;
      case TokenType.Identifier:
        return !END_OF_BLOCK.has(token.lexeme.toLowerCase());
      case TokenType.Operator:
        // `Ждать (...)` трактуется как вызов имени `Ждать` (как в эталоне).
        return token.lexeme === '+' || token.lexeme === '-' || token.lexeme === '?';
      default:
        return false;
    }
  }

  private tryParseAwait(): Expression | null {
    if (!this.isAwaitKeyword()) return null;
    const next = this.tokens[this.current + 1];
    if (!this.startsExpression(next)) return null; // `Ждать` — обычный идентификатор
    if (next !== undefined && next.type === TokenType.Identifier && KW_AWAIT.has(next.lexeme.toLowerCase())) {
      this.error('Нельзя ожидать результат ожидания');
    }
    // `inAsync` — тело асинхронного метода; `methodKind === null` — тело модуля (расширение).
    if (!this.inAsync && this.methodKind !== null) {
      this.error('Ждать допустим только в асинхронном методе или теле модуля');
    }
    const token = this.advance();
    const operand = this.parseUnary();
    return { kind: 'AwaitExpression', pos: this.posOf(token), operand };
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

  /** Записывает диагностику без исключения (толерантный режим). */
  private report(message: string): void {
    const t = this.peek();
    this.diagnostics.push({
      message,
      line: t.line,
      column: t.column,
      endLine: t.endLine,
      endColumn: t.endColumn,
    });
  }

  /** Паник-восстановление оператора: до `;`, закрывающего блока, начала метода или EOF. */
  private recoverStatement(from: number): void {
    // Ошибка на первом токене оператора: без сдвига цикл разбора не завершится.
    if (this.current === from) this.advanceRecovery();
    while (!this.isEnd()) {
      if (this.peek().type === TokenType.EndOfStatement) {
        this.advanceRecovery();
        return;
      }
      if (this.atBlockBoundary()) return;
      this.advanceRecovery();
    }
  }

  /** Восстановление объявления метода: пропускает его закрывающее ключевое слово. */
  private recoverMethod(from: number): void {
    this.recoverStatement(from);
    if (this.isKeyword(KW_ENDPROCEDURE) || this.isKeyword(KW_ENDFUNCTION)) {
      this.advanceRecovery();
      this.matchEndOfStatement();
    }
  }

  private atBlockBoundary(): boolean {
    if (this.isEnd()) return true;
    if (this.peek().type !== TokenType.Identifier) return false;
    const lower = this.peek().lexeme.toLowerCase();
    return (
      END_OF_BLOCK.has(lower) ||
      KW_PROCEDURE.has(lower) ||
      KW_FUNCTION.has(lower) ||
      (KW_ASYNC.has(lower) &&
        (this.isKeywordAt(1, KW_PROCEDURE) || this.isKeywordAt(1, KW_FUNCTION)))
    );
  }

  private advanceRecovery(): void {
    if (!this.isEnd()) this.advance();
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
    const text = `Ошибка разбора: ${message} (строка ${t.line}, колонка ${t.column})`;
    if (!this.tolerant) throw new Error(text);
    this.report(message);
    throw new RecoverableParseError(text);
  }
}
