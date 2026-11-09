import { afterEach, describe, expect, it, vi } from 'vitest';
import { tokenize } from '../src/lexer/lexer';
import { parse } from '../src/parser/parser';
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

describe('операторы и литералы', () => {
  afterEach(() => vi.restoreAllMocks());

  it('тернарный ?(Истина, а, б) берёт истину', () => {
    expect(exec('сообщить(?(Истина, "да", "нет"));')).toEqual(['да']);
  });

  it('тернарный ?(Ложь, а, б) берёт ложь', () => {
    expect(exec('сообщить(?(Ложь, "да", "нет"));')).toEqual(['нет']);
  });

  it('тернарный с коротким замыканием', () => {
    expect(exec('сообщить(?(Истина, "ок", НеизвестнаяФункция()));')).toEqual(['ок']);
  });

  it('унарный плюс', () => {
    expect(exec('сообщить(+5);')).toEqual(['5']);
  });

  it('парсит Новый Массив(2, 4)', () => {
    const program = parse(tokenize('x = Новый Массив(2, 4);'));
    expect(program.body[0]).toMatchObject({
      kind: 'Assignment',
      value: {
        kind: 'NewObjectExpression',
        typeName: 'Массив',
        args: [{ kind: 'NumberLiteral', value: 2 }, { kind: 'NumberLiteral', value: 4 }],
      },
    });
  });

  it('Новый без зарегистрированного типа бросает (типы — в T15)', () => {
    expect(() => exec('x = Новый Массив;')).toThrow(/Тип 'Массив' не найден/);
  });
});
