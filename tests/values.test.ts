import { describe, expect, it } from 'vitest';
import {
  add,
  compare,
  dateFromBsl,
  equals,
  toBoolean,
  toNumber,
  toStringValue,
  typeName,
} from '../src/runtime/values';

describe('система значений', () => {
  it('конкатенирует строки через add', () => {
    expect(add('Привет, ', 'Никита')).toBe('Привет, Никита');
    expect(add('a', 1)).toBe('a1');
    expect(add(1, 'a')).toBe('1a');
  });

  it('складывает числа через add', () => {
    expect(add(1, 2)).toBe(3);
  });

  it('сравнивает числа', () => {
    expect(compare(19, 18)).toBeGreaterThan(0);
    expect(compare(18, 18)).toBe(0);
    expect(compare(17, 18)).toBeLessThan(0);
  });

  it('сравнивает строки лексикографически', () => {
    expect(compare('a', 'b')).toBeLessThan(0);
    expect(compare('b', 'a')).toBeGreaterThan(0);
    expect(compare('a', 'a')).toBe(0);
  });

  it('сравнивает даты хронологически', () => {
    const a = dateFromBsl('20260101');
    const b = dateFromBsl('20260102');
    expect(compare(a, b)).toBeLessThan(0);
    expect(equals(a, b)).toBe(false);
    expect(equals(a, dateFromBsl('20260101'))).toBe(true);
  });

  it('проверяет равенство (разные типы не равны)', () => {
    expect(equals(1, 1)).toBe(true);
    expect(equals('a', 'a')).toBe(true);
    expect(equals(true, true)).toBe(true);
    expect(equals(null, null)).toBe(true);
    expect(equals(undefined, undefined)).toBe(true);
    expect(equals(null, undefined)).toBe(false);
    expect(equals(1, '1')).toBe(false);
  });

  it('приводит к булеву (пустое → ложь)', () => {
    expect(toBoolean(0)).toBe(false);
    expect(toBoolean(1)).toBe(true);
    expect(toBoolean('')).toBe(false);
    expect(toBoolean('x')).toBe(true);
    expect(toBoolean(false)).toBe(false);
    expect(toBoolean(true)).toBe(true);
    expect(toBoolean(null)).toBe(false);
    expect(toBoolean(undefined)).toBe(false);
  });

  it('приводит к строке', () => {
    expect(toStringValue(38)).toBe('38');
    expect(toStringValue('abc')).toBe('abc');
    expect(toStringValue(true)).toBe('Истина');
    expect(toStringValue(false)).toBe('Ложь');
    expect(toStringValue(null)).toBe('');
    expect(toStringValue(undefined)).toBe('');
  });

  it('приводит к числу', () => {
    expect(toNumber('38')).toBe(38);
    expect(toNumber('')).toBe(0);
    expect(toNumber(true)).toBe(1);
    expect(toNumber(false)).toBe(0);
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
  });

  it('определяет тип значения', () => {
    expect(typeName(1)).toBe('Число');
    expect(typeName('')).toBe('Строка');
    expect(typeName(true)).toBe('Булево');
    expect(typeName(null)).toBe('Null');
    expect(typeName(undefined)).toBe('Неопределено');
    expect(typeName(new Date(0))).toBe('Дата');
  });

  it('разбирает литерал даты', () => {
    const d = dateFromBsl('20260101');
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(1);
  });
});
