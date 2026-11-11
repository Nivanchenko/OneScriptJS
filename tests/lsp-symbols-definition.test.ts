import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SymbolKind } from 'vscode-languageserver';
import type { DocumentSymbol, Range } from 'vscode-languageserver';
import { analyze } from '../src/lsp/analysis';
import { definitionAt, documentSymbols } from '../src/lsp/symbols';

const structureSource = readFileSync(
  join(process.cwd(), 'tests/fixtures/lsp/structure.osjs'),
  'utf8',
);
const documentUri = 'file:///app/structure.osjs';

function contains(outer: Range, inner: Range): boolean {
  const startsAfter =
    outer.start.line < inner.start.line ||
    (outer.start.line === inner.start.line && outer.start.character <= inner.start.character);
  const endsBefore =
    outer.end.line > inner.end.line ||
    (outer.end.line === inner.end.line && outer.end.character >= inner.end.character);
  return startsAfter && endsBefore;
}

function walkSymbols(symbols: DocumentSymbol[], visit: (symbol: DocumentSymbol) => void): void {
  for (const symbol of symbols) {
    visit(symbol);
    walkSymbols(symbol.children ?? [], visit);
  }
}

function childNames(symbol: DocumentSymbol): string[] {
  return (symbol.children ?? []).map((child) => child.name);
}

describe('documentSymbol .osjs', () => {
  it('Outline: методы в регионах, у регионов kind Namespace', () => {
    const symbols = documentSymbols(analyze(structureSource));

    expect(symbols.map((symbol) => symbol.name)).toEqual(['Служебные', 'Основная']);
    const [служебные, основная] = symbols;
    expect(служебные?.kind).toBe(SymbolKind.Namespace);
    expect(основная?.kind).toBe(SymbolKind.Namespace);
    expect(childNames(служебные as DocumentSymbol)).toEqual(['Сложить']);
    expect(childNames(основная as DocumentSymbol)).toEqual(['Тест']);

    const сложить = служебные?.children?.[0];
    expect(сложить?.kind).toBe(SymbolKind.Function);
    expect(сложить?.selectionRange).toEqual({
      start: { line: 6, character: 8 },
      end: { line: 6, character: 15 },
    });
    expect(сложить?.range).toEqual({
      start: { line: 6, character: 0 },
      end: { line: 8, character: 12 },
    });

    const тест = основная?.children?.[0];
    expect(тест?.kind).toBe(SymbolKind.Method);
    expect(тест?.selectionRange).toEqual({
      start: { line: 14, character: 10 },
      end: { line: 14, character: 14 },
    });
    expect(тест?.range).toEqual({
      start: { line: 14, character: 0 },
      end: { line: 17, character: 14 },
    });
  });

  it('range региона покрывает #Область…#КонецОбласти, selectionRange внутри range', () => {
    const symbols = documentSymbols(analyze(structureSource));
    const [служебные, основная] = symbols;
    expect(служебные?.range).toEqual({
      start: { line: 4, character: 0 },
      end: { line: 10, character: 13 },
    });
    expect(основная?.range).toEqual({
      start: { line: 12, character: 0 },
      end: { line: 19, character: 13 },
    });

    walkSymbols(symbols, (symbol) => {
      expect(contains(symbol.range, symbol.selectionRange)).toBe(true);
      for (const child of symbol.children ?? []) {
        expect(contains(symbol.range, child.range)).toBe(true);
      }
    });
  });

  it('вложенные регионы — иерархией, методы без региона — верхним уровнем', () => {
    const nested = [
      '#Область Внешняя',
      'Процедура Снаружи()',
      'КонецПроцедуры',
      '#Область Внутренняя',
      'Функция Внутри()',
      'КонецФункции',
      '#КонецОбласти',
      '#КонецОбласти',
    ].join('\n');
    const symbols = documentSymbols(analyze(nested));
    expect(symbols.map((symbol) => symbol.name)).toEqual(['Внешняя']);
    const внешняя = symbols[0];
    expect(childNames(внешняя as DocumentSymbol)).toEqual(['Снаружи', 'Внутренняя']);
    const внутренняя = внешняя?.children?.find((child) => child.name === 'Внутренняя');
    expect(внутренняя?.kind).toBe(SymbolKind.Namespace);
    expect(childNames(внутренняя as DocumentSymbol)).toEqual(['Внутри']);

    const plain = documentSymbols(analyze('Процедура Один()\nКонецПроцедуры\n'));
    expect(plain.map((symbol) => symbol.name)).toEqual(['Один']);
    expect(plain[0]?.kind).toBe(SymbolKind.Method);
    expect(plain[0]?.range.end.line).toBe(1);
  });

  it('range асинхронного метода включает Асинх; CRLF не попадает в диапазон региона', () => {
    const asyncSource = 'Асинх Функция Загрузить()\nКонецФункции\n';
    const [asyncMethod] = documentSymbols(analyze(asyncSource));
    expect(asyncMethod?.kind).toBe(SymbolKind.Function);
    expect(asyncMethod?.selectionRange.start).toEqual({ line: 0, character: 14 });
    expect(asyncMethod?.range).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 1, character: 12 },
    });

    const [region] = documentSymbols(analyze('#Область Тест\r\n#КонецОбласти\r\n'));
    expect(region?.range.end).toEqual({ line: 1, character: 13 });
  });
});

