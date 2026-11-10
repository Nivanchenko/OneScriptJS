import { afterEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';

describe('браузерный коннектор (<one-script>)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('выполняет код из <one-script> и выводит в console.log', async () => {
    const window = new Window();
    vi.stubGlobal('window', window);
    vi.stubGlobal('document', window.document);
    vi.stubGlobal('customElements', window.customElements);
    vi.stubGlobal('HTMLElement', window.HTMLElement);

    const logs: unknown[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(...args);
    });

    // регистрирует <one-script> (сторонний эффект импорта)
    await import('../src/browser/onescript');

    const el = document.createElement('one-script');
    el.textContent = 'имя = "Никита"; сообщить("Привет, " + имя);';
    document.body.appendChild(el);

    // дать микротаске (queueMicrotask) выполниться
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(logs).toEqual(['Привет, Никита']);

    spy.mockRestore();
  });
});
