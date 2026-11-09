import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/runtime/runner';
import { createGlobalContext } from '../src/stdlib/global-context';

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

describe('ветвления (ИначеЕсли/Иначе)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Иначе при ложном условии', () => {
    expect(exec('x = 5; Если x > 10 Тогда сообщить("да"); Иначе сообщить("нет"); КонецЕсли;')).toEqual(['нет']);
  });

  it('ИначеЕсли срабатывает', () => {
    expect(
      exec(
        'x = 5;\nЕсли x > 10 Тогда сообщить("больше 10");\nИначеЕсли x > 3 Тогда сообщить("больше 3");\nИначе сообщить("мало");\nКонецЕсли;',
      ),
    ).toEqual(['больше 3']);
  });

  it('цепочка ИначеЕсли выбирает первое верное', () => {
    expect(
      exec(
        'x = 1;\nЕсли x = 0 Тогда сообщить("ноль");\nИначеЕсли x = 1 Тогда сообщить("один");\nИначеЕсли x = 2 Тогда сообщить("два");\nИначе сообщить("другое");\nКонецЕсли;',
      ),
    ).toEqual(['один']);
  });

  it('Иначе срабатывает, когда ни одно условие не верно', () => {
    expect(
      exec('x = 99; Если x = 0 Тогда сообщить("ноль"); ИначеЕсли x = 1 Тогда сообщить("один"); Иначе сообщить("другое"); КонецЕсли;'),
    ).toEqual(['другое']);
  });

  it('условие истинно — ветки Иначе не выполняются', () => {
    expect(
      exec('x = 20; Если x > 10 Тогда сообщить("да"); ИначеЕсли x > 5 Тогда сообщить("нет"); Иначе сообщить("нет2"); КонецЕсли;'),
    ).toEqual(['да']);
  });
});
