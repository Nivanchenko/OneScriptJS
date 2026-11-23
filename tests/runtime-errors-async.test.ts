import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/runtime/runner';
import type { RunOptions } from '../src/runtime/runner';
import { createGlobalContext } from '../src/stdlib/global-context';

/** Запускает (возможно, асинхронный) скрипт и собирает `Сообщить()`. */
async function execLogs(source: string, options?: RunOptions): Promise<string[]> {
  const logs: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(String(args[0]));
  });
  try {
    await run(source, createGlobalContext(), options);
  } finally {
    spy.mockRestore();
  }
  return logs;
}

describe('ошибки в async и фоновых заданиях (US5)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('ошибка в Асинх-методе: позиция возникновения и кадр async-метода', async () => {
    const logs = await execLogs(
      [
        'Асинх Функция Сломать()',
        '  Ждать Приостановить(1);',
        '  А = 1 / 0;',
        'КонецФункции',
        'Попытка',
        '  Ждать Сломать();',
        'Исключение',
        '  Ош = ИнформацияОбОшибке();',
        '  Сообщить(Ош.НомерСтроки);',
        '  Сообщить(Ош.ПолучитьСтекВызовов()[0].Метод);',
        '  Сообщить(Ош.Описание);',
        'КонецПопытки;',
      ].join('\n'),
      { sourceId: 'async.osjs' },
    );

    expect(logs).toEqual(['3', 'Сломать', 'Деление на ноль']);
  });

  it('Ждать пробрасывает снимок: стек содержит вызывающий кадр', async () => {
    const logs = await execLogs(
      [
        'Асинх Функция Сломать()',
        '  Ждать Приостановить(1);',
        '  А = 1 / 0;',
        'КонецФункции',
        'Попытка',
        '  Ждать Сломать();',
        'Исключение',
        '  Кадры = ИнформацияОбОшибке().ПолучитьСтекВызовов();',
        '  Сообщить(Кадры.Количество());',
        '  Сообщить(Кадры[0].Метод + "|" + Строка(Кадры[0].НомерСтроки));',
        '  Сообщить(Кадры[1].Метод + "|" + Строка(Кадры[1].НомерСтроки));',
        'КонецПопытки;',
      ].join('\n'),
      { sourceId: 'async-stack.osjs' },
    );

    expect(logs).toEqual(['2', 'Сломать|3', '<модуль>|6']);
  });

  it('необработанная ошибка Обещания печатается с позицией и стеком', async () => {
    const errors: unknown[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => errors.push(...args));

    await run(
      [
        'Асинх Функция Сломать()',
        '  А = 1 / 0;',
        'КонецФункции',
        'Обещание = Сломать();',
      ].join('\n'),
      createGlobalContext(),
      { sourceId: 'unhandled.osjs' },
    );
    // Политика необработанных ошибок отложена на макрозадачу.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(errors).toHaveLength(1);
    const text = String(errors[0]);
    expect(text).toContain('unhandled.osjs:2: Деление на ноль');
    expect(text).toContain('Стек вызовов:');
    expect(text).toContain('Сломать');
  });

  it('аварийное ФоновоеЗадание отдаёт ИнформацияОбОшибке со свойствами и стеком', async () => {
    const logs = await execLogs(
      [
        'Процедура Сломать() Экспорт',
        '  А = 1 / 0;',
        'КонецПроцедуры',
        'Задание = ФоновыеЗадания.Выполнить(ЭтотОбъект, "Сломать");',
        'Задание.ОжидатьЗавершения();',
        'Ош = Задание.ИнформацияОбОшибке;',
        'Сообщить(Ош.НомерСтроки);',
        'Сообщить(Ош.ИмяМодуля);',
        'Сообщить(Ош.Описание);',
        'Сообщить(Ош.ПолучитьСтекВызовов().Количество());',
        'Сообщить(Ош.ПолучитьСтекВызовов()[0].Метод);',
      ].join('\n'),
      { sourceId: 'job.osjs' },
    );

    expect(logs).toEqual(['2', 'job.osjs', 'Деление на ноль', '1', 'Сломать']);
  });

  it('у задания свой стек: без кадров главного потока', async () => {
    const logs = await execLogs(
      [
        'Процедура Сломать() Экспорт',
        '  А = 1 / 0;',
        'КонецПроцедуры',
        'Процедура Запустить() Экспорт',
        '  Задание = ФоновыеЗадания.Выполнить(ЭтотОбъект, "Сломать");',
        '  Задание.ОжидатьЗавершения();',
        '  Ош = Задание.ИнформацияОбОшибке;',
        '  Кадры = Ош.ПолучитьСтекВызовов();',
        '  Сообщить(Кадры.Количество());',
        '  Сообщить(Кадры[0].Метод);',
        'КонецПроцедуры',
        'Запустить();',
      ].join('\n'),
      { sourceId: 'job-stack.osjs' },
    );

    expect(logs).toEqual(['1', 'Сломать']);
  });
});
