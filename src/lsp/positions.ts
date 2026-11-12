import type { Position, Range } from 'vscode-languageserver';
import { TokenType } from '../lexer/token';
import type { Token } from '../lexer/token';
import type { Analysis } from './analysis';

export interface SourcePoint {
  line: number;
  character: number;
}

export function tokenStart(token: Token): SourcePoint {
  return { line: Math.max(0, token.line - 1), character: Math.max(0, token.column - 1) };
}

export function tokenEnd(token: Token): SourcePoint {
  return { line: Math.max(0, token.endLine - 1), character: Math.max(0, token.endColumn - 1) };
}

export function comparePoints(a: SourcePoint, b: SourcePoint): number {
  return a.line - b.line || a.character - b.character;
}

export function isTrivia(token: Token): boolean {
  return (
    token.type === TokenType.Comment ||
    token.type === TokenType.Preprocessor ||
    token.type === TokenType.EndOfFile
  );
}

export function tokenRange(token: Token): Range {
  return { start: tokenStart(token), end: tokenEnd(token) };
}

/**
 * Токен в позиции курсора. Конец идентификатора/комментария включается: курсор
 * сразу после набранного слова — это ещё это слово (нужно для completion и hover).
 */
export function tokenAt(analysis: Analysis, position: Position): Token | undefined {
  for (const token of analysis.tokens) {
    const start = tokenStart(token);
    if (comparePoints(position, start) < 0) break;
    const end = tokenEnd(token);
    const inside = comparePoints(position, end) < 0;
    const atEnd =
      comparePoints(position, end) === 0 &&
      (token.type === TokenType.Identifier ||
        token.type === TokenType.Comment ||
        token.type === TokenType.Preprocessor);
    if (inside || atEnd) return token;
  }
  return undefined;
}

export function isInsideTrivia(analysis: Analysis, position: Position): boolean {
  const token = tokenAt(analysis, position);
  return token !== undefined && (token.type === TokenType.String || isTrivia(token));
}

/** Последний значимый токен, начинающийся не позже позиции. */
export function lastSignificantBefore(
  analysis: Analysis,
  position: Position,
): { token: Token; index: number } | undefined {
  let found: { token: Token; index: number } | undefined;
  for (let index = 0; index < analysis.tokens.length; index += 1) {
    const token = analysis.tokens[index];
    if (token === undefined) continue;
    if (comparePoints(tokenStart(token), position) > 0) break;
    if (!isTrivia(token)) found = { token, index };
  }
  return found;
}

export function previousSignificant(
  analysis: Analysis,
  index: number,
): { token: Token; index: number } | undefined {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const token = analysis.tokens[cursor];
    if (token !== undefined && !isTrivia(token)) return { token, index: cursor };
  }
  return undefined;
}
