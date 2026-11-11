import type { HttpRequestData, HttpResponseData, HttpTransport } from '../stdlib/http';

/**
 * Браузерный транспорт: синхронный XMLHttpRequest.
 *
 * `responseType = 'arraybuffer'` для синхронных запросов запрещён, поэтому тело
 * читается как текст с переопределённым charset `x-user-defined`: байты 0x80–0xFF
 * приходят как U+F780–U+F7FF, и `charCodeAt(i) & 0xff` возвращает исходный байт.
 */
export function createBrowserHttpTransport(): HttpTransport {
  return (request: HttpRequestData): HttpResponseData => {
    const Xhr = (globalThis as { XMLHttpRequest?: typeof XMLHttpRequest }).XMLHttpRequest;
    if (!Xhr) throw new Error('XMLHttpRequest недоступен в этом окружении');

    const xhr = new Xhr();
    xhr.open(request.method, request.url, false);
    xhr.overrideMimeType('text/plain; charset=x-user-defined');
    for (const [name, value] of request.headers) {
      try {
        xhr.setRequestHeader(name, value);
      } catch {
        // Браузер запрещает часть заголовков (User-Agent, Cookie и т.п.) — это не ошибка скрипта.
      }
    }

    try {
      // Uint8Array — валидный BodyInit; приведение снимает расхождение типов lib.dom и TS 5.9.
      xhr.send(request.body === null ? null : (request.body as unknown as XMLHttpRequestBodyInit));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
    if (xhr.status === 0) throw new Error('нет ответа сервера (сеть или CORS)');

    return {
      status: xhr.status,
      headers: parseResponseHeaders(xhr.getAllResponseHeaders()),
      body: bytesFromBinaryText(xhr.responseText),
    };
  };
}

function bytesFromBinaryText(text: string): Uint8Array {
  // В браузере x-user-defined возвращает байты как U+F780–U+F7FF. Если платформа
  // проигнорировала overrideMimeType (например, happy-dom) и уже декодировала текст,
  // восстанавливаем исходные UTF-8 байты обратным кодированием.
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0xff && (code < 0xf780 || code > 0xf7ff)) return new TextEncoder().encode(text);
  }
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

function parseResponseHeaders(raw: string): [string, string][] {
  const headers: [string, string][] = [];
  for (const line of raw.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    headers.push([line.slice(0, separator).trim(), line.slice(separator + 1).trim()]);
  }
  return headers;
}
