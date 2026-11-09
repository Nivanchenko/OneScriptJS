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

describe('поразрядные операции', () => {
  afterEach(() => vi.restoreAllMocks());

  it('ПобитовоеИ', () => {
    expect(exec('сообщить(ПобитовоеИ(7, 5));')).toEqual(['5']);
  });

  it('ПобитовоеИли', () => {
    expect(exec('сообщить(ПобитовоеИли(17, 7));')).toEqual(['23']);
  });

  it('ПобитовоеНе', () => {
    expect(exec('сообщить(ПобитовоеНе(0));')).toEqual(['4294967295']);
  });

  it('ПобитовоеИНе', () => {
    expect(exec('сообщить(ПобитовоеИНе(7, 5));')).toEqual(['2']);
  });

  it('ПобитовоеИсключительноеИли', () => {
    expect(exec('сообщить(ПобитовоеИсключительноеИли(7, 5));')).toEqual(['2']);
  });

  it('ПобитовыйСдвигВлево/Вправо', () => {
    expect(exec('сообщить(ПобитовыйСдвигВлево(1, 3)); сообщить(ПобитовыйСдвигВправо(8, 2));')).toEqual(['8', '2']);
  });

  it('ПроверитьБит', () => {
    expect(exec('сообщить(ПроверитьБит(5, 0)); сообщить(ПроверитьБит(5, 1));')).toEqual(['Истина', 'Ложь']);
  });

  it('УстановитьБит', () => {
    expect(exec('сообщить(УстановитьБит(0, 2, 1));')).toEqual(['4']);
  });

  it('ПроверитьПоБитовойМаске', () => {
    expect(exec('сообщить(ПроверитьПоБитовойМаске(7, 5));')).toEqual(['Истина']);
  });
});
