import type { Value } from './values';

/** Рантайм-объект BSL (Массив, Структура и т.п.). */
export interface BslObject {
  readonly typeName: string;
  callMethod(name: string, args: Value[]): Value;
  getIndex(index: Value): Value;
  setIndex(index: Value, value: Value): void;
  getProp(name: string): Value;
  setProp(name: string, value: Value): void;
  /** Элементы для `Для Каждого … Из …` (если коллекция). */
  iterate?: () => Value[];
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
