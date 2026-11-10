/**
 * Рантайм-значения BSL и операции над ними.
 *
 * Значения — обычные JS-значения: `number` (Число), `string` (Строка),
 * `boolean` (Булево), `Date` (Дата), `null` (Null), `undefined` (Неопределено).
 * Точные правила приведения 1С сверяются с переносимыми тестами (T19).
 */

import { isBslObject } from './object';
import type { BslObject } from './object';

export type Value = number | string | boolean | Date | null | undefined | BslObject;

/** BSL-имя типа значения (для `ТипЗнч` / `Строка(Тип(...))`). */
export function typeName(value: Value): string {
  switch (typeof value) {
    case 'number':
      return 'Число';
    case 'string':
      return 'Строка';
    case 'boolean':
      return 'Булево';
    case 'undefined':
      return 'Неопределено';
    default:
      if (value === null) return 'Null';
      if (value instanceof Date) return 'Дата';
      return value.typeName;
  }
}

/** Приведение к булеву (для условий, `и`/`или`/`не`): пустое → Ложь. */
export function toBoolean(value: Value): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value !== '';
  return true; // Дата и объекты — всегда истина
}

/** Строковое представление (для `Строка()` и конкатенации). */
export function toStringValue(value: Value): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Истина' : 'Ложь';
  if (value instanceof Date) return formatDate(value);
  if (isBslObject(value) && value.toDisplayString) return value.toDisplayString();
  return String(value);
}

/** Приведение к числу (для `Число()` и сравнений). */
export function toNumber(value: Value): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') {
    if (value === '') return 0;
    const n = Number(value);
    if (Number.isNaN(n)) throw new TypeError(`Нельзя преобразовать к Числу: '${value}'`);
    return n;
  }
  throw new TypeError(`Нельзя преобразовать к Числу: ${typeName(value)}`);
}

/** `+`: число+число — сложение, иначе — конкатенация строк. */
export function add(left: Value, right: Value): Value {
  if (typeof left === 'number' && typeof right === 'number') return left + right;
  return toStringValue(left) + toStringValue(right);
}

/** Сравнение для `< > <= >=`: отрицательное/0/положительное. */
export function compare(left: Value, right: Value): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  if (typeof left === 'string' && typeof right === 'string') {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return (left ? 1 : 0) - (right ? 1 : 0);
  }
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
  throw new TypeError(`Нельзя сравнить ${typeName(left)} и ${typeName(right)}`);
}

/**
 * Сравнение для сортировки коллекций (аналог `GenericIValueComparer` из 1С).
 * Разные типы упорядочиваются: Неопределено < Null < Булево < Число < Строка <
 * Дата < Тип < объекты (по строковому представлению).
 */
export function sortCompare(left: Value, right: Value): number {
  const lr = sortRank(left);
  const rr = sortRank(right);
  if (lr !== rr) return lr - rr;
  if (typeof left === 'number') return left - (right as number);
  if (typeof left === 'string') return left.localeCompare(right as string);
  if (typeof left === 'boolean') return (left ? 1 : 0) - ((right as boolean) ? 1 : 0);
  if (left instanceof Date) return left.getTime() - (right as Date).getTime();
  return toStringValue(left).localeCompare(toStringValue(right));
}

function sortRank(value: Value): number {
  if (value === undefined) return 0;
  if (value === null) return 1;
  if (typeof value === 'boolean') return 2;
  if (typeof value === 'number') return 3;
  if (typeof value === 'string') return 4;
  if (value instanceof Date) return 5;
  if (isBslObject(value) && value.typeName === 'Тип') return 6;
  return 7; // прочие объекты — по строковому представлению
}

/** Равенство `=`/`<>`: значения разных типов не равны (кроме Null/Неопределено по идентичности). */
export function equals(left: Value, right: Value): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return left === right;
  }
  if (typeof left === 'number' && typeof right === 'number') return left === right;
  if (typeof left === 'string' && typeof right === 'string') return left === right;
  if (typeof left === 'boolean' && typeof right === 'boolean') return left === right;
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  if (isBslObject(left) && isBslObject(right)) {
    if (left.equals) return left.equals(right);
    return left === right;
  }
  return false;
}

/** Разбор литерала даты 'YYYYMMDD[HHMMSS]' в JS Date (UTC). */
export function dateFromBsl(value: string): Date {
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(4, 6)) - 1;
  const d = Number(value.slice(6, 8));
  const hh = value.length >= 10 ? Number(value.slice(8, 10)) : 0;
  const mm = value.length >= 12 ? Number(value.slice(10, 12)) : 0;
  const ss = value.length >= 14 ? Number(value.slice(12, 14)) : 0;
  return new Date(Date.UTC(y, m, d, hh, mm, ss));
}

// Формат 1С: `ДД.ММ.ГГГГ Ч:ММ:СС` (час без ведущего нуля).
function formatDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ` +
    `${d.getUTCHours()}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
