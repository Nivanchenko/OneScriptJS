import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { run } from '../src/runtime/runner';
import { createBrowserGlobalContext } from '../src/browser/context';
import { bindDeclarativeHandlers, registerScriptContext, resetDeclarativeHandlers } from '../src/browser/dom-events';

const examplesDir = join(process.cwd(), 'examples');

/** Разбирает демо-страницу: ставит body в happy-dom и исполняет первый <one-script>. */
function loadDemo(file: string): Window {
  const html = readFileSync(join(examplesDir, file), 'utf8');
  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  if (!bodyMatch) throw new Error(`В ${file} нет <body>`);
  // внешние <script src> в тесте не нужны
  const body = bodyMatch[1]!.replace(/<script\b[^>]*>\s*<\/script>/gi, '');

  const window = new Window();
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  window.document.body.innerHTML = body;

  const scripts = window.document.querySelectorAll('one-script');
  if (scripts.length === 0) throw new Error(`В ${file} нет <one-script>`);
  const code = scripts[0]!.textContent ?? '';
  // убираем сам тег, чтобы он не мешал проверкам
  scripts[0]!.remove();

  const ctx = createBrowserGlobalContext();
  registerScriptContext(null, ctx);
  run(code, ctx);
  bindDeclarativeHandlers(window.document as unknown as ParentNode);
  return window;
}

describe('демо-страницы examples/', () => {
  afterEach(() => {
    resetDeclarativeHandlers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('counter.html: кнопка увеличивает счётчик', () => {
    const window = loadDemo('counter.html');
    const button = window.document.getElementById('кнопка') as unknown as HTMLElement;
    button.click();
    button.click();
    button.click();
    expect(window.document.getElementById('вывод')?.textContent).toBe('3');
  });

  it('input.html: ввод зеркалируется в span', () => {
    const window = loadDemo('input.html');
    const input = window.document.getElementById('поле') as unknown as HTMLInputElement;
    input.value = 'abc';
    (input as unknown as HTMLElement).dispatchEvent(
      new window.Event('input', { bubbles: true }) as unknown as Event,
    );
    expect(window.document.getElementById('вывод')?.textContent).toBe('Вы ввели: abc');
  });

  it('hover.html: наведение и уход меняют класс', () => {
    const window = loadDemo('hover.html');
    const block = window.document.getElementById('блок') as unknown as HTMLElement;
    block.dispatchEvent(new window.Event('mouseenter') as unknown as Event);
    expect(block.className).toBe('активный');
    block.dispatchEvent(new window.Event('mouseleave') as unknown as Event);
    expect(block.className).toBe('');
  });

  it('dom.html: карточка со списком и кнопкой создаётся из BSL', () => {
    const window = loadDemo('dom.html');
    const card = window.document.getElementById('карточка');
    expect(card).not.toBeNull();
    expect(card!.querySelectorAll('li').length).toBe(3);
    expect(card!.querySelector('button')?.textContent).toBe('Выделить карточку');
  });
});
