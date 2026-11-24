import { readFileSync } from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';
import {
  Breakpoint,
  ContinuedEvent,
  ExitedEvent,
  InitializedEvent,
  LoggingDebugSession,
  OutputEvent,
  Scope,
  Source,
  StackFrame,
  StoppedEvent,
  TerminatedEvent,
  Thread,
} from '@vscode/debugadapter';
import type { DebugProtocol } from '@vscode/debugprotocol';
import type {
  AdapterMessage,
  BlockInfo,
  FrameInfo as PageFrameInfo,
  HelloMessage,
  PageMessage,
  ScopeInfo as PageScopeInfo,
  ThreadInfo as PageThreadInfo,
  VariableInfo as PageVariableInfo,
} from '../../debug/page-protocol';
import type { Program, Statement } from '../../ast/nodes';
import type { InlineBlockMap } from '../../debug/html-mapping';
import {
  blockLineToHtml,
  buildInlineBlockMaps,
  htmlLineToBlock,
} from '../../debug/html-mapping';
import { tokenize } from '../../lexer/lexer';
import { parse } from '../../parser/parser';
import { preprocessScript } from '../../parser/preprocessor';
import { DebugController } from '../../runtime/debug/controller';
import type {
  DebugBreakpointSpec,
  DebugSink,
  ExceptionFilter,
  FrameInfo,
} from '../../runtime/debug/controller';
import { formatErrorReport } from '../../runtime/error-snapshot';
import { stripBom } from '../module-source';
import { captureConsole } from './console-capture';
import { runLaunch } from './launch';
import { UrlMap } from './url-map';
import { createWsServer } from './ws-server';
import type { DebugWsServer, PageTransport } from './ws-server';

/** Аргументы `launch` из launch.json (контракт — data-model §2). */
interface LaunchArguments extends DebugProtocol.LaunchRequestArguments {
  program?: unknown;
  cwd?: unknown;
  stopOnEntry?: unknown;
}

/** Аргументы `attach` из launch.json (контракт — data-model §2). */
interface AttachArguments extends DebugProtocol.AttachRequestArguments {
  url?: unknown;
  webRoot?: unknown;
  port?: unknown;
  token?: unknown;
  origin?: unknown;
  stopOnEntry?: unknown;
  timeout?: unknown;
}

/** Разобранная конфигурация браузерного attach. */
export interface AttachConfig {
  url: string;
  webRoot: string;
  port: number;
  token?: string;
  origin?: string;
  stopOnEntry: boolean;
  connectTimeoutMs: number;
  helloTimeoutMs: number;
}

/** Источник, зарегистрированный по манифесту страницы. */
interface AttachSource {
  id: string;
  clientPath?: string;
  clientUrl?: string;
  kind: 'file' | 'inline-html' | 'dynamic' | 'stdin';
  text?: string;
  blockIndex?: number;
}

interface PendingPageRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

/** Состояние браузерной сессии: транспорт, источники и ожидания ответов страницы. */
interface AttachState {
  transport: PageTransport;
  urlMap: UrlMap;
  config: AttachConfig;
  sources: Map<string, AttachSource>;
  byPath: Map<string, AttachSource[]>;
  /** Inline-блоки страницы: `sourceId` движка → маппинг строк HTML. */
  inlineMaps: Map<string, InlineBlockMap>;
  /** Локальный файл страницы — `Source.path` для inline-кадров и брейкпоинтов. */
  htmlPagePath?: string;
  /** Ранее отправленные странице наборы брейкпоинтов по HTML-файлу. */
  htmlBreakpointSources: Map<string, Set<string>>;
  frames: PageFrameInfo[];
  threads: PageThreadInfo[];
  pending: Map<number, PendingPageRequest>;
  nextSeq: number;
  configured: boolean;
  helloSeen: boolean;
  closed: boolean;
  resolveHello?: (message: HelloMessage) => void;
  rejectHello?: (error: Error) => void;
}

/** Таймаут проксируемого запроса к странице (evaluate/scopes/variables). */
const PAGE_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_ATTACH_TIMEOUT_MS = 30_000;
const DEFAULT_HELLO_TIMEOUT_MS = 10_000;

/**
 * DAP-сессия отладчика BSL: Node `launch` (движок в процессе адаптера) и
 * браузерный `attach` (контроллер живёт на странице, запросы проксируются по
 * WebSocket). В launch stdout занят протоколом, поэтому вывод идёт в DAP-события.
 */
export class OsjsDebugSession extends LoggingDebugSession {
  private readonly sink: DebugSink;
  private controller?: DebugController;
  private programPath?: string;
  private programSource?: string;
  private cwd = process.cwd();
  private exitCode = 0;
  private terminatedSent = false;
  private disconnected = false;
  private restoreConsole?: () => void;
  private started = false;
  private pausedThreadId?: number;
  private readonly breakpointsBySource = new Map<string, DebugBreakpointSpec[]>();
  private readonly exceptionFilters = new Set<ExceptionFilter>(['uncaught']);
  private readonly executableLines = new Map<string, Set<number> | null>();
  /** Браузерная сессия; `undefined` — сессия Node launch. */
  private attach?: AttachState;
  private attachServer?: DebugWsServer;

  constructor() {
    super();
    this.sink = {
      stopped: (threadId, reason, _frames, description) => {
        this.pausedThreadId = threadId;
        const event = new StoppedEvent(reason, threadId, description);
        // Конструктор кладёт текст в `text`; контракт адаптера читает `description`.
        if (description !== undefined) {
          (event.body as DebugProtocol.StoppedEvent['body']).description = description;
        }
        this.sendEvent(event);
      },
      continued: (threadId, allThreads) => {
        this.sendEvent(new ContinuedEvent(threadId, allThreads));
      },
      output: (category, text) => this.emitOutput(category, text),
      // Полный список потоков отдаёт `threadsRequest`; отдельное событие не нужно.
      threads: () => undefined,
      terminated: (exitCode) => this.emitTerminated(exitCode),
    };
  }

