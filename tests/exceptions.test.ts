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

describe('исключения', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Попытка/Исключение ловит ВызватьИсключение', () => {
    expect(
      exec('Попытка\n  ВызватьИсключение "ошибка";\nИсключение\n  сообщить("поймано");\nКонецПопытки;'),
    ).toEqual(['поймано']);
  });

  it('ОписаниеОшибки возвращает текст исключения', () => {
    expect(
      exec('Попытка\n  ВызватьИсключение "текст ошибки";\nИсключение\n  сообщить(ОписаниеОшибки());\nКонецПопытки;'),
    ).toEqual(['текст ошибки']);
  });

  it('без исключения тело Исключение не выполняется', () => {
    expect(
      exec('Попытка\n  сообщить("ок");\nИсключение\n  сообщить("не должно");\nКонецПопытки;'),
    ).toEqual(['ок']);
  });

  it('исключение внутри функции ловится снаружи', () => {
    expect(
      exec(
        'Функция Ошибка()\n  ВызватьИсключение "из функции";\nКонецФункции\n' +
          'Попытка\n  Ошибка();\nИсключение\n  сообщить(ОписаниеОшибки());\nКонецПопытки;',
      ),
    ).toEqual(['из функции']);
  });

  it('исключение без Попытки всплывает наружу', () => {
    expect(() => exec('ВызватьИсключение "boom";')).toThrow(/boom/);
  });
});
