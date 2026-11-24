import type { DebugSink, FrameInfo, StopReason } from '../../runtime/debug/controller';
import { DebugController } from '../../runtime/debug/controller';
import type {
  AdapterMessage,
  AttachBlock,
  BlockInfo,
  BreakpointSpec,
  ExceptionFilterName,
  FrameInfo as PageFrameInfo,
  PageMessage,
  VariableInfo,
} from '../../debug/page-protocol';

/**
 * Page-agent: мост между страницей и DAP-адаптером по WebSocket.
 *
 * Агент подключается до старта движка, отдаёт манифест блоков и ждёт
 * `configured` — только после этого `attach()` отдаёт контроллер, а движок
 * начинает исполнять `<script type="text/osjs">`. Если адаптер недоступен,
 * возвращается `null`: страница работает штатно, без отладки.
 *
 * Файл браузерный: `node:*` не используется, транспорт и таймеры инжектируются
 * для тестов.
 */

/** Минимальный сокет: подмножество `WebSocket`, достаточное агенту. */
export interface AgentSocket {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

/** Таймеры: в тестах можно подменить, не трогая глобальный `setTimeout`. */
export interface AgentTimers {
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

export interface PageAgentOptions {
  pageUrl: string;
  baseURI: string;
  blocks: readonly AttachBlock[];
  port: number;
  /** Необязательный token адаптера (сверяется адаптером с `hello.token`). */
  token?: string;
  socketFactory?: (url: string) => AgentSocket;
  timers?: AgentTimers;
  /** Общий дедлайн рукопожатия (подключение + helloAck + configured), мс. */
  timeoutMs?: number;
  /** Чтение внешнего `.osjs` для манифеста (по умолчанию `fetch`). */
  fetchText?: (url: string) => Promise<string>;
}

export interface PageAgent {
  /** Резолвится контроллером после `configured`; `null` — отладка недоступна. */
  attach(): Promise<DebugController | null>;
  /** Снимает гейты, восстанавливает console и закрывает сокет. */
  dispose(): void;
}

const DEFAULT_TIMEOUT_MS = 5000;
const RECONNECT_BASE_MS = 100;
const RECONNECT_MAX_MS = 1000;
const CONNECT_ATTEMPT_MS = 1000;

export function createPageAgent(options: PageAgentOptions): PageAgent {
  const timers = options.timers ?? defaultTimers();
  const socketFactory =
    options.socketFactory ?? ((url: string) => new WebSocket(url) as unknown as AgentSocket);
  const fetchText = options.fetchText ?? defaultFetchText;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let socket: AgentSocket | undefined;
  let controller: DebugController | undefined;
  let disposed = false;
  let restoreConsole: (() => void) | undefined;
  let frames: PageFrameInfo[] = [];
  let stopOnEntry = false;
  let configuredSeen = false;
  let resolveAck: (() => void) | undefined;
  let rejectAck: ((error: Error) => void) | undefined;
  let resolveConfigured: (() => void) | undefined;
  let rejectConfigured: ((error: Error) => void) | undefined;

  const breakpoints = new Map<string, BreakpointSpec[]>();
  const filters = new Set<ExceptionFilterName>();

  const send = (message: PageMessage): void => {
    if (disposed || socket === undefined) return;
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // закрытый сокет не должен ронять страницу
    }
  };

  const sink: DebugSink = {
    stopped: (threadId: number, reason: StopReason, stopped: FrameInfo[], description?: string) => {
      frames = stopped;
      send({
        type: 'stopped',
        threadId,
        reason,
        frames: stopped,
        allThreadsStopped: true,
        ...(description === undefined ? {} : { description }),
      });
    },
    continued: (threadId) => send({ type: 'continued', threadId, allThreadsContinued: true }),
    output: (category, text) => send({ type: 'output', category, text }),
    threads: (threads) =>
      send({ type: 'threads', threads: threads.map(({ id, name }) => ({ id, name })) }),
    terminated: () => send({ type: 'terminated' }),
  };

  const frameAt = (index: number): PageFrameInfo => {
    const frame = frames[index];
    if (frame === undefined) throw new Error(`Кадр ${index} не найден в остановленном стеке`);
    return frame;
  };

  const answerEvaluate = async (
    seq: number,
    frameIndex: number,
    expression: string,
  ): Promise<void> => {
    try {
      if (controller === undefined) throw new Error('Отладчик ещё не готов');
      const info = await controller.evaluate(frameAt(frameIndex).id, expression);
      send({ type: 'evaluateResult', seq, ok: true, result: info });
    } catch (error) {
      send({ type: 'evaluateResult', seq, ok: false, error: messageOf(error) });
    }
  };

