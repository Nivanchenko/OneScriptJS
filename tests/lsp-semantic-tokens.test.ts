import { describe, expect, it } from 'vitest';
import { analyze } from '../src/lsp/analysis';
import { SEMANTIC_TOKEN_TYPES, semanticTokens } from '../src/lsp/semantic-tokens';

/** Стандартная легенда LSP из контракта (D16, data-model §5); порядок фиксирован. */
const STANDARD_TOKEN_TYPES = [
  'keyword',
  'operator',
  'number',
  'string',
  'comment',
  'decorator',
  'function',
  'method',
  'variable',
  'parameter',
  'property',
  'enumMember',
] as const;

interface DecodedToken {
  line: number;
  startChar: number;
  length: number;
  type: string;
  modifiers: number;
  text: string;
}

/** Декодирует `data` (5 ints/token) в токены с текстом из исходника. */
function decodeTokens(source: string): DecodedToken[] {
  const data = semanticTokens(analyze(source));
  expect(data.length % 5).toBe(0);
  const lines = source.split('\n');
  const decoded: DecodedToken[] = [];
  let line = 0;
  let startChar = 0;
  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaStart = data[i + 1];
    const length = data[i + 2];
    const typeIndex = data[i + 3];
    const modifiers = data[i + 4];
    if (
      deltaLine === undefined ||
      deltaStart === undefined ||
      length === undefined ||
      typeIndex === undefined ||
      modifiers === undefined
    ) {
      throw new Error('неполный semantic token');
    }
    line += deltaLine;
    startChar = deltaLine === 0 ? startChar + deltaStart : deltaStart;
    const type = SEMANTIC_TOKEN_TYPES[typeIndex];
    if (type === undefined) throw new Error(`неизвестный тип токена: ${typeIndex}`);
    const lineText = lines[line] ?? '';
    decoded.push({
      line,
      startChar,
      length,
      type,
      modifiers,
      text: lineText.slice(startChar, startChar + length),
    });
  }
  return decoded;
}

function typesOf(decoded: DecodedToken[], text: string): string[] {
  return decoded.filter((token) => token.text === text).map((token) => token.type);
}

function positionOf(token: DecodedToken): number {
  return token.line * 1_000_000 + token.startChar;
}

function expectNoOverlap(decoded: DecodedToken[]): void {
  for (let i = 1; i < decoded.length; i += 1) {
    const previous = decoded[i - 1];
    const current = decoded[i];
    if (previous === undefined || current === undefined) continue;
    expect(positionOf(current)).toBeGreaterThan(positionOf(previous));
    if (current.line === previous.line) {
      expect(current.startChar).toBeGreaterThanOrEqual(previous.startChar + previous.length);
    }
  }
}

