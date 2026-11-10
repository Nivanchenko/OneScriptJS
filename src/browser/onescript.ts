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

class OneScriptElement extends HTMLElement {
  connectedCallback(): void {
    // Отложить до конца разбора: на момент connectedCallback содержимое элемента
    // может быть ещё не распарсено (элемент подключается до своих дочерних узлов).
    queueMicrotask(() => {
      const ctx = createBrowserGlobalContext();
      // Контекст нужен декларативным обработчикам (`data-os-*`) в этом <one-script>.
      registerScriptContext(this.id || null, ctx);
      run(this.textContent ?? '', ctx);
      scheduleDeclarativeBinding();
    });
  }
}

if (!customElements.get(ONE_SCRIPT_TAG)) {
  customElements.define(ONE_SCRIPT_TAG, OneScriptElement);
}
