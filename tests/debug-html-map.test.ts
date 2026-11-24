import { describe, expect, it } from 'vitest';
import {
  blockLineToHtml,
  buildInlineBlockMaps,
  htmlLineToBlock,
} from '../src/debug/html-mapping';

/**
 * Маппинг строк HTML-файла ↔ строк inline-блока `<script type="text/osjs">`.
 * Контракт — specs/021-debugger/data-model.md §4, research.md F10.
 */

const PAGE_URL = 'http://localhost:5173/examples/page.html';
const BASE_URI = 'http://localhost:5173/examples/';

const TWO_BLOCKS = [
  '<!DOCTYPE html>', // 1
  '<html>', // 2
  '<body>', // 3
  '  <script type="text/osjs" id="first">', // 4
  '    А = 1;', // 5
  '    Сообщить(А);', // 6
  '  </script>', // 7
  '  <script type="text/osjs">', // 8
  '    Б = 2;', // 9
  '  </script>', // 10
  '</body>', // 11
  '</html>', // 12
].join('\n');

const TWO_BLOCKS_MANIFEST = [
  { index: 1, id: 'first', text: '\n    А = 1;\n    Сообщить(А);\n  ' },
  { index: 2, text: '\n    Б = 2;\n  ' },
];

describe('buildInlineBlockMaps: обычные блоки', () => {
  it('мапит блок с id и блок без id на строки HTML', () => {
    const maps = buildInlineBlockMaps(TWO_BLOCKS, PAGE_URL, BASE_URI, TWO_BLOCKS_MANIFEST);

    expect(maps).toHaveLength(2);
    expect(maps[0]).toMatchObject({
      sourceId: `${BASE_URI}#first`,
      blockIndex: 1,
      id: 'first',
      htmlContentStartLine: 4,
      lineCount: 4,
      text: TWO_BLOCKS_MANIFEST[0]!.text,
    });
    expect(maps[1]).toMatchObject({
      sourceId: `${BASE_URI}#block2`,
      blockIndex: 2,
      htmlContentStartLine: 8,
      lineCount: 3,
      text: TWO_BLOCKS_MANIFEST[1]!.text,
    });
    expect(maps[1]).not.toHaveProperty('id');
  });

  it('переводит html-строку в локальную и обратно', () => {
    const maps = buildInlineBlockMaps(TWO_BLOCKS, PAGE_URL, BASE_URI, TWO_BLOCKS_MANIFEST);
    const first = maps[0]!;

    expect(htmlLineToBlock(first, 4)).toBe(1);
    expect(htmlLineToBlock(first, 5)).toBe(2);
    expect(htmlLineToBlock(first, 6)).toBe(3);
    expect(htmlLineToBlock(first, 7)).toBe(4);
    expect(blockLineToHtml(first, 1)).toBe(4);
    expect(blockLineToHtml(first, 2)).toBe(5);
    expect(blockLineToHtml(first, 4)).toBe(7);

    // Строка тега `<script>` и строка после конца блока — вне блока.
    expect(htmlLineToBlock(first, 3)).toBeUndefined();
    expect(htmlLineToBlock(first, 8)).toBeUndefined();
    expect(blockLineToHtml(first, 0)).toBeUndefined();
    expect(blockLineToHtml(first, 5)).toBeUndefined();
  });
});

