import type { Window } from 'happy-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flush, makeScriptBlock, renderPage, runEngine } from './helpers/browser-script';

const PAGE_URL = 'http://localhost/app/';

function captureLogs(): unknown[] {
  const logs: unknown[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => logs.push(...args));
  return logs;
}

function captureErrors(): unknown[] {
  const errors: unknown[] = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => errors.push(...args));
  return errors;
}

/** fetch-мок: URL → текст ответа; неизвестный URL — 404. */
function stubFetch(window: Window, routes: Readonly<Record<string, string>>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = decodeURI(String(input));
      const text = routes[url];
      return text === undefined
        ? new window.Response('', { status: 404 })
        : new window.Response(text, { status: 200 });
    }),
  );
}

describe('браузер: ошибки исполнения (US1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('inline-блок: console.error содержит URL#blockN, строку и стек', async () => {
    const errors = captureErrors();
    renderPage([makeScriptBlock('А = 1 / 0;')]);

    await runEngine();
    await flush();

    expect(errors).toHaveLength(1);
    const text = String(errors[0]);
    expect(text).toContain(`${PAGE_URL}#block1:1: Деление на ноль`);
    expect(text).toContain('Стек вызовов:');
    expect(text).toContain('<модуль>');
  });

  it('inline-блок с id: модуль — URL#id', async () => {
    const errors = captureErrors();
    renderPage([makeScriptBlock('А = 1 / 0;', 'app')]);

    await runEngine();
    await flush();

    expect(String(errors[0])).toContain(`${PAGE_URL}#app:1: Деление на ноль`);
  });

  it('внешний .osjs: модуль — абсолютный URL файла', async () => {
    const errors = captureErrors();
    const window = renderPage(['<script type="text/osjs" src="app.osjs"></script>']);
    stubFetch(window, { 'http://localhost/app/app.osjs': 'А = 1 / 0;' });

    await runEngine();
    await flush();

    expect(String(errors[0])).toContain('http://localhost/app/app.osjs:1: Деление на ноль');
  });

  it('ошибка одного блока не останавливает остальные', async () => {
    const logs = captureLogs();
    const errors = captureErrors();
    renderPage([makeScriptBlock('ВызватьИсключение "бум";'), makeScriptBlock('Сообщить("второй");')]);

    await runEngine();
    await flush();

    expect(logs).toEqual(['второй']);
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain('бум');
    expect(String(errors[0])).toContain('#block1:1:');
  });

  it('ошибка декларативного обработчика data-os-* печатается с позицией', async () => {
    const errors = captureErrors();
    const window = renderPage(
      [makeScriptBlock('Перем Счёт; Счёт = 0;')],
      '<button id="к" data-os-click="А = 1 / 0;">+1</button>',
    );

    await runEngine();
    await flush();
    (window.document.getElementById('к') as unknown as HTMLElement).click();

    expect(errors).toHaveLength(1);
    const text = String(errors[0]);
    expect(text).toContain(`${PAGE_URL}#block1:1: Деление на ноль`);
    expect(text).toContain('<обработчик>');
  });

  it('ошибка в обработчике BSL-события содержит кадр обработчика', async () => {
    const errors = captureErrors();
    renderPage([
      makeScriptBlock(
        [
          'Процедура Обработчик() Экспорт',
          '  А = 1 / 0;',
          'КонецПроцедуры',
          'ДобавитьОбработчик ЭтотОбъект.Событие, ЭтотОбъект.Обработчик;',
          'ВызватьСобытие("Событие");',
        ].join('\n'),
      ),
    ]);

    await runEngine();
    await flush();

    expect(errors).toHaveLength(1);
    const text = String(errors[0]);
    expect(text).toContain(`${PAGE_URL}#block1:2: Деление на ноль`);
    expect(text).toContain('Обработчик');
    expect(text).toContain('<модуль>');
  });
});
