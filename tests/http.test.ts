import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/runtime/runner';
import { createGlobalContext } from '../src/stdlib/global-context';
import { encodeText } from '../src/stdlib/binary';
import type { HttpRequestData, HttpResponseData, HttpTransport } from '../src/stdlib/http';

function exec(source: string, transport?: HttpTransport): { logs: string[]; requests: HttpRequestData[] } {
  const requests: HttpRequestData[] = [];
  const logs: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  });
  const wrapped: HttpTransport | undefined = transport
    ? (request) => {
        requests.push(request);
        return transport(request);
      }
    : undefined;
  try {
    run(source, createGlobalContext(wrapped));
  } finally {
    spy.mockRestore();
  }
  return { logs, requests };
}

function ok(body: string, headers: [string, string][] = [['Content-Type', 'application/json; charset=utf-8']]): HttpResponseData {
  return { status: 200, headers, body: encodeText(body, undefined, false) };
}

const dummy: HttpTransport = () => ({ status: 200, headers: [], body: new Uint8Array(0) });

describe('HTTP: регистрация и конфигурация', () => {
  afterEach(() => vi.restoreAllMocks());

  it('регистрирует типы, пустой запрос и заголовки', () => {
    const { logs } = exec(
      'З = Новый HTTPЗапрос; Сообщить(З.АдресРесурса = ""); Сообщить(З.Заголовки.Количество());' +
        ' З2 = Новый HTTPЗапрос("/x", Новый Соответствие); Сообщить(З2.АдресРесурса);',
    );
    expect(logs).toEqual(['Истина', '0', '/x']);
  });

  it('соединение без транспорта даёт понятную ошибку', () => {
    expect(() => exec('Новый HTTPСоединение("http://example.com");')).toThrow(/HTTP-запросы недоступны/);
  });

  it('валидирует схему, порт и SSL', () => {
    expect(() => exec('Новый HTTPСоединение("ftp://example.com");', dummy)).toThrow(/схем/i);
    expect(() => exec('Новый HTTPСоединение("example.com"); Сообщить(1);', dummy)).not.toThrow();
    expect(() => exec('Новый HTTPСоединение("http://example.com", 70000);', dummy)).toThrow(/порт/i);
    expect(() =>
      exec('Новый HTTPСоединение("http://example.com", 0, "", "", Неопределено, 0, Новый Соответствие);', dummy),
    ).toThrow(/сертификат/i);
  });

  it('Сервер без схемы считается http и даёт хост/порт по умолчанию', () => {
    const { logs } = exec(
      'С = Новый HTTPСоединение("example.com"); Сообщить(С.Сервер); Сообщить(С.Порт);' +
        ' С2 = Новый HTTPСоединение("https://example.com/x"); Сообщить(С2.Порт);',
      dummy,
    );
    expect(logs).toEqual(['example.com', '80', '443']);
  });

  it('Заголовки запроса обязаны быть Соответствием', () => {
    expect(() => exec('Новый HTTPЗапрос("/x", "bad");')).toThrow(/Заголовки/);
  });
});

