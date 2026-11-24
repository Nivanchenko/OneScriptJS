import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  AdapterMessage,
  BlockInfo,
  PageMessage,
  VariableInfo,
} from '../src/debug/page-protocol';
import { findBlocks } from '../src/lsp/html-blocks';
import { OsjsDebugSession } from '../src/node/debug/session';
import type { PageTransport } from '../src/node/debug/ws-server';
import { DapClient, type DapMessage } from './helpers/dap';

/**
 * Интеграция DAP attach с фейковым page-agent: адаптер не знает, что за
 * транспортом нет браузера. Контракт — specs/021-debugger/contracts/*.
 */

const INITIALIZE_ARGS = {
  clientID: 'vitest',
  adapterID: 'osjs',
  linesStartAt1: true,
  columnsStartAt1: true,
  pathFormat: 'path',
};

const PAGE_URL = 'http://localhost:5173/examples/page.html';
const BASE_URI = 'http://localhost:5173/examples/';
const APP_URL = `${BASE_URI}app.osjs`;
const APP_SOURCE = [
  'Процедура Привет()', // 1
  '  А = 1;', // 2
  '  Б = 2;', // 3
  'КонецПроцедуры', // 4
  'Привет();', // 5
].join('\n');

type SentMessage = AdapterMessage & { seq?: number };

/** Транспорт страницы без WebSocket: копит отправленное и доставляет ответы. */
class FakePageTransport implements PageTransport {
  readonly sent: SentMessage[] = [];
  private messageHandlers: Array<(message: PageMessage) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private readonly inbox: PageMessage[] = [];
  private readonly waiters: Array<{
    type: string;
    from: number;
    resolve: (message: SentMessage) => void;
    timer: NodeJS.Timeout;
  }> = [];

  send(message: AdapterMessage): void {
    const sent = message as SentMessage;
    this.sent.push(sent);
    for (const waiter of [...this.waiters]) {
      if (waiter.type !== message.type) continue;
      if (this.sent.length - 1 < waiter.from) continue;
      this.waiters.splice(this.waiters.indexOf(waiter), 1);
      clearTimeout(waiter.timer);
      waiter.resolve(sent);
    }
  }

  onMessage(callback: (message: PageMessage) => void): void {
    this.messageHandlers.push(callback);
    for (const message of this.inbox.splice(0)) callback(message);
  }

  onClose(callback: () => void): void {
    this.closeHandlers.push(callback);
  }

  close(): void {
    for (const callback of this.closeHandlers.splice(0)) callback();
  }

  /** Доставка сообщения «из страницы» адаптеру. */
  deliver(message: PageMessage): void {
    if (this.messageHandlers.length === 0) {
      this.inbox.push(message);
      return;
    }
    for (const callback of this.messageHandlers) callback(message);
  }

  /** Ждёт отправленное адаптером сообщение нужного типа (начиная с индекса `from`). */
  waitFor(type: AdapterMessage['type'], from = 0, timeout = 3000): Promise<SentMessage> {
    const existing = this.sent.slice(from).find((message) => message.type === type);
    if (existing !== undefined) return Promise.resolve(existing);
    return new Promise<SentMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const at = this.waiters.findIndex((waiter) => waiter.timer === timer);
        if (at >= 0) this.waiters.splice(at, 1);
        reject(new Error(`Страница не получила '${type}'`));
      }, timeout);
      this.waiters.push({ type, from, resolve, timer });
    });
  }

  /** Последнее отправленное сообщение типа (без ожидания). */
  last(type: AdapterMessage['type']): SentMessage | undefined {
    return [...this.sent].reverse().find((message) => message.type === type);
  }

  count(type: AdapterMessage['type']): number {
    return this.sent.filter((message) => message.type === type).length;
  }
}

class AttachSession extends OsjsDebugSession {
  readonly transport = new FakePageTransport();
  failTransport?: Error;

  protected override async openAttachTransport(): Promise<PageTransport> {
    if (this.failTransport !== undefined) throw this.failTransport;
    return this.transport;
  }
}

interface Harness {
  client: DapClient;
  session: AttachSession;
  dispose(): void;
}

function connect(): Harness {
  const client = new DapClient();
  const session = new AttachSession();
  client.start(session);
  return {
    client,
    session,
    dispose: () => {
      client.dispose();
      session.transport.close();
    },
  };
}

function expectSuccess(response: DapMessage): DapMessage {
  expect(response.success, response.message).toBe(true);
  return response;
}

function body<T>(message: DapMessage): T {
  return message.body as unknown as T;
}

