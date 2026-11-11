import { DiagnosticSeverity } from 'vscode-languageserver';
import type { Diagnostic, Range } from 'vscode-languageserver';
import { TokenType } from '../lexer/token';
import type { Token } from '../lexer/token';
import { arity, findEnum, findFunction, findType } from './api-catalog';
import type { SymbolTables } from './analysis';
import type { Program } from '../ast/nodes';

interface AstNode {
  kind: string;
  pos?: { line: number; column: number };
  [key: string]: unknown;
}

function warning(code: string, message: string, range: Range): Diagnostic {
  return { range, severity: DiagnosticSeverity.Warning, code, source: 'osjs', message };
}

/** Диапазон идентификатора по позиции узла (AST хранит только начало). */
function identifierRange(node: AstNode, name: string): Range {
  const pos = node.pos ?? { line: 1, column: 1 };
  const start = { line: Math.max(0, pos.line - 1), character: Math.max(0, pos.column - 1) };
  return { start, end: { line: start.line, character: start.character + name.length } };
}

/** Диапазон имени, найденного после `from` в потоке токенов (для `Новый <Тип>` и т.п.). */
function nameRangeAfter(
  tokens: Token[],
  name: string,
  from: { line: number; column: number },
  fallback: AstNode,
): Range {
  const lower = name.toLowerCase();
  for (const token of tokens) {
    if (token.type !== TokenType.Identifier) continue;
    const after = token.line > from.line || (token.line === from.line && token.column >= from.column);
    if (!after || token.lexeme.toLowerCase() !== lower) continue;
    return {
      start: { line: token.line - 1, character: token.column - 1 },
      end: { line: token.endLine - 1, character: token.endColumn - 1 },
    };
  }
  return identifierRange(fallback, name);
}

/** Обход AST без зависимостей от конкретных типов узлов. */
function walk(node: unknown, visit: (node: AstNode) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const record = node as AstNode;
  if (typeof record.kind === 'string') visit(record);
  for (const [key, value] of Object.entries(record)) {
    if (key === 'pos' || key === 'kind') continue;
    walk(value, visit);
  }
}

/**
 * Консервативные семантические проверки (Warning):
 * OSJS3001 — неизвестная функция; OSJS3002 — арность известной функции;
 * OSJS3003 — неизвестный тип в `Новый` (только если в файле нет `#Использовать`).
 */
export function semanticDiagnostics(
  program: Program,
  symbols: SymbolTables,
  imports: readonly { path: string }[],
  tokens: Token[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const known = (name: string): boolean =>
    findFunction(name) !== undefined ||
    findType(name) !== undefined ||
    findEnum(name) !== undefined ||
    symbols.knownNames.has(name.toLowerCase());

  walk(program, (node) => {
    if (node.kind === 'CallExpression') {
      const callee = node.callee as AstNode | undefined;
      if (callee?.kind !== 'Identifier' || typeof callee.name !== 'string') return;
      const name = callee.name;
      if (!known(name)) {
        diagnostics.push(warning('OSJS3001', `Неизвестная функция «${name}».`, identifierRange(callee, name)));
        return;
      }
      const fn = findFunction(name);
      if (fn === undefined) return; // локальный метод/переменная — арность не проверяем
      const { min, max } = arity(fn);
      const count = Array.isArray(node.args) ? node.args.length : 0;
      const range = identifierRange(callee, name);
      if (count < min) {
        diagnostics.push(
          warning('OSJS3002', `Функция «${name}» ожидает не менее ${min} аргументов.`, range),
        );
      } else if (count > max) {
        diagnostics.push(
          warning('OSJS3002', `Функция «${name}» ожидает не более ${max} аргументов.`, range),
        );
      }
      return;
    }

    if (node.kind === 'NewObjectExpression') {
      if (imports.length > 0) return; // класс мог быть импортирован
      const typeName = node.typeName;
      if (typeof typeName !== 'string') return;
      if (findType(typeName) !== undefined) return;
      const pos = node.pos ?? { line: 1, column: 1 };
      diagnostics.push(
        warning(
          'OSJS3003',
          `Неизвестный тип «${typeName}» в «Новый».`,
          nameRangeAfter(tokens, typeName, pos, node),
        ),
      );
    }
  });

  return diagnostics;
}
