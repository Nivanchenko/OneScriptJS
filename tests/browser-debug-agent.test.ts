import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSocket, PageAgent } from '../src/browser/debug/agent';
import { createPageAgent } from '../src/browser/debug/agent';
import type {
  AdapterMessage,
  AttachInfo,
  HelloAckMessage,
  PageMessage,
} from '../src/debug/page-protocol';
import { flush, makeScriptBlock, renderPage, runEngine } from './helpers/browser-script';

/**
 * Page-agent и гейт браузерного движка: страница не исполняет блоки до
 * `configurationDone`, брейкпоинты/пауза работают, dispose снимает гейты.
 * Транспорт — фейковый сокет, WebSocket не нужен.
 */

const PAGE_URL = 'http://localhost/app/';

/** Сокет-фейк: открывается в микротаске и хранит отправленные сообщения. */
class FakeSocket implements AgentSocket {
  static instances: FakeSocket[] = [];

  readonly sent: PageMessage[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  closed = false;
  private readonly waiters: Array<{
    type: string;
    resolve: (message: PageMessage) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
    queueMicrotask(() => {
      if (!this.closed) this.onopen?.({});
    });
  }

  send(data: string): void {
    const message = JSON.parse(data) as PageMessage;
    this.sent.push(message);
    for (const waiter of [...this.waiters]) {
      if (waiter.type !== message.type) continue;
      this.waiters.splice(this.waiters.indexOf(waiter), 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.({});
  }

  receive(message: AdapterMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  last(type: PageMessage['type']): PageMessage | undefined {
    return [...this.sent].reverse().find((message) => message.type === type);
  }

  count(type: PageMessage['type']): number {
    return this.sent.filter((message) => message.type === type).length;
  }

  waitFor(type: PageMessage['type'], timeout = 2000): Promise<PageMessage> {
    const existing = this.sent.find((message) => message.type === type);
    if (existing !== undefined) return Promise.resolve(existing);
    return new Promise<PageMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const at = this.waiters.findIndex((waiter) => waiter.timer === timer);
        if (at >= 0) this.waiters.splice(at, 1);
        reject(new Error(`Агент не отправил '${type}'`));
      }, timeout);
      this.waiters.push({ type, resolve, timer });
    });
  }
}

let logs: unknown[] = [];
let agents: PageAgent[] = [];

/** Ставит мост `__OSJS_DEBUG__` так же, как это делает onescript-debug.js. */
function installBridge(options: { timeoutMs?: number } = {}): void {
  vi.stubGlobal('__OSJS_DEBUG__', {
    attach(info: AttachInfo) {
      const agent = createPageAgent({
        pageUrl: info.pageUrl,
        baseURI: info.baseURI,
        blocks: info.blocks,
        port: 9229,
        timeoutMs: options.timeoutMs ?? 1000,
        socketFactory: (url) => new FakeSocket(url),
      });
      agents.push(agent);
      return agent.attach();
    },
  });
}

function socket(): FakeSocket {
  const instance = FakeSocket.instances[0];
  if (instance === undefined) throw new Error('Агент не открыл сокет');
  return instance;
}

function helloAck(stopOnEntry = false): HelloAckMessage {
  return { type: 'helloAck', sessionId: 'test', stopOnEntry };
}

function click(window: ReturnType<typeof renderPage>, id: string): void {
  (window.document.getElementById(id) as unknown as HTMLElement).click();
}

beforeEach(() => {
  FakeSocket.instances = [];
  agents = [];
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(...args);
  });
});

afterEach(() => {
  for (const agent of agents.splice(0)) agent.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (globalThis as { __OSJS_DEBUG__?: unknown }).__OSJS_DEBUG__;
});

