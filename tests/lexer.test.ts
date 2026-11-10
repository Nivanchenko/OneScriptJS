import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/lexer/lexer';
import { TokenType } from '../src/lexer/token';

describe('лексер', () => {
  it('разбирает идентификаторы (русские и латинские)', () => {
    const tokens = tokenize('имя возраст _x abc1');
    expect(tokens.map((t) => [t.type, t.lexeme])).toEqual([
      [TokenType.Identifier, 'имя'],
      [TokenType.Identifier, 'возраст'],
      [TokenType.Identifier, '_x'],
      [TokenType.Identifier, 'abc1'],
      [TokenType.EndOfFile, ''],
    ]);
  });

  it('разбирает строковый литерал и экранирование ""', () => {
    const tokens = tokenize('"Никита" "a""b"');
    expect(tokens[0]).toMatchObject({ type: TokenType.String, value: 'Никита' });
    expect(tokens[1]).toMatchObject({ type: TokenType.String, value: 'a"b' });
  });

  it('разбирает многострочный литерал с продолжением через |', () => {
    const tokens = tokenize('"первая\n\t|вторая\n  // комментарий\n  |третья"');
    expect(tokens[0]).toMatchObject({
      type: TokenType.String,
      value: 'первая\nвторая\nтретья',
    });
  });

  it('отбрасывает CR в CRLF внутри литерала', () => {
    const tokens = tokenize('"a\r\n|b"');
    expect(tokens[0]).toMatchObject({ type: TokenType.String, value: 'a\nb' });
  });

  it('разбирает числа (целые и дробные)', () => {
    const tokens = tokenize('38 1.5');
    expect(tokens[0]).toMatchObject({ type: TokenType.Number, value: 38 });
    expect(tokens[1]).toMatchObject({ type: TokenType.Number, value: 1.5 });
  });

  it('разбирает литерал даты', () => {
    const tokens = tokenize("'20260101'");
    expect(tokens[0]).toMatchObject({ type: TokenType.Date, value: '20260101' });
  });

  it('разбирает спец-литералы регистронезависимо (RU/EN)', () => {
    const tokens = tokenize('Истина Ложь Неопределено NULL true false undefined');
    expect(tokens.slice(0, -1).map((t) => [t.type, t.value])).toEqual([
      [TokenType.Boolean, true],
      [TokenType.Boolean, false],
      [TokenType.Undefined, undefined],
      [TokenType.Null, undefined],
      [TokenType.Boolean, true],
      [TokenType.Boolean, false],
      [TokenType.Undefined, undefined],
    ]);
  });

  it('разбирает операторы, включая двухсимвольные', () => {
    const tokens = tokenize('= + - * / % > < >= <= <> ( ) , . [ ]');
    expect(tokens.slice(0, -1).map((t) => t.lexeme)).toEqual([
      '=', '+', '-', '*', '/', '%', '>', '<', '>=', '<=', '<>', '(', ')', ',', '.', '[', ']',
    ]);
  });

  it('разбирает ; как конец оператора', () => {
    const tokens = tokenize(';');
    expect(tokens[0]).toMatchObject({ type: TokenType.EndOfStatement });
  });

  it('пропускает комментарии //', () => {
    const tokens = tokenize('a // комментарий\nb');
    expect(tokens.map((t) => t.lexeme)).toEqual(['a', 'b', '']);
  });

  it('разбирает препроцессорную строку целиком', () => {
    const tokens = tokenize('#Если Истина Тогда\nсообщить("x");');
    expect(tokens[0]).toMatchObject({ type: TokenType.Preprocessor, lexeme: '#Если Истина Тогда' });
  });

  it('разбирает приёмочный пример целиком', () => {
    const tokens = tokenize('имя = "Никита"; возраст = 38; сообщить("..." + имя);');
    expect(tokens.map((t) => [t.type, t.lexeme])).toEqual([
      [TokenType.Identifier, 'имя'],
      [TokenType.Operator, '='],
      [TokenType.String, '"Никита"'],
      [TokenType.EndOfStatement, ';'],
      [TokenType.Identifier, 'возраст'],
      [TokenType.Operator, '='],
      [TokenType.Number, '38'],
      [TokenType.EndOfStatement, ';'],
      [TokenType.Identifier, 'сообщить'],
      [TokenType.Operator, '('],
      [TokenType.String, '"..."'],
      [TokenType.Operator, '+'],
      [TokenType.Identifier, 'имя'],
      [TokenType.Operator, ')'],
      [TokenType.EndOfStatement, ';'],
      [TokenType.EndOfFile, ''],
    ]);
  });

  it('отслеживает строку и колонку', () => {
    const tokens = tokenize('a\n  b');
    expect(tokens[0]).toMatchObject({ line: 1, column: 1 });
    expect(tokens[1]).toMatchObject({ line: 2, column: 3 });
  });

  it('бросает ошибку на незакрытой строке', () => {
    expect(() => tokenize('"abc')).toThrow(/строка 1/);
  });
});
