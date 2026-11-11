import type { GlobalContext } from '../runtime/context';
import { isBslObject } from '../runtime/object';
import type { Value } from '../runtime/values';
import { BslArray } from './collections/array';
import { BslStructure } from './collections/structure';

function toJson(value: Value): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (isBslObject(value)) {
    if (value.typeName === 'Структура' || value.typeName === 'ФиксированнаяСтруктура') {
      const obj: Record<string, unknown> = {};
      for (const key of value.iterate?.() ?? []) {
        // shortcut: свойства Структуры отдаются синхронно; async-getter в JSON не поддержан
        obj[String(key)] = toJson(value.getProp(String(key)) as Value);
      }
      return obj;
    }
    if (value.iterate) return value.iterate().map(toJson);
    throw new Error(`ЗаписатьJSON: тип '${value.typeName}' не сериализуется`);
  }
  return value;
}

function fromJson(value: unknown): Value {
  if (value === null) return null;
  if (Array.isArray(value)) {
    const arr = new BslArray([]);
    for (const item of value) arr.callMethod('Добавить', [fromJson(item)]);
    return arr;
  }
  if (typeof value === 'object') {
    const struct = new BslStructure([]);
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      struct.callMethod('Вставить', [k, fromJson(v)]);
    }
    return struct;
  }
  return value as Value;
}

/** Глобальные функции JSON. */
export function registerJsonFunctions(ctx: GlobalContext): void {
  ctx.registerAlias('ЗаписатьJSON', 'WriteJSON', (args) => JSON.stringify(toJson(args[0]!)));
  ctx.registerAlias('ПрочитатьJSON', 'ReadJSON', (args) => fromJson(JSON.parse(String(args[0]))));
}
