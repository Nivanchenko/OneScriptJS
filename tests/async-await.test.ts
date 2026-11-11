import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/runtime/runner';
import { createGlobalContext } from '../src/stdlib/global-context';
import { isThenable } from '../src/runtime/async';

/** Запускает скрипт, дожидается async-исполнения и возвращает вывод `Сообщить`. */
async function execute(
  source: string,
): Promise<{ logs: string[]; errors: string[]; returned: unknown; restore(): void }> {
  const logs: string[] = [];
  const errors: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map((a) => String(a)).join(' '));
  });
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map((a) => String(a)).join(' '));
  });
  try {
    const returned = run(source, createGlobalContext());
    if (isThenable(returned)) await returned;
    return { logs, errors, returned, restore: () => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    } };
  } catch (error) {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    throw error;
  }
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => vi.restoreAllMocks());

describe('Асинх/Ждать: User Story 1 (async-функция)', () => {
  it('возвращает результат через top-level Ждать', async () => {
    const result = await execute(`
      Асинх Функция Считать(Знач А, Знач Б) Экспорт
        Приостановить(20);
        Возврат А + Б;
      КонецФункции

      Сообщить("до");
      Сообщить(Ждать Считать(2, 3));
    `);
    try {
      expect(result.logs).toEqual(['до', '5']);
    } finally {
      result.restore();
    }
  });

  it('не блокирует хост во время ожидания', async () => {
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 5);
    try {
      const result = await execute(`
        Асинх Процедура Пауза() Экспорт
          Приостановить(60);
        КонецПроцедуры

        Ждать Пауза();
        Сообщить("после");
      `);
      result.restore();
      expect(result.logs).toEqual(['после']);
      expect(ticks).toBeGreaterThanOrEqual(3);
    } finally {
      clearInterval(timer);
    }
  });

  it('ошибка ловится Попыткой в точке Ждать', async () => {
    const result = await execute(`
      Асинх Функция Упасть() Экспорт
        Приостановить(10);
        ВызватьИсключение "ошибка в async";
      КонецФункции

      Обещание = Упасть();   // синхронно не бросает
      Попытка
        Ждать Обещание;
        Сообщить("без ошибки");
      Исключение
        Сообщить(ОписаниеОшибки());
      КонецПопытки;
    `);
    try {
      expect(result.logs).toEqual(['ошибка в async']);
    } finally {
      result.restore();
    }
  });

  it('ошибка до первой приостановки тоже попадает в Обещание', async () => {
    const result = await execute(`
      Асинх Функция СразуУпасть() Экспорт
        ВызватьИсключение "сразу";
      КонецФункции

      Обещание = СразуУпасть();  // не бросает
      Попытка
        Ждать Обещание;
      Исключение
        Сообщить(ОписаниеОшибки());
      КонецПопытки;
    `);
    try {
      expect(result.logs).toEqual(['сразу']);
    } finally {
      result.restore();
    }
  });

  it('повторное ожидание возвращает тот же результат', async () => {
    const result = await execute(`
      Асинх Функция Значение() Экспорт
        Приостановить(5);
        Возврат 99;
      КонецФункции

      Обещание = Значение();
      Сообщить(Ждать Обещание);
      Сообщить(Ждать Обещание);
    `);
    try {
      expect(result.logs).toEqual(['99', '99']);
    } finally {
      result.restore();
    }
  });

  it('Ждать обычного значения возвращает его как есть', async () => {
    const result = await execute('Сообщить(Ждать 42);');
    try {
      expect(result.logs).toEqual(['42']);
    } finally {
      result.restore();
    }
  });

  it('функция без приостановок даёт результат', async () => {
    const result = await execute(`
      Асинх Функция Быстро() Экспорт
        Возврат 7;
      КонецФункции
      Сообщить(Ждать Быстро());
    `);
    try {
      expect(result.logs).toEqual(['7']);
    } finally {
      result.restore();
    }
  });
});

describe('Асинх/Ждать: User Story 2 (async-процедура и ошибки)', () => {
  it('async-процедура возвращает Обещание, ожидание даёт Неопределено', async () => {
    const result = await execute(`
      Перем Выполнено;

      Асинх Процедура Обновить() Экспорт
        Приостановить(10);
        Выполнено = Истина;
      КонецПроцедуры

      Выполнено = Ложь;
      Обещание = Обновить();
      Сообщить(Ждать Обещание = Неопределено);
      Ждать Обещание;
      Сообщить(Выполнено);
    `);
    try {
      expect(result.logs).toEqual(['Истина', 'Истина']);
    } finally {
      result.restore();
    }
  });

  it('fire-and-forget: сценарий продолжается, хост дожидается отложенной работы', async () => {
    const result = await execute(`
      Асинх Процедура ВФоне() Экспорт
        Приостановить(20);
        Сообщить("в фоне");
      КонецПроцедуры

      ВФоне();
      Сообщить("основной");
    `);
    try {
      expect(result.logs).toEqual(['основной', 'в фоне']);
    } finally {
      result.restore();
    }
  });

  it('необработанная ошибка async-процедуры не роняет сценарий', async () => {
    const result = await execute(`
      Асинх Процедура Плохая() Экспорт
        Приостановить(10);
        ВызватьИсключение "фоновый сбой";
      КонецПроцедуры

      Плохая();
      Сообщить("продолжили");
    `);
    try {
      await wait(30);
      expect(result.logs).toEqual(['продолжили']);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('фоновый сбой');
    } finally {
      result.restore();
    }
  });

  it('Ждать в том же тике подавляет unhandled-сообщение', async () => {
    const result = await execute(`
      Асинх Функция СразуУпасть() Экспорт
        ВызватьИсключение "поймаем";
      КонецФункции

      Обещание = СразуУпасть();
      Попытка
        Ждать Обещание;
      Исключение
        Сообщить("перехвачено");
      КонецПопытки;
    `);
    try {
      await wait(30);
      expect(result.logs).toEqual(['перехвачено']);
      expect(result.errors).toEqual([]);
    } finally {
      result.restore();
    }
  });
});

