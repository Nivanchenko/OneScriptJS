import { afterEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';

interface Rendered {
  logs: unknown[];
  errors: unknown[];
  fetchMock: ReturnType<typeof vi.fn>;
}

/** Поднимает happy-dom-страницу, подставляет fetch и исполняет <one-script>. */
async function render(
  html: string,
  files: Record<string, string>,
  options: { url?: string; status?: number } = {},
): Promise<Rendered> {
  vi.resetModules();
  const window = new Window({ url: options.url ?? 'http://localhost/app/' });
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('customElements', window.customElements);
  vi.stubGlobal('HTMLElement', window.HTMLElement);
  vi.stubGlobal('URL', window.URL);

  const logs: unknown[] = [];
  const errors: unknown[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => logs.push(...args));
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => errors.push(...args));

  const fetchMock = vi.fn(async (url: string) => {
    if (options.status !== undefined && options.status !== 200) {
      return new window.Response('', { status: options.status });
    }
    const text = files[decodeURI(url)];
    if (text === undefined) return new window.Response('', { status: 404 });
    return new window.Response(text, { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);

  await import('../src/browser/onescript');
  const element = document.createElement('one-script');
  element.textContent = html;
  document.body.appendChild(element);
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { logs, errors, fetchMock };
}

describe('браузерный импорт модулей', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('загружает модуль по относительному URL', async () => {
    const { logs, fetchMock } = await render(
      '#Использовать "lib/Модуль.os"\nСообщить(Модуль.Сложить(2, 3));',
      {
        'http://localhost/app/lib/Модуль.os':
          'Функция Сложить(А, Б) Экспорт\n  Возврат А + Б;\nКонецФункции',
      },
    );
    expect(logs).toEqual(['5']);
    expect(decodeURI(String(fetchMock.mock.calls[0]?.[0]))).toBe(
      'http://localhost/app/lib/Модуль.os',
    );
  });

  it('загружает модуль в нашем формате .osjs', async () => {
    const { logs } = await render(
      '#Использовать "lib/Модуль.osjs"\nСообщить(Модуль.Сложить(2, 3));',
      {
        'http://localhost/app/lib/Модуль.osjs':
          'Функция Сложить(А, Б) Экспорт\n  Возврат А + Б;\nКонецФункции',
      },
    );
    expect(logs).toEqual(['5']);
  });

  it('загружает модуль по URL от корня сервера', async () => {
    const { logs } = await render('#Использовать "/lib/Модуль.os"\nСообщить(Модуль.Поле);', {
      'http://localhost/lib/Модуль.os': 'Перем Поле Экспорт;\nПоле = "root";',
    });
    expect(logs).toEqual(['root']);
  });

  it('резолвит импорт из ЗагрузитьСценарийИзСтроки, если модуль уже предзагружен', async () => {
    const { logs } = await render(
      [
        '#Использовать "lib/Модуль.os"',
        'Код = "#Использовать ""lib/Модуль.os""" + Символы.ПС + "Сообщить(Модуль.Поле);";',
        'ЗагрузитьСценарийИзСтроки(Код, "http://localhost/app/dyn.os");',
        'Сообщить(Модуль.Поле);',
      ].join('\n'),
      { 'http://localhost/app/lib/Модуль.os': 'Перем Поле Экспорт;\nПоле = 5;' },
    );
    expect(logs).toEqual(['5', '5']);
  });

  it('сообщает об ошибке для динамического импорта вне предзагрузки', async () => {
    const { logs, errors } = await render(
      'Код = "#Использовать ""lib/Нет.os""" + Символы.ПС + "Сообщить(1);";\nЗагрузитьСценарийИзСтроки(Код, "http://localhost/app/dyn.os");',
      {},
    );
    expect(logs).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(decodeURI(String(errors[0]))).toContain('Файл не найден');
  });

  it('пишет ошибку с URL при недоступном файле и не роняет страницу', async () => {
    const { logs, errors } = await render('#Использовать "lib/Нет.os"\nСообщить("после");', {});
    expect(logs).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(decodeURI(String(errors[0]))).toContain('http://localhost/app/lib/Нет.os');
    expect(String(errors[0])).toContain('HTTP 404');
  });
});