describe('semantic tokens .osjs', () => {
  it('легенда — только стандартные типы в порядке контракта', () => {
    expect(SEMANTIC_TOKEN_TYPES).toEqual([...STANDARD_TOKEN_TYPES]);
    expect(new Set(SEMANTIC_TOKEN_TYPES).size).toBe(STANDARD_TOKEN_TYPES.length);
  });

  it('дельта-кодирование: 5 ints на токен, порядок по позиции, без пересечений', () => {
    const source = [
      'Процедура Тест(Параметр)',
      '  Значение = 42 + 3.14;',
      '  Строка = "привет";',
      'КонецПроцедуры',
    ].join('\n');
    const data = semanticTokens(analyze(source));
    expect(data.length).toBeGreaterThan(0);
    expect(data.length % 5).toBe(0);

    const decoded = decodeTokens(source);
    for (const token of decoded) {
      expect(token.length).toBeGreaterThan(0);
      expect(token.modifiers).toBe(0);
      expect(STANDARD_TOKEN_TYPES).toContain(token.type);
    }
    expectNoOverlap(decoded);
    // первый токен — абсолютная позиция, последующие — относительные
    expect(decoded[0]?.line).toBe(0);
    expect(decoded[0]?.startChar).toBe(0);
  });

  it('классифицирует ключевые слова, операторы, литералы, комментарии, директивы и аннотации', () => {
    const source = [
      '#Область Тест',
      '// комментарий',
      '&Аннотация',
      'Процедура Метод(Параметр)',
      '  Значение = 42 + 3.14;',
      '  Строка = "привет";',
      '  Дата = \'20240101\';',
      '  Ждать АсинхФункция();',
      '  Объект.Свойство = 1;',
      '  Направление = НаправлениеПоиска.СНачала;',
      'КонецПроцедуры',
      '#КонецОбласти',
    ].join('\n');
    const decoded = decodeTokens(source);

    expect(typesOf(decoded, '#Область')).toEqual(['keyword']);
    expect(typesOf(decoded, '#КонецОбласти')).toEqual(['keyword']);
    expect(typesOf(decoded, '// комментарий')).toEqual(['comment']);
    expect(typesOf(decoded, 'Аннотация')).toEqual(['decorator']);
    expect(typesOf(decoded, 'Процедура')).toEqual(['keyword']);
    expect(typesOf(decoded, 'КонецПроцедуры')).toEqual(['keyword']);
    expect(typesOf(decoded, 'Ждать')).toEqual(['keyword']);
    expect(typesOf(decoded, 'Метод')).toContain('method');
    expect(typesOf(decoded, 'Параметр')).toContain('parameter');
    expect(typesOf(decoded, 'Значение')).toContain('variable');
    expect(typesOf(decoded, '42')).toEqual(['number']);
    expect(typesOf(decoded, '+')).toEqual(['operator']);
    expect(typesOf(decoded, '3.14')).toEqual(['number']);
    expect(typesOf(decoded, '"привет"')).toEqual(['string']);
    expect(typesOf(decoded, "'20240101'")).toEqual(['number']);
    expect(typesOf(decoded, 'Свойство')).toContain('property');
    expect(typesOf(decoded, 'СНачала')).toEqual(['enumMember']);
  });

  it('многострочная строка разбивается на сегменты по строкам', () => {
    const source = 'Текст = "первая\n|вторая\n|третья";\n';
    const decoded = decodeTokens(source);
    const strings = decoded.filter((token) => token.type === 'string');
    expect(strings.map((token) => token.line)).toEqual([0, 1, 2]);
    expect(strings.map((token) => token.text)).toEqual(['"первая', '|вторая', '|третья"']);
    for (const token of strings) {
      expect(token.length).toBeGreaterThan(0);
      // LSP-токен не может пересекать строку
      expect(token.startChar + token.length).toBeLessThanOrEqual(source.split('\n')[token.line]?.length ?? 0);
    }
    expectNoOverlap(decoded);
  });

  it('после вставки строки все токены сдвигаются, после удаления — возвращаются', () => {
    const base = 'Процедура Тест()\n  А = 1;\nКонецПроцедуры\n';
    const inserted = '// шапка\n\n' + base;

    const baseTokens = decodeTokens(base);
    const shifted = decodeTokens(inserted)
      .filter((token) => token.line >= 2)
      .map((token) => ({ ...token, line: token.line - 2 }));
    expect(shifted).toEqual(baseTokens);

    const restored = decodeTokens(inserted.slice('// шапка\n\n'.length));
    expect(restored).toEqual(baseTokens);
  });

  it('после удаления строки внутри метода диапазоны не съезжают', () => {
    const withComment = 'Процедура Тест()\n  // пояснение\n  А = 1;\nКонецПроцедуры\n';
    const withoutComment = 'Процедура Тест()\n  А = 1;\nКонецПроцедуры\n';

    const expected = decodeTokens(withoutComment);
    const actual = decodeTokens(withComment)
      .filter((token) => token.line !== 1)
      .map((token) => (token.line > 1 ? { ...token, line: token.line - 1 } : token));
    expect(actual).toEqual(expected);
  });

  it('корректно считает UTF-16 на кириллице и эмодзи', () => {
    const source = [
      'Процедура Привет()',
      '  Текст = "😀 привет";',
      '  // 😀 комментарий',
      'КонецПроцедуры',
    ].join('\n');
    const decoded = decodeTokens(source);

    const method = decoded.find((token) => token.text === 'Привет');
    expect(method?.type).toBe('method');
    expect(method?.length).toBe('Привет'.length);

    const string = decoded.find((token) => token.type === 'string');
    expect(string?.text).toBe('"😀 привет"');
    expect(string?.length).toBe('"😀 привет"'.length);

    const comment = decoded.find((token) => token.type === 'comment');
    expect(comment?.text).toBe('// 😀 комментарий');
    expect(comment?.length).toBe('// 😀 комментарий'.length);
  });

  it('корректно считает позиции при CRLF', () => {
    const source = 'Процедура Тест()\r\n  А = 1;\r\nКонецПроцедуры\r\n';
    const decoded = decodeTokens(source);

    const keyword = decoded.find((token) => token.text === 'Процедура');
    expect(keyword?.line).toBe(0);
    expect(keyword?.startChar).toBe(0);
    expect(keyword?.length).toBe('Процедура'.length);

    const number = decoded.find((token) => token.text === '1');
    expect(number?.line).toBe(1);
    expect(number?.startChar).toBe(6);
    expect(number?.length).toBe(1);

    const end = decoded.find((token) => token.text === 'КонецПроцедуры');
    expect(end?.line).toBe(2);
    expect(end?.startChar).toBe(0);

    expect(decoded.every((token) => !token.text.includes('\r'))).toBe(true);
    expectNoOverlap(decoded);
  });

  it('BOM не сдвигает токены относительно текста, который видит лексер', () => {
    const source = '\uFEFFПроцедура Тест()\nКонецПроцедуры\n';
    const decoded = decodeTokens(source);

    const keyword = decoded.find((token) => token.text === 'Процедура');
    expect(keyword?.line).toBe(0);
    // BOM — один UTF-16 code unit, лексер считает его частью первой строки.
    expect(keyword?.startChar).toBe(1);
    expect(keyword?.length).toBe('Процедура'.length);

    // `Процедура` (9) + пробел + BOM (1) → имя метода начинается с 11-го code unit.
    const method = decoded.find((token) => token.text === 'Тест');
    expect(method?.startChar).toBe(11);
  });

  it('файл длиннее лимита 10 000 строк не отдаёт токенов', () => {
    const tooManyLines = 'А = 1;' + '\n'.repeat(10_001);
    expect(semanticTokens(analyze(tooManyLines))).toEqual([]);

    const atLimit = 'А = 1;' + '\n'.repeat(9_999);
    expect(semanticTokens(analyze(atLimit)).length).toBeGreaterThan(0);
  });
});
