import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/lexer/lexer';
import { parse } from '../src/parser/parser';
import type {
  Assignment,
  AwaitExpression,
  BinaryExpression,
  CallExpression,
  ExpressionStatement,
  MethodDeclaration,
  Program,
  VariableDeclaration,
} from '../src/ast/nodes';

/**
 * Адаптация `reference/OneScript/src/Tests/OneScript.Language.Tests/ParserTests.cs`
 * (async/await) к нашему парсеру + расширение: `Ждать` в теле модуля разрешён.
 */

function program(source: string): Program {
  return parse(tokenize(source));
}

function method(source: string, name: string): MethodDeclaration {
  const found = program(source).body.find(
    (stmt) => stmt.kind === 'MethodDeclaration' && stmt.name === name,
  );
  if (!found || found.kind !== 'MethodDeclaration') throw new Error(`метод '${name}' не найден`);
  return found;
}

function firstStatement(source: string) {
  return program(source).body[0]!;
}

describe('парсер: Асинх-методы', () => {
  it('разбирает Асинх Функцию с Экспорт', () => {
    const parsed = method(
      'Асинх Функция Ф1() Экспорт\n  Возврат 1;\nКонецФункции',
      'Ф1',
    );
    expect(parsed.isFunction).toBe(true);
    expect(parsed.exported).toBe(true);
    expect(parsed.isAsync).toBe(true);
  });

  it('разбирает Асинх Процедуру и английский алиас Async', () => {
    expect(method('Асинх Процедура П1()\nКонецПроцедуры', 'П1').isAsync).toBe(true);
    expect(method('Async Function F1()\n  Return 1;\nEndFunction', 'F1').isAsync).toBe(true);
  });

  it('обычный метод не становится асинхронным', () => {
    expect(method('Процедура П1()\nКонецПроцедуры', 'П1').isAsync).toBe(false);
  });

  it('Асинх ПриСозданииОбъекта запрещён', () => {
    expect(() =>
      program('Асинх Процедура ПриСозданииОбъекта()\nКонецПроцедуры'),
    ).toThrow(/конструктор/i);
  });
});

describe('парсер: Ждать', () => {
  it('разбирает await вокруг постфиксного выражения', () => {
    const stmt = method(
      'Асинх Функция Ф()\n  А = Ждать Вызов().Поле;\n  Возврат А;\nКонецФункции',
      'Ф',
    ).body[0] as Assignment;
    expect(stmt.value).toMatchObject({
      kind: 'AwaitExpression',
      operand: {
        kind: 'MemberExpression',
        property: 'Поле',
        object: { kind: 'CallExpression', callee: { kind: 'Identifier' } },
      },
    });
  });

  it('await имеет приоритет ниже постфиксных операций и выше бинарных', () => {
    const stmt = method(
      'Асинх Функция Ф()\n  А = Ждать Вызов().Поле + 1;\n  Возврат А;\nКонецФункции',
      'Ф',
    ).body[0] as Assignment;
    expect(stmt.value).toMatchObject({
      kind: 'BinaryExpression',
      operator: '+',
      left: { kind: 'AwaitExpression' },
      right: { kind: 'NumberLiteral', value: 1 },
    });
  });

  it('разбирает Ждать как оператор-выражение', () => {
    const stmt = method(
      'Асинх Процедура П()\n  Ждать Операция();\nКонецПроцедуры',
      'П',
    ).body[0] as ExpressionStatement;
    expect(stmt).toMatchObject({
      kind: 'ExpressionStatement',
      expression: { kind: 'AwaitExpression', operand: { kind: 'CallExpression' } },
    });
  });

  it('разбирает английский алиас Await', () => {
    const stmt = method(
      'Async Function F()\n  A = Await F2();\n  Return A;\nEndFunction',
      'F',
    ).body[0] as Assignment;
    expect(stmt.value).toMatchObject({ kind: 'AwaitExpression' });
  });

  it('двойной Ждать — ошибка', () => {
    expect(() =>
      program('Асинх Функция Ф()\n  А = Ждать Ждать Б;\n  Возврат А;\nКонецФункции'),
    ).toThrow(/ожидать/i);
  });

  it('Ждать в обычном синхронном методе — ошибка', () => {
    expect(() =>
      program('Функция Ф()\n  А = Ждать Вызов();\n  Возврат А;\nКонецФункции'),
    ).toThrow(/асинхронном методе|теле модуля/i);
  });

  it('Ждать в теле модуля разрешён (расширение проекта)', () => {
    const stmt = firstStatement('Ждать Загрузить();') as ExpressionStatement;
    expect(stmt).toMatchObject({
      kind: 'ExpressionStatement',
      expression: { kind: 'AwaitExpression', operand: { kind: 'CallExpression' } },
    });
  });
});

describe('парсер: контекстные идентификаторы Ждать/Асинх (эталон)', () => {
  it('Перем Ждать и Процедура Ждать() остаются именами', () => {
    const parsed = program('Перем Ждать;\nПроцедура Ждать() Экспорт\nКонецПроцедуры');
    const variable = parsed.body[0] as VariableDeclaration;
    expect(variable.names).toEqual(['Ждать']);
    expect(method('Перем Ждать;\nПроцедура Ждать() Экспорт\nКонецПроцедуры', 'Ждать').isAsync).toBe(
      false,
    );
  });

  it('присваивание переменной Ждать на верхнем уровне', () => {
    const stmt = firstStatement('Ждать = 5;') as Assignment;
    expect(stmt.target).toMatchObject({ kind: 'Identifier', name: 'Ждать' });
  });

  it('внутри async Ждать без выражения — идентификатор', () => {
    const stmt = method(
      'Асинх Функция Ф()\n  А = Ждать;\n  Возврат А;\nКонецФункции',
      'Ф',
    ).body[0] as Assignment;
    expect(stmt.value).toMatchObject({ kind: 'Identifier', name: 'Ждать' });
  });

  it('внутри async А = Ждать(); — вызов метода с именем Ждать', () => {
    const stmt = method(
      'Асинх Функция Ф()\n  А = Ждать();\n  Возврат А;\nКонецФункции',
      'Ф',
    ).body[0] as Assignment;
    expect(stmt.value).toMatchObject({
      kind: 'CallExpression',
      callee: { kind: 'Identifier', name: 'Ждать' },
    });
  });

  it('А = П.Ждать; — свойство с именем Ждать', () => {
    const stmt = method(
      'Асинх Функция Ф()\n  А = П.Ждать;\n  Возврат А;\nКонецФункции',
      'Ф',
    ).body[0] as Assignment;
    expect(stmt.value).toMatchObject({
      kind: 'MemberExpression',
      property: 'Ждать',
    });
  });

  it('Асинх как обычное имя переменной', () => {
    const stmt = firstStatement('Асинх = "МояПеременная2";') as Assignment;
    expect(stmt.target).toMatchObject({ kind: 'Identifier', name: 'Асинх' });
    const fn = method('Процедура Асинх() Экспорт\nКонецПроцедуры', 'Асинх');
    expect(fn.isAsync).toBe(false);
  });

  it('тип AwaitExpression доступен и не путается с CallExpression', () => {
    const stmt = method(
      'Асинх Функция Ф()\n  А = Ждать Б;\n  Возврат А;\nКонецФункции',
      'Ф',
    ).body[0] as Assignment;
    const value = stmt.value as AwaitExpression;
    expect(value.kind).toBe('AwaitExpression');
    expect((value.operand as { kind: string }).kind).toBe('Identifier');
  });
});
