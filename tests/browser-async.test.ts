import { afterEach, describe, expect, it, vi } from 'vitest';
import { flush, makeScriptBlock, renderPage, runEngine } from './helpers/browser-script';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('браузер: Асинх/Ждать в script-блоке', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function mount(source: string): Promise<{
    logs: string[];
    errors: string[];
    restore(): void;
  }> {
    const logs: string[] = [];
    const errors: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => String(a)).join(' '));
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map((a) => String(a)).join(' '));
    });
    // Каждый тест поднимает свою страницу: модуль исполняется заново и видит её блоки.
    renderPage([makeScriptBlock(source)]);
    await runEngine();
    await flush();
    return {
      logs,
      errors,
      restore: () => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
      },
    };
  }

  it('async-функция печатает результат, страница не замирает', async () => {
    const page = await mount(`
      Асинх Функция Считать(Знач А, Знач Б) Экспорт
        Приостановить(60);
        Возврат А + Б;
      КонецФункции

      Сообщить("до");
      Сообщить(Ждать Считать(20, 22));
    `);
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 5);
    try {
      for (let i = 0; i < 80 && page.logs.length < 2; i++) await wait(10);
      expect(page.logs).toEqual(['до', '42']);
      expect(ticks).toBeGreaterThanOrEqual(3);
    } finally {
      clearInterval(timer);
      page.restore();
    }
  });

  it('необработанная ошибка async-процедуры не ломает страницу', async () => {
    const page = await mount(`
      Асинх Процедура Плохая() Экспорт
        Приостановить(10);
        ВызватьИсключение "сбой в фоне";
      КонецПроцедуры

      Плохая();
      Сообщить("страница жива");
    `);
    try {
      for (let i = 0; i < 80 && page.logs.length === 0; i++) await wait(10);
      await wait(30);
      expect(page.logs).toEqual(['страница жива']);
      expect(page.errors).toHaveLength(1);
      expect(page.errors[0]).toContain('сбой в фоне');
    } finally {
      page.restore();
    }
  });
});
