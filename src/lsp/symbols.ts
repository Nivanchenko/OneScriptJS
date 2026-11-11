import { SymbolKind } from 'vscode-languageserver';
import type { DocumentSymbol, Location, Position, Range } from 'vscode-languageserver';
import { TokenType } from '../lexer/token';
import type { Token } from '../lexer/token';
import {
  DIR_ENDREGION,
  DIR_REGION,
  KW_ASYNC,
  KW_ENDFUNCTION,
  KW_ENDPROCEDURE,
  KW_FUNCTION,
  KW_PROCEDURE,
} from '../parser/keywords';
import type { Analysis, MethodSymbol } from './analysis';

/** Резолв `${importPath}` → file-URI; инжектируется из `src/node` (слой LSP файлы не читает). */
export type ImportResolver = (importPath: string, documentUri: string) => string | null;

const ZERO_RANGE: Range = {
  start: { line: 0, character: 0 },
  end: { line: 0, character: 0 },
};

function tokenEnd(token: Token): Position {
  // У директивы препроцессора в CRLF `\r` попадает в лексему, но не в строку LSP.
  const trim = token.lexeme.endsWith('\r') ? 1 : 0;
  return { line: token.endLine - 1, character: Math.max(0, token.endColumn - 1 - trim) };
}

function comparePosition(a: Position, b: Position): number {
  return a.line - b.line || a.character - b.character;
}

function containsPosition(range: Range, position: Position): boolean {
  return (
    comparePosition(range.start, position) <= 0 && comparePosition(range.end, position) >= 0
  );
}

/** Директива региона: имя после `#Область`/`#Region` (пустое — как есть). */
function regionDirective(token: Token): { word: string; name: string } | undefined {
  // Хвост строки не фиксируем `$`: в CRLF `\r` остаётся в лексеме директивы.
  const match = /^#\s*([A-Za-zА-Яа-яЁё\u0370-\u03FF_]+)\s*([^\r\n]*)/u.exec(token.lexeme);
  if (match === null) return undefined;
  const word = (match[1] ?? '').toLowerCase();
  const name = (match[2] ?? '').trim();
  if (DIR_REGION.has(word)) return { word, name: name.length > 0 ? name : match[1] ?? '' };
  if (DIR_ENDREGION.has(word)) return { word, name };
  return undefined;
}

/** Строит иерархию регионов `#Область`/`#КонецОбласти` из trivia-токенов. */
function regionSymbols(tokens: readonly Token[]): DocumentSymbol[] {
  const roots: DocumentSymbol[] = [];
  const stack: DocumentSymbol[] = [];
  const eof = tokens[tokens.length - 1];
  const fallbackEnd: Position = eof === undefined ? ZERO_RANGE.end : tokenEnd(eof);

  const close = (symbol: DocumentSymbol, end: Position): void => {
    symbol.range.end = end;
    symbol.selectionRange = { start: { ...symbol.range.start }, end: { ...end } };
  };

  for (const token of tokens) {
    if (token.type !== TokenType.Preprocessor) continue;
    const directive = regionDirective(token);
    if (directive === undefined) continue;
    if (DIR_REGION.has(directive.word)) {
      const start: Position = { line: token.line - 1, character: token.column - 1 };
      const symbol: DocumentSymbol = {
        name: directive.name,
        kind: SymbolKind.Namespace,
        range: { start: { ...start }, end: { ...start } },
        selectionRange: { start: { ...start }, end: { ...start } },
        children: [],
      };
      const parent = stack[stack.length - 1];
      if (parent === undefined) roots.push(symbol);
      else (parent.children ??= []).push(symbol);
      stack.push(symbol);
    } else {
      const open = stack.pop();
      if (open !== undefined) close(open, tokenEnd(token));
    }
  }

  // Незакрытые регионы заканчиваются на последнем токене документа, а не теряются.
  while (stack.length > 0) {
    const open = stack.pop();
    if (open !== undefined) close(open, fallbackEnd);
  }
  return roots;
}

function tokenIndexAt(tokens: readonly Token[], position: Position): number {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) continue;
    if (token.line - 1 !== position.line) continue;
    if (token.column - 1 === position.character) return i;
  }
  return -1;
}

/** `range` метода — от объявления (включая `Асинх`) до закрывающего ключевого слова. */
function methodRange(tokens: readonly Token[], method: MethodSymbol): Range {
  const nameIndex = tokenIndexAt(tokens, method.range.start);
  if (nameIndex < 0) return method.range;

  let startIndex = nameIndex - 1;
  const keyword = startIndex >= 0 ? tokens[startIndex] : undefined;
  const isDeclaration =
    keyword?.type === TokenType.Identifier &&
    (KW_PROCEDURE.has(keyword.lexeme.toLowerCase()) ||
      KW_FUNCTION.has(keyword.lexeme.toLowerCase()));
  if (!isDeclaration) return method.range;

  const beforeKeyword = startIndex - 1 >= 0 ? tokens[startIndex - 1] : undefined;
  if (
    beforeKeyword?.type === TokenType.Identifier &&
    KW_ASYNC.has(beforeKeyword.lexeme.toLowerCase())
  ) {
    startIndex -= 1;
  }

  const start = tokens[startIndex];
  if (start === undefined) return method.range;
  const closingKeywords = method.isFunction ? KW_ENDFUNCTION : KW_ENDPROCEDURE;
  let end: Position | undefined;
  for (let i = nameIndex + 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined || token.type === TokenType.EndOfFile) break;
    if (token.type !== TokenType.Identifier) continue;
    if (!closingKeywords.has(token.lexeme.toLowerCase())) continue;
    end = tokenEnd(token);
    break;
  }

  return {
    start: { line: start.line - 1, character: start.column - 1 },
    end: end ?? method.range.end,
  };
}

