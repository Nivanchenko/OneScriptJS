#!/usr/bin/env node
/**
 * Приёмка Node launch по DAP без VS Code (quickstart §1).
 *
 * Запускает собранный `dist/debug/adapter.cjs` отдельным процессом и проходит
 * сценарий: `initialize` → `launch` (nested.osjs) → `setBreakpoints` →
 * `configurationDone` → `stopped(breakpoint)` → `stackTrace` → `continue` →
 * `exited`/`terminated`. Зависимостей нет: DAP-фрейминг и чтение stdout — здесь.
 *
 * Требуется `pnpm build:debug-adapter`. Код возврата: 0 — PASS, 1 — FAIL.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ADAPTER = join(ROOT, 'dist/debug/adapter.cjs');
const PROGRAM = join(ROOT, 'tests/fixtures/debug/nested.osjs');
/** `А = 1;` внутри `Внутренняя()` — исполняемый оператор. */
const BREAKPOINT_LINE = 3;
const TIMEOUT_MS = 30_000;

if (!existsSync(ADAPTER)) {
  console.error(
    `FAIL: нет ${ADAPTER}\n` +
      'Выполните pnpm build:debug-adapter и повторите.',
  );
  process.exit(1);
}
if (!existsSync(PROGRAM)) {
  console.error(`FAIL: нет фикстуры ${PROGRAM}`);
  process.exit(1);
}

/** DAP-клиент поверх stdio: фреймы `Content-Length: N\r\n\r\n<json>`. */
class DapClient {
  constructor(child) {
    this.child = child;
    this.buffer = Buffer.alloc(0);
    this.inbox = [];
    this.waiters = [];
    this.seq = 0;
    this.stderr = '';
    child.stdout.on('data', (chunk) => this.push(chunk));
    child.stderr.on('data', (chunk) => {
      this.stderr += chunk.toString('utf8');
    });
  }

  /** Шлёт запрос; возвращает промис ответа (по `request_seq`). */
  request(command, args, timeout = 10_000) {
    const seq = ++this.seq;
    const body = JSON.stringify({ seq, type: 'request', command, arguments: args });
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
    return this.waitFor(
      (message) =>
        message.type === 'response' && message.request_seq === seq,
      timeout,
      `ответ на ${command}`,
    );
  }

  /** Ждёт первое подходящее сообщение; уже пришедшие не теряются. */
  waitFor(match, timeout = 10_000, label = 'DAP-сообщение') {
    const index = this.inbox.findIndex(match);
    if (index >= 0) return Promise.resolve(this.inbox.splice(index, 1)[0]);
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        const at = this.waiters.findIndex((waiter) => waiter.timer === timer);
        if (at >= 0) this.waiters.splice(at, 1);
        reject(new Error(`таймаут ${timeout} мс: ${label}`));
      }, timeout);
      this.waiters.push({ match, resolve: resolvePromise, reject, timer });
    });
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString('ascii');
      const lengthMatch = /Content-Length:\s*(\d+)/i.exec(header);
      if (!lengthMatch) throw new Error(`DAP: нет Content-Length в «${header}»`);
      const length = Number(lengthMatch[1]);
      const start = headerEnd + 4;
      if (this.buffer.length < start + length) return;
      const payload = this.buffer.subarray(start, start + length).toString('utf8');
      this.buffer = this.buffer.subarray(start + length);
      this.deliver(JSON.parse(payload));
    }
  }

  deliver(message) {
    const index = this.waiters.findIndex((waiter) => waiter.match(message));
    if (index < 0) {
      this.inbox.push(message);
      return;
    }
    const [waiter] = this.waiters.splice(index, 1);
    clearTimeout(waiter.timer);
    waiter.resolve(message);
  }
}

function fail(message) {
  console.error(`FAIL: ${message}`);
}

async function main() {
  const child = spawn(process.execPath, [ADAPTER], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const client = new DapClient(child);
  const timer = setTimeout(() => {
    fail(`сценарий не завершился за ${TIMEOUT_MS} мс`);
    child.kill();
    process.exit(1);
  }, TIMEOUT_MS);
  timer.unref();

  try {
    const initialize = await client.request('initialize', {
      clientID: 'osjs-smoke',
      adapterID: 'osjs',
      linesStartAt1: true,
      columnsStartAt1: true,
      pathFormat: 'path',
    });
    if (initialize.success !== true) throw new Error('initialize: success != true');

    const launch = await client.request('launch', {
      program: PROGRAM,
      cwd: ROOT,
      stopOnEntry: false,
    });
    if (launch.success !== true) throw new Error('launch: success != true');

    const initialized = await client.waitFor(
      (message) => message.type === 'event' && message.event === 'initialized',
      10_000,
      'событие initialized',
    );
    void initialized;

    const breakpoints = await client.request('setBreakpoints', {
      source: { path: PROGRAM },
      breakpoints: [{ line: BREAKPOINT_LINE }],
    });
    const verified = breakpoints.body?.breakpoints?.[0]?.verified;
    if (verified !== true) {
      throw new Error(`setBreakpoints: брейкпоинт на строке ${BREAKPOINT_LINE} не verified`);
    }

    const configurationDone = await client.request('configurationDone', {});
    if (configurationDone.success !== true) {
      throw new Error('configurationDone: success != true');
    }

    const stopped = await client.waitFor(
      (message) =>
        message.type === 'event' &&
        message.event === 'stopped' &&
        message.body?.reason === 'breakpoint',
      15_000,
      'событие stopped(breakpoint)',
    );
    const threadId = stopped.body?.threadId ?? 1;

    const stackTrace = await client.request('stackTrace', { threadId });
    const frames = stackTrace.body?.stackFrames ?? [];
    if (frames.length === 0) throw new Error('stackTrace: пустой стек');
    if (frames[0].line !== BREAKPOINT_LINE) {
      throw new Error(`stackTrace: кадр 0 на строке ${frames[0].line}, ожидалась ${BREAKPOINT_LINE}`);
    }

    const continued = await client.request('continue', { threadId });
    if (continued.success !== true) throw new Error('continue: success != true');

    const exited = await client.waitFor(
      (message) => message.type === 'event' && message.event === 'exited',
      15_000,
      'событие exited',
    );
    if (exited.body?.exitCode !== 0) {
      throw new Error(`exited: код ${exited.body?.exitCode}, ожидался 0`);
    }
    await client.waitFor(
      (message) => message.type === 'event' && message.event === 'terminated',
      15_000,
      'событие terminated',
    );

    console.log(
      `PASS: initialize → launch → setBreakpoints(${BREAKPOINT_LINE}) → configurationDone → ` +
        `stopped(breakpoint) → stackTrace(${frames.length} кадров) → continue → exited(0)/terminated`,
    );
    return 0;
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    if (client.stderr.trim() !== '') console.error(`stderr адаптера: ${client.stderr.trim()}`);
    return 1;
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) {
      child.stdin.end();
      child.kill();
    }
  }
}

const code = await main();
process.exit(code);