describe('page-agent: гейт до configurationDone', () => {
  it('до configured блоки не исполняются, после — исполняются', async () => {
    installBridge();
    renderPage([makeScriptBlock('сообщить("старт");')]);
    await runEngine();
    await flush();

    const page = socket();
    expect(page.url).toBe('ws://127.0.0.1:9229');
    expect(page.sent[0]).toMatchObject({
      type: 'hello',
      v: 1,
      pageUrl: PAGE_URL,
      blocks: [{ index: 1, text: 'сообщить("старт");' }],
    });
    expect(logs).toEqual([]);

    page.receive(helloAck());
    await flush();
    // helloAck есть, но configurationDone ещё нет — движок ждёт.
    expect(logs).toEqual([]);

    page.receive({ type: 'configured' });
    await flush();
    expect(logs).toEqual(['старт']);
  });
});

describe('page-agent: брейкпоинты, пауза и вывод', () => {
  it('брейкпоинт останавливает, resume продолжает и выводит Сообщить', async () => {
    installBridge();
    renderPage([makeScriptBlock('А = 1;\nсообщить(А);')]);
    await runEngine();
    await flush();

    const page = socket();
    page.receive(helloAck());
    await flush();
    page.receive({
      type: 'breakpoints',
      sourceId: `${PAGE_URL}#block1`,
      replace: true,
      items: [{ line: 1 }],
    });
    page.receive({ type: 'configured' });
    await flush();

    const stopped = await page.waitFor('stopped');
    expect(stopped).toMatchObject({ threadId: 1, reason: 'breakpoint' });
    expect(logs).toEqual([]);

    page.receive({ type: 'resume', threadId: 1, mode: 'continue' });
    await flush();
    expect(logs).toEqual(['1']);
  });

  it('DOM-клик на паузе гейтится, после resume исполняется', async () => {
    installBridge();
    const window = renderPage(
      [
        makeScriptBlock(
          'Процедура Клик()\n  сообщить("клик");\nКонецПроцедуры',
          'один',
        ),
        makeScriptBlock('сообщить("блок2");'),
      ],
      '<button id="к" data-os-script="один" data-os-click="Клик();">x</button>',
    );
    await runEngine();
    await flush();

    const page = socket();
    page.receive(helloAck());
    await flush();
    page.receive({
      type: 'breakpoints',
      sourceId: `${PAGE_URL}#block2`,
      replace: true,
      items: [{ line: 1 }],
    });
    page.receive({ type: 'configured' });
    await flush();
    expect(await page.waitFor('stopped')).toMatchObject({ reason: 'breakpoint' });
    expect(logs).toEqual([]);

    click(window, 'к');
    await flush();
    // Обработчик из другого блока — отдельный поток; пауза глобальна.
    expect(logs).toEqual([]);

    page.receive({ type: 'resume', threadId: 1, mode: 'continue' });
    await flush();
    expect(logs).toHaveLength(2);
    expect(logs).toEqual(expect.arrayContaining(['блок2', 'клик']));
  });

  it('dispose на паузе снимает гейты: страница продолжает исполнение', async () => {
    installBridge();
    renderPage([makeScriptBlock('сообщить("после");')]);
    await runEngine();
    await flush();

    const page = socket();
    page.receive(helloAck());
    await flush();
    page.receive({
      type: 'breakpoints',
      sourceId: `${PAGE_URL}#block1`,
      replace: true,
      items: [{ line: 1 }],
    });
    page.receive({ type: 'configured' });
    await flush();
    expect(await page.waitFor('stopped')).toMatchObject({ reason: 'breakpoint' });
    expect(logs).toEqual([]);

    agents[0]!.dispose();
    await flush();
    expect(logs).toEqual(['после']);
    expect(page.closed).toBe(true);
  });
});

describe('page-agent: деградация', () => {
  it('если адаптер не отвечает — attach() возвращает null, страница исполняется штатно', async () => {
    installBridge({ timeoutMs: 60 });
    renderPage([makeScriptBlock('сообщить("без отладки");')]);
    await runEngine();
    await flush(150);

    expect(logs).toEqual(['без отладки']);
    expect(socket().closed).toBe(true);
  });

  it('onescript-debug регистрирует мост до старта движка', async () => {
    vi.resetModules();
    await import('../src/browser/onescript-debug');
    expect(typeof globalThis.__OSJS_DEBUG__?.attach).toBe('function');
  });
});
