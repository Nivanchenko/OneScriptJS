import { TokenType } from './token';
import type { LexerDiagnostic, LiteralValue, Token } from './token';

// Спец-литералы распознаются регистронезависимо (как в 1С/BSL).
const BOOLEAN_TRUE = new Set(['истина', 'true']);
const BOOLEAN_FALSE = new Set(['ложь', 'false']);
const UNDEFINED = new Set(['неопределено', 'undefined']);
const NULL = new Set(['null']);

const IDENT_START = /[A-Za-zА-Яа-яЁё\u0370-\u03FF_]/;
const IDENT_PART = /[A-Za-zА-Яа-яЁё\u0370-\u03FF0-9_]/;
const DIGIT = /[0-9]/;

const TWO_CHAR_OPERATORS = new Set(['<=', '>=', '<>']);
const OPERATOR_CHARS = new Set([
  '+', '-', '*', '/', '%', '=', '>', '<',
  '(', ')', ',', '.', '[', ']', '?', '~', '&', ':',
]);

export interface TokenizeOptions {
  /** Эмитировать `//`-комментарии токенами `Comment` (для semantic tokens). */
  includeTrivia?: boolean;
}

export interface TokenizeResult {
  tokens: Token[];
  errors: LexerDiagnostic[];
}

/**
 * Преобразует исходник BSL в поток токенов.
 * Ключевые слова (`если`, `тогда`, `цикл` и т.п.) остаются Identifier —
 * их распознаёт парсер. Комментарии `//` пропускаются.
 */
export function tokenize(source: string, options: TokenizeOptions = {}): Token[] {
  return scan(source, options, false).tokens;
}

/** То же, что `tokenize`, но ошибки собираются и разбор продолжается. */
export function tokenizeTolerant(source: string, options: TokenizeOptions = {}): TokenizeResult {
  return scan(source, options, true);
}

function scan(source: string, options: TokenizeOptions, tolerant: boolean): TokenizeResult {
  const tokens: Token[] = [];
  const errors: LexerDiagnostic[] = [];
  let offset = 0;
  let line = 1;
  let column = 1;

  const peek = (ahead = 0): string => source[offset + ahead] ?? '';
  const advance = (): string => {
    const ch = source[offset] ?? '';
    offset += 1;
    if (ch === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    return ch;
  };

  // Диапазон ошибки — от начала проблемной лексемы до текущей позиции.
  const fail = (message: string, startLine: number, startColumn: number): void => {
    if (!tolerant) throw new Error(`${message}: строка ${startLine}, колонка ${startColumn}`);
    errors.push({ message, line: startLine, column: startColumn, endLine: line, endColumn: column });
  };
  const failUnexpected = (message: string, startLine: number, startColumn: number): void => {
    if (!tolerant) {
      throw new Error(`${message} на строке ${startLine}, колонке ${startColumn}`);
    }
    errors.push({ message, line: startLine, column: startColumn, endLine: line, endColumn: column });
  };

  while (offset < source.length) {
    const startOffset = offset;
    const startLine = line;
    const startColumn = column;
    const emit = (type: TokenType, value?: LiteralValue): void => {
      tokens.push({
        type,
        lexeme: source.slice(startOffset, offset),
        value,
        line: startLine,
        column: startColumn,
        endLine: line,
        endColumn: column,
      });
    };

    const ch = peek();

    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '\uFEFF') {
      advance();
      continue;
    }

    if (ch === '/' && peek(1) === '/') {
      // CRLF не входит в Comment: LSP-диапазон не должен пересекать перевод строки.
      while (
        offset < source.length &&
        peek() !== '\n' &&
        !(peek() === '\r' && peek(1) === '\n')
      ) {
        advance();
      }
      if (options.includeTrivia) emit(TokenType.Comment);
      continue;
    }

    if (ch === '#') {
      advance();
      while (offset < source.length && peek() !== '\n') advance();
      emit(TokenType.Preprocessor);
      continue;
    }

    if (ch === '"') {
      advance();
      let value = '';
      for (;;) {
        if (offset >= source.length) {
          fail('Незакрытый строковый литерал', startLine, startColumn);
          break;
        }
        if (peek() === '"') {
          if (peek(1) === '"') {
            value += '"';
            advance();
            advance();
            continue;
          }
          advance();
          break;
        }
        // Многострочный литерал: `\n` входит в значение, а на следующей строке
        // отступы/комментарии и символ `|` отбрасываются.
        if (peek() === '\n') {
          value += advance();
          for (;;) {
            if (peek() === ' ' || peek() === '\t') {
              advance();
            } else if (peek() === '/' && peek(1) === '/') {
              while (offset < source.length && peek() !== '\n') advance();
              advance(); // перевод строки относится к строке-комментарию
            } else {
              break;
            }
          }
          if (peek() === '|') advance();
          continue;
        }
        if (peek() === '\r') {
          advance(); // CRLF: `\r` не входит в значение
          continue;
        }
        value += advance();
      }
      emit(TokenType.String, value);
      continue;
    }

    if (ch === "'") {
      advance();
      let value = '';
      while (offset < source.length && peek() !== "'") value += advance();
      if (offset >= source.length) {
        fail('Незакрытый литерал даты', startLine, startColumn);
        emit(TokenType.Date, value);
        continue;
      }
      advance();
      emit(TokenType.Date, value);
      continue;
    }

    if (DIGIT.test(ch)) {
      while (offset < source.length && DIGIT.test(peek())) advance();
      if (peek() === '.' && DIGIT.test(peek(1))) {
        advance();
        while (offset < source.length && DIGIT.test(peek())) advance();
      }
      emit(TokenType.Number, Number(source.slice(startOffset, offset)));
      continue;
    }

    if (IDENT_START.test(ch)) {
      while (offset < source.length && IDENT_PART.test(peek())) advance();
      const lower = source.slice(startOffset, offset).toLowerCase();
      if (BOOLEAN_TRUE.has(lower)) emit(TokenType.Boolean, true);
      else if (BOOLEAN_FALSE.has(lower)) emit(TokenType.Boolean, false);
      else if (UNDEFINED.has(lower)) emit(TokenType.Undefined);
      else if (NULL.has(lower)) emit(TokenType.Null);
      else emit(TokenType.Identifier);
      continue;
    }

    if (ch === ';') {
      advance();
      emit(TokenType.EndOfStatement);
      continue;
    }

    const two = ch + peek(1);
    if (TWO_CHAR_OPERATORS.has(two)) {
      advance();
      advance();
      emit(TokenType.Operator);
      continue;
    }

    if (OPERATOR_CHARS.has(ch)) {
      advance();
      emit(TokenType.Operator);
      continue;
    }

    advance();
    failUnexpected(`Неожиданный символ '${ch}'`, startLine, startColumn);
  }

  tokens.push({ type: TokenType.EndOfFile, lexeme: '', line, column, endLine: line, endColumn: column });
  return { tokens, errors };
}
