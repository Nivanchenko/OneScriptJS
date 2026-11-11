import { describe, expect, it, vi } from 'vitest';
import { run } from '../src/runtime/runner';
import { createGlobalContext } from '../src/stdlib/global-context';
import { isThenable } from '../src/runtime/async';
import { BackgroundTasksRegistry } from '../src/stdlib/tasks/registry';
import { BslBackgroundTask } from '../src/stdlib/tasks/task';
import type { BslObject } from '../src/runtime/object';

async function execute(source: string): Promise<string[]> {
  const logs: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map((a) => String(a)).join(' '));
  });
  try {
    const returned = run(source, createGlobalContext());
    if (isThenable(returned)) await returned;
    return logs;
  } finally {
    spy.mockRestore();
  }
}

const HELPERS = `
  Функция Арг(Знач Значение) Экспорт
    Результат = Новый Массив;
    Результат.Добавить(Значение);
    Возврат Результат;
  КонецФункции

  Процедура Долго() Экспорт
    Приостановить(50);
  КонецПроцедуры

  Процедура Быстро() Экспорт
    Приостановить(10);
  КонецПроцедуры
`;

describe('фоновые задания: User Story 3 (реестр и состояния)', () => {
  it('порядок: активные в порядке запуска, завершённые — в порядке завершения', async () => {
    const logs = await execute(`
      ${HELPERS}
      Долгое = ФоновыеЗадания.Выполнить(ЭтотОбъект, "Долго");
      Быстрое = ФоновыеЗадания.Выполнить(ЭтотОбъект, "Быстро");
      Все = ФоновыеЗадания.ПолучитьФоновыеЗадания();
      Сообщить(Все[0].ИмяМетода);
      Сообщить(Все[1].ИмяМетода);
      Быстрое.ОжидатьЗавершения();
      ПослеБыстрого = ФоновыеЗадания.ПолучитьФоновыеЗадания();
      Сообщить(ПослеБыстрого[0].ИмяМетода);
      Сообщить(ПослеБыстрого[1].ИмяМетода);
      Сообщить(ПослеБыстрого[1].Состояние);
      Долгое.ОжидатьЗавершения();
      ПослеВсех = ФоновыеЗадания.ПолучитьФоновыеЗадания();
      Сообщить(ПослеВсех[0].ИмяМетода);
      Сообщить(ПослеВсех[1].ИмяМетода);
    `);
    // Активные — в порядке запуска; завершённое быстрое уходит в конец.
    expect(logs).toEqual([
      'Долго',
      'Быстро',
      'Долго',
      'Быстро',
      'Завершено',
      'Быстро',
      'Долго',
    ]);
  });

  it('фильтры по состоянию, имени метода, объекту и UUID; неизвестные ключи игнорируются', async () => {
    const logs = await execute(`
      ${HELPERS}
      Быстрое = ФоновыеЗадания.Выполнить(ЭтотОбъект, "Быстро");
      Быстрое.ОжидатьЗавершения();
      ФоновыеЗадания.Выполнить(ЭтотОбъект, "Долго");

      ПоСостоянию = ФоновыеЗадания.ПолучитьФоновыеЗадания(
        Новый Структура("Состояние", СостояниеФоновогоЗадания.Завершено));
      Сообщить(ПоСостоянию.Количество());

      ПоИмени = ФоновыеЗадания.ПолучитьФоновыеЗадания(
        Новый Структура("ИмяМетода", "БЫСТРО"));
      Сообщить(ПоИмени.Количество());

      ПоОбъекту = ФоновыеЗадания.ПолучитьФоновыеЗадания(
        Новый Структура("Объект", ЭтотОбъект));
      Сообщить(ПоОбъекту.Количество());

      ПоИд = ФоновыеЗадания.ПолучитьФоновыеЗадания(
        Новый Структура("УникальныйИдентификатор", Быстрое.УникальныйИдентификатор));
      Сообщить(ПоИд.Количество());
      Сообщить(ПоИд[0].УникальныйИдентификатор = Быстрое.УникальныйИдентификатор);

      ПоНеизвестному = ФоновыеЗадания.ПолучитьФоновыеЗадания(
        Новый Структура("НеизвестныйКлюч", 1));
      Сообщить(ПоНеизвестному.Количество());
    `);
    expect(logs).toEqual(['1', '1', '2', '1', 'Истина', '2']);
  });

  it('Очистить убирает задания из реестра, но не отменяет их', async () => {
    const logs = await execute(`
      ${HELPERS}
      Задание = ФоновыеЗадания.Выполнить(ЭтотОбъект, "Быстро");
      ФоновыеЗадания.Очистить();
      Сообщить(ФоновыеЗадания.ПолучитьФоновыеЗадания().Количество());
      Задание.ОжидатьЗавершения();
      Сообщить(Задание.Состояние);
      Сообщить(ФоновыеЗадания.ПолучитьФоновыеЗадания().Количество());
    `);
    expect(logs).toEqual(['0', 'Завершено', '0']);
  });

  it('ПолучитьТекущее внутри задания даёт это задание, снаружи — Неопределено', async () => {
    const logs = await execute(`
      Функция ПроверитьТекущее() Экспорт
        Приостановить(10);
        Текущее = ФоновыеЗадания.ПолучитьТекущее();
        Если Текущее = Неопределено Тогда
          Возврат "нет";
        КонецЕсли;
        Возврат Текущее.УникальныйИдентификатор;
      КонецФункции

      Сообщить(ФоновыеЗадания.ПолучитьТекущее() = Неопределено);
      Задание = ФоновыеЗадания.Выполнить(ЭтотОбъект, "ПроверитьТекущее");
      Задание.ОжидатьЗавершения();
      Сообщить(Задание.УникальныйИдентификатор = Задание.Результат);
    `);
    expect(logs).toEqual(['Истина', 'Истина']);
  });

  it('Новый МенеджерФоновыхЗаданий невозможен', async () => {
    const logs = await execute(`
      Попытка
        Менеджер = Новый МенеджерФоновыхЗаданий;
        Сообщить("создался");
      Исключение
        Сообщить("нельзя");
      КонецПопытки;
    `);
    expect(logs).toEqual(['нельзя']);
  });
});

