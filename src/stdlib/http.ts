import type { BslObject } from '../runtime/object';
import { isBslObject } from '../runtime/object';
import type { GlobalContext } from '../runtime/context';
import type { Value } from '../runtime/values';
import { toBoolean, toNumber, toStringValue } from '../runtime/values';
import { BslMap } from './collections/map';
import { BslBinaryData, decodeText, encodeText, toBase64 } from './binary';

/** Запрос, который исполняет платформенный транспорт (уже с абсолютным URL). */
export interface HttpRequestData {
  method: string;
  url: string;
  headers: readonly [string, string][];
  body: Uint8Array | null;
  /** 0 — без таймаута. */
  timeoutMs: number;
  allowRedirect: boolean;
}

/** Ответ платформенного транспорта: тело всегда байты, статус — любой. */
export interface HttpResponseData {
  status: number;
  headers: [string, string][];
  body: Uint8Array;
}

/** Синхронный транспорт HTTP: браузер — XHR, Node — дочерний процесс с fetch. */
export type HttpTransport = (request: HttpRequestData) => HttpResponseData;

const NO_TRANSPORT = 'HTTP-запросы недоступны в этом окружении';
const BODY_FORBIDDEN = new Set(['GET', 'HEAD', 'CONNECT']);
const REDIRECT_PROPERTIES = new Set(['разрешитьавтоматическоеперенаправление', 'allowautoredirect']);

// --- заголовки (Соответствие) ---

function headerEntries(headers: BslMap): [string, string][] {
  const entries: [string, string][] = [];
  for (const key of headers.iterate?.() ?? []) {
    entries.push([toStringValue(key), toStringValue(headers.getIndex(key))]);
  }
  return entries;
}

function mapFromEntries(entries: readonly [string, string][]): BslMap {
  const map = new BslMap([]);
  for (const [name, value] of entries) map.callMethod('Вставить', [name, value]);
  return map;
}

function findHeader(headers: BslMap, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const key of headers.iterate?.() ?? []) {
    if (toStringValue(key).toLowerCase() === lower) return toStringValue(headers.getIndex(key));
  }
  return undefined;
}

function setHeader(headers: BslMap, name: string, value: string): void {
  const lower = name.toLowerCase();
  for (const key of headers.iterate?.() ?? []) {
    if (toStringValue(key).toLowerCase() === lower) {
      headers.callMethod('Вставить', [key, value]);
      return;
    }
  }
  headers.callMethod('Вставить', [name, value]);
}

function deleteHeader(headers: BslMap, name: string): void {
  const lower = name.toLowerCase();
  for (const key of headers.iterate?.() ?? []) {
    if (toStringValue(key).toLowerCase() === lower) headers.callMethod('Удалить', [key]);
  }
}

function charsetOf(headers: BslMap): string {
  const contentType = findHeader(headers, 'content-type');
  if (!contentType) return 'utf-8';
  const match = /charset\s*=\s*"?([^";]+)"?/i.exec(contentType);
  return match?.[1]?.trim() || 'utf-8';
}

// --- URL ---

function parseBaseUrl(raw: string): URL {
  let value = raw.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) value = `http://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Недопустимый адрес сервера: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Недопустимая схема адреса: ${url.protocol.replace(':', '')} (поддерживаются http и https)`);
  }
  return url;
}

// --- HTTPЗапрос ---

/** `HTTPЗапрос`/`HTTPRequest` — адрес ресурса, заголовки и тело запроса. */
export class BslHttpRequest implements BslObject {
  readonly typeName = 'HTTPЗапрос';
  private resource = '';
  private headers = new BslMap([]);
  private body: Uint8Array | null = null;

  constructor(args: Value[]) {
    const resource = args[0];
    if (resource !== undefined && resource !== null) this.resource = toStringValue(resource);
    const headers = args[1];
    if (headers !== undefined && headers !== null) this.headers = asHeadersMap(headers);
  }

  getResource(): string {
    return this.resource;
  }

  getHeaders(): BslMap {
    return this.headers;
  }

