import { TokenType } from '../lexer/token';
import type { Token } from '../lexer/token';
import * as languageKeywords from '../parser/keywords';
import { allEnums, findEnum, findFunction } from './api-catalog';
import type { Analysis } from './analysis';

/** Стандартные типы LSP: кастомные клиенты не рендерят (research D16, data-model §5). */
export const SEMANTIC_TOKEN_TYPES = [
  'keyword',
  'operator',
  'number',
  'string',
  'comment',
  'decorator',
  'function',
  'method',
  'variable',
  'parameter',
  'property',
  'enumMember',
] as const;

export type SemanticTokenType = (typeof SEMANTIC_TOKEN_TYPES)[number];

/** Контракт: файлы длиннее 10 000 строк остаются без семантических токенов. */
export const MAX_SEMANTIC_TOKEN_LINES = 10_000;

const TYPE_INDEX = new Map<SemanticTokenType, number>(
  SEMANTIC_TOKEN_TYPES.map((type, index) => [type, index] as const),
);

// Единственный источник ключевых слов — словари парсера (анти-drift, AGENTS §6).
const KEYWORDS = new Set<string>(
  Object.entries(languageKeywords)
    .filter(([name]) => name.startsWith('KW_'))
    .flatMap(([, set]) => [...(set as ReadonlySet<string>)]),
);

const ENUM_VALUE_NAMES = new Set<string>(
  allEnums().flatMap((item) =>
    item.values.flatMap((value) => [
      value.ru.toLowerCase(),
      ...(value.en === undefined ? [] : [value.en.toLowerCase()]),
    ]),
  ),
);

interface TokenEntry {
  line: number;
  start: number;
  length: number;
  type: SemanticTokenType;
}

interface AstNode {
  kind: string;
  pos?: { line: number; column: number };
  [key: string]: unknown;
}

function tokenKey(line: number, column: number): string {
  return `${line}:${column}`;
}

function tokenStartKey(token: Token): string {
  return tokenKey(token.line - 1, token.column - 1);
}

function lower(token: Token): string {
  return token.lexeme.toLowerCase();
}

/** Обход AST без зависимостей от конкретных типов узлов (как в diagnostics.ts). */
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
 * Тип для конкретного вхождения имени: объявления методов/переменных/параметров,
 * цели присваивания, счётчики циклов и вызовы — по AST и таблицам символов.
 */
