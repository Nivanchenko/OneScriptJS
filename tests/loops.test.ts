import { afterEach, describe, expect, it, vi } from 'vitest';
import { tokenize } from '../src/lexer/lexer';
import { parse } from '../src/parser/parser';
import { run } from '../src/runtime/runner';
import { createGlobalContext } from '../src/stdlib/global-context';

/** Выполняет исходник и собирает аргументы console.log. */
function exec(source: string): unknown[] {
  const logs: unknown[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(...args);
  });
  try {
    run(source, createGlobalContext());
  } finally {
    spy.mockRestore();
  }
  return logs;
}

describe('циклы', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Для ... По ... Цикл', () => {
    expect(exec('Для Сч = 1 По 5 Цикл сообщить(Сч); КонецЦикла;')).toEqual(['1', '2', '3', '4', '5']);
  });

  it('Пока ... Цикл', () => {
    expect(exec('Сч = 0; Пока Сч < 3 Цикл Сч = Сч + 1; сообщить(Сч); КонецЦикла;')).toEqual(['1', '2', '3']);
  });

  it('Прервать выходит из цикла', () => {
    expect(
      exec('Для Сч = 1 По 10 Цикл Если Сч > 3 Тогда Прервать; КонецЕсли; сообщить(Сч); КонецЦикла;'),
    ).toEqual(['1', '2', '3']);
  });

  it('Продолжить пропускает итерацию', () => {
    expect(
      exec('Для Сч = 1 По 5 Цикл Если Сч = 3 Тогда Продолжить; КонецЕсли; сообщить(Сч); КонецЦикла;'),
    ).toEqual(['1', '2', '4', '5']);
  });

  it('накапливает сумму через Для', () => {
    expect(exec('Сумма = 0; Для Сч = 1 По 5 Цикл Сумма = Сумма + Сч; КонецЦикла; сообщить(Сумма);')).toEqual(['15']);
  });

  it('парсит Для Каждого (выполнение — в T15, когда появится Массив)', () => {
    const program = parse(tokenize('Для Каждого Эл Из Массив Цикл сообщить(Эл); КонецЦикла;'));
    expect(program.body[0]).toMatchObject({
      kind: 'ForEachLoop',
      variable: 'Эл',
      collection: { kind: 'Identifier', name: 'Массив' },
    });
  });
});
