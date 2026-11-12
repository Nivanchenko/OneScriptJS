import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Diagnostic, Position } from 'vscode-languageserver';
import {
  analyzeHtml,
  blockAt,
  embeddedDiagnostics,
  embeddedSemanticTokens,
  toBlockPosition,
  toDocumentRange,
} from '../src/lsp/embedded';
import type { EmbeddedAnalysis, EmbeddedBlock } from '../src/lsp/embedded';
import { SEMANTIC_TOKEN_TYPES } from '../src/lsp/semantic-tokens';
import { definitionAt } from '../src/lsp/symbols';
import { DocumentStore } from '../src/lsp/document';

const FIXTURES = join(process.cwd(), 'tests/fixtures/lsp/embedded');

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

function blockText(analysis: EmbeddedAnalysis, index: number): string {
  const block = analysis.blocks[index];
  if (block === undefined) throw new Error(`нет блока ${index}`);
  return analysis.text.slice(block.contentStartOffset, block.contentEndOffset);
}

function offsetOf(block: EmbeddedBlock, position: Position): number {
  return block.html.offsetAt(position);
}

interface DecodedToken {
  line: number;
  startChar: number;
  length: number;
  type: string;
  text: string;
}

/** Декодер дельта-кодированных токенов с текстом из HTML. */
function decodeTokens(data: number[], html: string): DecodedToken[] {
  expect(data.length % 5).toBe(0);
  const lines = html.split('\n');
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
    const lineText = (lines[line] ?? '').replace(/\r$/, '');
    decoded.push({ line, startChar, length, type, text: lineText.slice(startChar, startChar + length) });
  }
  return decoded;
}

function isInsideBlock(block: EmbeddedBlock, position: Position): boolean {
  const offset = offsetOf(block, position);
  return offset >= block.contentStartOffset && offset <= block.contentEndOffset;
}

const ROUND_TRIP_FIXTURES = [
  'two-blocks.html',
  'inline.html',
  'crlf.html',
  'bom.html',
  'cyrillic-emoji.html',
  'comments-multiple.html',
];

describe('встроенные блоки: анализ и маппинг', () => {
  it('анализирует каждый блок отдельно тем же анализатором 014', () => {
    const analysis = analyzeHtml(fixture('two-blocks.html'));
    expect(analysis.blocks).toHaveLength(2);
    expect(blockText(analysis, 0)).toContain('Процедура Привет()');
    expect(blockText(analysis, 1)).toContain('Функция Сумма(А, Б)');

    const first = analysis.blocks[0];
    const second = analysis.blocks[1];
    if (first === undefined || second === undefined) throw new Error('нет блоков');
    expect(first.analysis.symbols.methods.map((method) => method.name)).toEqual(['Привет']);
    expect(second.analysis.symbols.methods.map((method) => method.name)).toEqual(['Сумма']);
    // Изоляция: имена одного блока не известны другому.
    expect(first.analysis.symbols.knownNames.has('сумма')).toBe(false);
    expect(second.analysis.symbols.knownNames.has('привет')).toBe(false);
  });

  it('round-trip block↔html для CRLF/BOM/эмодзи/инлайн (все смещения)', () => {
    for (const name of ROUND_TRIP_FIXTURES) {
      const analysis = analyzeHtml(fixture(name));
      for (const block of analysis.blocks) {
        for (let offset = 0; offset <= block.text.length; offset += 1) {
          // Позиция внутри CRLF не представима в LSP (positionAt схлопывает её к EOL).
          const insideCrlf =
            offset > 0 && block.text.charCodeAt(offset - 1) === 13 && block.text.charCodeAt(offset) === 10;
          if (insideCrlf) continue;
          const local = block.document.positionAt(offset);
          const mapped = toDocumentRange(block, { start: local, end: local });
          expect(isInsideBlock(block, mapped.start)).toBe(true);
          const back = toBlockPosition(block, mapped.start);
          expect(block.document.offsetAt(back), `${name} offset ${offset}`).toBe(offset);
          // Позиция совпадает с независимым пересчётом по HTML-документу.
          const expected = analysis.document.positionAt(block.contentStartOffset + offset);
          expect(mapped.start).toEqual(expected);
        }
      }
    }
  });

  it('round-trip для BOM и эмодзи в одной строке с блоком', () => {
    const html = '\uFEFF<p>😀</p><script type="text/osjs">А = "😀";</script>';
    const analysis = analyzeHtml(html);
    const block = analysis.blocks[0];
    if (block === undefined) throw new Error('нет блока');
    expect(blockText(analysis, 0)).toBe('А = "😀";');
    for (let offset = 0; offset <= block.text.length; offset += 1) {
      const local = block.document.positionAt(offset);
      const mapped = toDocumentRange(block, { start: local, end: local });
      expect(mapped.start.line).toBe(0);
      expect(mapped.start.character).toBe(html.indexOf('А = "😀";') + offset);
      expect(block.document.offsetAt(toBlockPosition(block, mapped.start))).toBe(offset);
    }
  });

  it('диапазон не выходит за границы блока (в т.ч. многострочный)', () => {
    const analysis = analyzeHtml(fixture('two-blocks.html'));
    const block = analysis.blocks[0];
    if (block === undefined) throw new Error('нет блока');
    const huge = toDocumentRange(block, {
      start: { line: 0, character: 0 },
      end: { line: 9999, character: 9999 },
    });
    expect(offsetOf(block, huge.start)).toBe(block.contentStartOffset);
    expect(offsetOf(block, huge.end)).toBe(block.contentEndOffset);

    const before = toDocumentRange(block, {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 3 },
    });
    expect(offsetOf(block, before.start)).toBeGreaterThanOrEqual(block.contentStartOffset);
    expect(offsetOf(block, before.end)).toBeLessThanOrEqual(block.contentEndOffset);
  });

  it('blockAt: внутри блока — блок, снаружи — undefined', () => {
    const analysis = analyzeHtml(fixture('two-blocks.html'));
    const first = analysis.blocks[0];
    const second = analysis.blocks[1];
    if (first === undefined || second === undefined) throw new Error('нет блоков');

    expect(blockAt(analysis, first.start)).toBe(first);
    expect(blockAt(analysis, first.end)).toBe(first);
    expect(blockAt(analysis, second.start)).toBe(second);
    // Позиция до первого блока и внутри HTML-разметки — вне блоков.
    expect(blockAt(analysis, { line: 0, character: 0 })).toBeUndefined();
    expect(blockAt(analysis, { line: 8, character: 0 })).toBeUndefined();
    // Позиция на самом теге `</script>` уже вне содержимого.
    const closeTag = analysis.document.positionAt(first.contentEndOffset + 2);
    expect(blockAt(analysis, closeTag)).toBeUndefined();
  });
});

