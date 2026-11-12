import type { Position } from 'vscode-languageserver';
import type { Expression, MethodDeclaration, Statement } from '../ast/nodes';
import { KW_ENDFUNCTION, KW_ENDPROCEDURE, KW_NEW } from '../parser/keywords';
import { TokenType } from '../lexer/token';
import type { Token } from '../lexer/token';
import type { Analysis } from './analysis';
import { findFunction, findType } from './api-catalog';
import { lastSignificantBefore, previousSignificant } from './positions';

/**
 * Минимальный вывод типа для `Член.` (data-model.md §6): только однозначные случаи,
 * иначе `unknown` — лучше промолчать, чем предложить неверные члены.
 */
export type InferredType = { kind: 'known'; name: string } | { kind: 'unknown' };

const UNKNOWN: InferredType = { kind: 'unknown' };
const MAX_DEPTH = 8;

interface AstNode {
  kind?: unknown;
  pos?: { line: number; column: number };
  [key: string]: unknown;
}

function asNode(value: unknown): AstNode | undefined {
  return typeof value === 'object' && value !== null ? (value as AstNode) : undefined;
}

function walk(node: unknown, visit: (node: AstNode) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  const record = asNode(node);
  if (record === undefined) return;
  if (typeof record.kind === 'string') visit(record);
  for (const [key, value] of Object.entries(record)) {
    if (key === 'pos' || key === 'kind') continue;
    walk(value, visit);
  }
}

/** Каноническое имя типа из каталога; иначе unknown. */
function knownType(name: string): InferredType {
  const type = findType(name.trim());
  return type === undefined ? UNKNOWN : { kind: 'known', name: type.ru };
}

/** Единственный тип возврата: альтернативы (`|`, запятая) не дают однозначности. */
function singleReturnType(returns: string | null): InferredType {
  if (returns === null) return UNKNOWN;
  const value = returns.trim();
  if (value === '' || value.includes('|') || value.includes(',')) return UNKNOWN;
  return knownType(value);
}

function isAfter(token: Token, pos: { line: number; column: number }): boolean {
  return token.line > pos.line || (token.line === pos.line && token.column > pos.column);
}

function methodEndLine(analysis: Analysis, method: MethodDeclaration): number {
  const endKeyword = method.isFunction ? KW_ENDFUNCTION : KW_ENDPROCEDURE;
  for (const token of analysis.tokens) {
    if (token.type !== TokenType.Identifier) continue;
    if (!isAfter(token, method.pos)) continue;
    if (endKeyword.has(token.lexeme.toLowerCase())) return token.line;
  }
  return Number.POSITIVE_INFINITY;
}

/** Метод, в области которого находится позиция; `undefined` — модульный код. */
export function methodAt(analysis: Analysis, position: Position): MethodDeclaration | undefined {
  let current: MethodDeclaration | undefined;
  for (const statement of analysis.program.body) {
    if (statement.kind !== 'MethodDeclaration') continue;
    if (statement.pos.line - 1 > position.line) break;
    if (
      statement.pos.line - 1 === position.line &&
      statement.pos.column - 1 > position.character
    ) {
      continue;
    }
    if (position.line > methodEndLine(analysis, statement) - 1) continue;
    current = statement;
  }
  return current;
}

function scopeStatements(analysis: Analysis, method: MethodDeclaration | undefined): Statement[] {
  if (method !== undefined) return method.body;
  // Тела методов не входят в модульную область — иначе повторные `X = …` в разных
  // методах ложно делали бы тип неоднозначным.
  return analysis.program.body.filter((statement) => statement.kind !== 'MethodDeclaration');
}

interface AssignmentInfo {
  value: Expression;
  line: number;
  column: number;
}

function assignmentsNamed(statements: readonly Statement[], name: string): AssignmentInfo[] {
  const lower = name.toLowerCase();
  const result: AssignmentInfo[] = [];
  for (const statement of statements) {
    walk(statement, (node) => {
      if (node.kind !== 'Assignment') return;
      const target = asNode(node.target);
      if (target?.kind !== 'Identifier' || typeof target.name !== 'string') return;
      if (target.name.toLowerCase() !== lower) return;
      const value = asNode(node.value);
      if (value === undefined) return;
      const pos = node.pos ?? { line: 1, column: 1 };
      result.push({ value: value as Expression, line: pos.line, column: pos.column });
    });
  }
  return result;
}