  protected override initializeRequest(
    response: DebugProtocol.InitializeResponse,
    _args: DebugProtocol.InitializeRequestArguments,
  ): void {
    response.body = {
      supportsConfigurationDoneRequest: true,
      supportsEvaluateForHovers: true,
      supportsConditionalBreakpoints: true,
      supportsLogPoints: true,
      supportsTerminateRequest: false,
      supportsSetVariable: false,
      supportsFunctionBreakpoints: false,
      supportsRestartRequest: false,
      supportsHitConditionalBreakpoints: false,
      supportsSetExpression: false,
      supportsTerminateThreadsRequest: false,
      supportsExceptionOptions: false,
      supportsExceptionInfoRequest: false,
      supportsStepBack: false,
      supportsDelayedStackTraceLoading: false,
      exceptionBreakpointFilters: [
        { filter: 'uncaught', label: 'Необработанные исключения', default: true },
        { filter: 'all', label: 'Все исключения', default: false },
      ],
    };
    this.sendResponse(response);
  }

  protected override launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: DebugProtocol.LaunchRequestArguments,
  ): void {
    const launch = args as LaunchArguments;
    const program = launch.program;
    if (typeof program !== 'string' || program.trim() === '') {
      this.sendErrorResponse(response, {
        id: 1001,
        format: 'Не указан файл сценария (program) в конфигурации запуска',
        showUser: true,
      });
      return;
    }
    this.cwd =
      typeof launch.cwd === 'string' && launch.cwd !== '' ? resolve(launch.cwd) : process.cwd();
    const programPath = isAbsolute(program) ? resolve(program) : resolve(this.cwd, program);

    let source: string;
    try {
      source = stripBom(readFileSync(programPath, 'utf8'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sendErrorResponse(response, {
        id: 1001,
        format: `Не удалось прочитать файл '${programPath}': ${message}`,
        showUser: true,
      });
      return;
    }

    this.programPath = programPath;
    this.programSource = source;
    this.controller =
      launch.noDebug === true
        ? undefined
        : new DebugController(this.sink, { stopOnEntry: launch.stopOnEntry === true });
    if (this.controller !== undefined) {
      this.controller.registerSource({
        id: programPath,
        path: programPath,
        text: source,
        kind: 'file',
      });
      this.controller.setExceptionFilters([...this.exceptionFilters]);
      for (const [sourceId, specs] of this.breakpointsBySource) {
        this.controller.setBreakpoints(sourceId, specs);
      }
    }

    this.sendResponse(response);
    // Клиент ждёт `initialized`, чтобы прислать брейкпоинты и configurationDone.
    this.sendEvent(new InitializedEvent());
  }

  /**
   * Точка инъекции транспорта: тесты подменяют её фейковым page-agent'ом, а
   * продакшен поднимает WebSocket-сервер на `127.0.0.1:<port>`.
   */
  protected async openAttachTransport(config: AttachConfig): Promise<PageTransport> {
    const server = await createWsServer({
      port: config.port,
      ...(config.token === undefined ? {} : { token: config.token }),
      ...(config.origin === undefined ? {} : { origin: config.origin }),
    });
    this.attachServer = server;
    return server.waitForClient(config.connectTimeoutMs);
  }

  protected override attachRequest(
    response: DebugProtocol.AttachResponse,
    args: DebugProtocol.AttachRequestArguments,
  ): void {
    if (this.attach !== undefined) {
      this.sendErrorResponse(response, {
        id: 1003,
        format: 'Сессия отладки браузера уже запущена',
        showUser: true,
      });
      return;
    }
    const parsed = parseAttachConfig(args);
    if (parsed.config === undefined) {
      this.sendErrorResponse(response, {
        id: 1004,
        format: parsed.error ?? 'Некорректная конфигурация attach',
        showUser: true,
      });
      return;
    }
    void this.startAttach(response, parsed.config);
  }

  /** Сервер поднят и страница подключилась — только теперь отвечаем успехом. */
  private async startAttach(
    response: DebugProtocol.AttachResponse,
    config: AttachConfig,
  ): Promise<void> {
    let transport: PageTransport;
    try {
      transport = await this.openAttachTransport(config);
    } catch (error) {
      this.closeAttachServer();
      const message = error instanceof Error ? error.message : String(error);
      this.sendErrorResponse(response, {
        id: 1003,
        format: `Не удалось подключиться к странице: ${message}`,
        showUser: true,
      });
      return;
    }
    if (this.disconnected) {
      transport.close();
      this.closeAttachServer();
      return;
    }
    this.sendResponse(response);
    void this.completeAttach(transport, config);
  }

  /** Ждёт `hello`; до него сессия не считается инициализированной. */
  private async completeAttach(transport: PageTransport, config: AttachConfig): Promise<void> {
    const state: AttachState = {
      transport,
      urlMap: new UrlMap({ webRoot: config.webRoot }),
      config,
      sources: new Map(),
      byPath: new Map(),
      inlineMaps: new Map(),
      htmlBreakpointSources: new Map(),
      frames: [],
      threads: [{ id: 1, name: 'Главный поток' }],
      pending: new Map(),
      nextSeq: 0,
      configured: false,
      helloSeen: false,
      closed: false,
    };
    this.attach = state;
    const hello = new Promise<HelloMessage>((resolve, reject) => {
      state.resolveHello = resolve;
      state.rejectHello = reject;
    });
    transport.onMessage((message) => this.onPageMessage(state, message));
    transport.onClose(() => this.onPageClose(state));
    try {
      await withTimeout(hello, config.helloTimeoutMs, 'Страница не прислала hello');
    } catch (error) {
      if (state.closed) return;
      const message = error instanceof Error ? error.message : String(error);
      this.emitOutput(
        'stderr',
        `Отладчик браузера: ${message}. Откройте страницу с подключённым onescript-debug.js ` +
          '(dev-инъекция OSJS_DEBUG=1 или <script src="onescript-debug.js"></script>).',
      );
      this.emitAttachTerminated();
      this.closeAttach(state);
      if (this.attach === state) this.attach = undefined;
    }
  }

  private onPageMessage(state: AttachState, message: PageMessage): void {
    switch (message.type) {
      case 'hello':
        void this.handleHello(state, message);
        return;
      case 'source':
        this.handleSource(state, message);
        return;
      case 'stopped':
        state.frames = message.frames;
        this.sendEvent(new StoppedEvent(message.reason, message.threadId, message.description));
        return;
      case 'continued':
        this.sendEvent(new ContinuedEvent(message.threadId, message.allThreadsContinued ?? true));
        return;
      case 'output':
        this.emitOutput(message.category, message.text);
        return;
      case 'threads':
        state.threads = message.threads;
        return;
      case 'evaluateResult':
      case 'scopesResult':
      case 'variablesResult':
        this.settlePageRequest(state, message);
        return;
      case 'terminated':
        this.emitAttachTerminated();
        return;
      case 'error':
        this.emitOutput('stderr', `Отладчик: ${message.message}`);
        return;
    }
  }

  private async handleHello(state: AttachState, message: HelloMessage): Promise<void> {
    if (state.helloSeen) return;
    state.helloSeen = true;
    // URL страницы + baseURI дают URL-корень webRoot: без него импортированные
    // модули получают двойной префикс каталога страницы и брейкпоинты не срабатывают.
    state.urlMap.setPageUrl(message.pageUrl);
    state.urlMap.setBaseURI(message.baseURI);
    for (const block of message.blocks) this.registerBlockSource(state, message, block);
    // Маппинг HTML-строк нужен до helloAck: клиент пришлёт setBreakpoints сразу после него.
    await this.loadInlineMaps(state, message);
    if (state.closed) return;
    this.sendPage(state, {
      type: 'helloAck',
      sessionId: 'osjs-browser',
      stopOnEntry: state.config.stopOnEntry,
    });
    // Только после helloAck клиент пришлёт setBreakpoints и configurationDone.
    this.sendEvent(new InitializedEvent());
    state.resolveHello?.(message);
    state.resolveHello = undefined;
    state.rejectHello = undefined;
  }

  /**
   * Читает HTML страницы и строит маппинг inline-блоков. Локальный файл — основной
   * путь (страница отдаётся dev-сервером из рабочей области); иначе — HTTP GET.
   * Без HTML маппинга нет: брейкпоинты в inline-блоках не верифицируются.
   */
  private async loadInlineMaps(state: AttachState, message: HelloMessage): Promise<void> {
    const pagePath = state.urlMap.toFilePath(message.pageUrl);
    let html: string | undefined;
    if (pagePath !== undefined) {
      state.htmlPagePath = pagePath;
      try {
        html = readFileSync(pagePath, 'utf8');
      } catch {
        // Файл мог исчезнуть между маппингом и чтением — пробуем HTTP.
        html = undefined;
      }
    }
    if (html === undefined) html = await fetchPageHtml(message.pageUrl);
    if (html === undefined) {
      this.emitOutput(
        'stderr',
        `Отладчик: не удалось прочитать HTML страницы '${message.pageUrl}' — ` +
          'брейкпоинты в inline-блоках не верифицируются.',
      );
      return;
    }
    for (const map of buildInlineBlockMaps(
      html,
      message.pageUrl,
      message.baseURI,
      message.blocks,
    )) {
      state.inlineMaps.set(map.sourceId, map);
    }
  }

  private registerBlockSource(
    state: AttachState,
    message: HelloMessage,
    block: BlockInfo,
  ): void {
    if (typeof block.src === 'string' && block.src.trim() !== '') {
      let url: string;
      try {
        url = new URL(block.src, message.baseURI).href;
      } catch {
        return;
      }
      const clientPath = state.urlMap.toFilePath(url);
      this.addAttachSource(state, {
        id: url,
        clientUrl: url,
        kind: 'file',
        text: block.text,
        ...(clientPath === undefined ? {} : { clientPath }),
      });
      return;
    }
    // sourceId inline-блока совпадает с движком: `${baseURI}#${id || blockN}`.
    const id = `${message.baseURI}#${block.id ?? `block${block.index}`}`;
    const pagePath = state.urlMap.toFilePath(message.pageUrl);
    this.addAttachSource(state, {
      id,
      clientUrl: message.pageUrl,
      kind: 'inline-html',
      text: block.text,
      blockIndex: block.index,
      ...(pagePath === undefined ? {} : { clientPath: pagePath }),
    });
  }

  private addAttachSource(state: AttachState, source: AttachSource): void {
    state.sources.set(source.id, source);
    if (source.clientPath === undefined) return;
    const sources = state.byPath.get(source.clientPath) ?? [];
    if (!sources.some((item) => item.id === source.id)) sources.push(source);
    state.byPath.set(source.clientPath, sources);
  }

  private handleSource(
    state: AttachState,
    message: { id: string; text: string; kind: AttachSource['kind'] },
  ): void {
    const existing = state.sources.get(message.id);
    if (existing !== undefined) {
      existing.text = message.text;
      existing.kind = message.kind;
      return;
    }
    this.addAttachSource(state, { id: message.id, kind: message.kind, text: message.text });
  }

  private settlePageRequest(
    state: AttachState,
    message: Extract<PageMessage, { type: 'evaluateResult' | 'scopesResult' | 'variablesResult' }>,
  ): void {
    const pending = state.pending.get(message.seq);
    if (pending === undefined) return;
    state.pending.delete(message.seq);
    clearTimeout(pending.timer);
    if (!message.ok) {
      pending.reject(new Error(message.error ?? 'Страница не выполнила запрос отладчика'));
      return;
    }
    const value =
      message.type === 'evaluateResult'
        ? message.result
        : message.type === 'scopesResult'
          ? message.scopes
          : message.variables;
    pending.resolve(value);
  }

  private onPageClose(state: AttachState): void {
    if (state.closed) return;
    state.closed = true;
    state.rejectHello?.(new Error('Страница закрыла соединение'));
    state.resolveHello = undefined;
    state.rejectHello = undefined;
    for (const pending of state.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Страница отключилась'));
    }
    state.pending.clear();
    this.closeAttachServer();
    this.emitAttachTerminated();
    if (this.attach === state) this.attach = undefined;
  }

  private closeAttach(state: AttachState): void {
    if (!state.closed) {
      state.closed = true;
      state.rejectHello?.(new Error('Сессия отладки завершена'));
      state.resolveHello = undefined;
      state.rejectHello = undefined;
      for (const pending of state.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Сессия отладки завершена'));
      }
      state.pending.clear();
    }
    try {
      state.transport.close();
    } catch {
      // транспорт уже закрыт
    }
    this.closeAttachServer();
  }

  private closeAttachServer(): void {
    const server = this.attachServer;
    this.attachServer = undefined;
    if (server === undefined) return;
    try {
      server.close();
    } catch {
      // сервер уже остановлен
    }
  }

  private sendPage(state: AttachState, message: AdapterMessage): void {
    if (state.closed) return;
    try {
      state.transport.send(message);
    } catch {
      // сбой транспорта не должен ломать DAP-сессию
    }
  }

  private requestPage<T>(
    state: AttachState,
    build: (seq: number) => AdapterMessage,
  ): Promise<T> {
    const seq = ++state.nextSeq;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        state.pending.delete(seq);
        reject(new Error('Страница не ответила на запрос отладчика'));
      }, PAGE_REQUEST_TIMEOUT_MS);
      state.pending.set(seq, { resolve: (value) => resolve(value as T), reject, timer });
      this.sendPage(state, build(seq));
    });
  }

  private attachFrameIndex(state: AttachState, frameId: number): number {
    const index = state.frames.findIndex((frame) => frame.id === frameId);
    if (index < 0) throw new Error(`Кадр ${frameId} не найден в остановленном стеке`);
    return index;
  }

  private emitAttachTerminated(): void {
    if (this.terminatedSent) return;
    this.terminatedSent = true;
    this.sendEvent(new TerminatedEvent());
  }

  private setAttachBreakpoints(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments,
  ): void {
    const state = this.attach;
    if (state === undefined) return;
    const requested = args.breakpoints ?? [];
    const unverified = (): void => {
      response.body = { breakpoints: requested.map(() => new Breakpoint(false)) };
      this.sendResponse(response);
    };
    const path = args.source?.path;
    if (typeof path !== 'string' || path === '') {
      unverified();
      return;
    }
    const absolute = isAbsolute(path) ? resolve(path) : resolve(state.config.webRoot, path);
    const candidates = state.byPath.get(absolute) ?? [];
    const fileSource = candidates.find((source) => source.kind === 'file');
    if (fileSource === undefined && candidates.some((source) => source.kind === 'inline-html')) {
      this.setHtmlBreakpoints(response, state, absolute, requested);
      return;
    }
    let sourceId: string;
    if (fileSource !== undefined) {
      sourceId = fileSource.id;
    } else {
      const url = state.urlMap.toSourceId(absolute);
      if (url === undefined) {
        unverified();
        return;
      }
      sourceId = url;
    }
    const lines = this.executableLinesFor(sourceId);
    if (lines === null) {
      // Текст источника неизвестен — верифицировать строку нечем; набор очищаем.
      this.breakpointsBySource.delete(sourceId);
      this.sendPage(state, { type: 'breakpoints', sourceId, replace: true, items: [] });
      unverified();
      return;
    }

    const specs: DebugBreakpointSpec[] = [];
    const seen = new Set<number>();
    const result = requested.map((breakpoint) => {
      const line = typeof breakpoint.line === 'number' ? breakpoint.line : 0;
      const verifiedLine = nearestExecutable(lines, line);
      if (verifiedLine === undefined) return new Breakpoint(false);
      if (!seen.has(verifiedLine)) {
        seen.add(verifiedLine);
        const spec: DebugBreakpointSpec = { line: verifiedLine };
        if (typeof breakpoint.condition === 'string' && breakpoint.condition !== '') {
          spec.condition = breakpoint.condition;
        }
        if (typeof breakpoint.logMessage === 'string') spec.logMessage = breakpoint.logMessage;
        specs.push(spec);
      }
      return new Breakpoint(true, verifiedLine, undefined, this.sourceFor(sourceId));
    });

    this.breakpointsBySource.set(sourceId, specs);
    this.sendPage(state, { type: 'breakpoints', sourceId, replace: true, items: specs });
    response.body = { breakpoints: result };
    this.sendResponse(response);
  }

  /**
   * Брейкпоинты HTML-файла: каждая строка мапится в (engineSourceId, blockLocalLine)
   * и уходит странице; DAP отвечает HTML-строкой того оператора, на котором
   * остановится движок. Наборы, которых нет в новом запросе, очищаются на странице
   * (DAP `setBreakpoints` заменяет файл).
   */
  private setHtmlBreakpoints(
    response: DebugProtocol.SetBreakpointsResponse,
    state: AttachState,
    htmlPath: string,
    requested: DebugProtocol.SourceBreakpoint[],
  ): void {
    const maps = [...state.inlineMaps.values()];
    if (maps.length === 0) {
      response.body = { breakpoints: requested.map(() => new Breakpoint(false)) };
      this.sendResponse(response);
      return;
    }

    const groups = new Map<string, DebugBreakpointSpec[]>();
    const seen = new Set<string>();
    const result = requested.map((breakpoint) => {
      const htmlLine = typeof breakpoint.line === 'number' ? breakpoint.line : 0;
      const mapped = findInlineMap(maps, htmlLine);
      if (mapped === undefined) return new Breakpoint(false);
      // Строка открывающего тега — не код блока: движок на ней не остановится.
      if (htmlLine === mapped.map.htmlContentStartLine) return new Breakpoint(false);
      // Движок останавливается только на строках операторов, поэтому строку без
      // оператора привязываем к следующему оператору этого же блока — иначе
      // брейкпоинт «verified», но никогда не срабатывает.
      const lines = this.executableLinesFor(mapped.map.sourceId);
      const adjusted = lines === null ? undefined : nearestExecutable(lines, mapped.blockLine);
      if (adjusted === undefined) return new Breakpoint(false);
      const htmlAdjusted = blockLineToHtml(mapped.map, adjusted);
      if (htmlAdjusted === undefined) return new Breakpoint(false);
      const key = `${mapped.map.sourceId}\u0000${adjusted}`;
      if (!seen.has(key)) {
        seen.add(key);
        const spec: DebugBreakpointSpec = { line: adjusted };
        if (typeof breakpoint.condition === 'string' && breakpoint.condition !== '') {
          spec.condition = breakpoint.condition;
        }
        if (typeof breakpoint.logMessage === 'string') spec.logMessage = breakpoint.logMessage;
        const items = groups.get(mapped.map.sourceId) ?? [];
        items.push(spec);
        groups.set(mapped.map.sourceId, items);
      }
      return new Breakpoint(true, htmlAdjusted, undefined, this.sourceFor(mapped.map.sourceId));
    });

    const previous = state.htmlBreakpointSources.get(htmlPath) ?? new Set<string>();
    for (const [sourceId, items] of groups) {
      this.sendPage(state, { type: 'breakpoints', sourceId, replace: true, items });
    }
    for (const sourceId of previous) {
      if (groups.has(sourceId)) continue;
      this.sendPage(state, { type: 'breakpoints', sourceId, replace: true, items: [] });
    }
    state.htmlBreakpointSources.set(htmlPath, new Set(groups.keys()));
    response.body = { breakpoints: result };
    this.sendResponse(response);
  }

  protected override setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments,
  ): void {
    if (this.attach !== undefined) {
      this.setAttachBreakpoints(response, args);
      return;
    }
    const requested = args.breakpoints ?? [];
    const path = args.source?.path;
    if (typeof path !== 'string' || path === '') {
      response.body = { breakpoints: requested.map(() => new Breakpoint(false)) };
      this.sendResponse(response);
      return;
    }

    const sourceId = this.sourceIdFor(path);
    const lines = this.executableLinesFor(sourceId);
    const specs: DebugBreakpointSpec[] = [];
    const seen = new Set<number>();
    const result = requested.map((breakpoint) => {
      const line = typeof breakpoint.line === 'number' ? breakpoint.line : 0;
      const verifiedLine = lines === null ? undefined : nearestExecutable(lines, line);
      if (verifiedLine === undefined) return new Breakpoint(false);
      if (!seen.has(verifiedLine)) {
        seen.add(verifiedLine);
        const spec: DebugBreakpointSpec = { line: verifiedLine };
        if (typeof breakpoint.condition === 'string' && breakpoint.condition !== '') {
          spec.condition = breakpoint.condition;
        }
        if (typeof breakpoint.logMessage === 'string') spec.logMessage = breakpoint.logMessage;
        specs.push(spec);
      }
      return new Breakpoint(true, verifiedLine, undefined, this.sourceFor(sourceId));
    });

    this.breakpointsBySource.set(sourceId, specs);
    this.controller?.setBreakpoints(sourceId, specs);
    response.body = { breakpoints: result };
    this.sendResponse(response);
  }

  protected override setExceptionBreakPointsRequest(
    response: DebugProtocol.SetExceptionBreakpointsResponse,
    args: DebugProtocol.SetExceptionBreakpointsArguments,
  ): void {
    this.exceptionFilters.clear();
    for (const filter of args.filters ?? []) {
      if (filter === 'uncaught' || filter === 'all') this.exceptionFilters.add(filter);
    }
    if (this.attach !== undefined) {
      this.sendPage(this.attach, {
        type: 'setExceptionBreakpoints',
        filters: [...this.exceptionFilters],
      });
      this.sendResponse(response);
      return;
    }
    this.controller?.setExceptionFilters([...this.exceptionFilters]);
    this.sendResponse(response);
  }

  protected override configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    _args: DebugProtocol.ConfigurationDoneArguments,
  ): void {
    if (this.attach !== undefined) {
      // Страница исполняет блоки только после `configured` (гейт до configurationDone),
      // и по контракту сообщение приходит ровно один раз.
      if (!this.attach.configured) {
        this.attach.configured = true;
        this.sendPage(this.attach, { type: 'configured' });
      }
      this.sendResponse(response);
      return;
    }
    // Движок стартует после ответа: клиент успевает завершить настройку сессии.
    this.sendResponse(response);
    void this.runScript();
  }

  protected override threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    if (this.attach !== undefined) {
      const threads =
        this.attach.threads.length > 0
          ? this.attach.threads
          : [{ id: 1, name: 'Главный поток' }];
      response.body = { threads: threads.map((thread) => new Thread(thread.id, thread.name)) };
      this.sendResponse(response);
      return;
    }
    const threads = this.controller?.threads() ?? [];
    response.body = { threads: threads.map((thread) => new Thread(thread.id, thread.name)) };
    this.sendResponse(response);
  }

  protected override stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    args: DebugProtocol.StackTraceArguments,
  ): void {
    if (this.attach !== undefined) {
      const frames = this.attach.frames;
      const start = Math.max(0, args.startFrame ?? 0);
      const levels = args.levels !== undefined && args.levels > 0 ? args.levels : frames.length;
      const stackFrames = frames
        .slice(start, start + levels)
        .map(
          (frame) =>
            new StackFrame(
              frame.id,
              frame.method,
              this.sourceFor(frame.sourceId),
              this.attachLine(frame),
              1,
            ),
        );
      response.body = { stackFrames, totalFrames: frames.length };
      this.sendResponse(response);
      return;
    }
    const frames = this.controller?.stackTrace(args.threadId) ?? [];
    const start = Math.max(0, args.startFrame ?? 0);
    const levels = args.levels !== undefined && args.levels > 0 ? args.levels : frames.length;
    const stackFrames = frames
      .slice(start, start + levels)
      .map((frame) => this.toStackFrame(frame));
    response.body = { stackFrames, totalFrames: frames.length };
    this.sendResponse(response);
  }

  protected override async scopesRequest(
    response: DebugProtocol.ScopesResponse,
    args: DebugProtocol.ScopesArguments,
  ): Promise<void> {
    if (this.attach !== undefined) {
      const state = this.attach;
      try {
        const frameIndex = this.attachFrameIndex(state, args.frameId);
        const scopes = await this.requestPage<PageScopeInfo[]>(state, (seq) => ({
          type: 'scopes',
          seq,
          frameIndex,
        }));
        response.body = {
          scopes: scopes.map(
            (scope) => new Scope(scope.name, scope.variablesReference, scope.expensive ?? false),
          ),
        };
        this.sendResponse(response);
      } catch (error) {
        this.sendErrorResponse(response, {
          id: 1005,
          format: error instanceof Error ? error.message : String(error),
          showUser: false,
        });
      }
      return;
    }
    const scopes = this.controller?.scopes(args.frameId) ?? [];
    response.body = {
      scopes: scopes.map((scope) => new Scope(scope.name, scope.variablesReference, scope.expensive ?? false)),
    };
    this.sendResponse(response);
  }

  protected override async variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments,
  ): Promise<void> {
    if (this.attach !== undefined) {
      const state = this.attach;
      try {
        const variables = await this.requestPage<PageVariableInfo[]>(state, (seq) => ({
          type: 'variables',
          seq,
          variablesReference: args.variablesReference,
        }));
        response.body = { variables: variables.map(toDapVariable) };
        this.sendResponse(response);
      } catch (error) {
        this.sendErrorResponse(response, {
          id: 1006,
          format: error instanceof Error ? error.message : String(error),
          showUser: false,
        });
      }
      return;
    }
    const variables = this.controller?.variables(args.variablesReference) ?? [];
    response.body = { variables: variables.map(toDapVariable) };
    this.sendResponse(response);
  }

  protected override async evaluateRequest(
    response: DebugProtocol.EvaluateResponse,
    args: DebugProtocol.EvaluateArguments,
  ): Promise<void> {
    if (this.attach !== undefined) {
      await this.evaluateAttach(response, args);
      return;
    }
    try {
      const frameId = args.frameId ?? this.currentFrameId();
      if (this.controller === undefined || frameId === undefined) {
        throw new Error('Исполнение не остановлено: evaluate доступен только на паузе');
      }
      const info = await this.controller.evaluate(frameId, args.expression);
      response.body = {
        result: info.value,
        type: info.type,
        variablesReference: info.variablesReference,
        ...(info.namedVariables !== undefined ? { namedVariables: info.namedVariables } : {}),
        ...(info.indexedVariables !== undefined
          ? { indexedVariables: info.indexedVariables }
          : {}),
      };
      this.sendResponse(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Hover не должен показывать ошибку DAP: клиент ждёт значение, поэтому отдаём
      // `err: <выражение>` как результат (как в эталонном отладчике OneScript).
      if (args.context === 'hover') {
        response.body = { result: `err: ${args.expression}`, variablesReference: 0 };
        this.sendResponse(response);
        return;
      }
      this.sendErrorResponse(response, { id: 1002, format: message, showUser: true });
    }
  }

  protected override continueRequest(
    response: DebugProtocol.ContinueResponse,
    args: DebugProtocol.ContinueArguments,
  ): void {
    if (this.attach !== undefined) {
      this.sendPage(this.attach, { type: 'resume', threadId: args.threadId, mode: 'continue' });
      response.body = { allThreadsContinued: true };
      this.sendResponse(response);
      return;
    }
    this.controller?.resume('continue');
    response.body = { allThreadsContinued: true };
    this.sendResponse(response);
  }

  protected override nextRequest(
    response: DebugProtocol.NextResponse,
    args: DebugProtocol.NextArguments,
  ): void {
    if (this.attach !== undefined) {
      this.sendPage(this.attach, { type: 'resume', threadId: args.threadId, mode: 'next' });
      this.sendResponse(response);
      return;
    }
    this.controller?.resume('next');
    this.sendResponse(response);
  }

  protected override stepInRequest(
    response: DebugProtocol.StepInResponse,
    args: DebugProtocol.StepInArguments,
  ): void {
    if (this.attach !== undefined) {
      this.sendPage(this.attach, { type: 'resume', threadId: args.threadId, mode: 'stepIn' });
      this.sendResponse(response);
      return;
    }
    this.controller?.resume('stepIn');
    this.sendResponse(response);
  }

  protected override stepOutRequest(
    response: DebugProtocol.StepOutResponse,
    args: DebugProtocol.StepOutArguments,
  ): void {
    if (this.attach !== undefined) {
      this.sendPage(this.attach, { type: 'resume', threadId: args.threadId, mode: 'stepOut' });
      this.sendResponse(response);
      return;
    }
    this.controller?.resume('stepOut');
    this.sendResponse(response);
  }

  protected override pauseRequest(
    response: DebugProtocol.PauseResponse,
    args: DebugProtocol.PauseArguments,
  ): void {
    if (this.attach !== undefined) {
      this.sendPage(this.attach, {
        type: 'pause',
        ...(args.threadId === undefined ? {} : { threadId: args.threadId }),
      });
      this.sendResponse(response);
      return;
    }
    this.controller?.requestPause();
    this.sendResponse(response);
  }

  protected override disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    _args: DebugProtocol.DisconnectArguments,
  ): void {
    if (this.attach !== undefined) {
      const state = this.attach;
      this.attach = undefined;
      // Ответ раньше закрытия: клиент должен получить подтверждение disconnect.
      this.sendResponse(response);
      this.sendPage(state, { type: 'disconnect' });
      this.closeAttach(state);
      this.disconnected = true;
      return;
    }
    // Ответ раньше terminated: клиент должен получить подтверждение disconnect.
    this.sendResponse(response);
    // stop() резолвит все паузные гейты — ни скрипт, ни промисы не остаются висеть.
    if (this.controller?.enabled === true) this.controller.stop();
    // Протокол завершён: дальше не пишем в поток и возвращаем глобальный console,
    // пока движок доигрывает остаток сценария.
    this.disconnected = true;
    this.restoreConsole?.();
    this.restoreConsole = undefined;
  }

  private async evaluateAttach(
    response: DebugProtocol.EvaluateResponse,
    args: DebugProtocol.EvaluateArguments,
  ): Promise<void> {
    const state = this.attach;
    if (state === undefined) return;
    try {
      const frameId = args.frameId ?? state.frames[0]?.id;
      if (frameId === undefined) throw new Error('Не указан кадр для evaluate');
      const frameIndex = this.attachFrameIndex(state, frameId);
      const info = await this.requestPage<PageVariableInfo>(state, (seq) => ({
        type: 'evaluate',
        seq,
        frameIndex,
        expression: args.expression,
      }));
      response.body = {
        result: info.value,
        type: info.type,
        variablesReference: info.variablesReference,
        ...(info.namedVariables !== undefined ? { namedVariables: info.namedVariables } : {}),
        ...(info.indexedVariables !== undefined
          ? { indexedVariables: info.indexedVariables }
          : {}),
      };
      this.sendResponse(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Hover не должен показывать ошибку DAP: клиент ждёт значение.
      if (args.context === 'hover') {
        response.body = { result: `err: ${args.expression}`, variablesReference: 0 };
        this.sendResponse(response);
        return;
      }
      this.sendErrorResponse(response, { id: 1002, format: message, showUser: true });
    }
  }

  /** Абсолютный путь → идентификатор источника движка (main и модули — пути). */
  private sourceIdFor(path: string): string {
    return isAbsolute(path) ? resolve(path) : resolve(this.cwd, path);
  }

  private sourceFor(sourceId: string): Source {
    const attached = this.attach?.sources.get(sourceId);
    if (attached !== undefined) {
      if (attached.kind === 'file' && attached.clientPath !== undefined) {
        return new Source(basename(attached.clientPath), attached.clientPath);
      }
      if (attached.kind === 'inline-html' && this.attach?.inlineMaps.has(sourceId) === true) {
        // Inline-блок живёт в HTML-файле страницы: DAP-источник — этот файл.
        const pagePath = this.attach.htmlPagePath;
        if (pagePath !== undefined) return new Source(basename(pagePath), pagePath);
      }
      return new Source(sourceId);
    }
    // Импортированные модули не приходят в манифесте (их грузит движок), поэтому
    // URL кадра мапим на файл рабочей области через webRoot — иначе шаг «внутрь»
    // упирается в источник без содержимого.
    if (this.attach !== undefined) {
      const path = this.attach.urlMap.toFilePath(sourceId);
      if (path !== undefined) return new Source(basename(path), path);
    }
    return isAbsolute(sourceId)
      ? new Source(basename(sourceId), sourceId)
      : new Source(sourceId);
  }

  /** Строка кадра страницы: у inline-блока — строка HTML, у файла — как есть. */
  private attachLine(frame: PageFrameInfo): number {
    const map = this.attach?.inlineMaps.get(frame.sourceId);
    if (map === undefined) return frame.line;
    return blockLineToHtml(map, frame.line) ?? frame.line;
  }

  /** Исполняемые строки файла по AST; `null` — файл не читается/не разбирается. */
  private executableLinesFor(sourceId: string): Set<number> | null {
    const cached = this.executableLines.get(sourceId);
    if (cached !== undefined) return cached;
    let text: string | undefined = this.attach?.sources.get(sourceId)?.text;
    if (text === undefined) {
      // launch: sourceId — путь; attach: URL источника → файл рабочей области.
      const path = this.attach === undefined ? sourceId : this.attach.urlMap.toFilePath(sourceId);
      if (path !== undefined) {
        try {
          text = stripBom(readFileSync(path, 'utf8'));
        } catch {
          text = undefined;
        }
      }
    }
    let lines: Set<number> | null;
    if (text === undefined) {
      lines = null;
    } else {
      try {
        lines = collectExecutableLines(parse(preprocessScript(tokenize(text)).tokens));
      } catch {
        lines = null;
      }
    }
    this.executableLines.set(sourceId, lines);
    return lines;
  }

  private toStackFrame(frame: FrameInfo): StackFrame {
    return new StackFrame(frame.id, frame.method, this.sourceFor(frame.sourceId), frame.line, 1);
  }

  private currentFrameId(): number | undefined {
    if (this.pausedThreadId === undefined) return undefined;
    return this.controller?.stackTrace(this.pausedThreadId)[0]?.id;
  }

  private emitOutput(category: 'stdout' | 'stderr' | 'console', text: string): void {
    if (this.disconnected) return;
    this.sendEvent(new OutputEvent(text.endsWith('\n') ? text : `${text}\n`, category));
  }

  private emitTerminated(exitCode?: number): void {
    if (this.terminatedSent) return;
    this.terminatedSent = true;
    this.sendEvent(new ExitedEvent(exitCode ?? this.exitCode));
    this.sendEvent(new TerminatedEvent());
  }

  private async runScript(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const programPath = this.programPath;
    const source = this.programSource;
    if (programPath === undefined || source === undefined) {
      this.emitOutput('stderr', 'Сценарий не был запущен: launch не выполнен');
      this.emitTerminated(1);
      return;
    }
    const restore = captureConsole((category, text) => this.sink.output(category, text));
    this.restoreConsole = restore;
    try {
      this.exitCode = await runLaunch(programPath, source, this.controller, (category, text) =>
        this.sink.output(category, text),
      );
    } catch (error) {
      this.exitCode = 1;
      this.sink.output('stderr', formatErrorReport(error));
    } finally {
      this.restoreConsole = undefined;
      restore();
    }
    if (this.terminatedSent) return;
    if (this.controller?.enabled === true) {
      // stop() сам пришлёт terminated с накопленным кодом завершения.
      this.controller.stop();
    } else {
      this.emitTerminated(this.exitCode);
    }
  }
}

