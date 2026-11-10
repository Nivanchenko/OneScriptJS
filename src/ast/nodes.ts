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
  callee: Expression;
  args: Expression[];
}
export interface MemberExpression extends Node {
  kind: 'MemberExpression';
  object: Expression;
  property: string;
}
export interface IndexExpression extends Node {
  kind: 'IndexExpression';
  object: Expression;
  index: Expression;
}
export interface TernaryExpression extends Node {
  kind: 'TernaryExpression';
  condition: Expression;
  then: Expression;
  else: Expression;
}
export interface NewObjectExpression extends Node {
  kind: 'NewObjectExpression';
  typeName: string;
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
  | CallExpression
  | MemberExpression
  | IndexExpression
  | TernaryExpression
  | NewObjectExpression;

// --- Операторы ---

export type LValue = Identifier | MemberExpression | IndexExpression;

export interface Assignment extends Node {
  kind: 'Assignment';
  target: LValue;
  value: Expression;
}
export interface IfStatement extends Node {
  kind: 'IfStatement';
  condition: Expression;
  thenBranch: Statement[];
  elseBranch: Statement[] | IfStatement | null;
}
export interface ExpressionStatement extends Node {
  kind: 'ExpressionStatement';
  expression: Expression;
}
export interface MethodParameter {
  name: string;
  byValue: boolean;
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
  names: string[];
}
export interface ForLoop extends Node {
  kind: 'ForLoop';
  variable: string;
  from: Expression;
  to: Expression;
  body: Statement[];
}
export interface WhileLoop extends Node {
  kind: 'WhileLoop';
  condition: Expression;
  body: Statement[];
}
export interface ForEachLoop extends Node {
  kind: 'ForEachLoop';
  variable: string;
  collection: Expression;
  body: Statement[];
}
export interface BreakStatement extends Node {
  kind: 'BreakStatement';
}
export interface ContinueStatement extends Node {
  kind: 'ContinueStatement';
}
export interface TryExceptStatement extends Node {
  kind: 'TryExceptStatement';
  tryBody: Statement[];
  exceptBody: Statement[];
}
export interface RaiseStatement extends Node {
  kind: 'RaiseStatement';
  value?: Expression;
}
export interface LabelStatement extends Node {
  kind: 'LabelStatement';
  name: string;
}
export interface GotoStatement extends Node {
  kind: 'GotoStatement';
  label: string;
}

export type Statement =
  | Assignment
  | IfStatement
  | ExpressionStatement
  | MethodDeclaration
  | ReturnStatement
  | VariableDeclaration
  | ForLoop
  | WhileLoop
  | ForEachLoop
  | BreakStatement
  | ContinueStatement
  | TryExceptStatement
  | RaiseStatement
  | LabelStatement
  | GotoStatement;

export interface Program extends Node {
  kind: 'Program';
  body: Statement[];
}
