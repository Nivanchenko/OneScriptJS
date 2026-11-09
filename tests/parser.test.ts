import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/lexer/lexer';
import { parse } from '../src/parser/parser';

function parseExpr(source: string): unknown {
  return parse(tokenize(`${source};`)).body[0];
}

describe('парсер', () => {
  it('парсит присваивание строки', () => {
    const stmt = parseExpr('имя = "Никита"');
    expect(stmt).toMatchObject({
      kind: 'Assignment',
      target: 'имя',
      value: { kind: 'StringLiteral', value: 'Никита' },
    });
  });

  it('парсит присваивание числа', () => {
    const stmt = parseExpr('возраст = 38');
    expect(stmt).toMatchObject({
      kind: 'Assignment',
      target: 'возраст',
      value: { kind: 'NumberLiteral', value: 38 },
    });
  });

  it('парсит вызов функции-оператора', () => {
    const stmt = parseExpr('сообщить("Привет")');
    expect(stmt).toMatchObject({
      kind: 'ExpressionStatement',
      expression: {
        kind: 'CallExpression',
        callee: 'сообщить',
        args: [{ kind: 'StringLiteral', value: 'Привет' }],
      },
    });
  });

  it('парсит конкатенацию слева направо', () => {
    const stmt = parseExpr('x = "a" + имя + "b"');
    expect(stmt).toMatchObject({
      kind: 'Assignment',
      value: {
        kind: 'BinaryExpression',
        operator: '+',
        left: {
          kind: 'BinaryExpression',
          operator: '+',
          left: { kind: 'StringLiteral', value: 'a' },
          right: { kind: 'Identifier', name: 'имя' },
        },
        right: { kind: 'StringLiteral', value: 'b' },
      },
    });
  });

  it('соблюдает приоритет операторов (* сильнее +)', () => {
    const stmt = parseExpr('1 + 2 * 3');
    expect(stmt).toMatchObject({
      kind: 'ExpressionStatement',
      expression: {
        kind: 'BinaryExpression',
        operator: '+',
        left: { kind: 'NumberLiteral', value: 1 },
        right: {
          kind: 'BinaryExpression',
          operator: '*',
          left: { kind: 'NumberLiteral', value: 2 },
          right: { kind: 'NumberLiteral', value: 3 },
        },
      },
    });
  });

  it('парсит унарный минус и Не', () => {
    expect(parseExpr('-5')).toMatchObject({
      kind: 'ExpressionStatement',
      expression: { kind: 'UnaryExpression', operator: '-', operand: { kind: 'NumberLiteral', value: 5 } },
    });
    expect(parseExpr('не Истина')).toMatchObject({
      kind: 'ExpressionStatement',
      expression: { kind: 'UnaryExpression', operator: 'не', operand: { kind: 'BooleanLiteral', value: true } },
    });
  });

  it('парсит условие со скобками', () => {
    const stmt = parseExpr('если (возраст > 18) тогда сообщить("x"); конецесли');
    expect(stmt).toMatchObject({
      kind: 'IfStatement',
      condition: {
        kind: 'BinaryExpression',
        operator: '>',
        left: { kind: 'Identifier', name: 'возраст' },
        right: { kind: 'NumberLiteral', value: 18 },
      },
      elseBranch: null,
    });
    expect((stmt as { thenBranch: unknown[] }).thenBranch).toHaveLength(1);
  });

  it('парсит вложенный если', () => {
    const program = parse(tokenize(
      'если (возраст > 18) тогда\n' +
      '  если (возраст > 30) тогда\n' +
      '    сообщить("больше 30");\n' +
      '  конецесли;\n' +
      'конецесли;',
    ));
    expect(program.body[0]).toMatchObject({
      kind: 'IfStatement',
      thenBranch: [
        {
          kind: 'IfStatement',
          condition: { kind: 'BinaryExpression', operator: '>' },
          elseBranch: null,
        },
      ],
      elseBranch: null,
    });
  });

  it('разбирает приёмочный пример целиком', () => {
    const program = parse(tokenize(
      'имя = "Никита";\n' +
      'фамилия = "Иванченко";\n' +
      'возраст = 38;\n' +
      'сообщить("Привет, ты указал: " + имя + ", " + фамилия);\n' +
      'если (возраст > 18) тогда\n' +
      '  если (возраст > 30) тогда\n' +
      '    сообщить("возраст больше 30");\n' +
      '  конецесли;\n' +
      '  сообщить("Добро пожаловать, " + имя + " твой возраст " + возраст);\n' +
      'конецесли;\n',
    ));
    expect(program.body).toHaveLength(5);
    expect(program.body[4]).toMatchObject({ kind: 'IfStatement' });
  });

  it('сохраняет позиции узлов', () => {
    const program = parse(tokenize('имя = "Никита";'));
    expect(program.body[0]).toMatchObject({ pos: { line: 1, column: 1 } });
    const stmt = parse(tokenize('a = 1;\n  b = 2;'));
    expect(stmt.body[1]).toMatchObject({ pos: { line: 2, column: 3 } });
  });

  it('бросает ошибку при отсутствии ;', () => {
    expect(() => parse(tokenize('имя = "x"'))).toThrow(/ожидается ';'/);
  });

  it('бросает ошибку при отсутствии конецесли', () => {
    expect(() => parse(tokenize('если Истина тогда сообщить("x");'))).toThrow(/ключевое слово/);
  });
});
