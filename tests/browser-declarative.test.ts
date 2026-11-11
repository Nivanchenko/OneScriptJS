import { afterEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { bindDeclarativeHandlers, registerScriptContext, resetDeclarativeHandlers } from '../src/browser/dom-events';
import { createBrowserGlobalContext } from '../src/browser/context';
import { run } from '../src/runtime/runner';
import { flush, makeScriptBlock, renderPage, runEngine } from './helpers/browser-script';

let captured: unknown[] = [];

function capture(): void {
  captured = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    captured.push(...args);
  });
}

function setupWindow(html: string): Window {
  const window = new Window();
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  window.document.body.innerHTML = html;
  return window;
}

/** Регистрирует контекст скрипта так же, как это делает script-блок. */
function addScriptContext(id: string | null, code: string): void {
  const ctx = createBrowserGlobalContext();
  registerScriptContext(id, ctx);
  run(code, ctx);
}

/** happy-dom Document не совпадает по типу с DOM-lib ParentNode — приводим на границе теста. */
function bind(window: Window): void {
  bindDeclarativeHandlers(window.document as unknown as ParentNode);
}

function click(window: Window, id: string): void {
  (window.document.getElementById(id) as unknown as HTMLElement).click();
}

describe('декларативные обработчики data-os-*', () => {
  afterEach(() => {
    resetDeclarativeHandlers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('data-os-click исполняется в области видимости единственного script-блока', async () => {
    const window = renderPage(
      [
        makeScriptBlock(
          'Перем Счёт; Счёт = 0; Вывод = Документ.ПолучитьЭлемент("вывод"); Вывод.Текст = "0";',
        ),
      ],
      '<button id="к" data-os-click="Счёт = Счёт + 1; Вывод.Текст = Строка(Счёт);">+1</button><span id="вывод"></span>',
    );
    await runEngine();
    await flush();
    // Привязку после исполнения блока уже запланировал движок.

    click(window, 'к');
    click(window, 'к');
    expect(window.document.getElementById('вывод')?.textContent).toBe('2');
  });

  it('data-os-input и data-os-change работают как обычные события', async () => {
    const window = setupWindow(
      '<input id="поле" data-os-input="Вывод.Текст = Документ.ПолучитьЭлемент(&quot;поле&quot;).Значение;">' +
        '<span id="вывод"></span>',
    );
    addScriptContext(null, 'Вывод = Документ.ПолучитьЭлемент("вывод");');
    bind(window);

    const input = window.document.getElementById('поле') as unknown as HTMLInputElement;
    input.value = 'abc';
    input.dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event);
    expect(window.document.getElementById('вывод')?.textContent).toBe('abc');
  });

  it('data-os-script указывает, в чьей области видимости исполнять', async () => {
    const window = setupWindow(
      '<button id="к1" data-os-script="один" data-os-click="сообщить(&quot;один&quot;);">1</button>' +
        '<button id="к2" data-os-script="два" data-os-click="сообщить(&quot;два&quot;);">2</button>',
    );
    capture();
    addScriptContext('один', 'Перем X; X = 1;');
    addScriptContext('два', 'Перем Y; Y = 2;');
    bind(window);

    click(window, 'к1');
    click(window, 'к2');
    expect(captured).toEqual(['один', 'два']);
  });

  it('без script-блока обработчики не активируются, но страница не падает', () => {
    const window = setupWindow('<button id="к" data-os-click="сообщить(1);">x</button>');
    capture();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    bind(window);
    expect(() => click(window, 'к')).not.toThrow();
    expect(captured).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('повторная привязка не дублирует обработчики', async () => {
    const window = setupWindow('<button id="к" data-os-click="сообщить(&quot;раз&quot;);">x</button>');
    capture();
    addScriptContext(null, 'Перем Z; Z = 0;');
    bind(window);
    bind(window);
    bind(window);

    click(window, 'к');
    expect(captured).toEqual(['раз']);
  });

  it('обработчик получает объект Событие', async () => {
    const window = setupWindow('<button id="к" data-os-click="сообщить(Событие.Тип);">x</button>');
    capture();
    addScriptContext(null, 'Перем Z; Z = 0;');
    bind(window);

    click(window, 'к');
    expect(captured).toEqual(['click']);
  });

  it('ошибка в декларативном обработчике не ломает страницу', async () => {
    const window = setupWindow('<button id="к" data-os-click="1/0;">x</button>');
    const errors: unknown[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      errors.push(...a);
    });
    addScriptContext(null, 'Перем Z; Z = 0;');
    bind(window);

    expect(() => click(window, 'к')).not.toThrow();
    expect(errors.length).toBeGreaterThan(0);
  });
});
