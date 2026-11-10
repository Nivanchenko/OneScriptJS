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

describe('системные перечисления', () => {
  afterEach(() => vi.restoreAllMocks());

  it('ХешФункция.SHA256 (равенство)', () => {
    expect(exec('сообщить(ХешФункция.SHA256 = ХешФункция.SHA256); сообщить(ХешФункция.SHA256 = ХешФункция.MD5);')).toEqual([
      'Истина',
      'Ложь',
    ]);
  });

  it('ЦветКонсоли: Строка(ЦветКонсоли.Красный)', () => {
    expect(exec('сообщить(Строка(ЦветКонсоли.Красный));')).toEqual(['Красный']);
  });

  it('КодировкаТекста.UTF8 = КодировкаТекста.UTF8', () => {
    expect(exec('сообщить(КодировкаТекста.UTF8 = КодировкаТекста.UTF8);')).toEqual(['Истина']);
  });

  it('НаправлениеСортировки: Возр/Убыв', () => {
    expect(exec('сообщить(Строка(НаправлениеСортировки.Возр)); сообщить(Строка(НаправлениеСортировки.Убыв));')).toEqual([
      'Возр',
      'Убыв',
    ]);
  });

  it('Символы.ПС — перевод строки', () => {
    expect(exec('сообщить(КодСимвола(Символы.ПС, 1)); сообщить(КодСимвола(Символы.Таб, 1));')).toEqual(['10', '9']);
  });

  it('двуязычные алиасы: ТипДиска.Fixed = ТипДиска.ЖесткийДиск', () => {
    expect(exec('сообщить(ТипДиска.Fixed = ТипДиска.ЖесткийДиск);')).toEqual(['Истина']);
  });
});