describe('HTTP: получение данных (US1)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('GET: статус, тело и заголовки ответа', () => {
    const { logs, requests } = exec(
      'Соединение = Новый HTTPСоединение("http://example.com");' +
        'Ответ = Соединение.Получить(Новый HTTPЗапрос("/api/users"));' +
        'Сообщить(Ответ.КодСостояния);' +
        'Сообщить(ПрочитатьJSON(Ответ.ПолучитьТелоКакСтроку()).Имя);' +
        'Сообщить(Ответ.Заголовки.Получить("Content-Type"));',
      () => ok('{"Имя":"Никита"}'),
    );
    expect(requests[0]!.method).toBe('GET');
    expect(requests[0]!.url).toBe('http://example.com/api/users');
    expect(logs).toEqual(['200', 'Никита', 'application/json; charset=utf-8']);
  });

  it('разрешает ресурс относительно базы соединения', () => {
    const { requests } = exec(
      'С1 = Новый HTTPСоединение("https://api.example.com/base/");' +
        'С1.Получить(Новый HTTPЗапрос("users"));' +
        'С1.Получить(Новый HTTPЗапрос("/users"));' +
        'С1.Получить(Новый HTTPЗапрос(""));' +
        'С2 = Новый HTTPСоединение("http://example.com:8080/api", 9090);' +
        'С2.Получить(Новый HTTPЗапрос("x"));',
      () => ok('ok', []),
    );
    expect(requests.map((r) => r.url)).toEqual([
      'https://api.example.com/base/users',
      'https://api.example.com/users',
      'https://api.example.com/base/',
      'http://example.com:9090/x', // база без завершающего слэша: «api» — последний сегмент-файл (как Uri/URL)
    ]);
  });

  it('декодирует тело по charset из Content-Type', () => {
    const cp1251 = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]);
    const { logs } = exec(
      'Ответ = Новый HTTPСоединение("http://example.com").Получить(Новый HTTPЗапрос("/"));' +
        'Сообщить(Ответ.ПолучитьТелоКакСтроку());',
      () => ({ status: 200, headers: [['Content-Type', 'text/plain; charset=windows-1251']], body: cp1251 }),
    );
    expect(logs).toEqual(['Привет']);
  });

  it('явная кодировка переопределяет заголовок', () => {
    const { logs } = exec(
      'Ответ = Новый HTTPСоединение("http://example.com").Получить(Новый HTTPЗапрос("/"));' +
        'Сообщить(Ответ.ПолучитьТелоКакСтроку("windows-1251"));',
      () => ({ status: 200, headers: [['Content-Type', 'text/plain; charset=utf-8']], body: new Uint8Array([0xcf, 0xf0, 0xe8]) }),
    );
    expect(logs).toEqual(['При']);
  });

  it('404 — это ответ, а не исключение', () => {
    const { logs } = exec(
      'Ответ = Новый HTTPСоединение("http://example.com").Получить(Новый HTTPЗапрос("/missing"));' +
        'Сообщить(Ответ.КодСостояния); Сообщить(Ответ.ПолучитьТелоКакСтроку());',
      () => ({ status: 404, headers: [['Content-Type', 'text/plain']], body: encodeText('нет', undefined, false) }),
    );
    expect(logs).toEqual(['404', 'нет']);
  });

  it('тело отсутствует для 204, HEAD и Content-Length: 0', () => {
    const { logs } = exec(
      'С = Новый HTTPСоединение("http://example.com");' +
        'О1 = С.Получить(Новый HTTPЗапрос("/1"));' +
        'О2 = С.ПолучитьЗаголовки(Новый HTTPЗапрос("/2"));' +
        'О3 = С.Получить(Новый HTTPЗапрос("/3"));' +
        'Сообщить(О1.ПолучитьТелоКакСтроку() = Неопределено);' +
        'Сообщить(О2.ПолучитьТелоКакСтроку() = Неопределено);' +
        'Сообщить(О3.ПолучитьТелоКакСтроку() = Неопределено);',
      (request) => {
        if (request.url.endsWith('/1')) return { status: 204, headers: [], body: new Uint8Array(0) };
        if (request.url.endsWith('/3')) return { status: 200, headers: [['Content-Length', '0']], body: new Uint8Array(0) };
        return { status: 200, headers: [['Content-Length', '5']], body: new Uint8Array(0) };
      },
    );
    expect(logs).toEqual(['Истина', 'Истина', 'Истина']);
  });

  it('нормализует gzip: убирает Content-Encoding и пересчитывает Content-Length', () => {
    const { logs } = exec(
      'Ответ = Новый HTTPСоединение("http://example.com").Получить(Новый HTTPЗапрос("/"));' +
        'Сообщить(Ответ.Заголовки.Получить("Content-Encoding") = Неопределено);' +
        'Сообщить(Ответ.Заголовки.Получить("Content-Length"));' +
        'Сообщить(Ответ.ПолучитьТелоКакСтроку());',
      () => ({
        status: 200,
        headers: [
          ['Content-Encoding', 'gzip'],
          ['Content-Length', '999'],
          ['Content-Type', 'text/plain'],
        ],
        body: encodeText('abc', undefined, false),
      }),
    );
    expect(logs).toEqual(['Истина', '3', 'abc']);
  });

  it('Получить с именем файла не поддерживается', () => {
    expect(() => exec('С = Новый HTTPСоединение("http://example.com"); С.Получить(Новый HTTPЗапрос("/"), "out.txt");', dummy)).toThrow(
      /файл/i,
    );
  });
});

