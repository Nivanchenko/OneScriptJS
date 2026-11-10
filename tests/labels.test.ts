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

describe('метки и аннотации', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Перейти вперёд пропускает код', () => {
    expect(exec('А = 1;\nПерейти ~Метка;\nА = 999;\n~Метка:\nсообщить(А);')).toEqual(['1']);
  });

  it('Перейти назад — цикл через goto', () => {
    expect(
      exec(
        'Счетчик = 0;\n~Начало:\nСчетчик = Счетчик + 1;\nЕсли Счетчик < 5 Тогда\n  Перейти ~Начало;\nКонецЕсли;\nсообщить(Счетчик);',
      ),
    ).toEqual(['5']);
  });

  it('Перейти выходит из вложенных циклов', () => {
    expect(
      exec(
        'Для И1 = 1 По 10 Цикл\n  Для И2 = 1 По 10 Цикл\n    Перейти ~Выход;\n  КонецЦикла;\nКонецЦикла;\n~Выход:\nсообщить("вышли");',
      ),
    ).toEqual(['вышли']);
  });

  it('аннотации перед объявлением игнорируются', () => {
    expect(
      exec(
        '&Анно\nПерем X;\n&Анно(1)\nФункция Ф()\n  Возврат 42;\nКонецФункции\nX = Ф();\nсообщить(X);',
      ),
    ).toEqual(['42']);
  });
});