/** Строки начала исполняемых операторов: ровно те, на которых сработает хук `exec`. */
function collectExecutableLines(program: Program): Set<number> {
  const lines = new Set<number>();
  const visit = (statements: readonly Statement[], topLevel: boolean): void => {
    for (const statement of statements) {
      if (statement.kind === 'MethodDeclaration') {
        // Объявление метода не исполняется; его тело — исполняется при вызове.
        visit(statement.body, false);
        continue;
      }
      // `Перем` в секции модуля не проходит через `exec`; внутри тела — проходит.
      if (statement.kind === 'VariableDeclaration' && topLevel) continue;
      lines.add(statement.pos.line);
      switch (statement.kind) {
        case 'IfStatement':
          visit(statement.thenBranch, false);
          if (Array.isArray(statement.elseBranch)) visit(statement.elseBranch, false);
          else if (statement.elseBranch !== null) visit([statement.elseBranch], false);
          break;
        case 'ForLoop':
        case 'WhileLoop':
        case 'ForEachLoop':
          visit(statement.body, false);
          break;
        case 'TryExceptStatement':
          visit(statement.tryBody, false);
          visit(statement.exceptBody, false);
          break;
        default:
          break;
      }
    }
  };
  visit(program.body, true);
  return lines;
}

/** Точное попадание либо ближайшая следующая исполняемая строка файла. */
function nearestExecutable(lines: ReadonlySet<number>, requested: number): number | undefined {
  if (lines.has(requested)) return requested;
  let next: number | undefined;
  for (const line of lines) {
    if (line > requested && (next === undefined || line < next)) next = line;
  }
  return next;
}

