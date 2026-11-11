import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/runtime/runner';
import { createGlobalContext } from '../src/stdlib/global-context';

/** Исполнить BSL-скрипт и вернуть перехваченный вывод `console.log`. */
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

describe('ЭтотОбъект', () => {
  afterEach(() => vi.restoreAllMocks());

  it('возвращает объект-модуль, у которого вызывается метод', () => {
    expect(
      exec(
        'Перем Вызовов;\n' +
          'Процедура Привет() Экспорт\n' +
          '  Вызовов = Вызовов + 1;\n' +
          '  Сообщить("привет");\n' +
          'КонецПроцедуры\n' +
          'Вызовов = 0;\n' +
          'ЭтотОбъект.Привет();\n' +
          'Сообщить(Вызовов);\n',
      ),
    ).toEqual(['привет', '1']);
  });
});