function buildOverlay(analysis: Analysis): Map<string, SemanticTokenType> {
  const overlay = new Map<string, SemanticTokenType>();
  const tokens = analysis.tokens;

  const startIndex = new Map<string, number>();
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) continue;
    const key = tokenStartKey(token);
    if (!startIndex.has(key)) startIndex.set(key, i);
  }
  const indexAt = (pos: { line: number; column: number } | undefined): number | undefined => {
    if (pos === undefined) return undefined;
    return startIndex.get(tokenKey(pos.line - 1, pos.column - 1));
  };
  const indexAfter = (pos: { line: number; column: number } | undefined): number => {
    if (pos === undefined) return 0;
    const exact = indexAt(pos);
    if (exact !== undefined) return exact;
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token === undefined) continue;
      if (token.line > pos.line || (token.line === pos.line && token.column >= pos.column)) {
        return i;
      }
    }
    return tokens.length - 1;
  };

  const markParameters = (nameIndex: number | undefined, params: readonly string[]): void => {
    if (nameIndex === undefined || params.length === 0) return;
    const names = new Set(params.map((name) => name.toLowerCase()));
    let depth = 0;
    let expecting = false;
    for (let i = nameIndex + 1; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token === undefined || token.type === TokenType.EndOfFile) break;
      if (token.type === TokenType.Operator) {
        if (token.lexeme === '(') {
          depth += 1;
          if (depth === 1) expecting = true;
        } else if (token.lexeme === ')') {
          depth -= 1;
          if (depth === 0) break;
        } else if (token.lexeme === ',' && depth === 1) {
          expecting = true;
        }
        continue;
      }
      if (depth !== 1 || !expecting || token.type !== TokenType.Identifier) continue;
      const low = lower(token);
      if (low === 'знач' || low === 'val') continue;
      if (names.has(low)) overlay.set(tokenStartKey(token), 'parameter');
      expecting = false;
    }
  };

  const localMethods = new Map<string, SemanticTokenType>();
  for (const method of analysis.symbols.methods) {
    localMethods.set(method.name.toLowerCase(), method.isFunction ? 'function' : 'method');
  }

  for (const method of analysis.symbols.methods) {
    const key = tokenKey(method.range.start.line, method.range.start.character);
    const type = method.isFunction ? 'function' : 'method';
    overlay.set(key, type);
    markParameters(startIndex.get(key), method.params);
  }

  for (const variable of analysis.symbols.moduleVars) {
    overlay.set(tokenKey(variable.range.start.line, variable.range.start.character), 'variable');
  }

  const markNames = (startPos: AstNode['pos'], names: readonly string[]): void => {
    if (names.length === 0) return;
    const wanted = new Set(names.map((name) => name.toLowerCase()));
    let found = 0;
    for (let i = indexAfter(startPos) + 1; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token === undefined || token.type === TokenType.EndOfFile) break;
      if (token.type === TokenType.EndOfStatement) break;
      if (token.type !== TokenType.Identifier) continue;
      const low = lower(token);
      if (low === 'экспорт' || low === 'export') continue;
      if (!wanted.has(low)) continue;
      overlay.set(tokenStartKey(token), 'variable');
      found += 1;
      if (found === wanted.size) break;
    }
  };

  // Резерв для целей присваивания: комментарии в потоке токенов могут прервать
  // разбор оператора, но `Имя = ...` остаётся переменной и без AST.
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    const token = tokens[i];
    const next = tokens[i + 1];
    if (token?.type !== TokenType.Identifier) continue;
    if (next?.type !== TokenType.Operator || next.lexeme !== '=') continue;
    if (!overlay.has(tokenStartKey(token))) overlay.set(tokenStartKey(token), 'variable');
  }

  walk(analysis.program, (node) => {
    if (node.kind === 'VariableDeclaration') {
      const names = Array.isArray(node.names) ? (node.names as string[]) : [];
      markNames(node.pos, names);
      return;
    }
    if (node.kind === 'ForLoop' || node.kind === 'ForEachLoop') {
      if (typeof node.variable !== 'string') return;
      const wanted = node.variable.toLowerCase();
      for (let i = indexAfter(node.pos) + 1; i < tokens.length; i += 1) {
        const token = tokens[i];
        if (token === undefined || token.type === TokenType.EndOfFile) break;
        if (token.type !== TokenType.Identifier) continue;
        if (lower(token) !== wanted) continue;
        overlay.set(tokenStartKey(token), 'variable');
        break;
      }
      return;
    }
    if (node.kind === 'Assignment') {
      const target = node.target as AstNode | undefined;
      if (target?.kind !== 'Identifier' || typeof target.name !== 'string') return;
      const index = indexAt(target.pos);
      const token = index === undefined ? undefined : tokens[index];
      if (token !== undefined) overlay.set(tokenStartKey(token), 'variable');
      return;
    }
    if (node.kind === 'CallExpression') {
      const callee = node.callee as AstNode | undefined;
      if (callee?.kind !== 'Identifier' || typeof callee.name !== 'string') return;
      const name = callee.name;
      const type = localMethods.get(name.toLowerCase());
      if (type !== undefined) {
        const index = indexAt(callee.pos);
        const token = index === undefined ? undefined : tokens[index];
        if (token !== undefined) overlay.set(tokenStartKey(token), type);
        return;
      }
      if (findFunction(name) !== undefined) {
        const index = indexAt(callee.pos);
        const token = index === undefined ? undefined : tokens[index];
        if (token !== undefined) overlay.set(tokenStartKey(token), 'function');
      }
    }
  });

  return overlay;
}

interface Segment {
  line: number;
  start: number;
  length: number;
}

/** Разбивает лексему по строкам: LSP-токен не может пересекать строку (data-model §3). */
function segmentsOf(token: Token): Segment[] {
  if (token.endLine === token.line) {
    const start = token.column - 1;
    return [{ line: token.line - 1, start, length: Math.max(0, token.endColumn - token.column) }];
  }
  const segments: Segment[] = [];
  const rawLines = token.lexeme.split('\n');
  for (let i = 0; i < rawLines.length; i += 1) {
    const raw = rawLines[i];
    if (raw === undefined) continue;
    // CRLF: `\r` не является частью строки документа.
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const line = token.line - 1 + i;
    const start = i === 0 ? token.column - 1 : 0;
    if (text.length > 0) segments.push({ line, start, length: text.length });
  }
  return segments;
}

