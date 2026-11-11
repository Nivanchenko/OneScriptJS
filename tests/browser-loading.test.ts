import { afterEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { makeScriptBlock, runEngine, flush } from './helpers/browser-script';

/**
 * Регрессия: при разборе документа `document.readyState === 'loading'`.
 * Движок должен дождаться `DOMContentLoaded` и только потом собрать блоки,
 * иначе исполняется пустой/недопарсенный код.
 */
describe('<script type="text/osjs">: запуск после разбора документа', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('при readyState=loading ждёт DOMContentLoaded и затем исполняет код один раз', async () => {
    vi.resetModules();
    const window = new Window({ url: 'http://localhost/app/' });
    vi.stubGlobal('window', window);
    vi.stubGlobal('document', window.document);
    vi.stubGlobal('URL', window.URL);

    // Эмулируем разбор: документ ещё загружается.
    let readyState = 'loading';
    Object.defineProperty(window.document, 'readyState', { get: () => readyState, configurable: true });

    const logs: unknown[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(...args);
    });

    // Блоки уже в DOM, но движок не должен исполнять их до готовности документа.
    window.document.body.innerHTML = makeScriptBlock('сообщить("готово");');
    await runEngine();
    await flush();

    expect(logs).toEqual([]); // ещё ничего не исполнилось
    // Наш CSS больше не нужен: script-блок нативно скрыт.
    expect(window.document.querySelectorAll('style')).toHaveLength(0);

    readyState = 'interactive';
    (window.document as unknown as EventTarget).dispatchEvent(
      new window.Event('DOMContentLoaded') as unknown as Event,
    );
    await flush();

    expect(logs).toEqual(['готово']);

    // Повторное событие не запускает блоки второй раз.
    (window.document as unknown as EventTarget).dispatchEvent(
      new window.Event('DOMContentLoaded') as unknown as Event,
    );
    await flush();

    expect(logs).toEqual(['готово']);
    spy.mockRestore();
  });
});
