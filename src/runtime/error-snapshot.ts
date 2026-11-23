/**
 * Снимок ошибки исполнения BSL: описание, позиция возникновения и BSL-стек.
 *
 * Чистые типы и функции без платформенных зависимостей (`node:*`/DOM): модуль
 * живёт в ядре и используется интерпретатором, stdlib и хостами. Снимок
 * создаётся один раз — в момент возникновения ошибки (first throw wins) и
 * переносится через перевыброс, async и фоновые задания.
 */

/** Кадр BSL-стека на момент ошибки. */
export interface FrameSnapshot {
  /** Имя BSL-метода; маркеры `<модуль>`, `<Выполнить>`, `<Вычислить>`, `<обработчик>`. */
  method: string;
  /** Идентификатор источника кадра (путь, URL или маркер). */
  module: string;
  /** 1-based строка, исполнявшаяся в кадре на момент ошибки. */
  line: number;
}

/** Снимок ошибки: описание + позиция + стек (изнутри наружу). */
export interface ErrorSnapshot {
  /** Текст ошибки — ровно то, что попадает в `ОписаниеОшибки()`. */
  description: string;
  /** Идентификатор источника возникновения. */
  module: string;
  /** 1-based строка возникновения; 0 — позиция недоступна. */
  line: number;
  /** Текст исходной строки; `""`, если недоступен. */
  sourceLine: string;
  /** Снимок BSL-стека: первый кадр — место возникновения. */
  frames: FrameSnapshot[];
}

/** Позиция возникновения ошибки для аннотации. */
export interface ErrorPosition {
  module: string;
  line: number;
  sourceLine?: string;
}

/** Маркер кадра тела модуля. */
export const MODULE_FRAME = '<модуль>';
/** Маркер кадра `Выполнить`. */
export const EXECUTE_FRAME = '<Выполнить>';
/** Маркер кадра `Вычислить`. */
export const EVAL_FRAME = '<Вычислить>';
/** Маркер кадра обработчика события без имени метода. */
export const HANDLER_FRAME = '<обработчик>';
/** Идентификатор источника по умолчанию (библиотека/тесты без пути). */
export const DEFAULT_SOURCE_ID = '<скрипт>';

/** Пустой снимок: `ИнформацияОбОшибке()` вне блока `Исключение`. */
export const EMPTY_SNAPSHOT: ErrorSnapshot = {
  description: '',
  module: '',
  line: 0,
  sourceLine: '',
  frames: [],
};

/**
 * Снимки привязываются к объектам ошибок в `WeakMap`, а не к полям: ошибки
 * stdlib — обычные `Error`, их не нужно менять по форме, а сборщик мусора
 * сам освободит снимок вместе с ошибкой.
 */
const snapshots = new WeakMap<Error, ErrorSnapshot>();

/** Снимок, привязанный к ошибке (или `undefined`, если её ещё не аннотировали). */
export function getErrorSnapshot(error: unknown): ErrorSnapshot | undefined {
  return error instanceof Error ? snapshots.get(error) : undefined;
}

/** Привязывает готовый снимок к ошибке (для `ВызватьИсключение`/перевыброса). */
export function setErrorSnapshot(error: Error, snapshot: ErrorSnapshot): void {
  snapshots.set(error, snapshot);
}

/** Создаёт снимок по ошибке, позиции и стеку. */
export function captureError(
  error: unknown,
  position: ErrorPosition,
  frames: readonly FrameSnapshot[],
): ErrorSnapshot {
  return {
    description: error instanceof Error ? error.message : String(error),
    module: position.module,
    line: position.line,
    sourceLine: position.sourceLine ?? '',
    frames: frames.map((frame) => ({ ...frame })),
  };
}

/**
 * Аннотирует ошибку снимком, только если его ещё нет (first throw wins),
 * и возвращает актуальный снимок.
 */
export function annotateError(
  error: unknown,
  position: ErrorPosition,
  frames: readonly FrameSnapshot[],
): ErrorSnapshot {
  const existing = getErrorSnapshot(error);
  if (existing) return existing;
  const snapshot = captureError(error, position, frames);
  if (error instanceof Error) setErrorSnapshot(error, snapshot);
  return snapshot;
}

/** Стек BSL-кадров в формате подробного описания. */
export function formatStack(frames: readonly FrameSnapshot[]): string {
  const lines = ['Стек вызовов:'];
  for (const frame of frames) {
    lines.push(`  ${frame.method} (${frame.module}:${frame.line})`);
  }
  return lines.join('\n');
}

/** Подробное описание: описание + BSL-стек; для пустого снимка — `""`. */
export function formatErrorDetails(snapshot: ErrorSnapshot | undefined): string {
  if (!snapshot) return '';
  const parts: string[] = [];
  if (snapshot.description !== '') parts.push(snapshot.description);
  if (snapshot.frames.length > 0) parts.push(formatStack(snapshot.frames));
  return parts.join('\n');
}

/**
 * Отчёт для хоста (CLI/browser): `модуль:строка: описание` + стек.
 * Без снимка — прежнее сообщение (деградация без падения).
 */
export function formatErrorReport(error: unknown): string {
  const snapshot = getErrorSnapshot(error);
  if (!snapshot) return error instanceof Error ? error.message : String(error);
  // Без позиции (fallback задания) — прежнее сообщение, без `:0:`.
  const hasPosition = snapshot.module !== '' && snapshot.line > 0;
  const header = hasPosition
    ? `${snapshot.module}:${snapshot.line}: ${snapshot.description}`
    : snapshot.description;
  return snapshot.frames.length > 0 ? `${header}\n${formatStack(snapshot.frames)}` : header;
}

/** Разбивает исходник на строки (1-based доступ через `line - 1`). */
export function splitSourceLines(source: string): string[] {
  return source.split(/\r\n|\r|\n/);
}

/** Текст строки исходника; `""`, если строки нет. */
export function sourceLineAt(lines: readonly string[], line: number): string {
  if (line <= 0) return '';
  return lines[line - 1] ?? '';
}
