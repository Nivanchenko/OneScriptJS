/**
 * Async-рантайм движка: значения типа «значение или обещание», генераторный драйвер с
 * синхронным быстрым путём, кооперативные точки приостановки и срез квантов.
 *
 * Зачем генераторы: они нативно сохраняют стек, циклы и `try/finally`, поэтому
 * `Попытка/Исключение`, `Возврат`, `Прервать`, `Продолжить` и `Перейти` работают так же,
 * как в синхронном интерпретаторе. Скрипт без приостановок драйвер исполняет синхронно и
 * возвращает обычное значение — обратная совместимость сохраняется.
 */

/** Значение, которое может быть получено синхронно или через `Promise`. */
export type MaybePromise<T> = T | Promise<T>;

/** Генератор интерпретатора: на приостановке отдаёт `Promise`, получает его результат. */
export type BslGenerator<T> = Generator<Promise<unknown>, T, unknown>;

/** Проверка «это thenable» без доверия к прототипу. */
export function isThenable<T>(value: MaybePromise<T>): value is Promise<T> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/** Применяет `next` к значению, дожидаясь его, если это Promise. */
export function thenMaybe<T, R>(
  value: MaybePromise<T>,
  next: (resolved: T) => MaybePromise<R>,
): MaybePromise<R> {
  return isThenable(value) ? value.then(next) : next(value);
}

/** Выполняет `finalize` (например, восстановление контекста) после значения или отказа. */
export function finallyMaybe<T>(
  value: MaybePromise<T>,
  finalize: () => void,
): MaybePromise<T> {
  if (!isThenable(value)) {
    finalize();
    return value;
  }
  return value.then(
    (resolved) => {
      finalize();
      return resolved;
    },
    (error: unknown) => {
      finalize();
      throw error;
    },
  );
}

/**
 * Генераторный эквивалент `await`: если значение — Promise, отдаёт его драйверу, иначе
 * сразу возвращает значение. Позволяет вызывать синхронные функции из async-кода.
 */
export function* yieldMaybe<T>(value: MaybePromise<T>): Generator<Promise<unknown>, T, unknown> {
  if (isThenable(value)) {
    return (yield value) as T;
  }
  return value;
}

export interface DriveOptions {
  /** Вызывается перед каждым шагом генератора (например, выставить currentInterpreter). */
  beforeStep?(): void;
  /** Вызывается после каждого шага генератора. */
  afterStep?(): void;
}

type GeneratorStep<T> = IteratorResult<Promise<unknown>, T>;

/**
 * Драйвер генератора: до первого `yield` исполняет всё синхронно и возвращает значение,
 * после — Promise. Отказ обещания доставляется в точку `yield` через `gen.throw`, поэтому
 * BSL-`Попытка` перехватывает его как обычное исключение.
 */
export function drive<T>(
  generator: Generator<Promise<unknown>, T, unknown>,
  options: DriveOptions = {},
): MaybePromise<T> {
  let step: GeneratorStep<T>;
  try {
    step = generator.next();
  } catch (error) {
    throw error;
  }
  if (step.done) return step.value;

  return new Promise<T>((resolve, reject) => {
    const runStep = (next: () => GeneratorStep<T>): void => {
      options.beforeStep?.();
      let current: GeneratorStep<T>;
      try {
        current = next();
      } catch (error) {
        reject(error);
        return;
      } finally {
        options.afterStep?.();
      }

      if (current.done) {
        resolve(current.value);
        return;
      }

      const promise = current.value;
      if (isThenable(promise)) {
        Promise.resolve(promise).then(
          (value) => runStep(() => generator.next(value)),
          (error: unknown) => runStep(() => generator.throw(error)),
        );
        return;
      }
      // Генератор отдал не Promise (не должно случаться, но не зависаем).
      runStep(() => generator.next(promise));
    };

    runStep(() => step);
  });
}

/**
 * Срез квантов: задания периодически уступают хост-среду, чтобы страница не замирала.
 * Синхронный путь (без slicer) не затрагивается.
 */
export interface SliceController {
  /** Пора ли уступить управление (по времени непрерывного исполнения). */
  due(): boolean;
}

export class TimeSlicer implements SliceController {
  private last = now();

  constructor(private readonly quantumMs = DEFAULT_QUANTUM_MS) {}

  due(): boolean {
    if (now() - this.last < this.quantumMs) return false;
    this.last = now();
    return true;
  }
}

/** Квант по умолчанию: ~10 мс непрерывного исполнения задания до уступки хосту. */
export const DEFAULT_QUANTUM_MS = 10;

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * Уступает управление хост-среде макротаском (браузер успевает перерисовать страницу и
 * обработать события). Node: `setImmediate`; браузер: `MessageChannel`; иначе таймер.
 */
export function yieldToHost(): Promise<void> {
  return new Promise<void>((resolve) => {
    const globalScope = globalThis as {
      setImmediate?: (callback: () => void) => unknown;
      MessageChannel?: typeof MessageChannel;
    };
    if (typeof globalScope.setImmediate === 'function') {
      globalScope.setImmediate(resolve);
      return;
    }
    if (typeof globalScope.MessageChannel === 'function') {
      const channel = new globalScope.MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(null);
      return;
    }
    setTimeout(resolve, 0);
  });
}

/** `Приостановить`/`Sleep`: кооперативный сон текущего логического потока. */
export function sleep(milliseconds: number): Promise<void> {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new Error('Неверное значение аргумента: Приостановить');
  }
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Ждёт `promise` не дольше `timeoutMs`; `0` — ждать бесконечно.
 * Возвращает `true`, если дождались, `false` — если истёк таймаут.
 */
export function waitWithTimeout(promise: Promise<void>, timeoutMs: number): Promise<boolean> {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new Error('Неверное значение аргумента: таймаут');
  }
  if (timeoutMs === 0) {
    return promise.then(() => true);
  }
  return new Promise<boolean>((resolve) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      resolve(false);
    }, timeoutMs);
    promise.then(
      () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(true);
      },
    );
  });
}

/** Ждёт все обещания не дольше `timeoutMs`; `0` — бесконечно. `true` — все завершились. */
export function waitAllPromises(promises: Promise<void>[], timeoutMs: number): Promise<boolean> {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new Error('Неверное значение аргумента: таймаут');
  }
  const all = Promise.all(promises.map((promise) => promise.then(() => undefined, () => undefined))).then(
    () => true,
  );
  if (timeoutMs === 0) return all;
  return new Promise<boolean>((resolve) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      resolve(false);
    }, timeoutMs);
    void all.then(() => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/** Индекс первого завершившегося обещания; `-1` по таймауту (`0` — ждать бесконечно). */
export function waitAnyPromises(promises: Promise<void>[], timeoutMs: number): Promise<number> {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new Error('Неверное значение аргумента: таймаут');
  }
  if (promises.length === 0) {
    throw new Error('ОжидатьЛюбое: нужен непустой массив заданий');
  }
  return new Promise<number>((resolve) => {
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (index: number): void => {
      if (finished) return;
      finished = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(index);
    };
    promises.forEach((promise, index) => {
      void promise.then(
        () => done(index),
        () => done(index),
      );
    });
    if (timeoutMs > 0) timer = setTimeout(() => done(-1), timeoutMs);
  });
}
