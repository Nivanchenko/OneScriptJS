import { afterEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { run } from '../src/runtime/runner';
import { createBrowserGlobalContext } from '../src/browser/context';

let captured: unknown[] = [];

/** Перехватить console.log на всё время теста (обработчики срабатывают позже run). */
function capture(): void {
  captured = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    captured.push(...args);
  });
}

function runScript(source: string): void {
  run(source, createBrowserGlobalContext());
}

function setupDom(html: string): Window {
  const window = new Window();
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  window.document.body.innerHTML = html;
  return window;
}

function click(window: Window, id: string): void {
  (window.document.getElementById(id) as unknown as HTMLElement).click();
}

function fire(window: Window, id: string, type: string): void {
  const el = window.document.getElementById(id) as unknown as HTMLElement;
  el.dispatchEvent(new window.Event(type, { bubbles: true }) as unknown as Event);
}

describe('события DOM из BSL', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('счётчик на кнопке сохраняет значение между нажатиями', () => {
    const window = setupDom('<button id="к">+1</button>');
    capture();
    runScript(`
      Перем Счёт;
      Счёт = 0;
      Кнопка = Документ.ПолучитьЭлемент("к");
      Кнопка.НаСобытие("Нажатие", "Счёт = Счёт + 1; сообщить(Счёт);");
    `);
    click(window, 'к');
    click(window, 'к');
    click(window, 'к');
    expect(captured).toEqual(['1', '2', '3']);
  });

  it('поле ввода зеркалирует текст в другой элемент', () => {
    const window = setupDom('<input id="вход"><span id="выход"></span>');
    runScript(`
      Поле = Документ.ПолучитьЭлемент("вход");
      Выход = Документ.ПолучитьЭлемент("выход");
      Поле.НаСобытие("Ввод", "Выход.Текст = Поле.Значение;");
    `);
    const input = window.document.getElementById('вход') as unknown as HTMLInputElement;
    input.value = 'привет';
    fire(window, 'вход', 'input');
    expect(window.document.getElementById('выход')?.textContent).toBe('привет');
  });

  it('наведение/уход меняют класс', () => {
    const window = setupDom('<div id="блок"></div>');
    runScript(`
      Блок = Документ.ПолучитьЭлемент("блок");
      Блок.НаСобытие("Наведение", "Блок.ДобавитьКласс(""активный"");");
      Блок.НаСобытие("Уход", "Блок.УбратьКласс(""активный"");");
    `);
    fire(window, 'блок', 'mouseenter');
    expect(window.document.getElementById('блок')?.className).toBe('активный');
    fire(window, 'блок', 'mouseleave');
    expect(window.document.getElementById('блок')?.className).toBe('');
  });

  it('СнятьСобытие отключает обработчик', () => {
    const window = setupDom('<button id="к">x</button><button id="стоп">stop</button>');
    capture();
    runScript(`
      Перем Н;
      Н = 0;
      Документ.ПолучитьЭлемент("к").НаСобытие("Нажатие", "Н = Н + 1; сообщить(Н);");
      Документ.ПолучитьЭлемент("стоп").НаСобытие("Нажатие", "Документ.ПолучитьЭлемент(""к"").СнятьСобытие(""Нажатие"");");
    `);
    click(window, 'к');
    click(window, 'стоп');
    click(window, 'к');
    expect(captured).toEqual(['1']);
  });

  it('произвольное имя DOM-события передаётся как есть', () => {
    const window = setupDom('<div id="э"></div>');
    capture();
    runScript(`
      Э = Документ.ПолучитьЭлемент("э");
      Э.НаСобытие("pointerdown", "сообщить(""нажали"");");
    `);
    fire(window, 'э', 'pointerdown');
    expect(captured).toEqual(['нажали']);
  });

  it('обработчик видит объект Событие (Тип, Цель)', () => {
    const window = setupDom('<button id="к">x</button>');
    capture();
    runScript(`
      К = Документ.ПолучитьЭлемент("к");
      К.НаСобытие("Нажатие", "сообщить(Событие.Тип); сообщить(Событие.Цель.Идентификатор);");
    `);
    click(window, 'к');
    expect(captured).toEqual(['click', 'к']);
  });

  it('Событие.Отменить отменяет действие по умолчанию', () => {
    const window = setupDom('<button id="к">go</button>');
    runScript(`
      К = Документ.ПолучитьЭлемент("к");
      К.НаСобытие("Нажатие", "Событие.Отменить();");
    `);
    const el = window.document.getElementById('к') as unknown as HTMLElement;
    const event = new window.Event('click', { bubbles: true, cancelable: true }) as unknown as Event;
    el.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('два скрипта не мешают друг другу', () => {
    const window = setupDom('<button id="к1">1</button><button id="к2">2</button>');
    capture();
    runScript(`
      Перем Своё;
      Своё = 0;
      Документ.ПолучитьЭлемент("к1").НаСобытие("Нажатие", "Своё = Своё + 10; сообщить(""A:"" + Своё);");
    `);
    runScript(`
      Перем Другое;
      Другое = 0;
      Документ.ПолучитьЭлемент("к2").НаСобытие("Нажатие", "Другое = Другое + 1; сообщить(""B:"" + Другое);");
    `);
    click(window, 'к1');
    click(window, 'к2');
    click(window, 'к1');
    expect(captured).toEqual(['A:10', 'B:1', 'A:20']);
  });

  it('ошибка в обработчике не ломает страницу', () => {
    const window = setupDom('<button id="к">x</button>');
    const errors: unknown[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      errors.push(...a);
    });
    runScript(`
      К = Документ.ПолучитьЭлемент("к");
      К.НаСобытие("Нажатие", "1/0;");
    `);
    expect(() => click(window, 'к')).not.toThrow();
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('<one-script>: подписка на события из разметки', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('кнопка из <one-script> увеличивает счётчик и пишет в DOM', async () => {
    const window = new Window();
    vi.stubGlobal('window', window);
    vi.stubGlobal('document', window.document);
    vi.stubGlobal('customElements', window.customElements);
    vi.stubGlobal('HTMLElement', window.HTMLElement);
    window.document.body.innerHTML = '<button id="к">+1</button><span id="счёт"></span>';

    await import('../src/browser/onescript');

    const el = window.document.createElement('one-script');
    el.textContent = `
      Перем Счёт;
      Счёт = 0;
      Кнопка = Документ.ПолучитьЭлемент("к");
      Вывод = Документ.ПолучитьЭлемент("счёт");
      Вывод.Текст = "0";
      Кнопка.НаСобытие("Нажатие", "Счёт = Счёт + 1; Вывод.Текст = Строка(Счёт);");
    `;
    window.document.body.appendChild(el);
    await new Promise((resolve) => setTimeout(resolve, 0));

    (window.document.getElementById('к') as unknown as HTMLElement).click();
    (window.document.getElementById('к') as unknown as HTMLElement).click();

    expect(window.document.getElementById('счёт')?.textContent).toBe('2');
  });
});

describe('<one-script>: события BSL', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('ДобавитьОбработчик и объявление события доходят до console.log', async () => {
    const window = new Window();
    vi.stubGlobal('window', window);
    vi.stubGlobal('document', window.document);
    vi.stubGlobal('customElements', window.customElements);
    vi.stubGlobal('HTMLElement', window.HTMLElement);
    window.document.body.innerHTML = '';

    // Модуль кешируется между тестами: перезагружаем, чтобы элемент зарегистрировался в этом Window.
    vi.resetModules();
    await import('../src/browser/onescript');

    capture();
    const el = window.document.createElement('one-script');
    el.textContent = `
      Перем Счетчик;
      Процедура Обработчик(П1, П2) Экспорт
        Счетчик = Счетчик + 1;
        Сообщить(П1);
        Сообщить(П2);
        Сообщить(Счетчик);
      КонецПроцедуры
      Источник = ЗагрузитьСценарийИзСтроки("Процедура Сгенерировать(Имя, Параметры) Экспорт
      |  ВызватьСобытие(Имя, Параметры);
      |КонецПроцедуры");
      Счетчик = 0;
      ДобавитьОбработчик Источник.МоеСобытие, ЭтотОбъект.Обработчик;
      Параметры = Новый Массив;
      Параметры.Добавить("П1");
      Параметры.Добавить("П2");
      Источник.Сгенерировать("МоеСобытие", Параметры);
    `;
    window.document.body.appendChild(el);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(captured).toEqual(['П1', 'П2', '1']);
  });
});
