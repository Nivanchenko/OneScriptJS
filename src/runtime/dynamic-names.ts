import type {
  Expression,
  LValue,
  MethodDeclaration,
  Program,
  Statement,
} from '../ast/nodes';
import type { Scope } from './scope';
import type { RuntimeEnvironment } from './context';

/** Всё, что видно динамическому фрагменту на момент проверки имён. */
export interface DynamicNameContext {
  scope: Scope;
  methods: ReadonlyMap<string, MethodDeclaration>;
  env: RuntimeEnvironment;
}

/** Локальные слоты кадра: `Перем` и имена, которым в теле присваивают значение. */
export interface FrameLocals {
  /** Явные `Перем` кадра — локальные, могут затенять внешние имена. */
  declared: string[];
  /** Имена, которым в кадре присваивают значение (слоты локалей кадра). */
  assigned: string[];
}

/**
 * Собирает локальные имена кадра по AST до исполнения тела: эталон выделяет слоты
 * всех локалей на компиляции (`ExtractCompilerContext` → `_currentFrame.Locals`),
 * поэтому динамический код видит их как `Неопределено` ещё до присваивания.
 */
export function collectFrameLocals(body: readonly Statement[]): FrameLocals {
  const declared: string[] = [];
  const assigned: string[] = [];
  collectLocalsFrom(body, declared, assigned);
  return { declared, assigned };
}

function collectLocalsFrom(
  body: readonly Statement[],
  declared: string[],
  assigned: string[],
): void {
  for (const stmt of body) {
    switch (stmt.kind) {
      case 'VariableDeclaration':
        declared.push(...stmt.names);
        break;
      case 'Assignment':
        if (stmt.target.kind === 'Identifier') assigned.push(stmt.target.name);
        break;
      case 'ForLoop':
      case 'ForEachLoop':
        assigned.push(stmt.variable);
        collectLocalsFrom(stmt.body, declared, assigned);
        break;
      case 'IfStatement':
        collectLocalsFrom(stmt.thenBranch, declared, assigned);
        if (Array.isArray(stmt.elseBranch)) {
          collectLocalsFrom(stmt.elseBranch, declared, assigned);
        } else if (stmt.elseBranch) {
          collectLocalsFrom([stmt.elseBranch], declared, assigned);
        }
        break;
      case 'WhileLoop':
        collectLocalsFrom(stmt.body, declared, assigned);
        break;
      case 'TryExceptStatement':
        collectLocalsFrom(stmt.tryBody, declared, assigned);
        collectLocalsFrom(stmt.exceptBody, declared, assigned);
        break;
      // Тело вложенного метода — отдельный кадр, его локали сюда не входят.
    }
  }
}

/** Встроенные функции, которые интерпретатор исполняет сам, не через `env.call`. */
const BUILTIN_FUNCTIONS = new Set([
  'вычислить',
  'eval',
  'описаниеошибки',
  'errordescription',
  'информацияобошибке',
  'errorinfo',
  'вызватьсобытие',
  'raiseevent',
]);

const key = (name: string): string => name.toLowerCase();

interface WalkState {
  /** Объявленные в тексте имена (lowercase), пополняется в текстовом порядке. */
  known: Set<string>;
  /** `Перем` и методы верхнего уровня фрагмента — известны всему фрагменту. */
  moduleVars: ReadonlySet<string>;
  moduleMethods: ReadonlySet<string>;
  ctx: DynamicNameContext;
}

/**
 * Проверяет имена динамического фрагмента до его исполнения: неразрешённое имя —
 * ошибка «Неизвестный символ» (как `SymbolNotFound` на компиляции в эталоне), поэтому
 * ни одна инструкция фрагмента не успевает дать побочный эффект.
 */
export function checkDynamicNames(program: Program, ctx: DynamicNameContext): void {
  const moduleVars = new Set<string>();
  const moduleMethods = new Set<string>();
  for (const stmt of program.body) {
    if (stmt.kind === 'VariableDeclaration') {
      for (const name of stmt.names) moduleVars.add(key(name));
    } else if (stmt.kind === 'MethodDeclaration') {
      moduleMethods.add(key(stmt.name));
    }
  }
  // `known` пополняется текстово-последовательно: чтение до присваивания — ошибка.
  // Слоты локалей фрагмента создаёт `declareFrameLocals` перед исполнением, поэтому
  // вложенный код видит их как `Неопределено`, как в эталоне.
  const state: WalkState = {
    known: new Set(moduleVars),
    moduleVars,
    moduleMethods,
    ctx,
  };
  for (const stmt of program.body) checkStatement(stmt, state);
}

/** Проверяет имена выражения `Вычислить` до его вычисления. */
export function checkDynamicExpression(expr: Expression, ctx: DynamicNameContext): void {
  checkExpression(expr, {
    known: new Set(),
    moduleVars: new Set(),
    moduleMethods: new Set(),
    ctx,
  });
}

function readable(name: string, state: WalkState): boolean {
  const lower = key(name);
  return (
    state.known.has(lower) ||
    state.ctx.scope.findBinding(name) !== undefined ||
    state.ctx.env.resolveGlobal?.(name) !== undefined ||
    state.ctx.env.hasGlobal?.(name) === true ||
    lower === 'этотобъект' ||
    lower === 'thisobject'
  );
}