/** Директива препроцессора: `#Область` → keyword; остальная часть строки — вне токена. */
function directiveEntry(token: Token): TokenEntry | undefined {
  const match = /^#\s*[A-Za-zА-Яа-яЁё\u0370-\u03FF_]+/u.exec(token.lexeme);
  if (match === null) return undefined;
  return {
    line: token.line - 1,
    start: token.column - 1,
    length: match[0].length,
    type: 'keyword',
  };
}

function previousToken(tokens: readonly Token[], index: number): Token | undefined {
  return index > 0 ? tokens[index - 1] : undefined;
}

function tokenEntries(analysis: Analysis): TokenEntry[] {
  const tokens = analysis.tokens;
  const overlay = buildOverlay(analysis);
  const entries: TokenEntry[] = [];

  const addSegments = (token: Token, type: SemanticTokenType): void => {
    for (const segment of segmentsOf(token)) entries.push({ ...segment, type });
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) continue;
    switch (token.type) {
      case TokenType.Comment:
        addSegments(token, 'comment');
        continue;
      case TokenType.Preprocessor: {
        const entry = directiveEntry(token);
        if (entry !== undefined) entries.push(entry);
        continue;
      }
      case TokenType.Number:
      case TokenType.Date:
        addSegments(token, 'number');
        continue;
      case TokenType.String:
        addSegments(token, 'string');
        continue;
      case TokenType.Operator:
        addSegments(token, 'operator');
        continue;
      case TokenType.Boolean:
      case TokenType.Undefined:
      case TokenType.Null:
        addSegments(token, 'keyword');
        continue;
      case TokenType.Identifier: {
        const low = lower(token);
        const previous = previousToken(tokens, i);
        const previousOperator = previous?.type === TokenType.Operator ? previous.lexeme : undefined;
        const beforeDot = i >= 2 ? tokens[i - 2] : undefined;
        const enumTypeName =
          previousOperator === '.' && beforeDot?.type === TokenType.Identifier
            ? beforeDot.lexeme
            : undefined;
        const isEnumMember =
          enumTypeName !== undefined &&
          findEnum(enumTypeName) !== undefined &&
          ENUM_VALUE_NAMES.has(low);
        const key = tokenStartKey(token);
        let type: SemanticTokenType | undefined;
        if (previousOperator === '&') {
          type = 'decorator';
        } else if (isEnumMember) {
          type = 'enumMember';
        } else if (previousOperator === '.') {
          type = 'property';
        } else if (KEYWORDS.has(low)) {
          type = 'keyword';
        } else {
          type = overlay.get(key);
          if (type === undefined && ENUM_VALUE_NAMES.has(low)) type = 'enumMember';
          if (type === undefined) {
            const method = analysis.symbols.methods.find(
              (symbol) => symbol.name.toLowerCase() === low,
            );
            if (method !== undefined) type = method.isFunction ? 'function' : 'method';
          }
        }
        if (type !== undefined) addSegments(token, type);
        continue;
      }
      default:
        continue;
    }
  }

  return entries;
}

/**
 * Semantic tokens в формате LSP: дельта-кодированный массив 5 ints/token
 * (deltaLine, deltaStartChar, length, tokenType, tokenModifiers).
 */
export function semanticTokens(analysis: Analysis): number[] {
  const tokens = analysis.tokens;
  const last = tokens[tokens.length - 1];
  const lineCount = Math.max(1, last?.endLine ?? 1);
  if (lineCount > MAX_SEMANTIC_TOKEN_LINES) return [];

  const sorted = tokenEntries(analysis).sort(
    (a, b) => a.line - b.line || a.start - b.start,
  );

  // Пересечения запрещены контрактом; после сортировки отбрасываем наложения.
  const nonOverlapping: TokenEntry[] = [];
  for (const entry of sorted) {
    const previous = nonOverlapping[nonOverlapping.length - 1];
    if (
      previous !== undefined &&
      previous.line === entry.line &&
      entry.start < previous.start + previous.length
    ) {
      continue;
    }
    nonOverlapping.push(entry);
  }

  const data: number[] = [];
  let previousLine = 0;
  let previousStart = 0;
  for (const entry of nonOverlapping) {
    const typeIndex = TYPE_INDEX.get(entry.type);
    if (typeIndex === undefined) continue;
    const deltaLine = entry.line - previousLine;
    const deltaStart = deltaLine === 0 ? entry.start - previousStart : entry.start;
    data.push(deltaLine, deltaStart, entry.length, typeIndex, 0);
    previousLine = entry.line;
    previousStart = entry.start;
  }
  return data;
}