function hello(inline = true): PageMessage {
  return {
    type: 'hello',
    v: 1,
    pageUrl: PAGE_URL,
    baseURI: BASE_URI,
    title: 'page',
    blocks: [
      { index: 1, src: 'app.osjs', text: APP_SOURCE },
      ...(inline
        ? [{ index: 2, id: 'inline', text: 'сообщить("inline");' }]
        : []),
    ],
  };
}

async function attach(client: DapClient, webRoot: string): Promise<DapMessage> {
  return expectSuccess(
    await client.sendRequest('attach', { url: PAGE_URL, webRoot, port: 9229 }),
  );
}

async function startAttach(harness: Harness, webRoot: string): Promise<void> {
  await expectSuccess(await harness.client.sendRequest('initialize', INITIALIZE_ARGS));
  await attach(harness.client, webRoot);
  harness.session.transport.deliver(hello());
  await harness.client.waitForEvent('initialized');
}

describe('DAP attach: рукопожатие', () => {
  let root: string;

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function prepare(): string {
    root = mkdtempSync(join(tmpdir(), 'osjs-dap-attach-'));
    mkdirSync(join(root, 'examples'), { recursive: true });
    writeFileSync(join(root, 'examples', 'app.osjs'), APP_SOURCE);
    writeFileSync(join(root, 'examples', 'page.html'), '<html><body></body></html>');
    return root;
  }

  it('отклоняет attach без url', async () => {
    prepare();
    const harness = connect();
    try {
      await expectSuccess(await harness.client.sendRequest('initialize', INITIALIZE_ARGS));
      const response = await harness.client.sendRequest('attach', { webRoot: root });
      expect(response.success).toBe(false);
      expect(response.message).toContain('url');
    } finally {
      harness.dispose();
    }
  });

  it('понятно сообщает, если транспорт не поднялся (занятый порт)', async () => {
    prepare();
    const harness = connect();
    try {
      await expectSuccess(await harness.client.sendRequest('initialize', INITIALIZE_ARGS));
      harness.session.failTransport = new Error('Порт 9229 уже занят');
      const response = await harness.client.sendRequest('attach', {
        url: PAGE_URL,
        webRoot: root,
      });
      expect(response.success).toBe(false);
      expect(response.message).toContain('9229');
    } finally {
      harness.dispose();
    }
  });

  it('hello → helloAck + initialized, источники зарегистрированы', async () => {
    const webRoot = prepare();
    const harness = connect();
    try {
      await expectSuccess(await harness.client.sendRequest('initialize', INITIALIZE_ARGS));
      await attach(harness.client, webRoot);
      harness.session.transport.deliver(hello());
      await harness.client.waitForEvent('initialized');

      const ack = harness.session.transport.last('helloAck');
      expect(ack).toMatchObject({ type: 'helloAck' });
      expect(typeof (ack as { sessionId?: string }).sessionId).toBe('string');
    } finally {
      harness.dispose();
    }
  });
});

