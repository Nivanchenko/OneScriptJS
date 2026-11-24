import { PassThrough } from 'node:stream';

/**
 * In-memory DAP-клиент для интеграционных тестов адаптера.
 *
 * Адаптер общается по stdio-контракту `Content-Length: N\r\n\r\n<json>`; здесь
 * тот же фрейминг, но поверх двух `PassThrough`, поэтому спавн процесса не нужен.
 * Читатель сообщений отделён от клиента: тот же класс использует stdio-smoke.
 */

/** DAP-сообщение в объёме, который нужен тестам (request/response/event). */
export interface DapMessage {
  seq: number;
  type: 'request' | 'response' | 'event';
  command?: string;
  event?: string;
  request_seq?: number;
  success?: boolean;
  body?: Record<string, unknown>;
  message?: string;
}

type Match = (message: DapMessage) => boolean;

interface Waiter {
  match: Match;
  resolve(message: DapMessage): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
  label: string;
}

/** Разбирает поток DAP-сообщений и умеет ждать сообщение по предикату. */
export class DapStreamReader {
  private buffer = Buffer.alloc(0);
  private readonly inbox: DapMessage[] = [];
  private readonly waiters: Waiter[] = [];
  private disposed = false;
  private readonly onData = (chunk: Buffer): void => this.push(chunk);

  constructor(private readonly stream: NodeJS.ReadableStream) {
    stream.on('data', this.onData);
  }

  /** Ждёт первое подходящее сообщение; уже пришедшие сообщения не теряются. */
  waitFor(match: Match, timeout = 5000, label = 'DAP-сообщение'): Promise<DapMessage> {
    const index = this.inbox.findIndex(match);
    if (index >= 0) return Promise.resolve(this.inbox.splice(index, 1)[0]!);
    if (this.disposed) return Promise.reject(new Error(`DAP-клиент закрыт (${label})`));
    return new Promise<DapMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const at = this.waiters.findIndex((waiter) => waiter.timer === timer);
        if (at >= 0) this.waiters.splice(at, 1);
        const received = this.inbox.map(describeMessage).join(', ');
        reject(new Error(`DAP: таймаут ${timeout} мс, ожидалось ${label}; получено: [${received}]`));
      }, timeout);
      this.waiters.push({ match, resolve, reject, timer, label });
    });
  }

  dispose(): void {
    this.disposed = true;
    this.stream.removeListener('data', this.onData);
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(`DAP-клиент закрыт, ожидание «${waiter.label}» отменено`));
    }
  }

  private push(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString('ascii');
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) throw new Error(`DAP: нет Content-Length в заголовке «${header}»`);
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (this.buffer.length < start + length) return;
      const payload = this.buffer.subarray(start, start + length).toString('utf8');
      this.buffer = this.buffer.subarray(start + length);
      this.deliver(JSON.parse(payload) as DapMessage);
    }
  }

  private deliver(message: DapMessage): void {
    const index = this.waiters.findIndex((waiter) => waiter.match(message));
    if (index >= 0) {
      const waiter = this.waiters.splice(index, 1)[0]!;
      clearTimeout(waiter.timer);
      waiter.resolve(message);
      return;
    }
    this.inbox.push(message);
  }
}

/** DAP-клиент: пишет запросы адаптеру и читает его ответы/события. */
export class DapClient {
  readonly toAdapter = new PassThrough();
  readonly fromAdapter = new PassThrough();
  private readonly reader = new DapStreamReader(this.fromAdapter);
  private nextSeq = 0;

  /** Подключает клиент к сессии адаптера (`start(inStream, outStream)`). */
  start(session: { start(inStream: NodeJS.ReadableStream, outStream: NodeJS.WritableStream): void }): void {
    session.start(this.toAdapter, this.fromAdapter);
  }

  sendRequest(
    command: string,
    args?: Record<string, unknown>,
    timeout = 5000,
  ): Promise<DapMessage> {
    const seq = ++this.nextSeq;
    const response = this.reader.waitFor(
      (message) => message.type === 'response' && message.request_seq === seq,
      timeout,
      `ответ на ${command}`,
    );
    this.write({ seq, type: 'request', command, arguments: args ?? {} });
    return response;
  }

  waitForEvent(event: string, timeout = 5000): Promise<DapMessage> {
    return this.reader.waitFor(
      (message) => message.type === 'event' && message.event === event,
      timeout,
      `событие ${event}`,
    );
  }

  waitForResponse(seq: number, timeout = 5000): Promise<DapMessage> {
    return this.reader.waitFor(
      (message) => message.type === 'response' && message.request_seq === seq,
      timeout,
      `ответ #${seq}`,
    );
  }

  dispose(): void {
    this.reader.dispose();
    // Снимаем слушатели адаптера до destroy: 'close' входного потока завершил бы
    // процесс теста через DebugSession.shutdown().
    this.toAdapter.removeAllListeners();
    this.toAdapter.destroy();
    this.fromAdapter.destroy();
  }

  private write(message: object): void {
    const json = JSON.stringify(message);
    this.toAdapter.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`);
  }
}

function describeMessage(message: DapMessage): string {
  if (message.type === 'event') return `event:${message.event}`;
  if (message.type === 'response') return `response:${message.command ?? '?'}`;
  return `request:${message.command ?? '?'}`;
}
