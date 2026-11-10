import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/runtime/runner';
import { createGlobalContext } from '../src/stdlib/global-context';

describe('Сообщить со статусом (СтатусСообщения)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('без статуса → console.log', () => {
    const logs: unknown[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(...a));
    run('сообщить("обычное");', createGlobalContext());
    spy.mockRestore();
    expect(logs).toEqual(['обычное']);
  });

  it('Внимание → console.warn, Важное → console.error, Информация → console.info', () => {
    const warn: unknown[] = [];
    const error: unknown[] = [];
    const info: unknown[] = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => warn.push(...a));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => error.push(...a));
    const infoSpy = vi.spyOn(console, 'info').mockImplementation((...a: unknown[]) => info.push(...a));

    run(
      'сообщить("внимание", СтатусСообщения.Внимание);\n' +
        'сообщить("важное", СтатусСообщения.Важное);\n' +
        'сообщить("инфо", СтатусСообщения.Информация);',
      createGlobalContext(),
    );

    warnSpy.mockRestore();
    errorSpy.mockRestore();
    infoSpy.mockRestore();

    expect(warn).toEqual(['внимание']);
    expect(error).toEqual(['важное']);
    expect(info).toEqual(['инфо']);
  });
});