describe('buildInlineBlockMaps: DOM-порядок ≠ raw-scan', () => {
  it('пропускает блоки из template/noscript и с неверным type, валидируя текст', () => {
    const html = [
      '<html><body>', // 1
      '<template>', // 2
      '  <script type="text/osjs">шаблон = 1;</script>', // 3
      '</template>', // 4
      '<noscript>', // 5
      '  <script type="text/osjs">безJS = 1;</script>', // 6
      '</noscript>', // 7
      '<script type="text/osjs ">пробел = 1;</script>', // 8
      '<script type="text/osjs" id="real">', // 9
      '  А = 1;', // 10
      '</script>', // 11
      '</body></html>', // 12
    ].join('\n');
    // Манифест агента — только то, что видит DOM: один блок с id="real".
    const manifest = [{ index: 1, id: 'real', text: '\n  А = 1;\n' }];

    const maps = buildInlineBlockMaps(html, PAGE_URL, BASE_URI, manifest);

    expect(maps).toHaveLength(1);
    expect(maps[0]).toMatchObject({
      sourceId: `${BASE_URI}#real`,
      blockIndex: 1,
      htmlContentStartLine: 9,
      lineCount: 3,
    });
    expect(htmlLineToBlock(maps[0]!, 10)).toBe(2);
  });

  it('не мапит блок, если текст в файле разошёлся с манифестом', () => {
    const manifest = [{ index: 1, id: 'first', text: '\n    А = 2;\n  ' }];

    expect(buildInlineBlockMaps(TWO_BLOCKS, PAGE_URL, BASE_URI, manifest)).toEqual([]);
  });
});

describe('buildInlineBlockMaps: границы строк', () => {
  it('блок, кончающийся в середине строки, живёт на одной строке', () => {
    const html = [
      '<html>', // 1
      '<script type="text/osjs">А = 1; Б = 2;</script>', // 2
      '</html>', // 3
    ].join('\n');
    const manifest = [{ index: 1, text: 'А = 1; Б = 2;' }];

    const maps = buildInlineBlockMaps(html, PAGE_URL, BASE_URI, manifest);

    expect(maps).toHaveLength(1);
    expect(maps[0]).toMatchObject({
      sourceId: `${BASE_URI}#block1`,
      htmlContentStartLine: 2,
      lineCount: 1,
    });
    expect(htmlLineToBlock(maps[0]!, 2)).toBe(1);
    expect(blockLineToHtml(maps[0]!, 1)).toBe(2);
    expect(htmlLineToBlock(maps[0]!, 1)).toBeUndefined();
    expect(htmlLineToBlock(maps[0]!, 3)).toBeUndefined();
  });

  it('CRLF не сдвигает строки блока', () => {
    const html = [
      '<html>',
      '<script type="text/osjs" id="crlf">',
      'А = 1;',
      'Б = 2;',
      '</script>',
      '</html>',
    ].join('\r\n');
    // Браузер отдаёт textContent уже с LF, сырой HTML — с CRLF.
    const text = '\r\nА = 1;\r\nБ = 2;\r\n';
    const manifest = [{ index: 1, id: 'crlf', text: text.replace(/\r\n/g, '\n') }];

    const maps = buildInlineBlockMaps(html, PAGE_URL, BASE_URI, manifest);

    expect(maps).toHaveLength(1);
    expect(maps[0]).toMatchObject({
      sourceId: `${BASE_URI}#crlf`,
      htmlContentStartLine: 2,
      lineCount: 4,
      text,
    });
    expect(htmlLineToBlock(maps[0]!, 3)).toBe(2);
    expect(blockLineToHtml(maps[0]!, 2)).toBe(3);
  });

  it('брейкпоинт на теге `<script>` — пустая первая строка, за блоком — вне диапазона', () => {
    const maps = buildInlineBlockMaps(TWO_BLOCKS, PAGE_URL, BASE_URI, TWO_BLOCKS_MANIFEST);
    const second = maps[1]!;

    // Строка открывающего тега — это остаток строки 1 содержимого (обычно пустой).
    expect(htmlLineToBlock(second, 8)).toBe(1);
    // Строка закрывающего тега — последняя строка содержимого (пробелы перед тегом).
    expect(htmlLineToBlock(second, 10)).toBe(3);
    // До открывающего тега и после закрывающего — вне блока.
    expect(htmlLineToBlock(second, 7)).toBeUndefined();
    expect(htmlLineToBlock(second, 11)).toBeUndefined();
    expect(htmlLineToBlock(second, 12)).toBeUndefined();
  });
});