  const answerScopes = async (seq: number, frameIndex: number): Promise<void> => {
    try {
      if (controller === undefined) throw new Error('Отладчик ещё не готов');
      send({
        type: 'scopesResult',
        seq,
        ok: true,
        scopes: controller.scopes(frameAt(frameIndex).id),
      });
    } catch (error) {
      send({ type: 'scopesResult', seq, ok: false, error: messageOf(error) });
    }
  };

  const answerVariables = async (seq: number, variablesReference: number): Promise<void> => {
    try {
      if (controller === undefined) throw new Error('Отладчик ещё не готов');
      const variables: VariableInfo[] = controller.variables(variablesReference);
      send({ type: 'variablesResult', seq, ok: true, variables });
    } catch (error) {
      send({ type: 'variablesResult', seq, ok: false, error: messageOf(error) });
    }
  };

  const handleMessage = (message: AdapterMessage): void => {
    switch (message.type) {
      case 'helloAck':
        stopOnEntry = message.stopOnEntry === true;
        resolveAck?.();
        resolveAck = undefined;
        rejectAck = undefined;
        return;
      case 'rejected':
        rejectAck?.(new Error(message.reason));
        rejectConfigured?.(new Error(message.reason));
        resolveAck = undefined;
        rejectAck = undefined;
        resolveConfigured = undefined;
        rejectConfigured = undefined;
        return;
      case 'configured':
        configuredSeen = true;
        resolveConfigured?.();
        resolveConfigured = undefined;
        rejectConfigured = undefined;
        return;
      case 'breakpoints':
        breakpoints.set(message.sourceId, message.items);
        controller?.setBreakpoints(message.sourceId, message.items);
        return;
      case 'setExceptionBreakpoints':
        filters.clear();
        for (const filter of message.filters) filters.add(filter);
        controller?.setExceptionFilters([...filters]);
        return;
      case 'resume':
        controller?.resume(message.mode);
        return;
      case 'pause':
        controller?.requestPause();
        return;
      case 'evaluate':
        void answerEvaluate(message.seq, message.frameIndex, message.expression);
        return;
      case 'scopes':
        void answerScopes(message.seq, message.frameIndex);
        return;
      case 'variables':
        void answerVariables(message.seq, message.variablesReference);
        return;
      case 'disconnect':
        dispose();
        return;
    }
  };

  const installConsole = (target: DebugController): void => {
    const originals = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
    };
    const patch =
      (method: keyof typeof originals, category: 'stdout' | 'stderr') =>
      (...args: unknown[]): void => {
        // Сначала devtools, потом адаптер — вывод не теряется и не рекурсирует.
        originals[method](...args);
        target.output(category, args.map(safeString).join(' '));
      };
    console.log = patch('log', 'stdout');
    console.info = patch('info', 'stdout');
    console.warn = patch('warn', 'stderr');
    console.error = patch('error', 'stderr');
    restoreConsole = () => {
      console.log = originals.log;
      console.info = originals.info;
      console.warn = originals.warn;
      console.error = originals.error;
    };
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    // stop() резолвит паузные гейты: страница не должна остаться замороженной.
    controller?.stop();
    restoreConsole?.();
    restoreConsole = undefined;
    rejectAck?.(new Error('Агент отладчика остановлен'));
    rejectConfigured?.(new Error('Агент отладчика остановлен'));
    resolveAck = undefined;
    rejectAck = undefined;
    resolveConfigured = undefined;
    rejectConfigured = undefined;
    const current = socket;
    socket = undefined;
    try {
      current?.close();
    } catch {
      // сокет уже закрыт
    }
  };

