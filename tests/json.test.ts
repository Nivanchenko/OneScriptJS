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

describe('JSON', () => {
  afterEach(() => vi.restoreAllMocks());

  it('ЗаписатьJSON сериализует массив', () => {
    expect(exec('М = Новый Массив; М.Добавить("a"); М.Добавить(1); сообщить(ЗаписатьJSON(М));')).toEqual(['["a",1]']);
  });

  it('ЗаписатьJSON примитива', () => {
    expect(exec('сообщить(ЗаписатьJSON(42)); сообщить(ЗаписатьJSON("строка"));')).toEqual(['42', '"строка"']);
  });

  it('ПрочитатьJSON разбирает массив', () => {
    expect(exec('М = ПрочитатьJSON("[1,2,3]"); сообщить(М.Количество()); сообщить(М[1]);')).toEqual(['3', '2']);
  });

  it('round-trip: ЗаписатьJSON → ПрочитатьJSON', () => {
    expect(
      exec('М = Новый Массив; М.Добавить("x"); М.Добавить("y"); К = ПрочитатьJSON(ЗаписатьJSON(М)); сообщить(К[1]);'),
    ).toEqual(['y']);
  });
});