/** DAP-переменная: `Variable` из библиотеки не отдаёт `type`, а он нужен клиенту. */
function toDapVariable(variable: PageVariableInfo): DebugProtocol.Variable {
  return {
    name: variable.name,
    value: variable.value,
    type: variable.type,
    variablesReference: variable.variablesReference,
    ...(variable.indexedVariables === undefined
      ? {}
      : { indexedVariables: variable.indexedVariables }),
    ...(variable.namedVariables === undefined ? {} : { namedVariables: variable.namedVariables }),
  };
}

/** Разбор attach-конфигурации: ошибки возвращаются текстом, а не исключением. */
function parseAttachConfig(
  args: DebugProtocol.AttachRequestArguments,
): { config?: AttachConfig; error?: string } {
  const raw = args as AttachArguments;
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (url === '') return { error: 'Не указан URL страницы (url) в конфигурации attach' };
  const webRoot =
    typeof raw.webRoot === 'string' && raw.webRoot !== '' ? resolve(raw.webRoot) : process.cwd();
  const port =
    typeof raw.port === 'number' &&
    Number.isInteger(raw.port) &&
    raw.port > 0 &&
    raw.port <= 65535
      ? raw.port
      : 9229;
  const timeout =
    typeof raw.timeout === 'number' && raw.timeout > 0
      ? raw.timeout
      : DEFAULT_ATTACH_TIMEOUT_MS;
  const config: AttachConfig = {
    url,
    webRoot,
    port,
    stopOnEntry: raw.stopOnEntry === true,
    connectTimeoutMs: timeout,
    helloTimeoutMs: Math.min(timeout, DEFAULT_HELLO_TIMEOUT_MS),
  };
  if (typeof raw.token === 'string' && raw.token !== '') config.token = raw.token;
  if (typeof raw.origin === 'string' && raw.origin !== '') config.origin = raw.origin;
  return { config };
}

/** Inline-блок, в диапазон строк которого попадает HTML-строка. */
function findInlineMap(
  maps: readonly InlineBlockMap[],
  htmlLine: number,
): { map: InlineBlockMap; blockLine: number } | undefined {
  for (const map of maps) {
    const blockLine = htmlLineToBlock(map, htmlLine);
    if (blockLine !== undefined) return { map, blockLine };
  }
  return undefined;
}

/** HTML страницы по HTTP(S), когда локального файла под `webRoot` нет. */
async function fetchPageHtml(url: string): Promise<string | undefined> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
  try {
    // Таймаут обязателен: attach не должен зависнуть на молчащем dev-сервере.
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return undefined;
    return await response.text();
  } catch {
    return undefined;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${message} за ${timeoutMs} мс`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
