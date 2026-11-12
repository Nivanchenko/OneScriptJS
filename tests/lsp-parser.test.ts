import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/lexer/lexer';
import { parse, parseTolerant } from '../src/parser/parser';
import type { IfStatement, MethodDeclaration, WhileLoop } from '../src/ast/nodes';

const tolerantOf = (source: string) => parseTolerant(tokenize(source));

describe('толерантный парсер', () => {
  it('собирает несколько независимых ошибок и сохраняет валидный код', () => {
    const { program, errors } = tolerantOf('a = 1 +;\nb = 2 3;\nc = 4;');

    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({
      message: "неожиданный токен ';'",
      line: 1,
      column: 8,
      endLine: 1,
      endColumn: 9,
    });
    expect(errors[1]).toMatchObject({
      message: "ожидается ';'",
      line: 2,
      column: 7,
      endLine: 2,
      endColumn: 8,
    });
    expect(program.body).toHaveLength(1);
    expect(program.body[0]).toMatchObject({ kind: 'Assignment', target: { name: 'c' } });
  });

  it('отдаёт частичный AST метода после ошибки внутри тела', () => {
    const source = [
      'Процедура П()',
      '  a = 1 +;',
      '  b = 2;',
      'КонецПроцедуры',
      'c = 3;',
    ].join('\n');
    const { program, errors } = tolerantOf(source);

    expect(errors).toHaveLength(1);
    expect(program.body.map((s) => s.kind)).toEqual(['MethodDeclaration', 'Assignment']);
    const method = program.body[0] as MethodDeclaration;
    expect(method.name).toBe('П');
    expect(method.body).toHaveLength(1);
    expect(method.body[0]).toMatchObject({ kind: 'Assignment', target: { name: 'b' } });
  });

  it('восстанавливается на границах блоков Если и Цикл', () => {
    const source = [
      'Процедура П()',
      '  Если Истина Тогда',
      '    a = 1 +;',
      '  КонецЕсли;',
      '  Пока Истина Цикл',
      '    b = 2 3;',
      '  КонецЦикла;',
      'КонецПроцедуры',
    ].join('\n');
    const { program, errors } = tolerantOf(source);

    expect(errors).toHaveLength(2);
    const method = program.body[0] as MethodDeclaration;
    expect(method.body.map((s) => s.kind)).toEqual(['IfStatement', 'WhileLoop']);
    expect((method.body[0] as IfStatement).thenBranch).toEqual([]);
    expect((method.body[1] as WhileLoop).body).toEqual([]);
  });

  it('восстанавливает methodKind: Возврат после метода снова вне метода', () => {
    const { program, errors } = tolerantOf(
      'Функция Ф()\n  a = 1 +;\nКонецФункции\nВозврат 1;',
    );

    expect(errors).toHaveLength(2);
    expect(errors[1]?.message).toContain('только внутри метода');
    expect(program.body.map((s) => s.kind)).toEqual(['MethodDeclaration']);
  });

  it('восстанавливает inAsync: Ждать в обычном методе после асинхронного', () => {
    const { errors } = tolerantOf(
      'Асинх Функция Ф()\n  a = 1 +;\nКонецФункции\nФункция Г()\n  Ждать 1;\nКонецФункции',
    );

    expect(errors).toHaveLength(2);
    expect(errors[1]?.message).toContain('Ждать допустим только в асинхронном методе');
  });

  it('восстанавливает loopDepth: Прервать после цикла с ошибкой снова вне цикла', () => {
    const { errors } = tolerantOf(
      'Пока Истина Цикл\n  a = 1 +;\nКонецЦикла;\nПрервать;',
    );

    expect(errors).toHaveLength(2);
    expect(errors[1]?.message).toContain('только внутри цикла');
  });

  it('восстанавливает exceptDepth: ВызватьИсключение после Попытки снова вне блока', () => {
    const { errors } = tolerantOf(
      'Попытка\n  a = 1 +;\nИсключение\n  b = 2 +;\nКонецПопытки;\nВызватьИсключение;',
    );

    expect(errors).toHaveLength(3);
    expect(errors[2]?.message).toContain('блоке "Исключение"');
  });

  it('пропускает битое объявление метода и продолжает со следующего оператора', () => {
    const { program, errors } = tolerantOf('Процедура ()\nКонецПроцедуры\nc = 3;');

    expect(errors).toHaveLength(1);
    expect(program.body.map((s) => s.kind)).toEqual(['Assignment']);
  });

  it('не падает на битой аннотации', () => {
    const { program, errors } = tolerantOf('&;\na = 1;');

    expect(errors).toHaveLength(1);
    expect(program.body).toHaveLength(1);
  });

  it('на валидном коде даёт тот же AST, что и parse()', () => {
    const source = [
      'Перем Модуль;',
      'Функция Сумма(а, б)',
      '  Возврат а + б;',
      'КонецФункции',
      'Если Истина Тогда',
      '  Итог = Сумма(1, 2);',
      'Иначе',
      '  Итог = 0;',
      'КонецЕсли;',
    ].join('\n');

    expect(parseTolerant(tokenize(source))).toEqual({
      program: parse(tokenize(source)),
      errors: [],
    });
  });
});

describe('parse(): строгий режим не изменился', () => {
  it('бросает на первой ошибке', () => {
    expect(() => parse(tokenize('a = 1 +;\nb = 2 3;'))).toThrow(/Ошибка разбора/);
  });

  it('не возвращает частичный AST', () => {
    expect(() => parse(tokenize('a = 1 +;\nb = 2;'))).toThrow();
  });
});
