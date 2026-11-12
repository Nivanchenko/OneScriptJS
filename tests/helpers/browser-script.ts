import { vi } from 'vitest';
import { Window } from 'happy-dom';

/** База страницы: от неё `<script type="text/osjs">` резолвит `#Использовать`. */
const PAGE_URL = 'http://localhost/app/';

/** HTML-разметка статического BSL-блока; содержимое — raw text, не экранируется. */
export function makeScriptBlock(source: string, id?: string): string {
  const idAttribute = id === undefined ? '' : ` id="${id}"`;
  return `<script type="text/osjs"${idAttribute}>${source}</script>`;
}

/**
 * Поднимает happy-dom-страницу и кладёт блоки в body **до** импорта движка:
 * на happy-dom `readyState` уже не `loading`, поэтому движок исполняет сразу.
 * `html` — дополнительная разметка страницы (кнопки/поля) перед блоками.
 */
export function renderPage(blocks: readonly string[], html = ''): Window {
  const window = new Window({ url: PAGE_URL });
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('URL', window.URL);
  window.document.body.innerHTML = [html, ...blocks].join('\n');
  return window;
}

/** Свежий импорт точки входа: модуль-синглтон исполняет блоки один раз. */
export async function runEngine(): Promise<void> {
  vi.resetModules();
  await import('../../src/browser/onescript');
}

/** Даёт движку завершить микротаски/таймеры (в т.ч. асинхронную предзагрузку модулей). */
export async function flush(ms = 0): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
