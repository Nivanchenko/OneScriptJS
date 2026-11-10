import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/runtime/runner';
import { createGlobalContext } from '../src/stdlib/global-context';

/**
 * Приёмочные сценарии, портированные из reference/OneScript/tests/*.os
 * (values-test, array, stringoperations, types, example-test, math, testrunner).
 * Каждый — «исходник → вывод сообщить()».
 */
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

describe('приёмочные сценарии (портированы из reference/tests)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('values-test: Null = Null и цепочка И', () => {
    expect(exec('А = Null; Б = Null; сообщить(А = Б и Б = Null и А = Null);')).toEqual(['Истина']);
  });

  it('array: Найти возвращает индекс или Неопределено', () => {
    expect(
      exec('М = Новый Массив; М.Добавить("1"); М.Добавить("2"); М.Добавить("3"); сообщить(М.Найти("2")); сообщить(М.Найти("9") = Неопределено);'),
    ).toEqual(['1', 'Истина']);
  });

  it('stringoperations: Сред и СтрНачинаетсяС', () => {
    expect(exec('Текст = "Привет"; сообщить(Сред(Текст, 1, 6)); сообщить(СтрНачинаетсяС(Текст, "При"));')).toEqual([
      'Привет',
      'Истина',
    ]);
  });

  it('types: ТипЗнч простых типов', () => {
    expect(exec('сообщить(ТипЗнч(Истина)); сообщить(ТипЗнч("")); сообщить(ТипЗнч(1));')).toEqual([
      'Булево',
      'Строка',
      'Число',
    ]);
  });

  it('example-test: функция Версия возвращает строку', () => {
    expect(exec('Функция Версия() Экспорт\n  Возврат "0.1";\nКонецФункции\nсообщить(Версия());')).toEqual(['0.1']);
  });

  it('math: Pow', () => {
    expect(exec('сообщить(Pow(2, 2));')).toEqual(['4']);
  });

  it('циклы: сумма 1..100 (эратосфеноподобный прогон)', () => {
    expect(exec('Сумма = 0; Для Сч = 1 По 100 Цикл Сумма = Сумма + Сч; КонецЦикла; сообщить(Сумма);')).toEqual(['5050']);
  });

  it('исключения: Попытка/Исключение и ОписаниеОшибки', () => {
    expect(
      exec('Попытка\n  ВызватьИсключение "неверный аргумент";\nИсключение\n  сообщить(ОписаниеОшибки());\nКонецПопытки;'),
    ).toEqual(['неверный аргумент']);
  });

  it('тернарный ?(Истина, а, б)', () => {
    expect(exec('сообщить(?(Истина, "да", "нет"));')).toEqual(['да']);
  });

  it('многомерный массив (array: запись и чтение)', () => {
    expect(exec('М = Новый Массив(2, 3); М[0][0] = "Привет"; М[1][1] = "мир"; сообщить(М[0][0]); сообщить(М[1][1]);')).toEqual([
      'Привет',
      'мир',
    ]);
  });
});
