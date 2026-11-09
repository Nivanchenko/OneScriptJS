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

describe('препроцессор', () => {
  afterEach(() => vi.restoreAllMocks());

  it('#Если Истина включает код', () => {
    expect(exec('#Если Истина Тогда\nсообщить("да");\n#КонецЕсли')).toEqual(['да']);
  });

  it('#Если Ложь — берётся Иначе', () => {
    expect(exec('#Если Ложь Тогда\nсообщить("нет");\n#Иначе\nсообщить("да");\n#КонецЕсли')).toEqual(['да']);
  });

  it('#ИначеЕсли выбирает ветку', () => {
    expect(
      exec('#Если Ложь Тогда\nсообщить("1");\n#ИначеЕсли Истина Тогда\nсообщить("2");\n#Иначе\nсообщить("3");\n#КонецЕсли'),
    ).toEqual(['2']);
  });

  it('#Область/#КонецОбласти игнорируются', () => {
    expect(exec('#Область Раздел\nсообщить("работает");\n#КонецОбласти')).toEqual(['работает']);
  });

  it('#Использовать игнорируется', () => {
    expect(exec('#Использовать asserts\nсообщить("работает");')).toEqual(['работает']);
  });
});