describe('HTTP: отправка данных (US2)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('POST: строковое тело UTF-8 и заголовки', () => {
    const { requests } = exec(
      'Запрос = Новый HTTPЗапрос("/api/orders");' +
        'Запрос.Заголовки.Вставить("Content-Type", "application/json");' +
        'Запрос.УстановитьТелоИзСтроки("{""id"": 42}");' +
        'Новый HTTPСоединение("http://example.com").ОтправитьДляОбработки(Запрос);',
      () => ok('ok', []),
    );
    expect(requests[0]!.method).toBe('POST');
    expect(requests[0]!.headers).toContainEqual(['Content-Type', 'application/json']);
    expect(new TextDecoder().decode(requests[0]!.body!)).toBe('{"id": 42}');
  });

  it('PUT с двоичными данными', () => {
    const { requests } = exec(
      'Запрос = Новый HTTPЗапрос("/api/bin");' +
        'Запрос.УстановитьТелоИзДвоичныхДанных(ПолучитьДвоичныеДанныеИзHexСтроки("A1B2"));' +
        'Новый HTTPСоединение("http://example.com").Записать(Запрос);',
      () => ok('ok', []),
    );
    expect(requests[0]!.method).toBe('PUT');
    expect(Array.from(requests[0]!.body!)).toEqual([0xa1, 0xb2]);
  });

  it('DELETE, PATCH, HEAD и произвольный метод', () => {
    const { requests, logs } = exec(
      'С = Новый HTTPСоединение("http://example.com");' +
        'С.Удалить(Новый HTTPЗапрос("/d"));' +
        'С.Изменить(Новый HTTPЗапрос("/p"));' +
        'О = С.ПолучитьЗаголовки(Новый HTTPЗапрос("/h"));' +
        'С.ВызватьHTTPМетод("OPTIONS", Новый HTTPЗапрос("/o"));' +
        'Сообщить(О.ПолучитьТелоКакСтроку() = Неопределено);',
      () => ok('ok', [['Content-Length', '2']]),
    );
    expect(requests.map((r) => r.method)).toEqual(['DELETE', 'PATCH', 'HEAD', 'OPTIONS']);
    expect(logs).toEqual(['Истина']);
  });

  it('тело для GET/HEAD не отправляется', () => {
    const { requests } = exec(
      'С = Новый HTTPСоединение("http://example.com");' +
        'З1 = Новый HTTPЗапрос("/g"); З1.УстановитьТелоИзСтроки("x"); С.Получить(З1);' +
        'З2 = Новый HTTPЗапрос("/h"); З2.УстановитьТелоИзСтроки("x"); С.ПолучитьЗаголовки(З2);',
      () => ok('ok', []),
    );
    expect(requests.map((r) => r.body)).toEqual([null, null]);
  });

  it('нереализованные файловые и потоковые методы дают ошибку', () => {
    expect(() => exec('З = Новый HTTPЗапрос; З.УстановитьИмяФайлаТела("x");')).toThrow(/не найден/);
    expect(() => exec('О = Новый HTTPСоединение("http://example.com").Получить(Новый HTTPЗапрос("/")); О.ПолучитьТелоКакПоток();', dummy)).toThrow(
      /не найден/,
    );
  });
});

