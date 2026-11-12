import { describe, expect, it } from 'vitest';
import { tokenize, tokenizeTolerant } from '../src/lexer/lexer';
import { TokenType } from '../src/lexer/token';

describe('лексер: диапазоны токенов', () => {
  it('заполняет конец токена (1-based, end — за последним символом)', () => {
    const tokens = tokenize('a = 1;\n"x"');
    expect(tokens[0]).toMatchObject({ line: 1, column: 1, endLine: 1, endColumn: 2 });
    expect(tokens[1]).toMatchObject({ line: 1, column: 3, endLine: 1, endColumn: 4 });
    expect(tokens[2]).toMatchObject({ line: 1, column: 5, endLine: 1, endColumn: 6 });
    expect(tokens[3]).toMatchObject({ line: 1, column: 6, endLine: 1, endColumn: 7 });
    expect(tokens[4]).toMatchObject({ line: 2, column: 1, endLine: 2, endColumn: 4 });
  });

  it('считает колонки в UTF-16 code units (эмодзи — два)', () => {
    // Без пересчёта в code points колонка после суррогатной пары сдвинулась бы.
    const tokens = tokenize('"😀" x');
    expect(tokens[0]).toMatchObject({ column: 1, endColumn: 5 });
    expect(tokens[1]).toMatchObject({ column: 6, endColumn: 7 });
  });

  it('даёт конец многострочного литерала на последней строке', () => {
    const tokens = tokenize('a = "первая\n  |вторая";');
    expect(tokens[2]).toMatchObject({
      type: TokenType.String,
      line: 1,
      column: 5,
      endLine: 2,
      endColumn: 11,
    });
    expect(tokens[3]).toMatchObject({ line: 2, column: 11, endLine: 2, endColumn: 12 });
  });

  it('ставит конец EOF-токена в позицию конца текста', () => {
    const tokens = tokenize('a = 1;\n"x"');
    expect(tokens.at(-1)).toMatchObject({ line: 2, column: 4, endLine: 2, endColumn: 4 });
  });
});

describe('лексер: trivia', () => {
  it('по умолчанию комментарии не эмитируются', () => {
    expect(tokenize('a // c\nb').map((t) => t.type)).toEqual([
      TokenType.Identifier,
      TokenType.Identifier,
      TokenType.EndOfFile,
    ]);
  });

  it('includeTrivia эмитирует Comment-токены с диапазоном', () => {
    const tokens = tokenize('a // c\nb', { includeTrivia: true });
    expect(tokens.map((t) => [t.type, t.lexeme])).toEqual([
      [TokenType.Identifier, 'a'],
      [TokenType.Comment, '// c'],
      [TokenType.Identifier, 'b'],
      [TokenType.EndOfFile, ''],
    ]);
    expect(tokens[1]).toMatchObject({ line: 1, column: 3, endLine: 1, endColumn: 7 });
  });

  it('не включает CRLF в Comment-токен', () => {
    const tokens = tokenize('a // c\r\nb', { includeTrivia: true });
    expect(tokens[1]).toMatchObject({
      type: TokenType.Comment,
      lexeme: '// c',
      line: 1,
      column: 3,
      endLine: 1,
      endColumn: 7,
    });
    expect(tokens[2]).toMatchObject({ line: 2, column: 1 });
  });
});

describe('лексер: толерантный режим', () => {
  it('незакрытая строка — ошибка, токен и завершение разбора', () => {
    const { tokens, errors } = tokenizeTolerant('"abc');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: 'Незакрытый строковый литерал',
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 5,
    });
    expect(tokens[0]).toMatchObject({ type: TokenType.String, lexeme: '"abc' });
    expect(tokens.at(-1)?.type).toBe(TokenType.EndOfFile);
  });

  it('незакрытая дата — ошибка и частичный токен', () => {
    const { tokens, errors } = tokenizeTolerant("'2026");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: 'Незакрытый литерал даты',
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 6,
    });
    expect(tokens[0]).toMatchObject({ type: TokenType.Date, lexeme: "'2026" });
  });

  it('неожиданный символ не прерывает разбор', () => {
    const { tokens, errors } = tokenizeTolerant('a @ b');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: "Неожиданный символ '@'",
      line: 1,
      column: 3,
      endLine: 1,
      endColumn: 4,
    });
    expect(tokens.map((t) => t.lexeme)).toEqual(['a', 'b', '']);
  });

  it('собирает несколько ошибок за проход', () => {
    const { errors } = tokenizeTolerant('@ a "x');
    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toBe("Неожиданный символ '@'");
    expect(errors[1]?.message).toBe('Незакрытый строковый литерал');
  });

  it('поддерживает includeTrivia вместе с толерантностью', () => {
    const { tokens } = tokenizeTolerant('a // c\nb', { includeTrivia: true });
    expect(tokens.map((t) => t.type)).toEqual([
      TokenType.Identifier,
      TokenType.Comment,
      TokenType.Identifier,
      TokenType.EndOfFile,
    ]);
  });
});

describe('лексер: поведение по умолчанию', () => {
  it('по-прежнему бросает на незакрытой строке', () => {
    expect(() => tokenize('"abc')).toThrow(/строка 1/);
  });

  it('по-прежнему бросает на неожиданном символе', () => {
    expect(() => tokenize('a @ b')).toThrow(/Неожиданный символ '@'/);
  });
});
