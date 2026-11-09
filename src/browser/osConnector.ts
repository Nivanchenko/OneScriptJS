/**
 * Браузерная точка входа. Регистрирует кастомный элемент <one-script>,
 * который выполняет BSL-код из своего содержимого.
 *
 * Вывод `Сообщить()` идёт через стандартную библиотеку в `console.log`.
 * Подключается как <script src="/osConnector.js"></script>.
 * Полноценный запуск движка появится в задачах разработки.
 */
import { version } from '../index';

const ONE_SCRIPT_TAG = 'one-script';

class OneScriptElement extends HTMLElement {
  connectedCallback(): void {
    const code = this.textContent ?? '';
    // Плейсхолдер: реальный запуск движка появится в задачах разработки.
    console.log(
      `OneScriptJS v${version()}: движок ещё не реализован (код: ${code.length} симв.)`,
    );
  }
}

if (!customElements.get(ONE_SCRIPT_TAG)) {
  customElements.define(ONE_SCRIPT_TAG, OneScriptElement);
}
