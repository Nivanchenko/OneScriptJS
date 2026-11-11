import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/runtime/runner';
import { createNodeGlobalContext } from '../src/node/context';

const SERVER_SCRIPT = `
const http = require('http');
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Method', req.method);
    res.end(req.method === 'GET' || req.method === 'HEAD' ? 'ok' : body);
  });
});
server.listen(0, '127.0.0.1', () => {
  process.stdout.write(String(server.address().port) + '\\n');
});
`;

function startEchoServer(): Promise<{ port: number; stop: () => void }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', SERVER_SCRIPT], { stdio: ['ignore', 'pipe', 'inherit'] });
    let output = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('эхо-сервер не запустился'));
    }, 10000);
    child.stdout.on('data', (chunk: Buffer) => {
      if (settled) return;
      output += chunk.toString();
      const port = Number(output.split('\n')[0]);
      if (Number.isInteger(port) && port > 0) {
        settled = true;
        clearTimeout(timer);
        resolve({ port, stop: () => child.kill() });
      }
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function exec(source: string): string[] {
  const logs: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  });
  try {
    run(source, createNodeGlobalContext());
  } finally {
    spy.mockRestore();
  }
  return logs;
}

describe('HTTP: Node-транспорт', () => {
  afterEach(() => vi.restoreAllMocks());

  it('GET и POST через локальный сервер', async () => {
    const server = await startEchoServer();
    try {
      const logs = exec(`
С = Новый HTTPСоединение("http://127.0.0.1:${server.port}");
О = С.Получить(Новый HTTPЗапрос("/echo"));
Сообщить(О.КодСостояния);
Сообщить(О.ПолучитьТелоКакСтроку());
Сообщить(О.Заголовки.Получить("X-Method"));
З = Новый HTTPЗапрос("/echo");
З.УстановитьТелоИзСтроки("привет");
О2 = С.ОтправитьДляОбработки(З);
Сообщить(О2.ПолучитьТелоКакСтроку());
`);
      expect(logs).toEqual(['200', 'ok', 'GET', 'привет']);
    } finally {
      server.stop();
    }
  }, 20000);

  it('сетевая ошибка содержит метод, URL и причину', () => {
    expect(() => exec('Новый HTTPСоединение("http://127.0.0.1:1").Получить(Новый HTTPЗапрос("/"));')).toThrow(
      /GET .*127\.0\.0\.1:1.*(fetch failed|ECONNREFUSED|connect)/i,
    );
  }, 20000);
});
