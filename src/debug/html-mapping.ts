import { findBlocks } from '../lsp/html-blocks';
import type { HtmlBlock } from '../lsp/html-blocks';

/**
 * Маппинг строк HTML-файла ↔ строк inline-блока `<script type="text/osjs">`.
 *
 * Файл браузерный: из `html-blocks` импортируется только тип (`HtmlBlock`), сам
 * `findBlocks` не тянет `node:*`/DOM. Источник истины — сырой HTML: манифест
 * page-agent приходит в DOM-порядке, а `findBlocks` сканирует сырой текст, поэтому
 * блоки сопоставляются по тексту, а не по позиции.
 */

/** Блок манифеста страницы: 1-based index в DOM-порядке, как в `sourceId` движка. */
export interface InlineBlockManifestEntry {
  index: number;
  id?: string;
  text: string;
}

/** Inline-блок, привязанный к строкам HTML-файла. */
export interface InlineBlockMap {
  /** `sourceId` движка: `${baseURI}#${id || blockN}`. */
  sourceId: string;
  /** 1-based index блока в DOM-порядке. */
  blockIndex: number;
  id?: string;
  /** 1-based строка HTML, на которой начинается содержимое (остаток строки тега). */
  htmlContentStartLine: number;
  /** Число строк содержимого блока (первая строка — остаток строки тега). */
  lineCount: number;
  text: string;
}

/**
 * Строит маппинг блоков манифеста на сырые блоки HTML.
 *
 * `manifest` — блоки в DOM-порядке (1-based `index`). Сырой скан `findBlocks`
 * видит больше: `<template>`, `<noscript>`, `<script type="text/osjs ">` с
 * пробелом — для браузера это не блоки. Поэтому идём по сырым блокам курсором и
 * берём первый, чей текст совпал с манифестом; несовпавший блок не мапится
 * (например, файл отредактировали после загрузки страницы).
 */
export function buildInlineBlockMaps(
  html: string,
  pageUrl: string,
  baseURI: string,
  manifest: readonly InlineBlockManifestEntry[],
): InlineBlockMap[] {
  // `<base href>` может отсутствовать/быть пустым — тогда база страницы.
  const base = baseURI !== '' ? baseURI : pageUrl;
  const blocks = findBlocks(html);
  const maps: InlineBlockMap[] = [];
  let cursor = 0;

  for (const entry of manifest) {
    let matched: HtmlBlock | undefined;
    for (let i = cursor; i < blocks.length; i += 1) {
      const block = blocks[i]!;
      if (sameBlockText(html.slice(block.contentStartOffset, block.contentEndOffset), entry.text)) {
        matched = block;
        cursor = i + 1;
        break;
      }
    }
    if (matched === undefined) continue;

    const text = html.slice(matched.contentStartOffset, matched.contentEndOffset);
    // Как в движке (`block.id || blockN`): пустой id не становится именем блока.
    const id = entry.id !== undefined && entry.id !== '' ? entry.id : undefined;
    maps.push({
      sourceId: `${base}#${id ?? `block${entry.index}`}`,
      blockIndex: entry.index,
      ...(id === undefined ? {} : { id }),
      htmlContentStartLine: matched.start.line + 1,
      lineCount: text.split('\n').length,
      text,
    });
  }

  return maps;
}

/**
 * HTML-строка → локальная строка блока (1-based); `undefined` — вне диапазона.
 * Строка 1 — остаток строки тега `<script>` (обычно пустой), как её видит движок.
 */
export function htmlLineToBlock(map: InlineBlockMap, htmlLine: number): number | undefined {
  const blockLocalLine = htmlLine - map.htmlContentStartLine + 1;
  return blockLocalLine >= 1 && blockLocalLine <= map.lineCount ? blockLocalLine : undefined;
}

/** Локальная строка блока → HTML-строка; `undefined` — вне диапазона. */
export function blockLineToHtml(map: InlineBlockMap, blockLocalLine: number): number | undefined {
  if (blockLocalLine < 1 || blockLocalLine > map.lineCount) return undefined;
  return map.htmlContentStartLine + blockLocalLine - 1;
}

/**
 * Браузер нормализует CRLF в `textContent` блока, а сырой HTML — нет; сравниваем
 * без различий переводов строк, чтобы страница на Windows не теряла маппинг.
 */
function sameBlockText(raw: string, manifestText: string): boolean {
  if (raw === manifestText) return true;
  return normalizeNewlines(raw) === normalizeNewlines(manifestText);
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}
