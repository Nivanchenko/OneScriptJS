import type { Window } from 'happy-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flush, makeScriptBlock, renderPage, runEngine } from './helpers/browser-script';

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

describe('script[type="text/osjs"]: исполнение (US1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('исполняет BSL из блока, а сам блок не попадает в отрендеренный текст', async () => {
    const logs = captureLogs();
    const window = renderPage([
      makeScriptBlock('имя = "Никита"; сообщить("Привет, " + имя);'),
    ]);

    await runEngine();
    await flush();

    expect(logs).toEqual(['Привет, Никита']);
    expect(window.document.body.innerText).not.toContain('сообщить');
    expect(window.getComputedStyle(window.document.querySelector('script')!).display).toBe('none');
  });

  it('исполняет два блока в порядке документа', async () => {
    const logs = captureLogs();
    renderPage([
      makeScriptBlock('Сообщить("первый");'),
      makeScriptBlock('Сообщить("второй");'),
    ]);

    await runEngine();
    await flush();

    expect(logs).toEqual(['первый', 'второй']);
  });

  it('сравнивает type без учёта регистра', async () => {
    const logs = captureLogs();
    renderPage(['<script type="TEXT/OSJS">Сообщить("регистр");</script>']);

    await runEngine();
    await flush();

    expect(logs).toEqual(['регистр']);
  });

  it('<one-script> не исполняется и не скрывается нашим CSS', async () => {
    const logs = captureLogs();
    const window = renderPage(
      [makeScriptBlock('Сообщить("наш");')],
      '<one-script>Сообщить("чужой");</one-script>',
    );

    await runEngine();
    await flush();

    expect(logs).toEqual(['наш']);
    expect(window.document.body.innerText).toContain('чужой'); // элемент видим: CSS не инжектится
    expect(window.document.getElementById('one-script-style')).toBeNull();
    expect(window.document.querySelectorAll('style')).toHaveLength(0);
    expect(window.customElements.get('one-script')).toBeUndefined();
  });

  it('не исполняет блоки других типов и без type', async () => {
    const logs = captureLogs();
    renderPage([
      '<script type="text/x-template">Сообщить("чужой тип");</script>',
      '<script>Сообщить("без типа");</script>',
      makeScriptBlock('Сообщить("наш");'),
    ]);

    await runEngine();
    await flush();

    expect(logs).toEqual(['наш']);
  });

  it('не исполняет блоки, добавленные после запуска', async () => {
    const logs = captureLogs();
    const window = renderPage([makeScriptBlock('Сообщить("старт");')]);

    await runEngine();
    await flush();
    expect(logs).toEqual(['старт']);

    window.document.body.insertAdjacentHTML(
      'beforeend',
      makeScriptBlock('Сообщить("динамика");'),
    );
    await flush();

    expect(logs).toEqual(['старт']);
  });

  it('повторный импорт не запускает блоки заново', async () => {
    const logs = captureLogs();
    renderPage([makeScriptBlock('Сообщить("один раз");')]);

    await runEngine();
    await flush();
    // модуль уже в кеше: повторный импорт не создаёт второй запуск
    await import('../src/browser/onescript');
    await flush();

    expect(logs).toEqual(['один раз']);
  });
});