describe('реестр фоновых заданий (unit)', () => {
  const target: BslObject = {
    typeName: 'Тест',
    callMethod: () => undefined,
    getProp: () => undefined,
    setProp: () => undefined,
    getIndex: () => undefined,
    setIndex: () => undefined,
  };
  const makeTask = (registry: BackgroundTasksRegistry, id: number): BslBackgroundTask =>
    new BslBackgroundTask({}, registry, id, target, `М${id}`);

  it('порядок и перенос завершённого в конец', () => {
    const registry = new BackgroundTasksRegistry(10);
    const a = makeTask(registry, 1);
    const b = makeTask(registry, 2);
    const c = makeTask(registry, 3);
    for (const task of [a, b, c]) registry.add(task);
    expect(registry.values().map((t) => t.taskId)).toEqual([1, 2, 3]);
    registry.markCompleted(b);
    expect(registry.values().map((t) => t.taskId)).toEqual([1, 3, 2]);
    registry.markCompleted(a);
    expect(registry.values().map((t) => t.taskId)).toEqual([3, 2, 1]);
  });

  it('вытесняются ранее завершившиеся, активные не вытесняются', () => {
    const registry = new BackgroundTasksRegistry(3);
    const active = [makeTask(registry, 1), makeTask(registry, 2)];
    for (const task of active) registry.add(task);
    registry.markCompleted(makeTask(registry, 3));
    const completed = [makeTask(registry, 4), makeTask(registry, 5), makeTask(registry, 6)];
    for (const task of completed) {
      registry.add(task);
      registry.markCompleted(task);
    }
    // Ёмкость 3: два активных + один самый поздний завершённый.
    expect(registry.values().map((t) => t.taskId)).toEqual([1, 2, 6]);
  });
});
