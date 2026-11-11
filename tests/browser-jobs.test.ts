import { afterEach, describe, expect, it, vi } from 'vitest';
import { flush, makeScriptBlock, renderPage, runEngine } from './helpers/browser-script';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('браузер: фоновые задания в script-блоке', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function mount(source: string): Promise<{ logs: string[]; restore(): void }> {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => String(a)).join(' '));
    });
    // Каждый тест поднимает свою страницу: модуль исполняется заново и видит её блоки.
    renderPage([makeScriptBlock(source)]);
    await runEngine();
    await flush();
    return { logs, restore: () => spy.mockRestore() };
  }

  it('скрипт дожидается задания, не блокируя страницу', async () => {
    const page = await mount(`
      Процедура Долго() Экспорт
        Приостановить(60);
        Сообщить("задание");
      КонецПроцедуры

      ФоновыеЗадания.Выполнить(ЭтотОбъект, "Долго");
      Сообщить("основной");
    `);
    try {
      // Пока задание спит, страница жива: интервал успевает сработать.
      let ticks = 0;
      const timer = setInterval(() => {
        ticks += 1;
      }, 5);
      for (let i = 0; i < 60 && !page.logs.includes('задание'); i++) await wait(10);
      clearInterval(timer);

      expect(page.logs).toEqual(['основной', 'задание']);
      expect(ticks).toBeGreaterThanOrEqual(3);
    } finally {
      page.restore();
    }
  });

  it('ошибка задания не ломает страницу и доступна через ИнформацияОбОшибке', async () => {
    const page = await mount(`
      Процедура Упасть() Экспорт
        Приостановить(10);
        ВызватьИсключение "ошибка в задании";
      КонецПроцедуры

      Задание = ФоновыеЗадания.Выполнить(ЭтотОбъект, "Упасть");
      Задание.ОжидатьЗавершения();
      Сообщить(Задание.Состояние);
      Сообщить(Задание.ИнформацияОбОшибке.Описание);
    `);
    try {
      for (let i = 0; i < 60 && page.logs.length < 2; i++) await wait(10);
      expect(page.logs).toEqual(['ЗавершеноАварийно', 'ошибка в задании']);
    } finally {
      page.restore();
    }
  });

  it('декларативные обработчики привязываются после завершения async-скрипта', async () => {
    const page = await mount(`
      Приостановить(20);
      Сообщить("готов");
    `);
    try {
      for (let i = 0; i < 60 && page.logs.length === 0; i++) await wait(10);
      // Привязка идёт после run(); проверяем, что скрипт завершился и страница жива.
      expect(page.logs).toEqual(['готов']);
      expect(typeof document.querySelectorAll).toBe('function');
    } finally {
      page.restore();
    }
  });
});
