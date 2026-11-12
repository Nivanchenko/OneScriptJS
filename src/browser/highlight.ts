/**
 * Подсветка BSL для встраиваемых редакторов (песочница, playground).
 *
 * Токенизирует исходник тем же лексером, что и движок, поэтому подсветка не
 * расходится с языком. Возвращает HTML: текст экранирован, токены обёрнуты в
 * `<span class="…">` с классами `ключевое`, `строка`, `число`, `дата`,
 * `литерал`, `комментарий`, `оператор`, `препроцессор`.
 */
import { tokenizeTolerant } from '../lexer/lexer';
import { TokenType } from '../lexer/token';
import type { Token } from '../lexer/token';
import * as languageKeywords from '../parser/keywords';

// Единственный источник ключевых слов — словари парсера (анти-drift, AGENTS §6).
const KEYWORDS = new Set<string>(
  Object.entries(languageKeywords)
    .filter(([name]) => name.startsWith('KW_'))
    .flatMap(([, words]) => [...(words as ReadonlySet<string>)]),
);

const TOKEN_CLASSES: Partial<Record<TokenType, string>> = {
  [TokenType.String]: 'строка',
  [TokenType.Date]: 'дата',
  [TokenType.Number]: 'число',
  [TokenType.Boolean]: 'литерал',
  [TokenType.Undefined]: 'литерал',
  [TokenType.Null]: 'литерал',
  [TokenType.Comment]: 'комментарий',
  [TokenType.Operator]: 'оператор',
  [TokenType.Preprocessor]: 'препроцессор',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (ch) => (ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;'));
}

/** CSS-класс токена; для идентификаторов подсвечиваются только ключевые слова. */
function tokenClass(token: Token): string | undefined {
  if (token.type === TokenType.Identifier) {
    return KEYWORDS.has(token.lexeme.toLowerCase()) ? 'ключевое' : undefined;
  }
  return TOKEN_CLASSES[token.type];
}

/** Смещения начала строк: строка (с 1) → индекс в исходнике. */
function lineOffsets(source: string): number[] {
  const offsets = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') offsets.push(i + 1);
  }
  return offsets;
}

/**
 * HTML-представление исходника BSL с подсветкой. Остальной текст (пробелы,
 * идентификаторы) остаётся как есть. Незавершённый код исключения не бросает:
 * токенизация толерантная, чтобы подсветка не ломалась на ходу набора.
 */
export function highlight(source: string): string {
  const offsets = lineOffsets(source);
  let result = '';
  let cursor = 0;
  for (const token of tokenizeTolerant(source, { includeTrivia: true }).tokens) {
    if (token.type === TokenType.EndOfFile) continue;
    const start = (offsets[token.line - 1] ?? 0) + token.column - 1;
    if (start > cursor) result += escapeHtml(source.slice(cursor, start));
    const text = escapeHtml(source.slice(start, start + token.lexeme.length));
    const cssClass = tokenClass(token);
    result += cssClass === undefined ? text : `<span class="${cssClass}">${text}</span>`;
    cursor = start + token.lexeme.length;
  }
  return cursor < source.length ? result + escapeHtml(source.slice(cursor)) : result;
}
