import type { DebugController, StepMode, StopReason } from '../runtime/debug/controller';

/**
 * Протокол page-agent ↔ DAP-адаптер (JSON поверх WebSocket).
 * Контракт — specs/021-debugger/contracts/page-agent-protocol.md.
 *
 * Файл браузерный: только типы, без `node:*` и DOM-зависимостей; объявления
 * `globalThis` ниже — единственный шов, через который движок находит отладчик.
 */

/** Блок `<script type="text/osjs">` в манифесте страницы (1-based index, DOM-порядок). */
export interface BlockInfo {
  index: number;
  id?: string;
  src?: string;
  text: string;
}

/** Блок в том виде, в каком его передаёт движок до старта (DOM-порядок). */
export interface AttachBlock {
  id?: string;
  src?: string;
  text: string;
}

/** Параметры вызова моста из движка: манифест блоков и база страницы. */
export interface AttachInfo {
  pageUrl: string;
  baseURI: string;
  blocks: readonly AttachBlock[];
}

/** Мост отладчика, который `onescript-debug.js` регистрирует до старта движка. */
export interface DebugBridge {
  attach(info: AttachInfo): Promise<DebugController | null>;
}

/** Вид источника для DAP `Source` и маппинга строк. */
export type SourceKind = 'file' | 'inline-html' | 'dynamic' | 'stdin';

/** Уточнение текста источника после старта блока. */
export interface SourceInfo {
  id: string;
  text: string;
  kind: SourceKind;
  url?: string;
  pageUrl?: string;
  blockIndex?: number;
  blockId?: string;
  /** 1-based строка HTML, с которой начинается содержимое inline-блока (W5). */
  contentStartLine?: number;
}

export interface FrameInfo {
  id: number;
  method: string;
  sourceId: string;
  line: number;
}

export interface ThreadInfo {
  id: number;
  name: string;
}

/** Переменная в терминах DAP (без внутренних ссылок контроллера). */
export interface VariableInfo {
  name: string;
  value: string;
  type: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
}

export interface ScopeInfo {
  name: string;
  variablesReference: number;
  expensive?: boolean;
}

export interface BreakpointSpec {
  line: number;
  condition?: string;
  logMessage?: string;
}

export type ExceptionFilterName = 'uncaught' | 'all';

export type OutputCategory = 'stdout' | 'stderr' | 'console';

// --- page → adapter ---

export interface HelloMessage {
  type: 'hello';
  v: 1;
  token?: string;
  pageUrl: string;
  baseURI: string;
  title?: string;
  blocks: BlockInfo[];
}

export interface SourceMessage {
  type: 'source';
  id: string;
  text: string;
  kind: SourceKind;
}

export interface StoppedMessage {
  type: 'stopped';
  threadId: number;
  reason: StopReason;
  frames: FrameInfo[];
  allThreadsStopped?: true;
  description?: string;
}

export interface ContinuedMessage {
  type: 'continued';
  threadId: number;
  allThreadsContinued?: true;
}

export interface OutputMessage {
  type: 'output';
  category: OutputCategory;
  text: string;
}

export interface ThreadsMessage {
  type: 'threads';
  threads: ThreadInfo[];
}

export interface EvaluateResultMessage {
  type: 'evaluateResult';
  seq: number;
  ok: boolean;
  result?: VariableInfo;
  error?: string;
}

export interface ScopesResultMessage {
  type: 'scopesResult';
  seq: number;
  ok: boolean;
  scopes?: ScopeInfo[];
  error?: string;
}

export interface VariablesResultMessage {
  type: 'variablesResult';
  seq: number;
  ok: boolean;
  variables?: VariableInfo[];
  error?: string;
}

export interface TerminatedMessage {
  type: 'terminated';
  reason?: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type PageMessage =
  | HelloMessage
  | SourceMessage
  | StoppedMessage
  | ContinuedMessage
  | OutputMessage
  | ThreadsMessage
  | EvaluateResultMessage
  | ScopesResultMessage
  | VariablesResultMessage
  | TerminatedMessage
  | ErrorMessage;

export type PageResultMessage =
  | EvaluateResultMessage
  | ScopesResultMessage
  | VariablesResultMessage;

// --- adapter → page ---

export interface HelloAckMessage {
  type: 'helloAck';
  sessionId: string;
  capabilities?: Record<string, boolean>;
  /** `stopOnEntry` из attach-конфигурации: контроллер страницы создаётся до `configured`. */
  stopOnEntry?: boolean;
}

export interface RejectedMessage {
  type: 'rejected';
  reason: string;
}

export interface BreakpointsMessage {
  type: 'breakpoints';
  sourceId: string;
  replace: boolean;
  items: BreakpointSpec[];
}

export interface SetExceptionBreakpointsMessage {
  type: 'setExceptionBreakpoints';
  filters: ExceptionFilterName[];
}

export interface ConfiguredMessage {
  type: 'configured';
}

export interface ResumeMessage {
  type: 'resume';
  threadId: number;
  mode: StepMode;
}

export interface PauseMessage {
  type: 'pause';
  threadId?: number;
}

export interface EvaluateMessage {
  type: 'evaluate';
  seq: number;
  frameIndex: number;
  expression: string;
}

/** `scopes`/`variables` добавлены к контракту для DAP-запросов в attach. */
export interface ScopesMessage {
  type: 'scopes';
  seq: number;
  frameIndex: number;
}

export interface VariablesMessage {
  type: 'variables';
  seq: number;
  variablesReference: number;
}

export interface DisconnectMessage {
  type: 'disconnect';
}

export type AdapterMessage =
  | HelloAckMessage
  | RejectedMessage
  | BreakpointsMessage
  | SetExceptionBreakpointsMessage
  | ConfiguredMessage
  | ResumeMessage
  | PauseMessage
  | EvaluateMessage
  | ScopesMessage
  | VariablesMessage
  | DisconnectMessage;

declare global {
  /** Мост отладчика; `undefined` — страница исполняется без отладки (production). */
  var __OSJS_DEBUG__: DebugBridge | undefined;
  /** Порт WS-сервера из dev-инъекции; строка — значение атрибута/query. */
  var __OSJS_DEBUG_PORT__: number | string | undefined;
}
