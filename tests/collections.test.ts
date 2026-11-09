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

describe('коллекции: Массив', () => {
  afterEach(() => vi.restoreAllMocks());

  it('создаёт массив и добавляет элементы', () => {
    expect(exec('М = Новый Массив; М.Добавить("a"); М.Добавить("b"); сообщить(М.Количество());')).toEqual(['2']);
  });

  it('индексация и присваивание по индексу', () => {
    expect(exec('М = Новый Массив; М.Добавить("a"); М[0] = "b"; сообщить(М[0]);')).toEqual(['b']);
  });

  it('Найти возвращает индекс или Неопределено', () => {
    expect(
      exec('М = Новый Массив; М.Добавить("a"); М.Добавить("b"); сообщить(М.Найти("b")); сообщить(М.Найти("z") = Неопределено);'),
    ).toEqual(['1', 'Истина']);
  });

  it('Удалить и ВГраница', () => {
    expect(exec('М = Новый Массив; М.Добавить("a"); М.Добавить("b"); М.Удалить(0); сообщить(М.ВГраница());')).toEqual(['0']);
  });

  it('многомерный массив', () => {
    expect(exec('М = Новый Массив(2, 3); М[0][0] = "x"; сообщить(М[0][0]); сообщить(М[0].Количество());')).toEqual(['x', '3']);
  });

  it('Для Каждого по массиву', () => {
    expect(
      exec('М = Новый Массив; М.Добавить("a"); М.Добавить("b"); Для Каждого Эл Из М Цикл сообщить(Эл); КонецЦикла;'),
    ).toEqual(['a', 'b']);
  });
});
