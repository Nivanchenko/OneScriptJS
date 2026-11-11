import { spawnSync } from 'node:child_process';
import type { HttpRequestData, HttpResponseData, HttpTransport } from '../stdlib/http';

/**
 * Node-транспорт: в Node нет синхронного HTTP, поэтому каждый запрос выполняется
 * дочерним процессом `node -e` с `fetch`, а `spawnSync` блокирует вызывающего.
 * Это вспомогательная среда (CLI/тесты); браузер использует XHR-транспорт.
 *
 * shortcut: дочерний процесс на каждый запрос (~100 мс); апгрейд — worker + Atomics,
 * если HTTP в CLI станет горячим путём.
 */
export function createNodeHttpTransport(): HttpTransport {
  return (request: HttpRequestData): HttpResponseData => {
    const payload = JSON.stringify({
      url: request.url,
      method: request.method,
      headers: request.headers,
      bodyBase64: request.body === null ? null : Buffer.from(request.body).toString('base64'),
      timeoutMs: request.timeoutMs,
      allowRedirect: request.allowRedirect,
    });

    const result = spawnSync(process.execPath, ['-e', CHILD_SCRIPT], {
      input: payload,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      const stderr = (result.stderr ?? '').trim();
      throw new Error(stderr || `дочерний процесс завершился с кодом ${result.status}`);
    }

    let parsed: { status?: number; headers?: [string, string][]; bodyBase64?: string; error?: string };
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw new Error('некорректный ответ Node-транспорта');
    }
    if (parsed.error) throw new Error(parsed.error);

    return {
      status: parsed.status ?? 0,
      headers: parsed.headers ?? [],
      body: Buffer.from(parsed.bodyBase64 ?? '', 'base64'),
    };
  };
}

const CHILD_SCRIPT = `
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', async () => {
  try {
    const req = JSON.parse(input);
    const forbidden = new Set([
      'content-length', 'host', 'connection', 'transfer-encoding',
      'keep-alive', 'upgrade', 'te', 'trailer', 'user-agent',
    ]);
    const headers = {};
    for (const pair of req.headers) {
      if (!forbidden.has(pair[0].toLowerCase())) headers[pair[0]] = pair[1];
    }
    const init = {
      method: req.method,
      headers,
      redirect: req.allowRedirect ? 'follow' : 'manual',
    };
    if (req.bodyBase64 !== null && req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = Buffer.from(req.bodyBase64, 'base64');
    }
    if (req.timeoutMs > 0) init.signal = AbortSignal.timeout(req.timeoutMs);

    const response = await fetch(req.url, init);
    const buffer = Buffer.from(await response.arrayBuffer());
    const responseHeaders = [];
    // fetch отдаёт имена в нижнем регистре; приводим к каноническому виду, как XHR/эталон.
    const canonical = (name) => name.replace(/(^|-)([a-z])/g, (_, dash, letter) => dash + letter.toUpperCase());
    response.headers.forEach((value, name) => responseHeaders.push([canonical(name), value]));
    process.stdout.write(JSON.stringify({
      status: response.status,
      headers: responseHeaders,
      bodyBase64: buffer.toString('base64'),
    }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ error: error && error.message ? error.message : String(error) }));
  }
});
`;
