import type { Position } from 'vscode-languageserver';

/** Language id HTML-документа: чужой формат, внутри которого живут наши блоки. */
export const HTML_LANGUAGE_ID = 'html';

/**
 * Блок `<script type="text/osjs">` в HTML-документе.
 *
 * `startOffset` — начало тега `<script`; содержимое блока (без тегов) —
 * `[contentStartOffset, contentEndOffset)` и диапазон `start`/`end`.
 */
export interface HtmlBlock {
  startOffset: number;
  contentStartOffset: number;
  contentEndOffset: number;
  start: Position;
  end: Position;
  id?: string;
  type: string;
}

const SCRIPT_TYPE = 'text/osjs';

/** Закрывающий тег `</script` с учётом регистра; `(?=[\s>/])` — валидный конец имени. */
const CLOSE_TAG = /<\/script(?=[\s>/])/gi;
const OPEN_TAG = /<script(?=[\s>/])/gi;
const COMMENT_OPEN = '<!--';

function findFrom(regex: RegExp, html: string, from: number): number {
  regex.lastIndex = from;
  const match = regex.exec(html);
  return match === null ? -1 : match.index;
}

/** Конец открывающего тега (`>`) с учётом кавычек в значениях атрибутов. */
function findTagEnd(html: string, from: number): number {
  let quote: string | undefined;
  for (let i = from; i < html.length; i += 1) {
    const ch = html[i];
    if (quote !== undefined) {
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '>') return i;
  }
  return -1;
}

/** Значение атрибута из текста после `<script`: двойные/одинарные кавычки или без них. */
function attribute(attributes: string, name: string): string | undefined {
  const pattern = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\x60]+))`,
    'i',
  );
  const match = pattern.exec(attributes);
  if (match === null) return undefined;
  return match[1] ?? match[2] ?? match[3];
}

/** Позиция LSP (0-based, UTF-16 code units) по смещению в тексте. */
function positionAt(lineStarts: readonly number[], offset: number): Position {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if ((lineStarts[mid] ?? 0) <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low, character: offset - (lineStarts[low] ?? 0) };
}

function lineStartsOf(html: string): number[] {
  const starts = [0];
  for (let i = 0; i < html.length; i += 1) {
    if (html[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

/**
 * Находит все блоки `<script type="text/osjs">` (type и имя тега — без учёта
 * регистра) в сыром HTML; HTML-комментарии не считаются разметкой.
 * Незакрытый блок продолжается до конца документа. Сканирование O(n).
 */
export function findBlocks(html: string): HtmlBlock[] {
  const lineStarts = lineStartsOf(html);
  const blocks: HtmlBlock[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    const comment = html.indexOf(COMMENT_OPEN, cursor);
    const open = findFrom(OPEN_TAG, html, cursor);
    if (open < 0) break;
    if (comment >= 0 && comment < open) {
      const end = html.indexOf('-->', comment + COMMENT_OPEN.length);
      cursor = end < 0 ? html.length : end + '-->'.length;
      continue;
    }

    const tagEnd = findTagEnd(html, open + '<script'.length);
    if (tagEnd < 0) break; // незакрытый тег: дальше нет разметки, которую мы понимаем

    const attributes = html.slice(open + '<script'.length, tagEnd);
    const type = attribute(attributes, 'type');
    const id = attribute(attributes, 'id');
    const contentStartOffset = tagEnd + 1;
    const close = findFrom(CLOSE_TAG, html, contentStartOffset);
    const contentEndOffset = close < 0 ? html.length : close;

    if ((type ?? '').trim().toLowerCase() === SCRIPT_TYPE) {
      blocks.push({
        startOffset: open,
        contentStartOffset,
        contentEndOffset,
        start: positionAt(lineStarts, contentStartOffset),
        end: positionAt(lineStarts, contentEndOffset),
        ...(id === undefined ? {} : { id }),
        type: type ?? '',
      });
    }

    if (close < 0) break;
    const closeEnd = html.indexOf('>', close + '</script'.length);
    cursor = closeEnd < 0 ? html.length : closeEnd + 1;
  }

  return blocks;
}
