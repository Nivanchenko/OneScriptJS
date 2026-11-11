/**
 * Браузерная точка входа. Исполняет BSL из HTML data blocks
 * `<script type="text/osjs">`: содержимое такого блока — raw text, поэтому
 * `<`, `>` и `&` не требуют HTML-экранирования.
 *
 * Вывод `Сообщить()` идёт через стандартную библиотеку в `console.log`.
 * Дополнительно регистрируется объект `Документ` для работы с DOM.
 * Подключается как <script src="/onescript.js"></script>.
 */
import { run } from '../runtime/runner';
import { preloadModuleSources, resolveUrlPath } from './module-source';
import { createBrowserGlobalContext } from './context';
import { registerScriptContext, scheduleDeclarativeBinding } from './dom-events';

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

/** Свежий контекст на блок; ошибка блока уходит в `console.error`, не прерывая остальные. */
async function executeBlock(block: HTMLScriptElement): Promise<void> {
  const doc = block.ownerDocument;
  const source = block.textContent ?? '';
  try {
    const ctx = createBrowserGlobalContext();
    // Контекст нужен декларативным обработчикам (`data-os-*`) в этом блоке.
    registerScriptContext(block.id || null, ctx);
    const modules = await preloadModuleSources(source, doc.baseURI);
    await run(source, ctx, { basePath: doc.baseURI, modules, resolve: resolveUrlPath });
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