describe('definition .osjs', () => {
  const analysis = analyze(structureSource);

  it('из вызова локального метода ведёт на объявление', () => {
    // `  Результат = Сложить(1, 2);` — строка 15
    const expected = {
      uri: documentUri,
      range: {
        start: { line: 6, character: 8 },
        end: { line: 6, character: 15 },
      },
    };
    expect(definitionAt(analysis, documentUri, { line: 15, character: 16 })).toEqual(expected);
    // курсор сразу за именем метода — то же определение
    expect(definitionAt(analysis, documentUri, { line: 15, character: 21 })).toEqual(expected);
  });

  it('из использования модульной переменной ведёт на объявление', () => {
    const source = [
      'Перем Счётчик;',
      '',
      'Процедура Тест()',
      '  Счётчик = 1;',
      'КонецПроцедуры',
    ].join('\n');
    const mini = analyze(source);
    const location = definitionAt(mini, 'file:///app/module.osjs', { line: 3, character: 4 });
    expect(location).toEqual({
      uri: 'file:///app/module.osjs',
      range: {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 13 },
      },
    });
  });

  it('#Использовать: инжектированный резолвер пути → Location файла с range 0:0', () => {
    const resolveImport = vi.fn(
      (_importPath: string, _documentUri: string): string | null =>
        'file:///app/lib/Модуль.osjs',
    );
    const location = definitionAt(
      analysis,
      documentUri,
      { line: 0, character: 20 },
      resolveImport,
    );
    expect(resolveImport).toHaveBeenCalledWith('lib/Модуль.osjs', documentUri);
    expect(location).toEqual({
      uri: 'file:///app/lib/Модуль.osjs',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    });
  });

  it('#Использовать: untitled, отсутствие резолвера и null от резолвера дают null', () => {
    const resolver = vi.fn((): string | null => 'file:///app/lib/Модуль.osjs');
    expect(
      definitionAt(analysis, 'untitled:Untitled-1', { line: 0, character: 20 }, resolver),
    ).toBeNull();
    expect(resolver).not.toHaveBeenCalled();

    expect(definitionAt(analysis, documentUri, { line: 0, character: 20 })).toBeNull();
    expect(
      definitionAt(analysis, documentUri, { line: 0, character: 20 }, () => null),
    ).toBeNull();
  });

  it('вне пути #Использовать и вне объявленных символов — null', () => {
    const resolver = vi.fn((): string | null => 'file:///app/lib/Модуль.osjs');
    // имя директивы, а не путь
    expect(definitionAt(analysis, documentUri, { line: 0, character: 2 }, resolver)).toBeNull();
    // ключевое слово
    expect(definitionAt(analysis, documentUri, { line: 8, character: 2 }, resolver)).toBeNull();
    // пустая строка
    expect(definitionAt(analysis, documentUri, { line: 1, character: 0 }, resolver)).toBeNull();
    expect(resolver).not.toHaveBeenCalled();
  });
});

describe('definition локальных переменных', () => {
  it('переход к объявлению локальной переменной метода', () => {
    const source =
      'Процедура Тест()\n  Локальная = 1;\n  Сообщить(Локальная);\nКонецПроцедуры\n';
    const analysis = analyze(source);
    const result = definitionAt(analysis, 'file:///app/local.osjs', {
      line: 2,
      character: 12,
    });
    expect(result).toEqual({
      uri: 'file:///app/local.osjs',
      range: { start: { line: 1, character: 2 }, end: { line: 1, character: 11 } },
    });
  });
});
