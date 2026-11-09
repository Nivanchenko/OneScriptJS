/**
 * Браузерная точка входа. Регистрирует кастомный элемент <one-script>,
 * который выполняет BSL-код из своего содержимого и пишет вывод
 * функции сообщить() в элемент #output.
 *
 * Подключается как <script src="/osConnector.js"></script>.
 * Полноценный запуск движка появится в задачах разработки.
 */
import { version } from '../index';

const ONE_SCRIPT_TAG = 'one-script';

class OneScriptElement extends HTMLElement {
  connectedCallback(): void {
    const code = this.textContent ?? '';
    const note = `OneScriptJS v${version()}: движок ещё не реализован (код: ${code.length} симв.)`;
    const output = document.getElementById('output');

    if (output) {
      const line = document.createElement('div');
      line.textContent = note;
      output.appendChild(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(note);
    }
  }
}

if (!customElements.get(ONE_SCRIPT_TAG)) {
  customElements.define(ONE_SCRIPT_TAG, OneScriptElement);
}