/** Тип выражения; для `Identifier` — по однократному присваиванию в области позиции. */
export function inferExpressionType(
  analysis: Analysis,
  expression: Expression,
  position: Position,
  depth = 0,
): InferredType {
  if (depth > MAX_DEPTH) return UNKNOWN;
  switch (expression.kind) {
    case 'NewObjectExpression':
      return knownType(expression.typeName);
    case 'Identifier':
      return inferVariableType(analysis, expression.name, position, depth + 1);
    case 'AwaitExpression':
      return inferExpressionType(analysis, expression.operand, position, depth + 1);
    case 'CallExpression': {
      if (expression.callee.kind !== 'Identifier') return UNKNOWN;
      if (KW_NEW.has(expression.callee.name.toLowerCase())) {
        const first = expression.args[0];
        return first?.kind === 'StringLiteral' ? knownType(first.value) : UNKNOWN;
      }
      const fn = findFunction(expression.callee.name);
      return fn === undefined ? UNKNOWN : singleReturnType(fn.returns);
    }
    default:
      return UNKNOWN;
  }
}

/** Тип переменной: ровно одно присваивание до курсора в текущей области. */
export function inferVariableType(
  analysis: Analysis,
  name: string,
  position: Position,
  depth = 0,
): InferredType {
  if (depth > MAX_DEPTH) return UNKNOWN;
  const method = methodAt(analysis, position);
  const assignments = assignmentsNamed(scopeStatements(analysis, method), name);
  if (assignments.length !== 1) return UNKNOWN;
  const assignment = assignments[0];
  if (assignment === undefined) return UNKNOWN;
  const assignmentLine = assignment.line - 1;
  const assignmentColumn = assignment.column - 1;
  if (
    assignmentLine > position.line ||
    (assignmentLine === position.line && assignmentColumn > position.character)
  ) {
    return UNKNOWN;
  }
  return inferExpressionType(
    analysis,
    assignment.value,
    { line: assignmentLine, character: assignmentColumn },
    depth + 1,
  );
}

function matchingParen(analysis: Analysis, closeIndex: number): number | undefined {
  let depth = 0;
  for (let index = closeIndex; index >= 0; index -= 1) {
    const token = analysis.tokens[index];
    if (token === undefined || token.type !== TokenType.Operator) continue;
    if (token.lexeme === ')') depth += 1;
    if (token.lexeme === '(') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return undefined;
}

function callReturnType(analysis: Analysis, openIndex: number): InferredType {
  const callee = previousSignificant(analysis, openIndex);
  if (callee === undefined || callee.token.type !== TokenType.Identifier) return UNKNOWN;
  const beforeCallee = previousSignificant(analysis, callee.index);
  if (beforeCallee !== undefined && KW_NEW.has(beforeCallee.token.lexeme.toLowerCase())) {
    return knownType(callee.token.lexeme);
  }
  const fn = findFunction(callee.token.lexeme);
  return fn === undefined ? UNKNOWN : singleReturnType(fn.returns);
}

/**
 * Тип объекта перед точкой для completion/hover членов. Понимает `Переменная.`,
 * `Новый Тип.` и прямой вызов stdlib-функции `Функция(…).`; цепочки — unknown.
 */
export function inferMemberType(analysis: Analysis, position: Position): InferredType {
  const last = lastSignificantBefore(analysis, position);
  if (last === undefined) return UNKNOWN;

  let objectIndex: number | undefined;
  if (last.token.type === TokenType.Operator && last.token.lexeme === '.') {
    const beforeDot = previousSignificant(analysis, last.index);
    objectIndex = beforeDot?.index;
  } else if (last.token.type === TokenType.Identifier) {
    const beforeToken = previousSignificant(analysis, last.index);
    if (
      beforeToken?.token.type !== TokenType.Operator ||
      beforeToken.token.lexeme !== '.'
    ) {
      return UNKNOWN;
    }
    const beforeDot = previousSignificant(analysis, beforeToken.index);
    objectIndex = beforeDot?.index;
  }
  if (objectIndex === undefined) return UNKNOWN;

  const object = analysis.tokens[objectIndex];
  if (object === undefined) return UNKNOWN;
  if (object.type === TokenType.Identifier) {
    const beforeObject = previousSignificant(analysis, objectIndex);
    if (beforeObject !== undefined && KW_NEW.has(beforeObject.token.lexeme.toLowerCase())) {
      return knownType(object.lexeme);
    }
    return inferVariableType(analysis, object.lexeme, position);
  }
  if (object.type === TokenType.Operator && object.lexeme === ')') {
    const openIndex = matchingParen(analysis, objectIndex);
    return openIndex === undefined ? UNKNOWN : callReturnType(analysis, openIndex);
  }
  return UNKNOWN;
}