  getBody(): Uint8Array | null {
    return this.body;
  }

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'установитьтелоизстроки':
      case 'setbodyfromstring':
        this.body = encodeText(toStringValue(args[0] ?? ''), args[1], false);
        return undefined;
      case 'получитьтелокакстроку':
      case 'getbodyasstring':
        return this.body === null ? undefined : decodeText(this.body, undefined);
      case 'установитьтелоиздвоичныхданных':
      case 'setbodyfrombinarydata':
        this.body = asBinaryData(args[0]).bytes;
        return undefined;
      case 'получитьтелокакдвоичныеданные':
      case 'getbodyasbinarydata':
        return this.body === null ? undefined : new BslBinaryData(this.body);
      default:
        throw new Error(`Метод '${name}' не найден у типа ${this.typeName}`);
    }
  }

  getProp(name: string): Value {
    switch (name.toLowerCase()) {
      case 'адресресурса':
      case 'resourceaddress':
        return this.resource;
      case 'заголовки':
      case 'headers':
        return this.headers;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа ${this.typeName}`);
    }
  }

  setProp(name: string, value: Value): void {
    switch (name.toLowerCase()) {
      case 'адресресурса':
      case 'resourceaddress':
        this.resource = toStringValue(value);
        return;
      case 'заголовки':
      case 'headers':
        this.headers = asHeadersMap(value);
        return;
      default:
        throw new Error(`Свойство '${name}' недоступно для записи`);
    }
  }

  getIndex(): Value {
    throw new Error(`Индексация недоступна для типа ${this.typeName}`);
  }

  setIndex(): void {
    throw new Error(`Индексация недоступна для типа ${this.typeName}`);
  }
}

// --- HTTPОтвет ---

/** `HTTPОтвет`/`HTTPResponse` — статус, заголовки и тело ответа. */
export class BslHttpResponse implements BslObject {
  readonly typeName = 'HTTPОтвет';
  private body: Uint8Array | null;

  constructor(
    readonly status: number,
    readonly headers: BslMap,
    body: Uint8Array | null,
    private readonly defaultCharset: string,
  ) {
    this.body = body;
  }

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'получитьтелокакстроку':
      case 'getbodyasstring': {
        if (this.body === null) return undefined;
        const encoding = args[0] === undefined || args[0] === null ? this.defaultCharset : args[0];
        return decodeText(this.body, encoding);
      }
      case 'получитьтелокакдвоичныеданные':
      case 'getbodyasbinarydata':
        return this.body === null ? undefined : new BslBinaryData(this.body);
      case 'закрыть':
      case 'close':
        this.body = null;
        return undefined;
      default:
        throw new Error(`Метод '${name}' не найден у типа ${this.typeName}`);
    }
  }

  getProp(name: string): Value {
    switch (name.toLowerCase()) {
      case 'кодсостояния':
      case 'statuscode':
        return this.status;
      case 'заголовки':
      case 'headers':
        return this.headers;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа ${this.typeName}`);
    }
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(): Value {
    throw new Error(`Индексация недоступна для типа ${this.typeName}`);
  }

  setIndex(): void {
    throw new Error(`Индексация недоступна для типа ${this.typeName}`);
  }
}

// --- HTTPСоединение ---

/** `HTTPСоединение`/`HTTPConnection` — параметры сервера и операции над ресурсами. */
export class BslHttpConnection implements BslObject {
  readonly typeName = 'HTTPСоединение';
  private readonly baseUrl: URL;
  private readonly host: string;
  private readonly port: number;
  private readonly user: string;
  private readonly password: string;
  private readonly timeout: number;
  private readonly useOSAuth: boolean;
  private readonly transport: HttpTransport;
  private allowAutoRedirect = true;

