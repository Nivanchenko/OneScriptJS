import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { AdapterMessage, PageMessage } from '../src/debug/page-protocol';
import { createWsServer } from '../src/node/debug/ws-server';
import type { DebugWsServer } from '../src/node/debug/ws-server';

/**
 * WebSocket-транспорт attach: одна сессия, token/Origin, понятная ошибка
 * занятого порта. Проверяется на настоящем сокете (порт 0 — свободный).
 */

const servers: DebugWsServer[] = [];
const sockets: WebSocket[] = [];

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.terminate();
  for (const server of servers.splice(0)) server.close();
});

async function startServer(options: { token?: string; origin?: string } = {}): Promise<DebugWsServer> {
  const server = await createWsServer({ port: 0, ...options });
  servers.push(server);
  return server;
}

/** Клиент с очередью входящих: сервер может ответить раньше, чем тест подпишется. */
interface TestClient {
  socket: WebSocket;
  next(timeout?: number): Promise<PageMessage | AdapterMessage>;
}

function connect(url: string, origin?: string): Promise<TestClient> {
  return new Promise<TestClient>((resolve, reject) => {
    const socket = new WebSocket(url, origin === undefined ? undefined : { origin });
    sockets.push(socket);
    const inbox: Array<PageMessage | AdapterMessage> = [];
    const waiters: Array<(message: PageMessage | AdapterMessage) => void> = [];
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString()) as PageMessage | AdapterMessage;
      const waiter = waiters.shift();
      if (waiter === undefined) inbox.push(message);
      else waiter(message);
    });
    const next = (timeout = 2000): Promise<PageMessage | AdapterMessage> => {
      const queued = inbox.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      return new Promise<PageMessage | AdapterMessage>((resolveNext, rejectNext) => {
        const timer = setTimeout(() => rejectNext(new Error('Сокет не прислал сообщение')), timeout);
        waiters.push((message) => {
          clearTimeout(timer);
          resolveNext(message);
        });
      });
    };
    socket.once('open', () => resolve({ socket, next }));
    socket.once('error', reject);
  });
}

function waitClosed(socket: WebSocket, timeout = 2000): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Сокет не закрылся')), timeout);
    socket.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function hello(token?: string): string {
  return JSON.stringify({
    type: 'hello',
    v: 1,
    ...(token === undefined ? {} : { token }),
    pageUrl: 'http://localhost:5173/',
    baseURI: 'http://localhost:5173/',
    blocks: [],
  });
}

describe('WebSocket-транспорт отладчика', () => {
  it('принимает одну сессию, вторая получает rejected и close 1013', async () => {
    const server = await startServer();
    const client = await connect(`ws://127.0.0.1:${server.port}`);
    const transport = await server.waitForClient(2000);
    const received: PageMessage[] = [];
    transport.onMessage((message) => received.push(message));

    client.socket.send(hello());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received.map((message) => message.type)).toEqual(['hello']);
    transport.send({ type: 'helloAck', sessionId: 's' });
    expect(await client.next()).toMatchObject({ type: 'helloAck', sessionId: 's' });

    const second = await connect(`ws://127.0.0.1:${server.port}`);
    expect(await second.next()).toMatchObject({ type: 'rejected' });
    await waitClosed(second.socket);
  });

  it('отклоняет hello с неверным token', async () => {
    const server = await startServer({ token: 'secret' });
    const client = await connect(`ws://127.0.0.1:${server.port}`);
    const transport = await server.waitForClient(2000);
    const received: PageMessage[] = [];
    transport.onMessage((message) => received.push(message));

    client.socket.send(hello('wrong'));
    expect(await client.next()).toMatchObject({ type: 'rejected' });
    await waitClosed(client.socket);
    expect(received).toEqual([]);
  });

  it('отклоняет чужой Origin', async () => {
    const server = await startServer({ origin: 'http://localhost:5173' });
    const client = await connect(`ws://127.0.0.1:${server.port}`, 'http://evil.example');
    expect(await client.next()).toMatchObject({ type: 'rejected' });
    await waitClosed(client.socket);
  });

  it('занятый порт — понятная ошибка с номером порта', async () => {
    const server = await startServer();
    await expect(createWsServer({ port: server.port })).rejects.toThrow(
      new RegExp(`Порт ${server.port} уже занят`),
    );
  });

  it('таймаут ожидания клиента не оставляет висеть сервер', async () => {
    const server = await startServer();
    await expect(server.waitForClient(30)).rejects.toThrow(/не подключился/);
  });
});
