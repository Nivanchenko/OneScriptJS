import { afterEach, describe, expect, it, vi } from 'vitest';
import { tokenize } from '../src/lexer/lexer';
import { parse } from '../src/parser/parser';
import { Interpreter } from '../src/runtime/interpreter';
import { createGlobalContext } from '../src/stdlib/global-context';

/** Выполняет исходник и собирает аргументы console.log. */
function run(source: string): unknown[] {
  const logs: unknown[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(...args);
  });
  try {
    new Interpreter(createGlobalContext()).run(parse(tokenize(source)));
  } finally {
    spy.mockRestore();
  }
  return logs;
}

describe('глобальный контекст: Сообщить', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('печатает в console.log через русское имя', () => {
    expect(run('сообщить("Привет");')).toEqual(['Привет']);
  });

  it('печатает через английский алиас Message', () => {
    expect(run('Message("Hi");')).toEqual(['Hi']);
  });

  it('принимает второй аргумент (статус)', () => {
    expect(run('сообщить("x", Неопределено);')).toEqual(['x']);
  });

  it('имена регистронезависимы', () => {
    expect(run('СООБЩИТЬ("x");')).toEqual(['x']);
  });

  it('строкует нестроковый аргумент', () => {
    expect(run('сообщить(38);')).toEqual(['38']);
  });

  it('бросает на неизвестную функцию', () => {
    expect(() => run('неизвестнаяФункция();')).toThrow(/Неизвестная функция/);
  });
});
