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

describe('двоичные данные', () => {
  afterEach(() => vi.restoreAllMocks());

  it('БуферДвоичныхДанных: размер и индексация', () => {
    expect(
      exec('Б = Новый БуферДвоичныхДанных(3); сообщить(Б.Размер); Б[0] = 65; сообщить(Б[0]);'),
    ).toEqual(['3', '65']);
  });

  it('строка → буфер → строка (UTF-8)', () => {
    expect(
      exec('Б = ПолучитьБуферДвоичныхДанныхИзСтроки("привет"); сообщить(ПолучитьСтрокуИзБуфераДвоичныхДанных(Б));'),
    ).toEqual(['привет']);
  });

  it('hex-строка → буфер → hex-строка', () => {
    expect(
      exec('Б = ПолучитьБуферДвоичныхДанныхИзHexСтроки("A1B2C3"); сообщить(ПолучитьHexСтрокуИзБуфераДвоичныхДанных(Б));'),
    ).toEqual(['A1B2C3']);
  });

  it('Base64 → буфер → Base64', () => {
    expect(
      exec('Б = ПолучитьБуферДвоичныхДанныхИзBase64Строки("MTIz"); сообщить(ПолучитьСтрокуИзБуфераДвоичныхДанных(Б));'),
    ).toEqual(['123']);
  });

  it('ДвоичныеДанные: Размер и равенство', () => {
    expect(
      exec('Д1 = ПолучитьДвоичныеДанныеИзСтроки("123"); Д2 = ПолучитьДвоичныеДанныеИзСтроки("123"); сообщить(Д1.Размер()); сообщить(Д1 = Д2);'),
    ).toEqual(['3', 'Истина']);
  });
});