  constructor(args: Value[], transport: HttpTransport | undefined) {
    if (!transport) throw new Error(NO_TRANSPORT);
    const rawHost = toStringValue(args[0] ?? '');
    if (rawHost.trim() === '') throw new Error('Не указан сервер');
    const url = parseBaseUrl(rawHost);

    const port = args[1] === undefined || args[1] === null ? 0 : toNumber(args[1]);
    if (port !== 0) {
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Недопустимый порт: ${port}`);
      url.port = String(port);
    }

    const ssl = args[6];
    if (ssl !== undefined && ssl !== null) {
      throw new Error(
        'Защищенное соединение по произвольным сертификатам не поддерживается. Укажите протокол https в адресе хоста.',
      );
    }

    this.transport = transport;
    this.baseUrl = url;
    this.host = url.hostname;
    this.port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
    this.user = args[2] === undefined || args[2] === null ? '' : toStringValue(args[2]);
    this.password = args[3] === undefined || args[3] === null ? '' : toStringValue(args[3]);
    this.timeout = args[5] === undefined || args[5] === null ? 0 : toNumber(args[5]);
    if (this.timeout < 0) throw new Error(`Недопустимый таймаут: ${this.timeout}`);
    this.useOSAuth = args[7] !== undefined && args[7] !== null ? toBoolean(args[7]) : false;
  }

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'получить':
      case 'get':
        return this.getResponse(args[0], 'GET', args[1]);
      case 'отправитьдляобработки':
      case 'post':
        return this.getResponse(args[0], 'POST', args[1]);
      case 'записать':
      case 'put':
        return this.getResponse(args[0], 'PUT');
      case 'удалить':
      case 'delete':
        return this.getResponse(args[0], 'DELETE');
      case 'изменить':
      case 'patch':
        return this.getResponse(args[0], 'PATCH');
      case 'получитьзаголовки':
      case 'head':
        return this.getResponse(args[0], 'HEAD');
      case 'вызватьhttpметод':
      case 'callhttpmethod':
        return this.getResponse(args[1], toStringValue(args[0] ?? ''), args[2]);
      default:
        throw new Error(`Метод '${name}' не найден у типа ${this.typeName}`);
    }
  }

  getProp(name: string): Value {
    switch (name.toLowerCase()) {
      case 'сервер':
      case 'host':
        return this.host;
      case 'порт':
      case 'port':
        return this.port;
      case 'пользователь':
      case 'user':
        return this.user;
      case 'пароль':
      case 'password':
        return this.password;
      case 'прокси':
      case 'proxy':
        return undefined;
      case 'таймаут':
      case 'timeout':
        return this.timeout;
      case 'разрешитьавтоматическоеперенаправление':
      case 'allowautoredirect':
        return this.allowAutoRedirect;
      case 'использоватьаутентификациюос':
      case 'useosauthentication':
        return this.useOSAuth;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа ${this.typeName}`);
    }
  }

  setProp(name: string, value: Value): void {
    if (REDIRECT_PROPERTIES.has(name.toLowerCase())) {
      this.allowAutoRedirect = toBoolean(value);
      return;
    }
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(): Value {
    throw new Error(`Индексация недоступна для типа ${this.typeName}`);
  }

  setIndex(): void {
    throw new Error(`Индексация недоступна для типа ${this.typeName}`);
  }

  private getResponse(requestValue: Value, method: string, output?: Value): BslHttpResponse {
    if (output !== undefined && output !== null && toStringValue(output) !== '') {
      throw new Error('Запись ответа в файл не поддерживается');
    }
    if (!(isBslObject(requestValue) && requestValue instanceof BslHttpRequest)) {
      throw new Error('Неверный тип аргумента: ожидался HTTPЗапрос');
    }
    const url = new URL(requestValue.getResource(), this.baseUrl);
    const headers = headerEntries(requestValue.getHeaders());
    if (this.user !== '' || this.password !== '') {
      const credentials = toBase64(encodeText(`${this.user}:${this.password}`, undefined, false));
      upsertHeader(headers, 'Authorization', `Basic ${credentials}`);
    }

    const upper = method.toUpperCase();
    const data: HttpRequestData = {
      method: upper,
      url: url.toString(),
      headers,
      body: BODY_FORBIDDEN.has(upper) ? null : requestValue.getBody(),
      timeoutMs: this.timeout > 0 ? this.timeout * 1000 : 0,
      allowRedirect: this.allowAutoRedirect,
    };

    let response: HttpResponseData;
    try {
      response = this.transport(data);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Не удалось выполнить HTTP-запрос ${upper} ${data.url}: ${reason}`);
    }
    return buildResponse(response, upper);
  }
}

// --- общие проверки и сборка ответа ---

function asHeadersMap(value: Value): BslMap {
  if (!(isBslObject(value) && value instanceof BslMap)) {
    throw new Error('Неверный тип аргумента: Заголовки должны быть Соответствием');
  }
  return value;
}

function asBinaryData(value: Value): BslBinaryData {
  if (!(isBslObject(value) && value instanceof BslBinaryData)) {
    throw new Error('Неверный тип аргумента: ожидались ДвоичныеДанные');
  }
  return value;
}

function upsertHeader(entries: [string, string][], name: string, value: string): void {
  const lower = name.toLowerCase();
  const index = entries.findIndex(([key]) => key.toLowerCase() === lower);
  if (index === -1) entries.push([name, value]);
  else entries[index] = [entries[index]![0], value];
}

function bodyIsAbsent(status: number, method: string, headers: BslMap): boolean {
  if (method === 'HEAD' || status === 204 || status === 304) return true;
  return findHeader(headers, 'content-length') === '0';
}

function buildResponse(data: HttpResponseData, method: string): BslHttpResponse {
  const headers = mapFromEntries(data.headers);
  const contentEncoding = findHeader(headers, 'content-encoding');
  if (contentEncoding !== undefined && contentEncoding.toLowerCase() !== 'identity') {
    deleteHeader(headers, 'content-encoding');
    setHeader(headers, 'Content-Length', String(data.body.length));
  }
  const body = bodyIsAbsent(data.status, method, headers) ? null : data.body;
  return new BslHttpResponse(data.status, headers, body, charsetOf(headers));
}

/** Регистрирует типы HTTP-клиента; без транспорта соединение создавать нельзя. */
export function registerHttpFunctions(ctx: GlobalContext, httpTransport?: HttpTransport): void {
  ctx.registerType('HTTPЗапрос', (args) => new BslHttpRequest(args));
  ctx.registerType('HTTPRequest', (args) => new BslHttpRequest(args));
  ctx.registerType('HTTPСоединение', (args) => new BslHttpConnection(args, httpTransport));
  ctx.registerType('HTTPConnection', (args) => new BslHttpConnection(args, httpTransport));
}