function methodSymbol(tokens: readonly Token[], method: MethodSymbol): DocumentSymbol {
  return {
    name: method.name,
    kind: method.isFunction ? SymbolKind.Function : SymbolKind.Method,
    range: methodRange(tokens, method),
    selectionRange: method.range,
  };
}

/** Дети самого глубокого региона, содержащего позицию; иначе — переданный уровень. */
function deepestRegionChildren(
  symbols: DocumentSymbol[],
  position: Position,
): DocumentSymbol[] {
  for (const symbol of symbols) {
    if (symbol.kind !== SymbolKind.Namespace) continue;
    if (!containsPosition(symbol.range, position)) continue;
    symbol.children ??= [];
    return deepestRegionChildren(symbol.children, position);
  }
  return symbols;
}

function sortSymbols(symbols: DocumentSymbol[]): void {
  symbols.sort((a, b) => comparePosition(a.range.start, b.range.start));
  for (const symbol of symbols) {
    if (symbol.children !== undefined) sortSymbols(symbol.children);
  }
}

/**
 * Outline документа: методы (`Method`/`Function`) и вложенные регионы `#Область`
 * (`Namespace`). Диапазон региона — от директивы до `#КонецОбласти`.
 */
export function documentSymbols(analysis: Analysis): DocumentSymbol[] {
  const symbols = regionSymbols(analysis.tokens);
  for (const method of analysis.symbols.methods) {
    const symbol = methodSymbol(analysis.tokens, method);
    deepestRegionChildren(symbols, symbol.range.start).push(symbol);
  }
  sortSymbols(symbols);
  pruneEmptyChildren(symbols);
  return symbols;
}

function pruneEmptyChildren(symbols: DocumentSymbol[]): void {
  for (const symbol of symbols) {
    if (symbol.children === undefined) continue;
    if (symbol.children.length === 0) delete symbol.children;
    else pruneEmptyChildren(symbol.children);
  }
}

function tokenAt(tokens: readonly Token[], position: Position): Token | undefined {
  let atWordEnd: Token | undefined;
  for (const token of tokens) {
    if (token.type !== TokenType.Identifier) continue;
    if (token.line - 1 > position.line) break;
    if (token.line - 1 !== position.line) continue;
    const start = token.column - 1;
    const end = token.endLine - 1 === position.line ? token.endColumn - 1 : Number.POSITIVE_INFINITY;
    if (position.character >= start && position.character < end) return token;
    // Курсор сразу за идентификатором (конец слова) — тоже попадание.
    if (position.character === end) atWordEnd ??= token;
  }
  return atWordEnd;
}

/** Путь импорта, если позиция — внутри кавычек директивы `#Использовать`. */
function importPathAt(analysis: Analysis, position: Position): string | undefined {
  for (const imported of analysis.imports) {
    const token = analysis.tokens.find(
      (candidate) => candidate.type === TokenType.Preprocessor && candidate.line === imported.line,
    );
    if (token === undefined) continue;
    const match = /"([^"]*)"/.exec(token.lexeme);
    if (match === null) continue;
    const quoteStart = token.column - 1 + (match.index ?? 0);
    const quoteEnd = quoteStart + match[0].length;
    if (
      position.line === token.line - 1 &&
      position.character >= quoteStart &&
      position.character <= quoteEnd
    ) {
      return imported.path;
    }
  }
  return undefined;
}

/**
 * Переход к определению: локальный метод/переменная — тот же документ; `#Использовать` —
 * файл модуля через инжектированный резолвер; untitled-буфер — без перехода.
 */
export function definitionAt(
  analysis: Analysis,
  documentUri: string,
  position: Position,
  resolveImport?: ImportResolver,
): Location | Location[] | null {
  const importPath = importPathAt(analysis, position);
  if (importPath !== undefined) {
    if (
      documentUri.startsWith('untitled:') ||
      resolveImport === undefined
    ) {
      return null;
    }
    const uri = resolveImport(importPath, documentUri);
    return uri === null || uri === '' ? null : { uri, range: ZERO_RANGE };
  }

  const token = tokenAt(analysis.tokens, position);
  if (token === undefined || token.type !== TokenType.Identifier) return null;
  const name = token.lexeme.toLowerCase();

  const method = analysis.symbols.methods.find(
    (candidate) => candidate.name.toLowerCase() === name,
  );
  if (method !== undefined) return { uri: documentUri, range: method.range };

  // Локальные объявления важнее модульных: последнее объявление до курсора.
  const locals = analysis.symbols.locals.filter(
    (candidate) => candidate.name.toLowerCase() === name,
  );
  if (locals.length > 0) {
    const before = locals.filter(
      (candidate) =>
        candidate.range.start.line < position.line ||
        (candidate.range.start.line === position.line &&
          candidate.range.start.character <= position.character),
    );
    const chosen = (before.length > 0 ? before : locals)[(before.length > 0 ? before : locals).length - 1];
    if (chosen !== undefined) return { uri: documentUri, range: chosen.range };
  }

  const variable = analysis.symbols.moduleVars.find(
    (candidate) => candidate.name.toLowerCase() === name,
  );
  if (variable !== undefined) return { uri: documentUri, range: variable.range };

  return null;
}