describe('HTTP: параметры и ошибки (US3)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('basic-auth и свойства соединения', () => {
    const { requests, logs } = exec(
      'С = Новый HTTPСоединение("http://example.com:8080", 0, "user", "pass", Неопределено, 5);' +
        'Сообщить(С.Сервер); Сообщить(С.Порт); Сообщить(С.Пользователь); Сообщить(С.Пароль);' +
        'Сообщить(С.Таймаут); Сообщить(С.РазрешитьАвтоматическоеПеренаправление);' +
        'С.РазрешитьАвтоматическоеПеренаправление = Ложь;' +
        'Сообщить(С.РазрешитьАвтоматическоеПеренаправление);' +
        'Сообщить(С.Прокси = Неопределено);' +
        'С.Получить(Новый HTTPЗапрос("/"));',
      () => ok('ok', []),
    );
    expect(logs).toEqual(['example.com', '8080', 'user', 'pass', '5', 'Истина', 'Ложь', 'Истина']);
    expect(requests[0]!.headers).toContainEqual(['Authorization', 'Basic dXNlcjpwYXNz']);
    expect(requests[0]!.timeoutMs).toBe(5000);
    expect(requests[0]!.allowRedirect).toBe(false);
  });

  it('Таймаут 0 — без ограничения, редирект включён по умолчанию', () => {
    const { requests } = exec('Новый HTTPСоединение("http://example.com").Получить(Новый HTTPЗапрос("/"));', () => ok('ok', []));
    expect(requests[0]!.timeoutMs).toBe(0);
    expect(requests[0]!.allowRedirect).toBe(true);
  });

  it('Закрыть освобождает тело и идемпотентен', () => {
    const { logs } = exec(
      'О = Новый HTTPСоединение("http://example.com").Получить(Новый HTTPЗапрос("/"));' +
        'О.Закрыть(); О.Закрыть();' +
        'Сообщить(О.ПолучитьТелоКакСтроку() = Неопределено); Сообщить(О.КодСостояния);',
      () => ok('abc', []),
    );
    expect(logs).toEqual(['Истина', '200']);
  });

  it('сетевая ошибка содержит метод, URL и причину', () => {
    expect(() =>
      exec('Новый HTTPСоединение("http://example.com").Получить(Новый HTTPЗапрос("/api"));', () => {
        throw new Error('boom');
      }),
    ).toThrow(/GET .*http:\/\/example\.com\/api.*boom/);
  });

  it('неизвестное свойство и запись read-only свойства — ошибки', () => {
    expect(() => exec('С = Новый HTTPСоединение("http://example.com"); С.Чегото;', dummy)).toThrow(/не найден/);
    expect(() => exec('С = Новый HTTPСоединение("http://example.com"); С.Сервер = "x";', dummy)).toThrow(/недоступно/);
  });

  it('Двоичные данные ответа доступны через ПолучитьТелоКакДвоичныеДанные', () => {
    const { logs } = exec(
      'О = Новый HTTPСоединение("http://example.com").Получить(Новый HTTPЗапрос("/"));' +
        'Д = О.ПолучитьТелоКакДвоичныеДанные(); Сообщить(Д.Размер());',
      () => ({ status: 200, headers: [], body: new Uint8Array([1, 2, 3]) }),
    );
    expect(logs).toEqual(['3']);
  });
});

describe('HTTP: английские имена', () => {
  afterEach(() => vi.restoreAllMocks());

  it('HTTPConnection/HTTPRequest и англоязычные методы', () => {
    const { logs, requests } = exec(
      'Запрос = New HTTPRequest("/en");' +
        'Запрос.SetBodyFromString("abc");' +
        'Запрос.Headers.Insert("X-Test", "1");' +
        'Ответ = New HTTPConnection("http://example.com").Post(Запрос);' +
        'Сообщить(Ответ.StatusCode);' +
        'Сообщить(Ответ.GetBodyAsString());' +
        'Сообщить(Ответ.Headers.Get("X-Test"));',
      () => ({ status: 201, headers: [['X-Test', 'yes']], body: encodeText('created', undefined, false) }),
    );
    expect(logs).toEqual(['201', 'created', 'yes']);
    expect(requests[0]!.method).toBe('POST');
    expect(new TextDecoder().decode(requests[0]!.body!)).toBe('abc');
  });
});
