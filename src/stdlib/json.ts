import type { GlobalContext } from '../runtime/context';
import { isBslObject } from '../runtime/object';
import type { Value } from '../runtime/values';
import { BslArray } from './collections/array';

function toJson(value: Value): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (isBslObject(value)) {
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
    throw new Error('ПрочитатьJSON: объекты JSON пока не поддерживаются (нужна Структура)');
  }
  return value as Value;
}

/** Глобальные функции JSON. */
export function registerJsonFunctions(ctx: GlobalContext): void {
  ctx.registerAlias('ЗаписатьJSON', 'WriteJSON', (args) => JSON.stringify(toJson(args[0]!)));
  ctx.registerAlias('ПрочитатьJSON', 'ReadJSON', (args) => fromJson(JSON.parse(String(args[0]))));
}