function callable(name: string, state: WalkState): boolean {
  const lower = key(name);
  if (state.moduleMethods.has(lower) || state.ctx.methods.has(lower)) return true;
  if (BUILTIN_FUNCTIONS.has(lower)) return true;
  // Окружение без предиката не может ответить — вызов решает runtime (совместимость).
  if (state.ctx.env.hasFunction === undefined) return true;
  return state.ctx.env.hasFunction(name);
}

function checkBlock(body: readonly Statement[], state: WalkState): void {
  for (const stmt of body) checkStatement(stmt, state);
}

function checkStatement(stmt: Statement, state: WalkState): void {
  switch (stmt.kind) {
    case 'Assignment':
      // Сначала значение: `Рез = Рез + 8` без прежнего присваивания — ошибка.
      checkExpression(stmt.value, state);
      checkTarget(stmt.target, state);
      return;
    case 'ExpressionStatement':
      checkExpression(stmt.expression, state);
      return;
    case 'VariableDeclaration':
      for (const name of stmt.names) state.known.add(key(name));
      return;
    case 'IfStatement':
      checkExpression(stmt.condition, state);
      checkBlock(stmt.thenBranch, state);
      // Присваивания ветки видны дальше — состояние `known` общее для обеих веток.
      if (stmt.elseBranch) {
        if (Array.isArray(stmt.elseBranch)) checkBlock(stmt.elseBranch, state);
        else checkStatement(stmt.elseBranch, state);
      }
      return;
    case 'ForLoop':
      checkExpression(stmt.from, state);
      // Счётчик объявляется до проверки `to` — как `VisitForLoop` в эталоне.
      state.known.add(key(stmt.variable));
      checkExpression(stmt.to, state);
      checkBlock(stmt.body, state);
      return;
    case 'ForEachLoop':
      checkExpression(stmt.collection, state);
      state.known.add(key(stmt.variable));
      checkBlock(stmt.body, state);
      return;
    case 'WhileLoop':
      checkExpression(stmt.condition, state);
      checkBlock(stmt.body, state);
      return;
    case 'TryExceptStatement':
      checkBlock(stmt.tryBody, state);
      checkBlock(stmt.exceptBody, state);
      return;
    case 'ReturnStatement':
    case 'RaiseStatement':
      if (stmt.value) checkExpression(stmt.value, state);
      return;
    case 'ExecuteStatement':
      // Содержимое строки проверяется при её собственном исполнении.
      checkExpression(stmt.value, state);
      return;
    case 'AddHandlerStatement':
    case 'RemoveHandlerStatement':
      checkExpression(stmt.eventSource, state);
      checkExpression(stmt.eventName, state);
      if (stmt.handlerTarget) checkExpression(stmt.handlerTarget, state);
      checkExpression(stmt.handlerMethod, state);
      return;
    case 'MethodDeclaration':
      checkMethodBody(stmt, state);
      return;
    case 'BreakStatement':
    case 'ContinueStatement':
    case 'LabelStatement':
    case 'GotoStatement':
      return;
  }
}

function checkTarget(target: LValue, state: WalkState): void {
  if (target.kind === 'Identifier') {
    state.known.add(key(target.name));
    return;
  }
  checkExpression(target.object, state);
  if (target.kind === 'IndexExpression') checkExpression(target.index, state);
}

function checkMethodBody(method: MethodDeclaration, state: WalkState): void {
  // Тело метода фрагмента живёт в module-scope фрагмента: верхнеуровневые
  // присваивания ему не видны, поэтому `known` начинается заново.
  const body: WalkState = {
    known: new Set(state.moduleVars),
    moduleVars: state.moduleVars,
    moduleMethods: state.moduleMethods,
    ctx: state.ctx,
  };
  for (const param of method.params) {
    body.known.add(key(param.name));
    if (param.defaultValue) checkExpression(param.defaultValue, body);
  }
  checkBlock(method.body, body);
}

function checkExpression(expr: Expression, state: WalkState): void {
  switch (expr.kind) {
    case 'Identifier':
      if (!readable(expr.name, state)) throw new Error(`Неизвестный символ: ${expr.name}`);
      return;
    case 'CallExpression':
      if (expr.callee.kind === 'Identifier') {
        if (!callable(expr.callee.name, state)) {
          throw new Error(`Неизвестный символ: ${expr.callee.name}`);
        }
      } else {
        checkExpression(expr.callee, state);
      }
      for (const arg of expr.args) checkExpression(arg, state);
      return;
    case 'MemberExpression':
      checkExpression(expr.object, state);
      return;
    case 'IndexExpression':
      checkExpression(expr.object, state);
      checkExpression(expr.index, state);
      return;
    case 'BinaryExpression':
      checkExpression(expr.left, state);
      checkExpression(expr.right, state);
      return;
    case 'UnaryExpression':
      checkExpression(expr.operand, state);
      return;
    case 'TernaryExpression':
      checkExpression(expr.condition, state);
      checkExpression(expr.then, state);
      checkExpression(expr.else, state);
      return;
    case 'NewObjectExpression':
      // shortcut: имя типа в `Новый` не проверяется — неизвестный тип остаётся
      // ошибкой исполнения; проверка появится с фазой компиляции.
      for (const arg of expr.args) checkExpression(arg, state);
      return;
    case 'AwaitExpression':
      checkExpression(expr.operand, state);
      return;
    case 'NumberLiteral':
    case 'StringLiteral':
    case 'BooleanLiteral':
    case 'DateLiteral':
    case 'NullLiteral':
    case 'UndefinedLiteral':
      return;
  }
}
