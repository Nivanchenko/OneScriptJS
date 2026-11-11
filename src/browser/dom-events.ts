import type { GlobalContext } from '../runtime/context';
import { BslDomEvent, domEventType } from './dom';

/**
 * Декларативная привязка событий: `<button data-os-click="…">`.
 *
 * Контекст исполнения — область видимости `<one-script>`:
 * - `data-os-script="<id>"` на элементе ссылается на `<one-script id="…">`;
 * - без атрибута используется первый зарегистрированный `<one-script>`.
 *
 * Контекст ищется **в момент события**, поэтому порядок загрузки скриптов
 * и элементов не важен.
 */

const DEFAULT_SCRIPT = '__default__';
const scriptContexts = new Map<string, GlobalContext>();
const boundElements = new WeakSet<Element>();
let warnedNoScript = false;

/** Регистрирует контекст `<one-script>` для декларативных обработчиков. */
export function registerScriptContext(id: string | null, ctx: GlobalContext): void {
  if (id) {
    scriptContexts.set(id, ctx);
  } else if (!scriptContexts.has(DEFAULT_SCRIPT)) {
    scriptContexts.set(DEFAULT_SCRIPT, ctx);
  }
}

/** Сбрасывает состояние (для тестов и повторной инициализации). */
export function resetDeclarativeHandlers(): void {
  scriptContexts.clear();
  warnedNoScript = false;
}

/** Имя `data-os-<событие>` → тип DOM-события. */
const ATTRIBUTE_PREFIX = 'data-os-';

function resolveContext(element: Element): GlobalContext | undefined {
  const scriptId = element.getAttribute('data-os-script');
  if (scriptId) return scriptContexts.get(scriptId);
  return scriptContexts.get(DEFAULT_SCRIPT);
}

function makeHandler(element: Element, code: string): (event: Event) => void {
  return (event: Event) => {
    const ctx = resolveContext(element);
    const interpreter = ctx?.currentInterpreter;
    if (!ctx || !interpreter) {
      if (!warnedNoScript) {
        warnedNoScript = true;
        console.warn('Не найден <one-script> для декларативных обработчиков data-os-*');
      }
      return;
    }
    try {
      const result = interpreter.executeInModule(code, { 'Событие': new BslDomEvent(event, ctx) });
      // DOM-событие нельзя дождаться: ошибки async-части логируем, страницу не роняем.
      void Promise.resolve(result).catch((e: unknown) => {
        console.error(`Ошибка в обработчике '${ATTRIBUTE_PREFIX}${event.type}':`, e instanceof Error ? e.message : e);
      });
    } catch (e) {
      console.error(`Ошибка в обработчике '${ATTRIBUTE_PREFIX}${event.type}':`, e instanceof Error ? e.message : e);
    }
  };
}

/**
 * Привязывает обработчики `data-os-*` в поддереве `root`.
 * Повторный вызов не дублирует уже привязанные обработчики.
 */
export function bindDeclarativeHandlers(root?: ParentNode): void {
  const doc = (globalThis as { document?: Document }).document;
  const scope = root ?? doc;
  if (!scope) return;
  const elements = scope.querySelectorAll('*');
  for (const element of Array.from(elements)) {
    if (boundElements.has(element)) continue;
    let hasHandlers = false;
    for (const attribute of Array.from(element.attributes)) {
      if (!attribute.name.startsWith(ATTRIBUTE_PREFIX)) continue;
      const eventName = attribute.name.slice(ATTRIBUTE_PREFIX.length);
      if (eventName === 'script') continue;
      element.addEventListener(domEventType(eventName), makeHandler(element, attribute.value));
      hasHandlers = true;
    }
    if (!hasHandlers) continue;
    boundElements.add(element);
  }
}

/**
 * Планирует привязку после текущей задачи (скрипты `<one-script>` выполняются
 * в `queueMicrotask`, поэтому привязка должна идти после них).
 */
let scheduled = false;
export function scheduleDeclarativeBinding(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    bindDeclarativeHandlers();
  });
}
