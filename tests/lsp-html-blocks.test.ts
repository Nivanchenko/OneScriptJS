import { describe, expect, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { findBlocks } from '../src/lsp/html-blocks';

/** Позиция для проверки: независимо от реализации блока, через TextDocument. */
function docOf(html: string): TextDocument {
  return TextDocument.create('file:///page.html', 'html', 0, html);
}

function content(html: string, index = 0): string {
  const block = findBlocks(html)[index];
  if (block === undefined) return '<нет блока>';
  return html.slice(block.contentStartOffset, block.contentEndOffset);
}

describe('сканер блоков <script type="text/osjs">', () => {
  it('HTML без блоков: пустой список', () => {
    expect(findBlocks('<!doctype html><html><body><p>привет</p></body></html>')).toEqual([]);
    expect(findBlocks('')).toEqual([]);
  });

  it('находит блок и отделяет содержимое от тегов', () => {
    const html = '<!doctype html><script type="text/osjs">Сообщить("ок");</script>';
    const blocks = findBlocks(html);
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    if (block === undefined) throw new Error('блок не найден');
    expect(html.slice(block.contentStartOffset, block.contentEndOffset)).toBe('Сообщить("ок");');
    expect(block.type).toBe('text/osjs');
    expect(block.startOffset).toBe(html.indexOf('<script'));
    expect(block.id).toBeUndefined();

    const doc = docOf(html);
    expect(block.start).toEqual(doc.positionAt(block.contentStartOffset));
    expect(block.end).toEqual(doc.positionAt(block.contentEndOffset));
    expect(block.start.character).toBe(html.indexOf('Сообщить'));
  });

  it('несколько блоков — в порядке документа', () => {
    const html = [
      '<div>',
      '<script type="text/osjs">Первый();</script>',
      '<p>между</p>',
      '<script type="text/osjs" id="app">Второй();</script>',
      '</div>',
    ].join('\n');
    const blocks = findBlocks(html);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => html.slice(block.contentStartOffset, block.contentEndOffset))).toEqual([
      'Первый();',
      'Второй();',
    ]);
    expect(blocks[0]?.id).toBeUndefined();
    expect(blocks[1]?.id).toBe('app');
    expect(blocks[0]?.startOffset).toBeLessThan(blocks[1]?.startOffset ?? 0);
  });

  it('type сравнивается без учёта регистра (и тег тоже)', () => {
    const html = [
      '<SCRIPT TYPE="text/OSJS">А();</SCRIPT>',
      '<script type="TEXT/osjs">Б();</script>',
    ].join('\n');
    const blocks = findBlocks(html);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.type)).toEqual(['text/OSJS', 'TEXT/osjs']);
    expect(blocks.map((block) => html.slice(block.contentStartOffset, block.contentEndOffset))).toEqual([
      'А();',
      'Б();',
    ]);
  });

  it('атрибуты: кавычки, без кавычек, любые дополнительные атрибуты', () => {
    const html = [
      '<script type=text/osjs>А();</script>',
      "<script id='one' data-x='y' type='text/osjs'>Б();</script>",
      '<script data-x="a>b" type="text/osjs" defer>В();</script>',
    ].join('\n');
    const blocks = findBlocks(html);
    expect(blocks.map((block) => html.slice(block.contentStartOffset, block.contentEndOffset))).toEqual([
      'А();',
      'Б();',
      'В();',
    ]);
    expect(blocks[1]?.id).toBe('one');
    expect(blocks[2]?.id).toBeUndefined();
  });

  it('другие type не считаются нашими блоками', () => {
    const html = [
      '<script type="text/javascript">var a = 1;</script>',
      '<script type="module">export {};</script>',
      '<script>обычный();</script>',
      '<script type="text/osjsx">не наш();</script>',
      '<script type="text/osjs">наш();</script>',
    ].join('\n');
    const blocks = findBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(content(html)).toBe('наш();');
  });

  it('HTML-комментарии игнорируются', () => {
    const html = [
      '<!-- <script type="text/osjs">Скрытый();</script> -->',
      '<script type="text/osjs">Видимый();</script>',
      '<!-- многострочный',
      '<script type="text/osjs">ТожеСкрытый();</script>',
      '-->',
    ].join('\n');
    const blocks = findBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(content(html)).toBe('Видимый();');
  });

  it('незакрытый блок — содержимое до EOF', () => {
    const html = '<script type="text/osjs">\nА = 1;\nБ = 2;\n';
    const blocks = findBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(content(html)).toBe('\nА = 1;\nБ = 2;\n');
    expect(blocks[0]?.end).toEqual(docOf(html).positionAt(html.length));
  });

  it('незакрытый блок обрывает поиск: следующие теги — уже содержимое', () => {
    const html = '<script type="text/osjs">А();<script type="text/osjs">Б();</script>';
    const blocks = findBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(content(html)).toBe('А();<script type="text/osjs">Б();');
  });

  it('пустой блок', () => {
    const html = '<script type="text/osjs"></script>';
    const blocks = findBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.contentStartOffset).toBe(blocks[0]?.contentEndOffset);
    expect(content(html)).toBe('');
  });

  it('инлайн-блок: границы в одной строке с разметкой', () => {
    const html = '<p>до</p><script type="text/osjs">Сообщить("ок");</script><p>после</p>';
    const blocks = findBlocks(html);
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    if (block === undefined) throw new Error('блок не найден');
    expect(block.start.line).toBe(0);
    expect(block.end.line).toBe(0);
    expect(block.start.character).toBe(html.indexOf('Сообщить'));
    expect(content(html)).toBe('Сообщить("ок");');
  });

  it('последовательность </script> внутри содержимого обрывает блок', () => {
    const html = '<script type="text/osjs">Текст = "до </script> после";</script>';
    const blocks = findBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(content(html)).toBe('Текст = "до ');
  });

  it('находит блоки при CRLF и не сбивает позиции', () => {
    const html = '<div>\r\n<script type="text/osjs">\r\nА = 1;\r\n</script>\r\n</div>';
    const blocks = findBlocks(html);
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    if (block === undefined) throw new Error('блок не найден');
    expect(content(html)).toBe('\r\nА = 1;\r\n');
    expect(block.start.line).toBe(1);
    expect(block.start.character).toBe('<script type="text/osjs">'.length);
    expect(block.end.line).toBe(3);
    expect(block.end.character).toBe(0);
  });

  it('находит блоки после BOM и эмодзи', () => {
    const html = '\uFEFF<p>😀</p><script type="text/osjs">А = "😀";</script>';
    const blocks = findBlocks(html);
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    if (block === undefined) throw new Error('блок не найден');
    expect(content(html)).toBe('А = "😀";');
    expect(block.start.line).toBe(0);
    // BOM и эмодзи считаются в UTF-16 code units.
    expect(block.start.character).toBe(html.indexOf('А'));
  });

  it('не создаёт блок из <script> внутри содержимого нашего блока', () => {
    const html = [
      '<script type="text/osjs">',
      'Текст = "<script type="text/osjs">";',
      '</script>',
      '<script type="text/osjs">Второй();</script>',
    ].join('\n');
    const blocks = findBlocks(html);
    expect(blocks).toHaveLength(2);
    expect(blocks[1] !== undefined && html.slice(blocks[1].contentStartOffset, blocks[1].contentEndOffset)).toBe(
      'Второй();',
    );
  });
});
