import type { BslObject } from './object';
import type { Value } from './values';
import type { RuntimeEnvironment } from './context';
import type { MaybePromise } from './async';

export type PromiseState = 'pending' | 'fulfilled' | 'rejected';

/** Учёт незавершённого `Обещания` окружением (для flush перед завершением запуска). */
export interface AsyncTracker {
  readonly completion: Promise<void>;
}

interface Waiter {
  resolve(value: Value): void;
  reject(error: unknown): void;
}

/**
 * `Обещание` / `Promise` — непрозрачный handle асинхронного вызова.
 * Результат/ошибка кэшируются; повторное ожидание разрешено. Публичных методов и
 * свойств нет: разворачивание — только оператором `Ждать`.
 */
export class BslPromise implements BslObject, AsyncTracker {
  readonly typeName = 'Обещание';
  readonly completion: Promise<void>;

  state: PromiseState = 'pending';
  value: Value = undefined;
  error: unknown;
  /** Было ли хоть одно `Ждать` (для политики необработанных ошибок). */
  awaited = false;

  private resolveCompletion!: () => void;
  private waiters: Waiter[] = [];

  constructor(private readonly env: RuntimeEnvironment) {
    this.completion = new Promise<void>((resolve) => {
      this.resolveCompletion = resolve;
    });
    this.env.trackAsync?.(this);
  }

  resolve(value: Value): void {
    if (this.state !== 'pending') return;
    this.value = value;
    this.state = 'fulfilled';
    this.reportIfUnobserved();
    this.settleWaiters();
    this.resolveCompletion();
  }

  reject(error: unknown): void {
    if (this.state !== 'pending') return;
    this.error = error;
    this.state = 'rejected';
    this.reportIfUnobserved();
    this.settleWaiters();
    this.resolveCompletion();
  }

  /** `Ждать`: значение, исключение или приостановка до завершения. */
  await(): MaybePromise<Value> {
    this.awaited = true;
    if (this.state === 'fulfilled') return this.value;
    if (this.state === 'rejected') throw this.error;
    return new Promise<Value>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  toDisplayString(): string {
    return 'Обещание';
  }

  private settleWaiters(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) {
      if (this.state === 'fulfilled') waiter.resolve(this.value);
      else waiter.reject(this.error);
    }
  }

  /**
   * Необработанная ошибка: сообщаем отложенно, чтобы `Ждать` в том же тике успело
   * пометить обещание как ожидаемое.
   */
  private reportIfUnobserved(): void {
    if (this.state !== 'rejected') return;
    setTimeout(() => {
      if (this.awaited) return;
      if (this.env.reportUnhandledError) this.env.reportUnhandledError(this.error);
      else console.error(this.error instanceof Error ? this.error.message : String(this.error));
    }, 0);
  }

  // --- BslObject: непрозрачный тип ---

  callMethod(name: string): Value {
    throw new Error(`Метод '${name}' не найден у типа Обещание`);
  }

  getProp(name: string): Value {
    throw new Error(`Свойство '${name}' не найдено у типа Обещание`);
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа Обещание');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа Обещание');
  }
}

/**
 * Дожидается завершения всех учтённых `Обещаний`; `undefined` (синхронно), если работы нет.
 * Новые обещания, созданные во время ожидания, тоже учитываются.
 */
export function flushPendingPromises(pending: Set<AsyncTracker>): MaybePromise<void> {
  if (pending.size === 0) return;
  const active = [...pending];
  return Promise.all(active.map((tracker) => tracker.completion)).then(() =>
    flushPendingPromises(pending),
  );
}
