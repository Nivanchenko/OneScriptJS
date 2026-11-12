import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { flush, renderPage, runEngine } from './helpers/browser-script';

const examplesDir = join(process.cwd(), 'examples');

/** Разбирает демо-страницу: ставит body в happy-dom и исполняет её script-блоки. */
async function loadDemo(file: string): Promise<Window> {
  const html = readFileSync(join(examplesDir, file), 'utf8');
  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  if (!bodyMatch) throw new Error(`В ${file} нет <body>`);
  // внешние <script src> в тесте не нужны
  const body = bodyMatch[1]!.replace(/<script\b[^>]*>\s*<\/script>/gi, '');

  const window = renderPage([], body);
  if (window.document.querySelectorAll('script[type="text/osjs"]').length === 0) {
    throw new Error(`В ${file} нет <script type="text/osjs">`);
  }
  await runEngine();
  await flush();
  return window;
}

describe('демо-страницы examples/', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('counter.html: кнопка увеличивает счётчик', async () => {
    const window = await loadDemo('counter.html');
    const button = window.document.getElementById('кнопка') as unknown as HTMLElement;
    button.click();
    button.click();
    button.click();
    expect(window.document.getElementById('вывод')?.textContent).toBe('3');
  });

  it('delegation.html: один обработчик на контейнере определяет нажатую кнопку', async () => {
    const window = await loadDemo('delegation.html');
    const buttons = window.document.querySelectorAll('#панель button');
    const result = window.document.getElementById('результат');

    (buttons[0] as unknown as HTMLElement).click();
    expect(result?.textContent).toBe('Нажато: Отлично (data-choice=Отлично)');

    // Вложенный <span>: цель — сам span, обработчик поднимается до кнопки.
    (buttons[1]!.querySelector('span') as unknown as HTMLElement).click();
    expect(result?.textContent).toBe('Нажато: Хорошо (data-choice=Хорошо)');
  });

  it('input.html: ввод зеркалируется в span', async () => {
    const window = await loadDemo('input.html');
    const input = window.document.getElementById('поле') as unknown as HTMLInputElement;
    input.value = 'abc';
    (input as unknown as HTMLElement).dispatchEvent(
      new window.Event('input', { bubbles: true }) as unknown as Event,
    );
    expect(window.document.getElementById('вывод')?.textContent).toBe('Вы ввели: abc');
  });

  it('hover.html: наведение и уход меняют класс', async () => {
    const window = await loadDemo('hover.html');
    const block = window.document.getElementById('блок') as unknown as HTMLElement;
    block.dispatchEvent(new window.Event('mouseenter') as unknown as Event);
    expect(block.className).toBe('активный');
    block.dispatchEvent(new window.Event('mouseleave') as unknown as Event);
    expect(block.className).toBe('');
  });

  it('dom.html: карточка со списком и кнопкой создаётся из BSL', async () => {
    const window = await loadDemo('dom.html');
    const card = window.document.getElementById('карточка');
    expect(card).not.toBeNull();
    expect(card!.querySelectorAll('li').length).toBe(3);
    expect(card!.querySelector('button')?.textContent).toBe('Выделить карточку');
  });

  it('collections.html: таблица значений рендерится в DOM-отчёт', async () => {
    const window = await loadDemo('collections.html');
    const report = window.document.getElementById('отчёт');
    const table = report?.querySelector('table');
    expect(table).not.toBeNull();
    expect(table!.querySelector('caption')?.textContent).toBe('Отчёт по складу');
    expect(table!.querySelectorAll('thead th').length).toBe(4);

    const rows = table!.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
    const firstRowCells = Array.from(rows[0]!.querySelectorAll('td')).map((cell) => cell.textContent);
    expect(firstRowCells).toEqual(['Монитор', '18000,00 руб.', '2', '36000,00 руб.']);

    const footer = table!.querySelector('tfoot')?.textContent ?? '';
    expect(footer).toContain('Итого, позиций: 3');
    expect(footer).toContain('49500,00 руб.');
    expect(window.document.getElementById('итог')?.textContent).toBe(
      'Всего по складу: 49500,00 руб. Позиции: Монитор · Клавиатура · Мышь.',
    );
  });

  it('strings-json.html: строки, Формат и JSON выводятся в <pre>', async () => {
    const window = await loadDemo('strings-json.html');
    const output = window.document.getElementById('вывод')?.textContent ?? '';
    expect(output).toContain('СтрШаблон: Привет, мир! Сегодня пятница.');
    expect(output).toContain('3 части: яблоко | банан | груша');
    expect(output).toContain('СтрЗаменить: путь домой');
    expect(output).toContain('Формат числа: 1 234 567,50');
    expect(output).toContain('Формат даты: 11.11.2026 15:30');
    expect(output).toContain('ЗаписатьJSON: {"имя":"Анна","город":"Москва","возраст":30}');
    expect(output).toContain('ПрочитатьJSON: имя = Анна, город = Москва, возраст = 30');
  });

  it('form.html: submit отменяется, приветствие показывается', async () => {
    const window = await loadDemo('form.html');
    const form = window.document.getElementById('форма') as unknown as HTMLElement;
    const input = window.document.getElementById('имя') as unknown as HTMLInputElement;
    input.value = 'Анна';

    const event = new window.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event;
    const notCanceled = form.dispatchEvent(event);
    expect(notCanceled).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(window.document.getElementById('результат')?.textContent).toBe(
      'Привет, Анна! Событие: submit.',
    );
  });
});
