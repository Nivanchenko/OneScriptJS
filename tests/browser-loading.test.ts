import { afterEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';

/**
 * Регрессия: в реальном браузере `connectedCallback` срабатывает, когда текст
 * `<one-script>` ещё не разобран, а `document.readyState === 'loading'`.
 * Тогда исполнение нужно отложить до `DOMContentLoaded`, иначе запускается пустой код.
 */
describe('<one-script>: запуск после разбора документа', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('при readyState=loading ждёт DOMContentLoaded и затем исполняет код', async () => {
    const window = new Window();
    vi.stubGlobal('window', window);
    vi.stubGlobal('document', window.document);
    vi.stubGlobal('customElements', window.customElements);
    vi.stubGlobal('HTMLElement', window.HTMLElement);

    // Эмулируем разбор: документ ещё загружается.
    let readyState = 'loading';
    Object.defineProperty(window.document, 'readyState', { get: () => readyState, configurable: true });

    const logs: unknown[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(...args);
    });

    await import('../src/browser/onescript');

    // Исходник не должен отображаться на странице.
    const style = window.document.getElementById('one-script-style');
    expect(style?.textContent).toBe('one-script { display: none; }');

    const el = window.document.createElement('one-script');
    window.document.body.appendChild(el);
    // Текст появляется в DOM уже после подключения элемента (как при разборе HTML).
    el.textContent = 'сообщить("готово");';

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(logs).toEqual([]); // ещё ничего не исполнилось

    readyState = 'interactive';
    (window.document as unknown as EventTarget).dispatchEvent(
      new window.Event('DOMContentLoaded') as unknown as Event,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(logs).toEqual(['готово']);
    spy.mockRestore();
  });
});
