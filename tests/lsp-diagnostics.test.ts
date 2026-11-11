import { describe, expect, it } from 'vitest';
import type { Diagnostic } from 'vscode-languageserver';
import { analyze } from '../src/lsp/analysis';

function diags(source: string): Diagnostic[] {
  return analyze(source).diagnostics;
}

function codes(source: string): string[] {
  return diags(source).map((d) => String(d.code ?? '')).sort();
}

function linesOf(source: string, code: string): number[] {
  return diags(source)
    .filter((d) => d.code === code)
    .map((d) => d.range.start.line);
}

describe('диагностика .osjs', () => {
  it('синтаксическая ошибка: код, severity, точная позиция и диапазон', () => {
    // строка 2 (0-based: 1) — незаконченное выражение
    const list = diags('Процедура Тест()\n  А = 1 +;\nКонецПроцедуры\n');
    const error = list.find((d) => d.code === 'OSJS2001');
    expect(error).toBeDefined();
    expect(error?.severity).toBe(1); // Error
    expect(error?.source).toBe('osjs');
    expect(error?.range.start.line).toBe(1);
    expect(error?.range.start.character).toBeGreaterThanOrEqual(0);
    expect(error?.range.end.character).toBeGreaterThan(error?.range.start.character ?? 0);
  });

  it('несколько независимых ошибок разбора видны одновременно', () => {
    const source = [
      'Процедура Первая()',
      '  А = ;',
      'КонецПроцедуры',
      'Процедура Вторая()',
      '  Б = 1 + ;',
      'КонецПроцедуры',
      'Процедура Третья()',
      '  В = 2 3;',
      'КонецПроцедуры',
    ].join('\n');
    const parseErrors = linesOf(source, 'OSJS2001');
    expect(parseErrors.length).toBeGreaterThanOrEqual(3);
    expect(new Set(parseErrors).size).toBeGreaterThanOrEqual(3);
  });

  it('на валидном файле диагностик нет', () => {
    const source = [
      'Перем Счётчик;',
      'Функция Сложить(А, Б)',
      '  Возврат А + Б;',
      'КонецФункции',
      'Сообщить(Сложить(2, 3));',
    ].join('\n');
    expect(diags(source)).toEqual([]);
  });

  it('комментарий внутри метода не ломает разбор: семантика видит следующий вызов', () => {
    const source = 'Процедура Тест()\n  // пояснение\n  НесуществующаяФункция(1);\nКонецПроцедуры\n';
    expect(codes(source)).toContain('OSJS3001');
  });

  it('OSJS1001: незакрытый строковый литерал', () => {
    const list = diags('Сообщить("незакрытая);\n');
    expect(list.some((d) => d.code === 'OSJS1001')).toBe(true);
  });

  it('OSJS3001: неизвестная глобальная функция', () => {
    const list = diags('НесуществующаяФункция(1);\n');
    const warning = list.find((d) => d.code === 'OSJS3001');
    expect(warning?.severity).toBe(2); // Warning
    expect(warning?.range.start.line).toBe(0);
    expect(diags('Сообщить("ок");\n')).toEqual([]);
  });

  it('OSJS3002: неверное число аргументов известной функции', () => {
    expect(codes('СтрРазделить("а");\n')).toContain('OSJS3002');
    expect(codes('СтрРазделить("а", ",");\n')).toEqual([]);
  });

  it('OSJS3003: неизвестный тип в «Новый»', () => {
    expect(codes('Х = Новый НесуществующийТип;\n')).toContain('OSJS3003');
    expect(codes('Х = Новый Массив;\n')).toEqual([]);
  });

  it('OSJS3003 подавляется при наличии #Использовать (класс мог быть импортирован)', () => {
    const source = '#Использовать "lib/Класс.osjs"\n\nХ = Новый ИмпортированныйКласс;\n';
    expect(codes(source)).not.toContain('OSJS3003');
  });

  it('семантика не дублирует синтаксис и не проверяется на частичном AST', () => {
    const source = 'Процедура Тест()\n  НесуществующаяФункция(1);\n  А = 1 +;\nКонецПроцедуры\n';
    expect(codes(source)).not.toContain('OSJS3001');
    expect(codes(source)).toContain('OSJS2001');
  });

  it('стилевых правил нет', () => {
    const longLine = 'Х = "' + 'а'.repeat(200) + '";';
    const source = 'Перем Неиспользуемая;\n' + longLine + '\n';
    expect(diags(source)).toEqual([]);
  });

  it('лимит диагностик на документ: не более 200', () => {
    const lines: string[] = [];
    for (let i = 0; i < 300; i++) lines.push('Х = ;');
    expect(diags(lines.join('\n')).length).toBeLessThanOrEqual(200);
  });

  it('дедупликация: одна и та же позиция с одним кодом — один раз', () => {
    const list = diags('Х = ;\n');
    const keys = list.map((d) => `${d.code}:${d.range.start.line}:${d.range.start.character}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('производительность: 1000 строк диагностируются не дольше 1 секунды', () => {
    const lines: string[] = ['Перем А;'];
    for (let i = 0; i < 999; i++) lines.push('А = А + 1;');
    const source = lines.join('\n');
    const started = performance.now();
    const list = diags(source);
    const elapsed = performance.now() - started;
    expect(list).toEqual([]);
    expect(elapsed).toBeLessThan(1000);
  });

  it('стресс: файл с 100+ ошибками не бросает и даёт диагностику', () => {
    const lines: string[] = [];
    for (let i = 0; i < 120; i++) {
      lines.push('Процедура Метод' + i + '()');
      lines.push('  А = ;');
      lines.push('КонецПроцедуры');
    }
    expect(() => diags(lines.join('\n'))).not.toThrow();
    expect(diags(lines.join('\n')).length).toBeGreaterThan(0);
  });
});
