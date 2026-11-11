import { afterEach, describe, expect, it, vi } from 'vitest';
import { flush, makeScriptBlock, renderPage, runEngine } from './helpers/browser-script';

describe('браузерный коннектор (<script type="text/osjs">)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('выполняет код из script-блока и выводит в console.log', async () => {
    const logs: unknown[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(...args);
    });

    renderPage([makeScriptBlock('имя = "Никита"; сообщить("Привет, " + имя);')]);
    await runEngine();
    await flush();

    expect(logs).toEqual(['Привет, Никита']);
    spy.mockRestore();
  });
});
