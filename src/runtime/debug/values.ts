import { isThenable } from '../async';
import type { MaybePromise } from '../async';
import { isBslObject } from '../object';
import type { BslObject } from '../object';
import { toStringValue, typeName } from '../values';
import type { Value } from '../values';

/**
 * Визуализатор BSL-значений для отладчика: представление и ленивые дети.
 * Работает только через публичный `BslObject`-интерфейс, поэтому не тянет stdlib
 * и остаётся браузерным.
 */

/** Переменная в терминах DAP (без внутренних ссылок). */
export interface VariableInfo {
  name: string;
  value: string;
  type: string;
  /** 0 — примитив; > 0 — ленивые дети (реестр контроллера). */
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
}

/** Один ребёнок значения (имя + само значение). */
export interface ChildVariable {
  name: string;
  value: Value;
}

/** Лимит детей одного уровня: защита от гигантских коллекций. */
export const MAX_VARIABLES = 1000;

const ARRAY_TYPES = new Set(['Массив', 'ФиксированныйМассив']);
const STRUCTURE_TYPES = new Set(['Структура', 'ФиксированнаяСтруктура']);
const MAP_TYPES = new Set(['Соответствие', 'ФиксированноеСоответствие']);

/** Есть ли у значения раскрываемые дети. */
export function isExpandable(value: Value): value is BslObject {
  return isBslObject(value) && typeof value.iterate === 'function';
}

/** Индексированная коллекция (для DAP `indexedVariables`). */
export function isIndexedCollection(value: BslObject): boolean {
  return ARRAY_TYPES.has(value.typeName);
}

/** Количество детей (если коллекция). */
export function childCount(value: BslObject): number {
  try {
    return value.iterate?.().length ?? 0;
  } catch {
    return 0;
  }
}

/** Дети значения — один уровень, без рекурсии. */
export function childrenOf(value: Value): ChildVariable[] {
  if (!isExpandable(value)) return [];
  const items = value.iterate!();
  if (STRUCTURE_TYPES.has(value.typeName)) {
    return items.slice(0, MAX_VARIABLES).map((key) => {
      const name = toStringValue(key);
      return { name, value: readChild(() => value.getProp(name)) };
    });
  }
  if (MAP_TYPES.has(value.typeName)) {
    const result: ChildVariable[] = [];
    for (let i = 0; i < items.length && result.length < MAX_VARIABLES; i++) {
      const key = items[i]!;
      result.push({ name: `[${i}].Ключ`, value: key });
      result.push({ name: `[${i}].Значение`, value: readChild(() => value.getIndex(key)) });
    }
    return result;
  }
  // Массив и прочие коллекции — по индексам.
  return items
    .slice(0, MAX_VARIABLES)
    .map((item, index) => ({ name: `[${index}]`, value: item }));
}

/**
 * Синхронное чтение значения. Асинхронные геттеры в отладчике не поддерживаем:
 * коллекции MVP (Массив/Структура/Соответствие) читаются синхронно.
 */
function readChild(read: () => MaybePromise<Value>): Value {
  try {
    const value = read();
    return isThenable(value) ? undefined : value;
  } catch {
    return undefined;
  }
}

/** Строковое представление значения для DAP. */
export function presentValue(value: Value): string {
  if (value === null) return 'Null';
  if (value === undefined) return 'Неопределено';
  if (isBslObject(value)) {
    if (value.toDisplayString) {
      try {
        return value.toDisplayString();
      } catch {
        // Падение ToString не должно ломать отладчик — покажем тип.
      }
    }
    if (typeof value.iterate === 'function') return `${value.typeName}[${childCount(value)}]`;
    return `<${value.typeName}>`;
  }
  try {
    return toStringValue(value);
  } catch {
    return `<${typeName(value)}>`;
  }
}