/** fetch-мок: URL → текст ответа; неизвестный URL — 404. */
function stubFetch(
  window: Window,
  routes: Readonly<Record<string, string>>,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: string) => {
    const url = decodeURI(String(input));
    const text = routes[url];
    return text === undefined
      ? new window.Response('', { status: 404 })
      : new window.Response(text, { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('script[type="text/osjs"]: внешний src (спека 019)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('загружает внешний .osjs; inline-содержимое игнорируется', async () => {
    const logs = captureLogs();
    const window = renderPage([
      '<script type="text/osjs" src="app.osjs">Сообщить("inline");</script>',
    ]);
    const fetchMock = stubFetch(window, {
      'http://localhost/app/app.osjs': 'Сообщить("внешний");',
    });

    await runEngine();
    await flush();

    expect(logs).toEqual(['внешний']);
    expect(decodeURI(String(fetchMock.mock.calls[0]?.[0]))).toBe('http://localhost/app/app.osjs');
  });

  it('#Использовать разрешается относительно URL внешнего файла', async () => {
    const logs = captureLogs();
    const window = renderPage(['<script type="text/osjs" src="scripts/app.osjs"></script>']);
    const fetchMock = stubFetch(window, {
      'http://localhost/app/scripts/app.osjs':
        '#Использовать "lib/Модуль.osjs"\nСообщить(Модуль.Сложить(2, 3));',
      'http://localhost/app/scripts/lib/Модуль.osjs':
        'Функция Сложить(А, Б) Экспорт\n  Возврат А + Б;\nКонецФункции',
    });

    await runEngine();
    await flush();

    expect(logs).toEqual(['5']);
    expect(fetchMock.mock.calls.map((call) => decodeURI(String(call[0])))).toEqual([
      'http://localhost/app/scripts/app.osjs',
      'http://localhost/app/scripts/lib/Модуль.osjs',
    ]);
  });

  it('сохраняет порядок документа при медленной загрузке', async () => {
    const logs = captureLogs();
    const window = renderPage([
      '<script type="text/osjs" src="slow.osjs"></script>',
      makeScriptBlock('Сообщить("второй");'),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () => resolve(new window.Response('Сообщить("первый");', { status: 200 })),
              10,
            );
          }),
      ),
    );

    await runEngine();
    await flush(50);

    expect(logs).toEqual(['первый', 'второй']);
  });

  it('ошибка загрузки — console.error, остальные блоки исполняются', async () => {
    const logs = captureLogs();
    const errors = captureErrors();
    const window = renderPage([
      '<script type="text/osjs" src="missing.osjs"></script>',
      makeScriptBlock('Сообщить("второй");'),
    ]);
    stubFetch(window, {});

    await runEngine();
    await flush();

    expect(logs).toEqual(['второй']);
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain('http://localhost/app/missing.osjs');
    expect(String(errors[0])).toContain('404');
  });

  it('некорректный URL — console.error, остальные блоки исполняются', async () => {
    const logs = captureLogs();
    const errors = captureErrors();
    renderPage([
      '<script type="text/osjs" src="http://["></script>',
      makeScriptBlock('Сообщить("второй");'),
    ]);

    await runEngine();
    await flush();

    expect(logs).toEqual(['второй']);
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain('Не удалось загрузить');
  });

  it('id блока с src регистрирует контекст для data-os-*', async () => {
    const window = renderPage(
      ['<script type="text/osjs" id="app" src="app.osjs"></script>'],
      '<button id="к" data-os-script="app" data-os-click="Счёт = Счёт + 1; Сообщить(Счёт);">+1</button>',
    );
    stubFetch(window, {
      'http://localhost/app/app.osjs': 'Перем Счёт;\nСчёт = 0;',
    });
    const logs = captureLogs();

    await runEngine();
    await flush();

    const button = window.document.getElementById('к') as unknown as HTMLElement;
    button.click();
    button.click();

    expect(logs).toEqual(['1', '2']);
  });

  it('ТекущийСценарий().Источник указывает на внешний файл', async () => {
    const logs = captureLogs();
    const window = renderPage(['<script type="text/osjs" src="app.osjs"></script>']);
    stubFetch(window, {
      'http://localhost/app/app.osjs': 'Сообщить(ТекущийСценарий().Источник);',
    });

    await runEngine();
    await flush();

    expect(logs).toEqual(['http://localhost/app/app.osjs']);
  });

  it('пустой src — фолбэк на inline-содержимое', async () => {
    const logs = captureLogs();
    const window = renderPage([
      '<script type="text/osjs" src="  ">Сообщить("inline");</script>',
    ]);
    const fetchMock = stubFetch(window, {});

    await runEngine();
    await flush();

    expect(logs).toEqual(['inline']);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('script[type="text/osjs"]: raw-text и опасные последовательности (US2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('выполняет А<Б без пробелов как BSL-сравнение', async () => {
    const logs = captureLogs();
    renderPage([
      makeScriptBlock(`
        А = 1;
        Б = 2;
        Если А<Б Тогда
          Сообщить("меньше");
        КонецЕсли;
      `),
    ]);

    await runEngine();
    await flush();

    expect(logs).toEqual(['меньше']);
  });

  it('сохраняет & и HTML-фрагменты в строках посимвольно', async () => {
    const logs = captureLogs();
    renderPage([
      makeScriptBlock(`
        Сообщить("Tom & Jerry");
        Сообщить("<div>&copy;</div>");
      `),
    ]);

    await runEngine();
    await flush();

    expect(logs).toEqual(['Tom & Jerry', '<div>&copy;</div>']);
  });

  it('не исполняет блок внутри HTML-комментария', async () => {
    const logs = captureLogs();
    renderPage(
      [makeScriptBlock('Сообщить("виден");')],
      '<!-- <script type="text/osjs">Сообщить("скрыт");</script> -->',
    );

    await runEngine();
    await flush();

    expect(logs).toEqual(['виден']);
  });

  it('пустой блок — no-op, остальные исполняются', async () => {
    const logs = captureLogs();
    const errors = captureErrors();
    renderPage([makeScriptBlock(''), makeScriptBlock('  \n  '), makeScriptBlock('Сообщить("да");')]);

    await runEngine();
    await flush();

    expect(logs).toEqual(['да']);
    expect(errors).toEqual([]);
  });

  it('обрыв на </script> даёт ошибку разбора, а не тихий успех', async () => {
    const logs = captureLogs();
    const errors = captureErrors();
    renderPage([
      makeScriptBlock('s = "a</script>b"; Сообщить(s);'),
      makeScriptBlock('Сообщить("второй");'),
    ]);

    await runEngine();
    await flush();

    expect(logs).toEqual(['второй']);
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toMatch(/строк/i);
    expect(String(errors[0])).toContain('</script>'); // подсказка о причине обрыва
  });
});

