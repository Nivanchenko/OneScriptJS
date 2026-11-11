import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/runtime/runner';
import { createGlobalContext } from '../src/stdlib/global-context';

/**
 * Фундамент async-рантайма: синхронный быстрый путь для скриптов без ожиданий и
 * кооперативная приостановка через `Приостановить`/`Sleep`.
 */

interface Execution {
  /** То, что вернул `run`: undefined для синхронного скрипта, Promise для async. */
  returned: unknown;
  logs: string[];
  restore(): void;
}

/** Запускает скрипт и держит перехват `console.log` до явного `restore()`. */
function begin(source: string): Execution {
  const logs: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map((a) => String(a)).join(' '));
  });
  let returned: unknown;
  try {
    returned = run(source, createGlobalContext()) as unknown;
  } catch (error) {
    spy.mockRestore();
    throw error;
  }
  return { returned, logs, restore: () => spy.mockRestore() };
}

/** Запускает скрипт и дожидается завершения, если оно асинхронное. */
async function execute(source: string): Promise<Execution> {
  const execution = begin(source);
  try {
    await settle(execution.returned);
    return execution;
  } finally {
    execution.restore();
  }
}

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

async function settle(returned: unknown): Promise<void> {
  if (isThenable(returned)) await returned;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('async-рантайм', () => {
  it('скрипт без ожиданий исполняется синхронно (sync fast-path)', async () => {
    const execution = await execute('Сообщить("раз"); Сообщить("два");');
    expect(execution.returned).toBeUndefined();
    expect(execution.logs).toEqual(['раз', 'два']);
  });

  it('Приостановить делает исполнение асинхронным и не блокирует хост', async () => {
    const ticks: number[] = [];
    const timer = setInterval(() => ticks.push(Date.now()), 5);
    const execution = begin('Сообщить("до"); Приостановить(60); Сообщить("после");');
    try {
      expect(isThenable(execution.returned)).toBe(true);
      // До разрешения Promise основной скрипт не должен дойти до "после".
      expect(execution.logs).toEqual(['до']);
      await settle(execution.returned);
      expect(execution.logs).toEqual(['до', 'после']);
      // Пока скрипт «спал», хост жил: таймер успел сработать несколько раз.
      expect(ticks.length).toBeGreaterThanOrEqual(3);
    } finally {
      clearInterval(timer);
      execution.restore();
    }
  });

  it('Приостановить(0) уступает управление, отрицательное значение — ошибка', async () => {
    const execution = await execute('Приостановить(0); Сообщить("ok");');
    expect(execution.logs).toEqual(['ok']);
    // Ошибка аргумента возникает синхронно, до приостановки (как Thread.Sleep).
    expect(() => begin('Приостановить(-1);')).toThrow();
  });

  it('Попытка/Исключение ловит ошибку, брошенную после приостановки', async () => {
    const execution = await execute(
      [
        'Попытка',
        '  Приостановить(10);',
        '  ВызватьИсключение "поздняя ошибка";',
        'Исключение',
        '  Сообщить(ОписаниеОшибки());',
        'КонецПопытки;',
      ].join('\n'),
    );
    await settle(execution.returned);
    expect(execution.logs).toEqual(['поздняя ошибка']);
  });

  it('Возврат и управляющие конструкции работают после приостановки', async () => {
    const source = [
      'Функция СуммаПослеПаузы(Знач До) Экспорт',
      '  Приостановить(5);',
      '  Сумма = 0;',
      '  Для Сч = 1 По До Цикл',
      '    Если Сч = 3 Тогда',
      '      Продолжить;',
      '    КонецЕсли;',
      '    Сумма = Сумма + Сч;',
      '  КонецЦикла;',
      '  Возврат Сумма;',
      'КонецФункции',
      'Сообщить(СуммаПослеПаузы(5));',
    ].join('\n');
    const execution = await execute(source);
    expect(execution.logs).toEqual(['12']);
  });

  it('Перейти и метка работают после приостановки', async () => {
    const source = [
      'Приостановить(5);',
      'Перейти ~Метка;',
      'Сообщить("пропущено");',
      '~Метка:',
      'Сообщить("после метки");',
    ].join('\n');
    const execution = await execute(source);
    expect(execution.logs).toEqual(['после метки']);
  });
});
