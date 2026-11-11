import type { Value } from './values';
import type { MaybePromise } from './async';

/** Рантайм-объект BSL (Массив, Структура и т.п.). */
export interface BslObject {
  readonly typeName: string;
  callMethod(name: string, args: Value[]): MaybePromise<Value>;
  getIndex(index: Value): MaybePromise<Value>;
  setIndex(index: Value, value: Value): MaybePromise<void>;
  getProp(name: string): MaybePromise<Value>;
  setProp(name: string, value: Value): MaybePromise<void>;
  /** Элементы для `Для Каждого … Из …` (если коллекция). */
  iterate?: () => Value[];
  /** Значимое равенство (по умолчанию — ссылочное). */
  equals?: (other: BslObject) => boolean;
  /** Строковое представление для `Строка()`. */
  toDisplayString?: () => string;
  /** Есть ли доступный снаружи метод (для проверки подписки на событие). */
  hasMethod?: (name: string) => boolean;
}

/** Является ли значение рантайм-объектом BSL. */
export function isBslObject(value: unknown): value is BslObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Date) &&
    typeof (value as { callMethod?: unknown }).callMethod === 'function'
  );
}
