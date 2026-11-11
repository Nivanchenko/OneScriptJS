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
      target: { kind: 'Identifier', name: 'имя' },
      value: { kind: 'StringLiteral', value: 'Никита' },
    });
  });

  it('парсит присваивание числа', () => {
    const stmt = parseExpr('возраст = 38');
    expect(stmt).toMatchObject({
      kind: 'Assignment',
      target: { kind: 'Identifier', name: 'возраст' },
      value: { kind: 'NumberLiteral', value: 38 },
    });
  });

  it('парсит вызов функции-оператора', () => {
    const stmt = parseExpr('сообщить("Привет")');
    expect(stmt).toMatchObject({
      kind: 'ExpressionStatement',
      expression: {
        kind: 'CallExpression',
        callee: { kind: 'Identifier', name: 'сообщить' },
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

  it('Не имеет приоритет ниже сравнения (Не a = b → Не (a = b))', () => {
    const stmt = parseExpr('не 5 = 0');
    expect(stmt).toMatchObject({
      kind: 'ExpressionStatement',
      expression: {
        kind: 'UnaryExpression',
        operator: 'не',
        operand: { kind: 'BinaryExpression', operator: '=' },
      },
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

  it('требует порядок секций: Перем → методы → код', () => {
    expect(() => parse(tokenize('X = 1;\nФункция Ф()\nКонецФункции'))).toThrow(
      'объявление метода должно быть расположено до исполняемого кода',
    );
    expect(() => parse(tokenize('Процедура П()\nКонецПроцедуры\nПерем X;'))).toThrow(
      'объявления переменных должны быть расположены в начале модуля',
    );
    expect(() => parse(tokenize('X = 1;\nПерем Y;'))).toThrow(
      'объявления переменных должны быть расположены в начале модуля',
    );
  });

  it('требует локальные Перем в начале метода', () => {
    expect(() =>
      parse(tokenize('Процедура П()\nX = 1;\nПерем Y;\nКонецПроцедуры')),
    ).toThrow('объявления переменных должны быть расположены в начале модуля');
    expect(() => parse(tokenize('Процедура П()\nПерем Y;\nY = 1;\nКонецПроцедуры'))).not.toThrow();
  });

  it('запрещает вложенные методы и Перем внутри блоков', () => {
    expect(() =>
      parse(tokenize('Функция Ф()\nФункция В()\nКонецФункции\nКонецФункции')),
    ).toThrow('объявление метода должно быть расположено до исполняемого кода');
    expect(() =>
      parse(tokenize('Процедура П()\nЕсли Истина Тогда\nПерем Y;\nКонецЕсли;\nКонецПроцедуры')),
    ).toThrow('объявления переменных должны быть расположены в начале модуля');
  });

  it('принимает канонический порядок секций', () => {
    const program = parse(tokenize('Перем X;\nПроцедура П()\nКонецПроцедуры\nX = 1;'));
    expect(program.body.map((s) => s.kind)).toEqual([
      'VariableDeclaration',
      'MethodDeclaration',
      'Assignment',
    ]);
  });

  it('парсит множественное объявление Перем a, b, c;', () => {
    const program = parse(tokenize('Перем а, б, в;'));
    expect(program.body[0]).toMatchObject({
      kind: 'VariableDeclaration',
      names: ['а', 'б', 'в'],
    });
  });

  it('парсит Перем с Экспорт у каждого имени', () => {
    const program = parse(tokenize('Перем Поле1 Экспорт, Поле2;'));
    expect(program.body[0]).toMatchObject({
      kind: 'VariableDeclaration',
      names: ['Поле1', 'Поле2'],
      exportedNames: ['Поле1'],
    });
  });

  it('парсит Перем с Экспорт у нескольких имён', () => {
    const program = parse(tokenize('Перем А Экспорт, Б, В Экспорт;'));
    expect(program.body[0]).toMatchObject({
      names: ['А', 'Б', 'В'],
      exportedNames: ['А', 'В'],
    });
  });

  it('не добавляет exportedNames без Экспорт', () => {
    const program = parse(tokenize('Перем А, Б;'));
    expect(program.body[0]).not.toHaveProperty('exportedNames');
  });

  it('парсит пропущенные аргументы вызова f(,23) и f(a,,c)', () => {
    const a = parseExpr('ф(, 23)') as { kind: string; expression: { args: unknown[] } };
    expect(a.expression.args).toMatchObject([
      { kind: 'UndefinedLiteral' },
      { kind: 'NumberLiteral', value: 23 },
    ]);

    const b = parseExpr('ф("x",, "z")') as { kind: string; expression: { args: unknown[] } };
    expect(b.expression.args).toMatchObject([
      { kind: 'StringLiteral', value: 'x' },
      { kind: 'UndefinedLiteral' },
      { kind: 'StringLiteral', value: 'z' },
    ]);
  });

  it('парсит конкатенацию смежных строковых литералов', () => {
    const stmt = parseExpr('x = "a" "b"');
    expect(stmt).toMatchObject({
      kind: 'Assignment',
      value: { kind: 'StringLiteral', value: 'ab' },
    });
  });

  it('парсит ВызватьИсключение без аргумента (перевыброс) в блоке Исключение', () => {
    const program = parse(
      tokenize('Попытка\nВызватьИсключение "x";\nИсключение\nВызватьИсключение;\nКонецПопытки;'),
    );
    expect(program.body[0]).toMatchObject({
      kind: 'TryExceptStatement',
      exceptBody: [{ kind: 'RaiseStatement', value: undefined }],
    });
  });

  it('запрещает ВызватьИсключение без аргумента вне блока Исключение', () => {
    expect(() => parse(tokenize('ВызватьИсключение;'))).toThrow(
      'без параметров может использоваться только в блоке "Исключение"',
    );
  });

  it('проверяет Возврат по контексту метода', () => {
    expect(() => parse(tokenize('Возврат 1;'))).toThrow(
      'Оператор "Возврат" может использоваться только внутри метода',
    );
    expect(() => parse(tokenize('Функция Ф()\nВозврат;\nКонецФункции'))).toThrow(
      'Функция должна возвращать значение',
    );
    expect(() => parse(tokenize('Процедура П()\nВозврат 1;\nКонецПроцедуры'))).toThrow(
      'Процедуры не могут возвращать значение',
    );
    expect(() => parse(tokenize('Функция Ф()\nВозврат 1;\nКонецФункции'))).not.toThrow();
    expect(() => parse(tokenize('Процедура П()\nВозврат;\nКонецПроцедуры'))).not.toThrow();
  });

  it('запрещает Прервать/Продолжить вне цикла', () => {
    expect(() => parse(tokenize('Прервать;'))).toThrow(
      'Оператор "Прервать" может использоваться только внутри цикла',
    );
    expect(() => parse(tokenize('Продолжить;'))).toThrow(
      'Оператор "Продолжить" может использоваться только внутри цикла',
    );
  });

  it('парсит Новый("Массив") как вызов глобальной функции', () => {
    const stmt = parseExpr('Новый("Массив")');
    expect(stmt).toMatchObject({
      kind: 'ExpressionStatement',
      expression: {
        kind: 'CallExpression',
        callee: { kind: 'Identifier', name: 'Новый' },
        args: [{ kind: 'StringLiteral', value: 'Массив' }],
      },
    });
  });

  it('пропускает пустые операторы ;;', () => {
    const program = parse(tokenize('a = 1;;\nb = 2;'));
    expect(program.body).toHaveLength(2);
    expect(program.body[0]).toMatchObject({ kind: 'Assignment', target: { name: 'a' } });
    expect(program.body[1]).toMatchObject({ kind: 'Assignment', target: { name: 'b' } });
  });

  it('допускает конец блока как терминатор оператора без ;', () => {
    const program = parse(tokenize('если Истина тогда\n  ВызватьИсключение "ошибка"\nКонецЕсли;'));
    expect(program.body[0]).toMatchObject({
      kind: 'IfStatement',
      thenBranch: [{ kind: 'RaiseStatement', value: { kind: 'StringLiteral', value: 'ошибка' } }],
    });
  });

  it('парсит ключевые литералы как имена свойств', () => {
    const stmt = parseExpr('Структура.Истина');
    expect(stmt).toMatchObject({
      kind: 'ExpressionStatement',
      expression: { kind: 'MemberExpression', property: 'Истина' },
    });
    expect(parseExpr('Структура.Неопределено')).toMatchObject({
      kind: 'ExpressionStatement',
      expression: { kind: 'MemberExpression', property: 'Неопределено' },
    });
    expect(parseExpr('Структура.Null')).toMatchObject({
      kind: 'ExpressionStatement',
      expression: { kind: 'MemberExpression', property: 'Null' },
    });
  });

  it('бросает ошибку при отсутствии ;', () => {
    expect(() => parse(tokenize('имя = "x"\nвозраст = 2'))).toThrow(/ожидается ';'/);
  });

  it('бросает ошибку при отсутствии конецесли', () => {
    expect(() => parse(tokenize('если Истина тогда сообщить("x");'))).toThrow(/ключевое слово/);
  });

  it('парсит ДобавитьОбработчик с методом текущего модуля', () => {
    expect(parseExpr('ДобавитьОбработчик Источник.МоеСобытие, Обработчик')).toMatchObject({
      kind: 'AddHandlerStatement',
      eventSource: { kind: 'Identifier', name: 'Источник' },
      eventName: { kind: 'StringLiteral', value: 'МоеСобытие' },
      handlerTarget: null,
      handlerMethod: { kind: 'StringLiteral', value: 'Обработчик' },
    });
  });

  it('парсит ДобавитьОбработчик с обработчиком-свойством объекта', () => {
    expect(parseExpr('ДобавитьОбработчик Источник.МоеСобытие, ЭтотОбъект.Метод')).toMatchObject({
      kind: 'AddHandlerStatement',
      eventSource: { kind: 'Identifier', name: 'Источник' },
      eventName: { kind: 'StringLiteral', value: 'МоеСобытие' },
      handlerTarget: { kind: 'Identifier', name: 'ЭтотОбъект' },
      handlerMethod: { kind: 'StringLiteral', value: 'Метод' },
    });
  });
});
