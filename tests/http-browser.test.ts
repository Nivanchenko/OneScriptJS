import { afterEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { Buffer } from 'node:buffer';
import { run } from '../src/runtime/runner';
import { createBrowserGlobalContext } from '../src/browser/context';

describe('HTTP: браузерный транспорт (happy-dom)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('выполняет GET через синхронный XMLHttpRequest и читает тело (UTF-8)', () => {
    let seenMethod = '';
    let seenUrl = '';
    let seenContentType = '';
    let postMethod = '';
    let postBodyPresent = false;
    const seenBodies: boolean[] = [];
    let win!: Window;

    win = new Window({
      settings: {
        fetch: {
          disableSameOriginPolicy: true,
          interceptor: {
            beforeSyncRequest: ({ request }) => {
              if (request.url.endsWith('/api/save')) {
                postMethod = request.method;
                postBodyPresent = request.body !== null;
                seenBodies.push(request.body !== null);
                return {
                  status: 201,
                  statusText: 'Created',
                  ok: true,
                  url: request.url,
                  redirected: false,
                  headers: new win.Headers({ 'Content-Type': 'text/plain' }),
                  body: Buffer.from('saved'),
                };
              }
              seenMethod = request.method;
              seenUrl = request.url;
              seenContentType = request.headers.get('Content-Type') ?? '';
              seenBodies.push(request.body !== null);
              return {
                status: 200,
                statusText: 'OK',
                ok: true,
                url: request.url,
                redirected: false,
                headers: new win.Headers({ 'Content-Type': 'application/json; charset=utf-8' }),
                body: Buffer.from('{"message":"Привет"}'),
              };
            },
          },
        },
      },
    });

    vi.stubGlobal('window', win);
    vi.stubGlobal('document', win.document);
    vi.stubGlobal('XMLHttpRequest', win.XMLHttpRequest);
    vi.stubGlobal('customElements', win.customElements);
    vi.stubGlobal('HTMLElement', win.HTMLElement);

    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });

    try {
      run(
        'Соединение = Новый HTTPСоединение("http://example.com");' +
          'Запрос = Новый HTTPЗапрос("/api/me");' +
          'Запрос.Заголовки.Вставить("Content-Type", "application/json");' +
          'Ответ = Соединение.Получить(Запрос);' +
          'Сообщить(Ответ.КодСостояния);' +
          'Сообщить(Ответ.ПолучитьТелоКакСтроку());' +
          'З2 = Новый HTTPЗапрос("/api/save");' +
          'З2.УстановитьТелоИзСтроки("привет");' +
          'О2 = Соединение.ОтправитьДляОбработки(З2);' +
          'Сообщить(О2.КодСостояния);' +
          'Сообщить(О2.ПолучитьТелоКакСтроку());',
        createBrowserGlobalContext(),
      );
    } finally {
      spy.mockRestore();
    }

    expect(logs).toEqual(['200', '{"message":"Привет"}', '201', 'saved']);
    expect(seenMethod).toBe('GET');
    expect(seenUrl).toBe('http://example.com/api/me');
    expect(seenContentType).toBe('application/json');
    expect(postMethod).toBe('POST');
    expect(postBodyPresent).toBe(true);
    expect(seenBodies).toEqual([false, true]);
  });
});
