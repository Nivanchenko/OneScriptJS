/**
 * Браузерная точка входа. Исполняет BSL из HTML data blocks
 * `<script type="text/osjs">`: содержимое такого блока — raw text, поэтому
 * `<`, `>` и `&` не требуют HTML-экранирования. Блок с атрибутом `src`
 * скачивает внешний `.osjs` (URL относительно `document.baseURI`) и исполняет
 * его вместо inline-содержимого.
 *
 * Вывод `Сообщить()` идёт через стандартную библиотеку в `console.log`.
 * Дополнительно регистрируется объект `Документ` для работы с DOM.
 * Подключается как <script src="/onescript.js"></script>.
 *
 * Экспортируется `OneScript.highlight(источник)` — HTML с подсветкой BSL тем же
 * лексером, что и движок (используется редактором-песочницей).
 */
import { run } from '../runtime/runner';
import { preloadModuleSources, resolveUrlPath } from './module-source';
import { createBrowserGlobalContext } from './context';
import { registerScriptContext, scheduleDeclarativeBinding } from './dom-events';

export { highlight } from './highlight';

const BLOCK_TYPE = 'text/osjs';
let started = false;

/** Наш блок — `script[type="text/osjs"]`; тип сравнивается без учёта регистра. */
function isOsjsBlock(element: Element): element is HTMLScriptElement {
  return (
    element.tagName === 'SCRIPT' &&
    (element.getAttribute('type') ?? '').toLowerCase() === BLOCK_TYPE
  );
}

/** Статические блоки в порядке документа на момент старта. */
function collectBlocks(doc: Document): HTMLScriptElement[] {
  return Array.from(doc.querySelectorAll('script[type]')).filter(isOsjsBlock);
}

/**
 * Ошибка разбора/лексера приходит с позицией. Если блок оборван на `</script>`,
 * движок видит только обрезанный текст — подсказываем безопасную запись.
 */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /строка \d+,\s*колонка/i.test(message)
    ? `${message} (если блок оборван на </script>, соберите строку конкатенацией)`
    : message;
}

/**
 * Источник блока: inline-текст или внешний `.osjs` по `src` (URL относительно
 * `document.baseURI`). `src` побеждает inline-содержимое; пустой `src` — inline.
 */
async function blockSource(
  block: HTMLScriptElement,
): Promise<{ source: string; url?: string }> {
  const src = block.getAttribute('src');
  if (src === null || src.trim() === '') return { source: block.textContent ?? '' };

  let url: string;
  try {
    url = new URL(src, block.ownerDocument.baseURI).href;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Не удалось загрузить '${src}': ${reason}`);
  }
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { source: await response.text(), url };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Не удалось загрузить '${url}': ${reason}`);
  }
}

/** Свежий контекст на блок; ошибка блока уходит в `console.error`, не прерывая остальные. */
async function executeBlock(block: HTMLScriptElement): Promise<void> {
  const doc = block.ownerDocument;
  try {
    const { source, url } = await blockSource(block);
    const ctx = createBrowserGlobalContext();
    // Контекст нужен декларативным обработчикам (`data-os-*`) в этом блоке.
    registerScriptContext(block.id || null, ctx);
    const entryUrl = url ?? doc.baseURI;
    const modules = await preloadModuleSources(source, entryUrl);
    await run(source, ctx, {
      basePath: entryUrl,
      ...(url === undefined ? {} : { path: url }),
      modules,
      resolve: resolveUrlPath,
    });
    scheduleDeclarativeBinding();
  } catch (error) {
    console.error(describeError(error));
  }
}

/** Последовательный `await` сохраняет порядок документа даже при асинхронной предзагрузке. */
async function runAll(doc: Document): Promise<void> {
  for (const block of collectBlocks(doc)) {
    await executeBlock(block);
  }
}

/** Один запуск на документ: сразу, если DOM уже готов, иначе — на `DOMContentLoaded`. */
function start(): void {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc || started) return;
  started = true;
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', () => void runAll(doc), { once: true });
  } else {
    void runAll(doc);
  }
}

start();