describe('script[type="text/osjs"]: контексты и изоляция (US3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('id блока + data-os-click/data-os-script исполняются в контексте блока', async () => {
    const window = renderPage(
      [
        makeScriptBlock(
          `
            Перем Счёт;
            Счёт = 0;
            Вывод = Документ.ПолучитьЭлемент("вывод");
          `,
          'app',
        ),
      ],
      '<button id="к" data-os-script="app" data-os-click="Счёт = Счёт + 1; Вывод.Текст = Строка(Счёт);">+1</button>' +
        '<output id="вывод">0</output>',
    );

    await runEngine();
    await flush();

    const button = window.document.getElementById('к') as unknown as HTMLElement;
    button.click();
    button.click();

    expect(window.document.getElementById('вывод')?.textContent).toBe('2');
  });

  it('первый блок без id становится контекстом по умолчанию', async () => {
    const window = renderPage(
      [makeScriptBlock('Перем X; X = 0;'), makeScriptBlock('Перем X; X = 100;')],
      '<button id="к" data-os-click="X = X + 1; Сообщить(X);">+1</button>',
    );
    const logs = captureLogs();

    await runEngine();
    await flush();
    (window.document.getElementById('к') as unknown as HTMLElement).click();

    expect(logs).toEqual(['1']);
  });

  it('дубликат id — последний зарегистрированный контекст побеждает', async () => {
    const window = renderPage(
      [
        makeScriptBlock('Перем Y; Y = 1;', 'app'),
        makeScriptBlock('Перем Y; Y = 2;', 'app'),
      ],
      '<button id="к" data-os-script="app" data-os-click="Сообщить(Y);">+1</button>',
    );
    const logs = captureLogs();

    await runEngine();
    await flush();
    (window.document.getElementById('к') as unknown as HTMLElement).click();

    expect(logs).toEqual(['2']);
  });

  it('два блока изолированы: переменные не пересекаются', async () => {
    const logs = captureLogs();
    const errors = captureErrors();
    renderPage([
      makeScriptBlock('Общая = "первый"; Сообщить(Общая);'),
      makeScriptBlock('Сообщить(Общая);'),
    ]);

    await runEngine();
    await flush();

    // Во втором контексте нет `Общая`: неопределённое значение печатается пустым.
    expect(logs).toEqual(['первый', '']);
    expect(errors).toEqual([]);
  });

  it('исключение в первом блоке не мешает второму', async () => {
    const logs = captureLogs();
    const errors = captureErrors();
    renderPage([
      makeScriptBlock('ВызватьИсключение "бум";'),
      makeScriptBlock('Сообщить("второй");'),
    ]);

    await runEngine();
    await flush();

    expect(logs).toEqual(['второй']);
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain('бум');
  });
});

describe('script[type="text/osjs"]: импорты (US1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('#Использовать разрешается относительно document.baseURI', async () => {
    const logs = captureLogs();
    const window = renderPage([
      makeScriptBlock('#Использовать "lib/Модуль.osjs"\nСообщить(Модуль.Сложить(2, 3));'),
    ]);
    const fetchMock = vi.fn(async (url: string) => {
      const text = {
        'http://localhost/app/lib/Модуль.osjs':
          'Функция Сложить(А, Б) Экспорт\n  Возврат А + Б;\nКонецФункции',
      }[decodeURI(String(url))];
      return text === undefined
        ? new window.Response('', { status: 404 })
        : new window.Response(text, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await runEngine();
    await flush();

    expect(logs).toEqual(['5']);
    expect(decodeURI(String(fetchMock.mock.calls[0]?.[0]))).toBe(
      'http://localhost/app/lib/Модуль.osjs',
    );
  });

  it('сохраняет порядок блоков при асинхронной предзагрузке модулей', async () => {
    const logs = captureLogs();
    const window = renderPage([
      makeScriptBlock('#Использовать "lib/Медленный.osjs"\nСообщить("первый");'),
      makeScriptBlock('Сообщить("второй");'),
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve(
                  new window.Response('Функция Ничего() Экспорт\nКонецФункции', { status: 200 }),
                ),
              10,
            );
          }),
      ),
    );

    await runEngine();
    await flush(50);

    expect(logs).toEqual(['первый', 'второй']);
  });
});