  const connectUntil = async (deadline: number): Promise<AgentSocket> => {
    let attempt = 0;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Адаптер отладчика недоступен');
      const candidate = socketFactory(`ws://127.0.0.1:${options.port}`);
      try {
        await openSocket(candidate, Math.min(remaining, CONNECT_ATTEMPT_MS), timers);
        return candidate;
      } catch {
        try {
          candidate.close();
        } catch {
          // сокет не открылся
        }
        attempt += 1;
        const backoff = Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_MAX_MS);
        if (Date.now() + backoff >= deadline) throw new Error('Адаптер отладчика недоступен');
        await delay(backoff, timers);
      }
    }
  };

  const handshake = (deadline: number, manifest: BlockInfo[]): Promise<void> => {
    const ack = new Promise<void>((resolve, reject) => {
      resolveAck = resolve;
      rejectAck = reject;
    });
    send({
      type: 'hello',
      v: 1,
      pageUrl: options.pageUrl,
      baseURI: options.baseURI,
      blocks: manifest,
      ...(options.token === undefined ? {} : { token: options.token }),
    });
    return withDeadline(ack, deadline, 'Отладчик не прислал helloAck', timers);
  };

  const waitConfigured = (deadline: number): Promise<void> => {
    if (configuredSeen) return Promise.resolve();
    const configured = new Promise<void>((resolve, reject) => {
      resolveConfigured = resolve;
      rejectConfigured = reject;
    });
    return withDeadline(
      configured,
      deadline,
      'Отладчик не прислал configured (configurationDone)',
      timers,
    );
  };

  return {
    async attach(): Promise<DebugController | null> {
      const deadline = Date.now() + timeoutMs;
      try {
        const manifest = await withDeadline(
          buildManifest(options.blocks, options.baseURI, fetchText),
          deadline,
          'Не удалось прочитать источники для отладчика',
          timers,
        );
        const connected = await connectUntil(deadline);
        socket = connected;
        connected.onmessage = (event) => {
          const message = parseMessage(event.data);
          if (message !== undefined) handleMessage(message);
        };
        connected.onclose = () => {
          // Адаптер пропал: страница продолжает жить без отладки.
          if (!disposed) dispose();
        };
        connected.onerror = () => {
          // за onerror придёт onclose; отдельная обработка не нужна
        };
        await handshake(deadline, manifest);
        controller = new DebugController(sink, { stopOnEntry });
        for (const [sourceId, specs] of breakpoints) controller.setBreakpoints(sourceId, specs);
        if (filters.size > 0) controller.setExceptionFilters([...filters]);
        installConsole(controller);
        await waitConfigured(deadline);
        return controller;
      } catch {
        // Любая ошибка рукопожатия — деградация без отладки, страница не падает.
        dispose();
        return null;
      }
    },
    dispose,
  };
}

/** Манифест блоков: текст inline берём из DOM, внешний `.osjs` — fetch'ем до hello. */
async function buildManifest(
  blocks: readonly AttachBlock[],
  baseURI: string,
  fetchText: (url: string) => Promise<string>,
): Promise<BlockInfo[]> {
  const manifest: BlockInfo[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    const entry: BlockInfo = { index: index + 1, text: block.text };
    if (block.id !== undefined && block.id !== '') entry.id = block.id;
    if (block.src !== undefined && block.src.trim() !== '') {
      entry.src = block.src;
      try {
        entry.text = await fetchText(new URL(block.src, baseURI).href);
      } catch {
        // Движок сообщит об ошибке загрузки сам; отладчик не должен мешать.
        entry.text = '';
      }
    }
    manifest.push(entry);
  }
  return manifest;
}

function openSocket(
  candidate: AgentSocket,
  timeoutMs: number,
  timers: AgentTimers,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      timers.clearTimeout(handle);
      candidate.onopen = null;
      candidate.onerror = null;
      candidate.onclose = null;
      if (error === undefined) resolve();
      else reject(error);
    };
    const handle = timers.setTimeout(
      () => finish(new Error('Таймаут подключения к отладчику')),
      timeoutMs,
    );
    candidate.onopen = () => finish();
    candidate.onerror = () => finish(new Error('Ошибка подключения к отладчику'));
    candidate.onclose = () => finish(new Error('Соединение с отладчиком закрыто'));
  });
}

function withDeadline<T>(
  promise: Promise<T>,
  deadline: number,
  message: string,
  timers: AgentTimers,
): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new Error(message));
  return new Promise<T>((resolve, reject) => {
    const handle = timers.setTimeout(() => reject(new Error(message)), remaining);
    promise.then(
      (value) => {
        timers.clearTimeout(handle);
        resolve(value);
      },
      (error: unknown) => {
        timers.clearTimeout(handle);
        reject(error);
      },
    );
  });
}

function delay(ms: number, timers: AgentTimers): Promise<void> {
  return new Promise<void>((resolve) => {
    timers.setTimeout(() => resolve(), ms);
  });
}

function parseMessage(data: unknown): AdapterMessage | undefined {
  if (typeof data !== 'string') return undefined;
  try {
    return JSON.parse(data) as AdapterMessage;
  } catch {
    return undefined;
  }
}

function defaultTimers(): AgentTimers {
  return {
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: (handle) => clearTimeout(handle),
  };
}

async function defaultFetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function safeString(value: unknown): string {
  try {
    return String(value);
  } catch {
    return '<значение>';
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
