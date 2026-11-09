/** Позиция в исходнике (1-базовая). */
export interface Pos {
  line: number;
  column: number;
}

interface Node {
  pos: Pos;
}

// --- Выражения ---

export interface NumberLiteral extends Node {
  kind: 'NumberLiteral';
  value: number;
}
export interface StringLiteral extends Node {
  kind: 'StringLiteral';
  value: string;
}
export interface BooleanLiteral extends Node {
  kind: 'BooleanLiteral';
  value: boolean;
}
export interface DateLiteral extends Node {
  kind: 'DateLiteral';
  value: string;
}
export interface NullLiteral extends Node {
  kind: 'NullLiteral';
}
export interface UndefinedLiteral extends Node {
  kind: 'UndefinedLiteral';
}
export interface Identifier extends Node {
  kind: 'Identifier';
  name: string;
}
export interface BinaryExpression extends Node {
  kind: 'BinaryExpression';
  operator: string;
  left: Expression;
  right: Expression;
}
export interface UnaryExpression extends Node {
  kind: 'UnaryExpression';
  operator: string;
  operand: Expression;
}
export interface CallExpression extends Node {
  kind: 'CallExpression';
  callee: string;
  args: Expression[];
}

export type Expression =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | DateLiteral
  | NullLiteral
  | UndefinedLiteral
  | Identifier
  | BinaryExpression
  | UnaryExpression
  | CallExpression;

// --- Операторы ---

export interface Assignment extends Node {
  kind: 'Assignment';
  target: string;
  value: Expression;
}
export interface IfStatement extends Node {
  kind: 'IfStatement';
  condition: Expression;
  thenBranch: Statement[];
  elseBranch: Statement[] | null;
}
export interface ExpressionStatement extends Node {
  kind: 'ExpressionStatement';
  expression: Expression;
}
export interface MethodParameter {
  name: string;
  defaultValue?: Expression;
}
export interface MethodDeclaration extends Node {
  kind: 'MethodDeclaration';
  name: string;
  isFunction: boolean;
  exported: boolean;
  params: MethodParameter[];
  body: Statement[];
}
export interface ReturnStatement extends Node {
  kind: 'ReturnStatement';
  value?: Expression;
}
export interface VariableDeclaration extends Node {
  kind: 'VariableDeclaration';
  name: string;
}

export type Statement =
  | Assignment
  | IfStatement
  | ExpressionStatement
  | MethodDeclaration
  | ReturnStatement
  | VariableDeclaration;

export interface Program extends Node {
  kind: 'Program';
  body: Statement[];
}
