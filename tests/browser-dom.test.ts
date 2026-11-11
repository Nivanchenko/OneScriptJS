import { afterEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { run } from '../src/runtime/runner';
import { createBrowserGlobalContext } from '../src/browser/context';
import { createGlobalContext } from '../src/stdlib/global-context';
import { flush, makeScriptBlock, renderPage, runEngine } from './helpers/browser-script';

function exec(source: string): unknown[] {
  const logs: unknown[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(...args);
  });
  try {
    run(source, createBrowserGlobalContext());
  } finally {
    spy.mockRestore();
  }
  return logs;
}

function setupDom(): Window {
  const window = new Window();
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  return window;
}

describe('Документ (DOM): создание и изменение элементов', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('создаёт элемент, задаёт текст и вставляет в body', () => {
    const window = setupDom();
    exec('Э = Документ.СоздатьЭлемент("div"); Э.Текст = "привет"; Э.ДобавитьВ(Документ.ТелоКорпуса);');
    const div = window.document.body.querySelector('div');
    expect(div?.textContent).toBe('привет');
  });

  it('ПолучитьЭлемент по идентификатору; несуществующий → Неопределено', () => {
    const window = setupDom();
    window.document.body.innerHTML = '<span id="метка">x</span>';
    expect(exec('Э = Документ.ПолучитьЭлемент("метка"); сообщить(Э.Текст);')).toEqual(['x']);
    expect(exec('сообщить(Документ.ПолучитьЭлемент("нет") = Неопределено);')).toEqual(['Истина']);
  });

  it('классы, стили и атрибуты', () => {
    setupDom();
    expect(
      exec(
        'Э = Документ.СоздатьЭлемент("p"); ' +
        'Э.ДобавитьКласс("активный"); Э.УстановитьАтрибут("data-x", "42"); ' +
        'Э.Стиль.Установить("color", "red"); ' +
        'сообщить(Э.ЕстьКласс("активный")); ' +
        'сообщить(Э.ПолучитьАтрибут("data-x")); ' +
        'сообщить(Э.Стиль.Получить("color"));',
      ),
    ).toEqual(['Истина', '42', 'red']);
  });

  it('Значение для поля ввода', () => {
    const window = setupDom();
    window.document.body.innerHTML = '<input id="поле">';
    exec('Э = Документ.ПолучитьЭлемент("поле"); Э.Значение = "текст"; сообщить(Э.Значение);');
    expect((window.document.getElementById('поле') as unknown as HTMLInputElement).value).toBe('текст');
  });

  it('Родитель и Дети', () => {
    const window = setupDom();
    window.document.body.innerHTML = '<div id="контейнер"><b>1</b><b>2</b></div>';
    expect(
      exec(
        'К = Документ.ПолучитьЭлемент("контейнер"); Д = К.Дети; ' +
          'сообщить(Д.Количество()); сообщить(Д[0].Родитель.Идентификатор);',
      ),
    ).toEqual(['2', 'контейнер']);
  });

  it('Удалить убирает элемент из документа', () => {
    const window = setupDom();
    window.document.body.innerHTML = '<div id="x"></div>';
    exec('Документ.ПолучитьЭлемент("x").Удалить();');
    expect(window.document.getElementById('x')).toBeNull();
  });

  it('ТелоКорпуса и Заголовок', () => {
    const window = setupDom();
    exec('Документ.Заголовок = "Новая"; сообщить(Документ.Заголовок);');
    expect(window.document.title).toBe('Новая');
  });

  it('вне браузера объект Документ недоступен', () => {
    // без stubGlobal('document', …)
    expect(() => run('Документ.ПолучитьЭлемент("x");', createBrowserGlobalContext())).toThrow(
      /Документ недоступен вне браузера/,
    );
  });

  it('общая stdlib не знает про Документ (остаётся Node-совместимой)', () => {
    expect(createGlobalContext().resolveGlobal('Документ')).toBeUndefined();
  });
});

describe('Документ доступен из <script type="text/osjs">', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('код из блока создаёт элемент в body', async () => {
    const window = renderPage([
      makeScriptBlock(
        'Э = Документ.СоздатьЭлемент("h1"); Э.Текст = "Заголовок"; Э.ДобавитьВ(Документ.ТелоКорпуса);',
      ),
    ]);

    await runEngine();
    await flush();

    const h1 = window.document.body.querySelector('h1');
    expect(h1?.textContent).toBe('Заголовок');
  });
});
