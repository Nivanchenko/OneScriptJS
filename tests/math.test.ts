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

describe('математика и система', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Мин/Макс', () => {
    expect(exec('сообщить(Мин(3, 1, 2)); сообщить(Макс(3, 1, 2));')).toEqual(['1', '3']);
  });

  it('Окр/Цел', () => {
    expect(exec('сообщить(Окр(2.5)); сообщить(Цел(2.7)); сообщить(Цел(-2.7));')).toEqual(['3', '2', '-2']);
  });

  it('Pow', () => {
    expect(exec('сообщить(Pow(2, 3));')).toEqual(['8']);
  });

  it('ТипЗнч', () => {
    expect(exec('сообщить(ТипЗнч("abc")); сообщить(ТипЗнч(42)); сообщить(ТипЗнч(ТекущаяДата()));')).toEqual([
      'Строка',
      'Число',
      'Дата',
    ]);
  });
});
