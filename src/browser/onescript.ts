/**
 * Браузерная точка входа. Регистрирует кастомный элемент <one-script>,
 * который выполняет BSL-код из своего содержимого.
 *
 * Вывод `Сообщить()` идёт через стандартную библиотеку в `console.log`.
 * Подключается как <script src="/onescript.js"></script>.
 */
import { run } from '../runtime/runner';
import { createGlobalContext } from '../stdlib/global-context';

const ONE_SCRIPT_TAG = 'one-script';

class OneScriptElement extends HTMLElement {
  connectedCallback(): void {
    // Отложить до конца разбора: на момент connectedCallback содержимое элемента
    // может быть ещё не распарсено (элемент подключается до своих дочерних узлов).
    queueMicrotask(() => run(this.textContent ?? '', createGlobalContext()));
  }
}

if (!customElements.get(ONE_SCRIPT_TAG)) {
  customElements.define(ONE_SCRIPT_TAG, OneScriptElement);
}