describe('Асинх/Ждать: User Story 3 (композиция и совместимость)', () => {
  it('async-функция ожидает другую async-функцию', async () => {
    const result = await execute(`
      Асинх Функция Внутренняя(Знач Х) Экспорт
        Приостановить(5);
        Возврат Х * 2;
      КонецФункции

      Асинх Функция Внешняя(Знач Х) Экспорт
        Удвоенное = Ждать Внутренняя(Х);
        Возврат Удвоенное + 1;
      КонецФункции

      Сообщить(Ждать Внешняя(10));
    `);
    try {
      expect(result.logs).toEqual(['21']);
    } finally {
      result.restore();
    }
  });

  it('Обещание хранится в коллекции и передаётся параметром', async () => {
    const result = await execute(`
      Асинх Функция Значение() Экспорт
        Приостановить(5);
        Возврат 5;
      КонецФункции

      Асинх Функция Принять(Знач Обещание) Экспорт
        Возврат Ждать Обещание + 1;
      КонецФункции

      Хранилище = Новый Массив;
      Хранилище.Добавить(Значение());
      Сообщить(Ждать Хранилище[0]);
      Сообщить(Ждать Принять(Значение()));
    `);
    try {
      expect(result.logs).toEqual(['5', '6']);
    } finally {
      result.restore();
    }
  });

  it('async-метод использует Приостановить и ожидания фоновых заданий', async () => {
    const result = await execute(`
      Функция Арг(Знач Значение) Экспорт
        Р = Новый Массив;
        Р.Добавить(Значение);
        Возврат Р;
      КонецФункции

      Асинх Функция Собрать() Экспорт
        Задание = ФоновыеЗадания.Выполнить(ЭтотОбъект, "Пауза", Арг(10));
        ФоновыеЗадания.ОжидатьВсе(НовыйМассивИзЗадания(Задание));
        Приостановить(5);
        Возврат "готово";
      КонецФункции

      Функция НовыйМассивИзЗадания(Знач Задание) Экспорт
        Р = Новый Массив;
        Р.Добавить(Задание);
        Возврат Р;
      КонецФункции

      Процедура Пауза(Знач Мс) Экспорт
        Приостановить(Мс);
      КонецПроцедуры

      Сообщить(Ждать Собрать());
    `);
    try {
      expect(result.logs).toEqual(['готово']);
    } finally {
      result.restore();
    }
  });

  it('job на async-метод возвращает Обещание как результат', async () => {
    const result = await execute(`
      Асинх Функция Посчитать() Экспорт
        Приостановить(5);
        Возврат 11;
      КонецФункции

      Задание = ФоновыеЗадания.Выполнить(ЭтотОбъект, "Посчитать");
      Задание.ОжидатьЗавершения();
      Сообщить(Ждать Задание.Результат);
    `);
    try {
      expect(result.logs).toEqual(['11']);
    } finally {
      result.restore();
    }
  });

  it('параметры async-метода передаются по значению', async () => {
    const result = await execute(`
      Асинх Процедура Изменить(Параметр) Экспорт
        Параметр = 100;
      КонецПроцедуры

      Значение = 1;
      Ждать Изменить(Значение);
      Сообщить(Значение);
    `);
    try {
      expect(result.logs).toEqual(['1']);
    } finally {
      result.restore();
    }
  });

  it('Обещание непрозрачно: представление и запрет Новый', async () => {
    const result = await execute(`
      Асинх Функция Быстро() Экспорт
        Возврат 1;
      КонецФункции

      Обещание = Быстро();
      Сообщить(Строка(Обещание));
      Попытка
        Новый Обещание;
        Сообщить("создалось");
      Исключение
        Сообщить("нельзя");
      КонецПопытки;
      Сообщить(Ждать Обещание);
    `);
    try {
      expect(result.logs).toEqual(['Обещание', 'нельзя', '1']);
    } finally {
      result.restore();
    }
  });

  it('контекстные идентификаторы Ждать/Асинх в рантайме', async () => {
    const result = await execute(`
      Перем Ждать;

      Процедура Ждать() Экспорт
        Сообщить("метод Ждать");
      КонецПроцедуры

      Процедура Асинх() Экспорт
        Сообщить("метод Асинх");
      КонецПроцедуры

      Ждать = 5;
      Сообщить(Ждать);
      Ждать();
      Асинх();
    `);
    try {
      expect(result.logs).toEqual(['5', 'метод Ждать', 'метод Асинх']);
    } finally {
      result.restore();
    }
  });

  it('Ждать вложенного Обещания (функция вернула другое Обещание)', async () => {
    const result = await execute(`
      Асинх Функция Внутренняя() Экспорт
        Приостановить(5);
        Возврат "внутри";
      КонецФункции

      Асинх Функция Внешняя() Экспорт
        Возврат Внутренняя();
      КонецФункции

      Вложенное = Ждать Внешняя();
      Сообщить(Ждать Вложенное);
    `);
    try {
      expect(result.logs).toEqual(['внутри']);
    } finally {
      result.restore();
    }
  });
});