describe('DAP attach: сценарий отладки', () => {
  let root: string;

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function prepare(): string {
    root = mkdtempSync(join(tmpdir(), 'osjs-dap-attach-'));
    mkdirSync(join(root, 'examples'), { recursive: true });
    writeFileSync(join(root, 'examples', 'app.osjs'), APP_SOURCE);
    writeFileSync(join(root, 'examples', 'page.html'), '<html><body></body></html>');
    return root;
  }

  it('брейкпоинт → stopped → стек/области/переменные/evaluate → continue → output → terminated', async () => {
    const webRoot = prepare();
    const harness = connect();
    const { client, session } = harness;
    const transport = session.transport;
    try {
      await startAttach(harness, webRoot);

      const breakpointsResponse = expectSuccess(
        await client.sendRequest('setBreakpoints', {
          source: { path: join(webRoot, 'examples', 'app.osjs') },
          breakpoints: [{ line: 2 }],
        }),
      );
      expect(body<{ breakpoints: Array<{ verified: boolean; line?: number }> }>(breakpointsResponse).breakpoints).toEqual([
        expect.objectContaining({ verified: true, line: 2 }),
      ]);
      expect(transport.last('breakpoints')).toMatchObject({
        sourceId: APP_URL,
        replace: true,
        items: [{ line: 2 }],
      });

      expectSuccess(await client.sendRequest('configurationDone'));
      expect(transport.last('configured')).toMatchObject({ type: 'configured' });

      const frames = [{ id: 7, method: '<модуль>', sourceId: APP_URL, line: 2 }];
      transport.deliver({
        type: 'stopped',
        threadId: 1,
        reason: 'breakpoint',
        frames,
        allThreadsStopped: true,
      });
      const stopped = await client.waitForEvent('stopped');
      expect(body<{ reason: string; threadId: number }>(stopped)).toMatchObject({
        reason: 'breakpoint',
        threadId: 1,
      });

      const stack = body<{
        stackFrames: Array<{ id: number; name: string; line: number; source?: { path?: string } }>;
        totalFrames: number;
      }>(expectSuccess(await client.sendRequest('stackTrace', { threadId: 1 })));
      expect(stack.totalFrames).toBe(1);
      expect(stack.stackFrames[0]).toMatchObject({
        id: 7,
        name: '<модуль>',
        line: 2,
        source: { path: join(webRoot, 'examples', 'app.osjs') },
      });

      // scopes: адаптер проксирует запрос странице и ждёт ответ по seq.
      const scopesPromise = client.sendRequest('scopes', { frameId: 7 });
      const scopesMessage = await transport.waitFor('scopes');
      expect(scopesMessage).toMatchObject({ frameIndex: 0 });
      transport.deliver({
        type: 'scopesResult',
        seq: scopesMessage.seq!,
        ok: true,
        scopes: [
          { name: 'Локальные', variablesReference: 11 },
          { name: 'Модуль', variablesReference: 12 },
        ],
      });
      const scopes = body<{ scopes: Array<{ name: string; variablesReference: number }> }>(
        expectSuccess(await scopesPromise),
      );
      expect(scopes.scopes.map((scope) => scope.name)).toEqual(['Локальные', 'Модуль']);

      const variablesPromise = client.sendRequest('variables', { variablesReference: 11 });
      const variablesMessage = await transport.waitFor('variables');
      expect(variablesMessage).toMatchObject({ variablesReference: 11 });
      const local: VariableInfo = {
        name: 'А',
        value: '1',
        type: 'Число',
        variablesReference: 0,
      };
      transport.deliver({
        type: 'variablesResult',
        seq: variablesMessage.seq!,
        ok: true,
        variables: [local],
      });
      expect(
        body<{ variables: VariableInfo[] }>(expectSuccess(await variablesPromise)).variables,
      ).toEqual([local]);

      const evaluatePromise = client.sendRequest('evaluate', {
        expression: 'А + 1',
        frameId: 7,
        context: 'watch',
      });
      const evaluateMessage = await transport.waitFor('evaluate');
      expect(evaluateMessage).toMatchObject({ frameIndex: 0, expression: 'А + 1' });
      transport.deliver({
        type: 'evaluateResult',
        seq: evaluateMessage.seq!,
        ok: true,
        result: { name: 'А + 1', value: '2', type: 'Число', variablesReference: 0 },
      });
      expect(
        body<{ result: string }>(expectSuccess(await evaluatePromise)).result,
      ).toBe('2');

      expectSuccess(await client.sendRequest('continue', { threadId: 1 }));
      expect(transport.last('resume')).toMatchObject({ mode: 'continue', threadId: 1 });

      transport.deliver({ type: 'output', category: 'stdout', text: '2\n' });
      const output = await client.waitForEvent('output');
      expect(body<{ category: string; output: string }>(output)).toMatchObject({
        category: 'stdout',
        output: '2\n',
      });

      transport.deliver({ type: 'terminated' });
      await client.waitForEvent('terminated');

      expectSuccess(await client.sendRequest('disconnect', {}));
      expect(transport.last('disconnect')).toMatchObject({ type: 'disconnect' });
    } finally {
      harness.dispose();
    }
  });

  it('ошибка страницы в evaluate отдаётся DAP-ошибкой, hover — значением err', async () => {
    const webRoot = prepare();
    const harness = connect();
    const { client, session } = harness;
    const transport = session.transport;
    try {
      await startAttach(harness, webRoot);
      transport.deliver({
        type: 'stopped',
        threadId: 1,
        reason: 'pause',
        frames: [{ id: 1, method: '<модуль>', sourceId: APP_URL, line: 2 }],
      });
      await client.waitForEvent('stopped');

      const failedPromise = client.sendRequest('evaluate', {
        expression: 'Нет',
        frameId: 1,
        context: 'watch',
      });
      const failedMessage = await transport.waitFor('evaluate');
      transport.deliver({
        type: 'evaluateResult',
        seq: failedMessage.seq!,
        ok: false,
        error: 'Неизвестная переменная',
      });
      const failed = await failedPromise;
      expect(failed.success).toBe(false);
      expect(failed.message).toContain('Неизвестная');

      const hoverFrom = transport.sent.length;
      const hoverPromise = client.sendRequest('evaluate', {
        expression: 'Нет',
        frameId: 1,
        context: 'hover',
      });
      const hoverMessage = await transport.waitFor('evaluate', hoverFrom);
      transport.deliver({
        type: 'evaluateResult',
        seq: hoverMessage.seq!,
        ok: false,
        error: 'Неизвестная переменная',
      });
      expect(body<{ result: string }>(expectSuccess(await hoverPromise)).result).toBe('err: Нет');
    } finally {
      harness.dispose();
    }
  });

  it('HTML-источник в W3 не верифицируется и не уходит странице', async () => {
    const webRoot = prepare();
    const harness = connect();
    const { client, session } = harness;
    try {
      await startAttach(harness, webRoot);
      const response = expectSuccess(
        await client.sendRequest('setBreakpoints', {
          source: { path: join(webRoot, 'examples', 'page.html') },
          breakpoints: [{ line: 3 }],
        }),
      );
      expect(
        body<{ breakpoints: Array<{ verified: boolean }> }>(response).breakpoints,
      ).toEqual([expect.objectContaining({ verified: false })]);
      expect(session.transport.count('breakpoints')).toBe(0);
    } finally {
      harness.dispose();
    }
  });
});