describe('встроенные блоки: диагностика', () => {
  function diagnosticsOf(html: string): Diagnostic[] {
    return embeddedDiagnostics(analyzeHtml(html));
  }

  it('переносит диагностику 014 в координаты HTML', () => {
    const html = [
      '<!doctype html>',
      '<body>',
      '<script type="text/osjs">',
      'Процедура Тест()',
      '  А = 1 +;',
      'КонецПроцедуры',
      '</script>',
      '</body>',
    ].join('\n');
    const list = diagnosticsOf(html);
    const error = list.find((diagnostic) => diagnostic.code === 'OSJS2001');
    expect(error).toBeDefined();
    expect(error?.source).toBe('osjs');
    expect(error?.range.start.line).toBe(4); // строка `А = 1 +;` в HTML
    const block = analyzeHtml(html).blocks[0];
    if (block === undefined) throw new Error('нет блока');
    expect(isInsideBlock(block, error?.range.start ?? { line: 0, character: 0 })).toBe(true);
  });

  it('ошибки из нескольких блоков видны одновременно', () => {
    const block = (body: string): string => `<script type="text/osjs">\n${body}\n</script>`;
    const html = [block('А = ;'), '<p>между</p>', block('Б = ]'), block('В = (')].join('\n');
    const list = diagnosticsOf(html);
    const parseErrors = list.filter((diagnostic) => diagnostic.code === 'OSJS2001');
    expect(parseErrors.length).toBeGreaterThanOrEqual(3);
    expect(new Set(parseErrors.map((diagnostic) => diagnostic.range.start.line)).size).toBeGreaterThanOrEqual(3);
  });

  it('чистый BSL внутри блоков и ошибки HTML снаружи не диагностируются', () => {
    const html = [
      '<div><span></div>',
      '<script type="text/osjs">',
      'Сообщить("ок");',
      '</script>',
      '<p>незакрытый тег',
    ].join('\n');
    expect(diagnosticsOf(html)).toEqual([]);
  });

  it('OSJS4001: обрыв блока на </script> внутри строки — Error с объяснением', () => {
    const list = diagnosticsOf(fixture('script-in-string.html'));
    const error = list.find((diagnostic) => diagnostic.code === 'OSJS4001');
    expect(error).toBeDefined();
    expect(error?.severity).toBe(1); // Error
    expect(error?.source).toBe('osjs');
    const message = typeof error?.message === 'string' ? error.message : '';
    expect(message).toContain('</script>');
    expect(message.toLowerCase()).toContain('безопасно');

    const analysis = analyzeHtml(fixture('script-in-string.html'));
    const block = analysis.blocks[0];
    if (block === undefined) throw new Error('нет блока');
    expect(isInsideBlock(block, error?.range.start ?? { line: 0, character: 0 })).toBe(true);
    expect(isInsideBlock(block, error?.range.end ?? { line: 0, character: 0 })).toBe(true);
  });

  it('OSJS4001: parse-error в конце закрытого блока — Error', () => {
    const html = '<script type="text/osjs">\nА = 1 +\n</script>';
    const list = diagnosticsOf(html);
    expect(list.some((diagnostic) => diagnostic.code === 'OSJS4001')).toBe(true);
  });

  it('OSJS4001 не ставится на корректный блок и на незакрытый (EOF) блок', () => {
    expect(diagnosticsOf('<script type="text/osjs">Текст = "ок";</script>')).toEqual([]);

    const unclosed = diagnosticsOf('<script type="text/osjs">\nТекст = "не закрыт\n');
    expect(unclosed.some((diagnostic) => diagnostic.code === 'OSJS4001')).toBe(false);
    expect(unclosed.some((diagnostic) => diagnostic.code === 'OSJS1001')).toBe(true);
  });

  it('OSJS4002: <script и <!-- в тексте блока — Warning внутри блока', () => {
    const html = [
      '<script type="text/osjs">',
      'Текст = "<script>";',
      'Ещё = "<!--";',
      '</script>',
    ].join('\n');
    const list = diagnosticsOf(html);
    const warnings = list.filter((diagnostic) => diagnostic.code === 'OSJS4002');
    expect(warnings).toHaveLength(2);
    for (const warning of warnings) {
      expect(warning.severity).toBe(2); // Warning
      expect(warning.source).toBe('osjs');
    }
    const analysis = analyzeHtml(html);
    const block = analysis.blocks[0];
    if (block === undefined) throw new Error('нет блока');
    expect(warnings[0]?.range.start.line).toBe(1);
    expect(warnings[1]?.range.start.line).toBe(2);
    for (const warning of warnings) {
      expect(isInsideBlock(block, warning.range.start)).toBe(true);
      expect(isInsideBlock(block, warning.range.end)).toBe(true);
    }
  });

  it('OSJS4002 не появляется в обычном блоке', () => {
    expect(diagnosticsOf('<script type="text/osjs">Текст = "ок";</script>')).toEqual([]);
  });

  it('лимит 200 на HTML-документ, дедуп и сортировка', () => {
    const pieces: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      pieces.push('<script type="text/osjs">');
      for (let j = 0; j < 10; j += 1) pieces.push('Х = ;');
      pieces.push('</script>');
    }
    const list = diagnosticsOf(pieces.join('\n'));
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(200);

    const keys = list.map(
      (diagnostic) => `${String(diagnostic.code)}:${diagnostic.range.start.line}:${diagnostic.range.start.character}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    const positions = list.map((diagnostic) => diagnostic.range.start.line * 100_000 + diagnostic.range.start.character);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe('встроенные блоки: semantic tokens', () => {
  function tokensOf(html: string): DecodedToken[] {
    return decodeTokens(embeddedSemanticTokens(analyzeHtml(html)), html);
  }

  it('токены только внутри блоков и в HTML-координатах', () => {
    const html = [
      '<!doctype html>',
      '<p>разметка</p>',
      '<script type="text/osjs">',
      'Процедура Тест()',
      '  Значение = 42;',
      'КонецПроцедуры',
      '</script>',
    ].join('\n');
    const analysis = analyzeHtml(html);
    const decoded = tokensOf(html);
    expect(decoded.length).toBeGreaterThan(0);

    const block = analysis.blocks[0];
    if (block === undefined) throw new Error('нет блока');
    for (const token of decoded) {
      expect(isInsideBlock(block, { line: token.line, character: token.startChar })).toBe(true);
      expect(token.startChar + token.length).toBeLessThanOrEqual(
        (html.split('\n')[token.line] ?? '').replace(/\r$/, '').length,
      );
    }
    const keyword = decoded.find((token) => token.text === 'Процедура');
    expect(keyword?.type).toBe('keyword');
    expect(keyword?.line).toBe(3);
    // Слова разметки не подсвечиваются.
    expect(decoded.some((token) => token.text === 'разметка' || token.text === 'doctype')).toBe(false);
  });

  it('инлайн-блок: токены в одной строке с HTML', () => {
    const html = '<p>до</p><script type="text/osjs">А = 1;</script><p>после</p>';
    const decoded = tokensOf(html);
    expect(decoded.length).toBeGreaterThan(0);
    expect(decoded.every((token) => token.line === 0)).toBe(true);
    const variable = decoded.find((token) => token.text === 'А');
    expect(variable?.type).toBe('variable');
    expect(variable?.startChar).toBe(html.indexOf('А = 1;'));
  });

  it('нет пересечений', () => {
    const decoded = tokensOf(fixture('cyrillic-emoji.html'));
    for (let i = 1; i < decoded.length; i += 1) {
      const previous = decoded[i - 1];
      const current = decoded[i];
      if (previous === undefined || current === undefined) continue;
      if (previous.line === current.line) {
        expect(current.startChar).toBeGreaterThanOrEqual(previous.startChar + previous.length);
      } else {
        expect(current.line).toBeGreaterThan(previous.line);
      }
    }
  });

  it('после вставки строки токены сдвигаются вместе с HTML, после удаления — возвращаются', () => {
    const html = [
      '<script type="text/osjs">',
      'А = 1;',
      '</script>',
    ].join('\n');
    const base = tokensOf(html);
    const inserted = tokensOf('<!-- шапка -->\n<p>ещё</p>\n' + html).map((token) => ({
      ...token,
      line: token.line - 2,
    }));
    expect(inserted).toEqual(base);

    const removed = tokensOf(html);
    expect(removed).toEqual(base);
  });

  it('HTML без блоков — токенов нет', () => {
    expect(tokensOf(fixture('no-blocks.html'))).toEqual([]);
  });
});

describe('DocumentStore: html-документы', () => {
  it('хранит html и инвалидирует встроенный анализ на didChange', () => {
    const store = new DocumentStore();
    const uri = 'file:///app/page.html';
    const text = fixture('two-blocks.html');
    const state = store.open(uri, 'html', 1, text);
    expect(state?.languageId).toBe('html');

    const embedded = analyzeHtml(text, { uri, version: 1 });
    store.setEmbedded(uri, embedded);
    expect(store.get(uri)?.embedded).toBe(embedded);

    const changed = store.change(uri, 2, text + '\n');
    expect(changed?.version).toBe(2);
    expect(changed?.embedded).toBeUndefined();
  });

  it('чужие languageId по-прежнему не принимаются', () => {
    const store = new DocumentStore();
    expect(store.open('file:///app/main.os', 'bsl', 1, 'А = 1;')).toBeUndefined();
    expect(store.get('file:///app/main.os')).toBeUndefined();
    expect(store.open('file:///app/ok.osjs', 'osjs', 1, 'А = 1;')).toBeDefined();
  });

  it('путь .osjs не изменился: analysis кэшируется и сбрасывается', () => {
    const store = new DocumentStore();
    const uri = 'file:///app/ok.osjs';
    store.open(uri, 'osjs', 1, 'А = 1;');
    const analysis = analyzeHtml('<script type="text/osjs">А = 1;</script>').blocks[0]?.analysis;
    if (analysis === undefined) throw new Error('нет анализа');
    store.setAnalysis(uri, analysis);
    expect(store.get(uri)?.analysis).toBe(analysis);
    expect(store.change(uri, 2, 'А = 2;')?.analysis).toBeUndefined();
  });
});

describe('изоляция блоков', () => {
  it('локальный символ одного блока не находится в другом', () => {
    const html = [
      '<script type="text/osjs">',
      'Секрет = 1;',
      '</script>',
      '<script type="text/osjs">',
      'Сообщить(Секрет);',
      '</script>',
    ].join('\n');
    const analysis = analyzeHtml(html);
    const second = analysis.blocks[1];
    if (second === undefined) throw new Error('нет блока');
    const position = analysis.document.positionAt(analysis.text.lastIndexOf('Секрет'));
    const local = toBlockPosition(second, position);
    expect(definitionAt(second.analysis, analysis.uri, local)).toBeNull();
  });
});
