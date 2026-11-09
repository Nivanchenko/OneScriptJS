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

describe('система типов (Тип/ТипЗнч)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Тип("Булево") = Тип("Boolean")', () => {
    expect(exec('сообщить(Тип("Булево") = Тип("Boolean"));')).toEqual(['Истина']);
  });

  it('Тип("Булево") = ТипЗнч(Истина)', () => {
    expect(exec('сообщить(Тип("Булево") = ТипЗнч(Истина));')).toEqual(['Истина']);
  });

  it('Строка(Тип("Массив")) = "Массив"', () => {
    expect(exec('сообщить(Строка(Тип("Массив")));')).toEqual(['Массив']);
  });

  it('разные типы не равны', () => {
    expect(exec('сообщить(ТипЗнч("x") = ТипЗнч(1));')).toEqual(['Ложь']);
  });

  it('ТипЗнч объекта (Массив)', () => {
    expect(exec('М = Новый Массив; сообщить(Строка(ТипЗнч(М)));')).toEqual(['Массив']);
  });
});
