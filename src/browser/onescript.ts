/**
 * Браузерная точка входа. Регистрирует кастомный элемент <one-script>,
 * который выполняет BSL-код из своего содержимого.
 *
 * Вывод `Сообщить()` идёт через стандартную библиотеку в `console.log`.
 * Дополнительно регистрируется объект `Документ` для работы с DOM.
 * Подключается как <script src="/onescript.js"></script>.
 */
import { run } from '../runtime/runner';
import { createBrowserGlobalContext } from './context';
import { registerScriptContext, scheduleDeclarativeBinding } from './dom-events';

const ONE_SCRIPT_TAG = 'one-script';

/** Исходник `<one-script>` не должен отображаться на странице. */
function injectHiddenStyle(): void {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc || doc.getElementById('one-script-style')) return;
  const style = doc.createElement('style');
  style.id = 'one-script-style';
  style.textContent = 'one-script { display: none; }';
  (doc.head ?? doc.documentElement).appendChild(style);
}

class OneScriptElement extends HTMLElement {
  private executed = false;

  connectedCallback(): void {
    // При разборе страницы connectedCallback срабатывает, когда элемент ещё пуст:
    // текст-исходник появляется в DOM только после открывающего тега. Поэтому при
    // `readyState === 'loading'` дожидаемся конца разбора, иначе — микротаски.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.execute(), { once: true });
      return;
    }
    queueMicrotask(() => this.execute());
  }

  private execute(): void {
    if (this.executed || !this.isConnected) return;
    this.executed = true;
    const ctx = createBrowserGlobalContext();
    // Контекст нужен декларативным обработчикам (`data-os-*`) в этом <one-script>.
    registerScriptContext(this.id || null, ctx);
    run(this.textContent ?? '', ctx);
    scheduleDeclarativeBinding();
  }
}

injectHiddenStyle();

if (!customElements.get(ONE_SCRIPT_TAG)) {
  customElements.define(ONE_SCRIPT_TAG, OneScriptElement);
}
