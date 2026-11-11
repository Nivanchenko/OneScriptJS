import type { BslObject } from './object';
import type { Value } from './values';
import type { MaybePromise } from './async';
import { thenMaybe } from './async';

/** Подписка на событие. */
export interface Handler {
  /** Объект-цель подписки (для дедупликации и отписки). */
  target: BslObject;
  /** Имя метода в исходном регистре. */
  method: string;
  /** Способ вызова, зафиксированный при подписке. */
  invoke: (args: Value[]) => MaybePromise<Value>;
}

const key = (name: string): string => name.toLowerCase();

/**
 * Реестр подписок на события BSL: источник → имя события → обработчики.
 * Живёт в `GlobalContext`, поэтому подписки видны всем модулям одного исполнения.
 */
export class EventProcessor {
  private readonly handlers = new Map<BslObject, Map<string, Handler[]>>();

  /**
   * Подписывает `target.method` на `eventName` источника.
   * `local: true` — форма «голый идентификатор»: вызывается `invoke` напрямую,
   * без проверки экспортности (метод текущего модуля).
   */
  add(
    source: BslObject,
    eventName: string,
    target: BslObject,
    method: string,
    local: boolean,
    invoke?: (args: Value[]) => MaybePromise<Value>,
  ): void {
    const name = key(eventName);
    const list = this.handlers.get(source)?.get(name) ?? [];
    if (list.some((h) => h.target === target && key(h.method) === key(method))) return;
    if (!local && target.hasMethod && !target.hasMethod(method)) {
      throw new Error(`Метод объекта не обнаружен (${method})`);
    }
    const byName = this.handlers.get(source) ?? new Map<string, Handler[]>();
    byName.set(name, list);
    this.handlers.set(source, byName);
    list.push({
      target,
      method,
      invoke: invoke ?? ((args) => target.callMethod(method, args)),
    });
  }

  /** Снимает подписку; отсутствующая — no-op, порядок остальных не меняется. */
  remove(source: BslObject, eventName: string, target: BslObject, method: string): void {
    const list = this.handlers.get(source)?.get(key(eventName));
    if (!list) return;
    const index = list.findIndex((h) => h.target === target && key(h.method) === key(method));
    if (index !== -1) list.splice(index, 1);
  }

  /** Вызывает подписчиков в порядке подписки; исключения не перехватывает. */
  raise(source: BslObject, eventName: string, args: Value[]): MaybePromise<void> {
    const list = this.handlers.get(source)?.get(key(eventName));
    if (!list) return;
    const snapshot = [...list];
    const step = (index: number): MaybePromise<void> => {
      const handler = snapshot[index];
      if (!handler) return;
      return thenMaybe(handler.invoke(args), () => step(index + 1));
    };
    return step(0);
  }
}
