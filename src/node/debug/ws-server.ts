import type { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { RawData } from 'ws';
import type { AdapterMessage, PageMessage } from '../../debug/page-protocol';

/**
 * WebSocket-транспорт до page-agent (браузерный attach).
 *
 * Слушает только `127.0.0.1`: страница и адаптер живут на одной машине.
 * Одна сессия: первая вкладка принимается, вторая получает `rejected` и close
 * 1013 (Try Again Later) — как в эталонном отладчике OneScript.
 */

/** Транспорт одной страницы: адаптер видит только эти четыре операции. */
export interface PageTransport {
  send(message: AdapterMessage): void;
  onMessage(callback: (message: PageMessage) => void): void;
  onClose(callback: () => void): void;
  close(): void;
}

export interface WsServerOptions {
  /** Порт; по умолчанию 9229. `0` — свободный порт (нужно тестам). */
  port?: number;
  /** Необязательный общий секрет: сверяется с `hello.token`. */
  token?: string;
  /** Необязательный разрешённый Origin (строка или список). */
  origin?: string | readonly string[];
  host?: string;
}

export interface DebugWsServer {
  readonly port: number;
  /** Ждёт подключения страницы; таймаут — ошибка с понятным текстом. */
  waitForClient(timeoutMs: number): Promise<PageTransport>;
  close(): void;
}

const DEFAULT_PORT = 9229;
const CLOSE_REJECTED = 1013;

export async function createWsServer(options: WsServerOptions = {}): Promise<DebugWsServer> {
  const host = options.host ?? '127.0.0.1';
  const requestedPort = options.port ?? DEFAULT_PORT;
  const origins = normalizeOrigins(options.origin);
  const wss = new WebSocketServer({ host, port: requestedPort });

  try {
    await new Promise<void>((resolve, reject) => {
      const onListening = (): void => {
        wss.off('error', onError);
        resolve();
      };
      const onError = (error: NodeJS.ErrnoException): void => {
        wss.off('listening', onListening);
        reject(describeListenError(error, host, requestedPort));
      };
      wss.once('listening', onListening);
      wss.once('error', onError);
    });
  } catch (error) {
    try {
      wss.close();
    } catch {
      // сервер не поднялся — закрывать нечего
    }
    throw error;
  }

  // После `listening` ошибки сокетов обрабатываются на самих сокетах; на сервере
  // оставляем no-op, чтобы необработанный 'error' не уронил процесс.
  wss.on('error', () => undefined);
  const sockets = new Set<WebSocket>();
  const waiters: Array<{
    resolve(transport: PageTransport): void;
    reject(error: Error): void;
    timer: NodeJS.Timeout;
  }> = [];
  let accepted = false;
  let pendingTransport: PageTransport | undefined;
  let closed = false;

  const address = wss.address();
  const port = typeof address === 'object' && address !== null ? address.port : requestedPort;

  wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    if (closed) {
      socket.close(CLOSE_REJECTED);
      return;
    }
    if (!originAllowed(request.headers.origin, origins)) {
      rejectSocket(socket, 'Origin страницы не разрешён для отладчика');
      return;
    }
    if (accepted) {
      rejectSocket(socket, 'Сессия отладки уже занята другой вкладкой');
      return;
    }
    accepted = true;
    sockets.add(socket);
    const transport = new SocketPageTransport(socket, options.token);
    const waiter = waiters.shift();
    if (waiter !== undefined) {
      clearTimeout(waiter.timer);
      waiter.resolve(transport);
    } else {
      pendingTransport = transport;
    }
    socket.on('close', () => sockets.delete(socket));
  });

  return {
    port,
    waitForClient(timeoutMs: number): Promise<PageTransport> {
      if (pendingTransport !== undefined) {
        const transport = pendingTransport;
        pendingTransport = undefined;
        return Promise.resolve(transport);
      }
      return new Promise<PageTransport>((resolve, reject) => {
        const timer = setTimeout(() => {
          const at = waiters.findIndex((waiter) => waiter.timer === timer);
          if (at >= 0) waiters.splice(at, 1);
          reject(new Error('Клиент отладчика не подключился: откройте страницу с onescript-debug.js'));
        }, timeoutMs);
        waiters.push({ resolve, reject, timer });
      });
    },
    close(): void {
      if (closed) return;
      closed = true;
      for (const waiter of waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error('Сервер отладчика остановлен'));
      }
      for (const socket of sockets) {
        try {
          socket.close();
        } catch {
          // сокет уже закрыт
        }
      }
      sockets.clear();
      try {
        wss.close();
      } catch {
        // сервер уже закрыт
      }
    },
  };
}

/** Транспорт поверх одного сокета: буферизует сообщения до подписки адаптера. */
class SocketPageTransport implements PageTransport {
  private readonly inbox: PageMessage[] = [];
  private readonly messageHandlers: Array<(message: PageMessage) => void> = [];
  private readonly closeHandlers: Array<() => void> = [];
  private closed = false;

  constructor(
    private readonly socket: WebSocket,
    private readonly token?: string,
  ) {
    socket.on('message', (data: RawData) => this.receive(data));
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
  }

  send(message: AdapterMessage): void {
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) return;
    try {
      this.socket.send(JSON.stringify(message));
    } catch {
      // закрытие сокета во время отправки не должно ломать DAP-сессию
    }
  }

  onMessage(callback: (message: PageMessage) => void): void {
    this.messageHandlers.push(callback);
    for (const message of this.inbox.splice(0)) callback(message);
  }

  onClose(callback: () => void): void {
    if (this.closed) callback();
    else this.closeHandlers.push(callback);
  }

  close(): void {
    this.finish();
    try {
      this.socket.close();
    } catch {
      // сокет уже закрыт
    }
  }

  private receive(data: RawData): void {
    let message: PageMessage;
    try {
      message = JSON.parse(data.toString()) as PageMessage;
    } catch {
      return; // мусор в сокете не должен ронять сессию
    }
    if (this.token !== undefined && message.type === 'hello' && message.token !== this.token) {
      this.send({ type: 'rejected', reason: 'Неверный token отладчика' });
      this.close();
      return;
    }
    if (this.messageHandlers.length === 0) {
      this.inbox.push(message);
      return;
    }
    for (const handler of this.messageHandlers) handler(message);
  }

  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    for (const handler of this.closeHandlers.splice(0)) handler();
  }
}

function rejectSocket(socket: WebSocket, reason: string): void {
  try {
    socket.send(JSON.stringify({ type: 'rejected', reason }));
  } catch {
    // сокет мог закрыться до отправки
  }
  socket.close(CLOSE_REJECTED);
}

function normalizeOrigins(origin: string | readonly string[] | undefined): string[] | undefined {
  if (origin === undefined) return undefined;
  return typeof origin === 'string' ? [origin] : [...origin];
}

function originAllowed(
  requestOrigin: string | undefined,
  allowed: string[] | undefined,
): boolean {
  if (allowed === undefined) return true;
  return requestOrigin !== undefined && allowed.includes(requestOrigin);
}

function describeListenError(
  error: NodeJS.ErrnoException,
  host: string,
  port: number,
): Error {
  if (error.code === 'EADDRINUSE') {
    return new Error(
      `Порт ${port} уже занят: закройте другую сессию отладки или укажите другой "port" в конфигурации attach`,
    );
  }
  return new Error(`Не удалось запустить WebSocket-сервер на ${host}:${port}: ${error.message}`);
}