describe('DAP attach: inline HTML-блоки (W5)', () => {
  let root: string;

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** Фикстура страницы: два inline-блока (с id и без) и data-os-click. */
  function preparePage(pageHtml?: string): { webRoot: string; html: string; blocks: BlockInfo[] } {
    root = mkdtempSync(join(tmpdir(), 'osjs-dap-html-'));
    mkdirSync(join(root, 'examples'), { recursive: true });
    const html = pageHtml ?? readFileSync(resolve('tests/fixtures/debug/page.html'), 'utf8');
    writeFileSync(join(root, 'examples', 'page.html'), html);
    const blocks: BlockInfo[] = findBlocks(html).map((block, index) => ({
      index: index + 1,
      ...(block.id === undefined ? {} : { id: block.id }),
      text: html.slice(block.contentStartOffset, block.contentEndOffset),
    }));
    return { webRoot: root, html, blocks };
  }

  it('setBreakpoints по HTML-строке уходит странице локальной строкой, stackTrace отдаёт HTML', async () => {
    const { webRoot, html, blocks } = preparePage();
    const pagePath = join(webRoot, 'examples', 'page.html');
    const raw = findBlocks(html);
    // blockLocal 2 — первый оператор блока (строка 1 — пустой остаток тега).
    const firstLine = raw[0]!.start.line + 2;
    const secondLine = raw[1]!.start.line + 2;
    const harness = connect();
    const { client, session } = harness;
    const transport = session.transport;
    try {
      await expectSuccess(await client.sendRequest('initialize', INITIALIZE_ARGS));
      await attach(client, webRoot);
      transport.deliver({
        type: 'hello',
        v: 1,
        pageUrl: PAGE_URL,
        baseURI: BASE_URI,
        blocks,
      });
      await client.waitForEvent('initialized');

      const response = expectSuccess(
        await client.sendRequest('setBreakpoints', {
          source: { path: pagePath },
          breakpoints: [
            { line: firstLine, condition: 'А = 1' },
            { line: secondLine, logMessage: 'Б={Б}' },
            { line: 1 },
          ],
        }),
      );
      expect(
        body<{ breakpoints: Array<{ verified: boolean; line?: number }> }>(response).breakpoints,
      ).toEqual([
        expect.objectContaining({ verified: true, line: firstLine }),
        expect.objectContaining({ verified: true, line: secondLine }),
        expect.objectContaining({ verified: false }),
      ]);

      const breakpointMessages = transport.sent.filter(
        (message) => message.type === 'breakpoints',
      );
      expect(breakpointMessages).toHaveLength(2);
      expect(breakpointMessages[0]).toMatchObject({
        sourceId: `${BASE_URI}#first`,
        replace: true,
        items: [{ line: 2, condition: 'А = 1' }],
      });
      expect(breakpointMessages[1]).toMatchObject({
        sourceId: `${BASE_URI}#block2`,
        replace: true,
        items: [{ line: 2, logMessage: 'Б={Б}' }],
      });

      transport.deliver({
        type: 'stopped',
        threadId: 1,
        reason: 'breakpoint',
        frames: [
          { id: 21, method: '<модуль>', sourceId: `${BASE_URI}#first`, line: 2 },
        ],
      });
      await client.waitForEvent('stopped');
      const stack = body<{
        stackFrames: Array<{
          id: number;
          line: number;
          source?: { name?: string; path?: string };
        }>;
      }>(expectSuccess(await client.sendRequest('stackTrace', { threadId: 1 })));
      expect(stack.stackFrames[0]).toMatchObject({
        id: 21,
        line: firstLine,
        source: { name: 'page.html', path: pagePath },
      });

      // Новый набор без блока 1 очищает его брейкпоинты на странице (replace).
      const from = transport.sent.length;
      expectSuccess(
        await client.sendRequest('setBreakpoints', {
          source: { path: pagePath },
          breakpoints: [{ line: secondLine }],
        }),
      );
      const updates = transport.sent
        .slice(from)
        .filter((message) => message.type === 'breakpoints');
      expect(updates).toHaveLength(2);
      expect(updates[0]).toMatchObject({
        sourceId: `${BASE_URI}#block2`,
        items: [{ line: 2 }],
      });
      expect(updates[1]).toMatchObject({ sourceId: `${BASE_URI}#first`, items: [] });
    } finally {
      harness.dispose();
    }
  });

  it('пустая/комментарная строка блока привязывается к следующему оператору', async () => {
    const fixture = readFileSync(resolve('tests/fixtures/debug/page.html'), 'utf8');
    // В фикстуре нет пустых строк внутри блока: добавляем комментарий и пустую
    // строку в копию страницы, чтобы не менять общий файл.
    const html = fixture.replace('    А = 1;', '    // пояснение\n\n    А = 1;');
    const { webRoot, blocks } = preparePage(html);
    const pagePath = join(webRoot, 'examples', 'page.html');
    const raw = findBlocks(html);
    const tagLine = raw[0]!.start.line + 1;
    const commentLine = tagLine + 1;
    const emptyLine = tagLine + 2;
    // `А = 1;` — локальная строка 4: 1 — остаток строки тега, 2 — комментарий, 3 — пустая.
    const operatorLine = tagLine + 3;
    const harness = connect();
    const { client, session } = harness;
    const transport = session.transport;
    try {
      await expectSuccess(await client.sendRequest('initialize', INITIALIZE_ARGS));
      await attach(client, webRoot);
      transport.deliver({
        type: 'hello',
        v: 1,
        pageUrl: PAGE_URL,
        baseURI: BASE_URI,
        blocks,
      });
      await client.waitForEvent('initialized');

      const response = expectSuccess(
        await client.sendRequest('setBreakpoints', {
          source: { path: pagePath },
          breakpoints: [{ line: commentLine }, { line: emptyLine }, { line: operatorLine }],
        }),
      );
      expect(
        body<{ breakpoints: Array<{ verified: boolean; line?: number }> }>(response).breakpoints,
      ).toEqual([
        expect.objectContaining({ verified: true, line: operatorLine }),
        expect.objectContaining({ verified: true, line: operatorLine }),
        expect.objectContaining({ verified: true, line: operatorLine }),
      ]);

      const messages = transport.sent.filter((message) => message.type === 'breakpoints');
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        sourceId: `${BASE_URI}#first`,
        replace: true,
        items: [{ line: 4 }],
      });
    } finally {
      harness.dispose();
    }
  });

  it('тег <script> и строка после последнего оператора блока — verified:false', async () => {
    const { webRoot, html, blocks } = preparePage();
    const pagePath = join(webRoot, 'examples', 'page.html');
    const raw = findBlocks(html);
    const firstTagLine = raw[0]!.start.line + 1;
    const firstBlockText = html.slice(raw[0]!.contentStartOffset, raw[0]!.contentEndOffset);
    // Строка закрывающего тега — хвост содержимого блока, операторов после неё нет.
    const closingTagLine = firstTagLine + firstBlockText.split('\n').length - 1;
    const nextBlockTagLine = raw[1]!.start.line + 1;
    const harness = connect();
    const { client, session } = harness;
    try {
      await expectSuccess(await client.sendRequest('initialize', INITIALIZE_ARGS));
      await attach(client, webRoot);
      session.transport.deliver({
        type: 'hello',
        v: 1,
        pageUrl: PAGE_URL,
        baseURI: BASE_URI,
        blocks,
      });
      await client.waitForEvent('initialized');

      const response = expectSuccess(
        await client.sendRequest('setBreakpoints', {
          source: { path: pagePath },
          breakpoints: [
            { line: firstTagLine },
            { line: closingTagLine },
            { line: nextBlockTagLine },
          ],
        }),
      );
      expect(
        body<{ breakpoints: Array<{ verified: boolean }> }>(response).breakpoints,
      ).toEqual([
        expect.objectContaining({ verified: false }),
        expect.objectContaining({ verified: false }),
        expect.objectContaining({ verified: false }),
      ]);
      expect(session.transport.count('breakpoints')).toBe(0);
    } finally {
      harness.dispose();
    }
  });
});
