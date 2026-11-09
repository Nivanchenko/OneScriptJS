import type { BslObject } from '../../runtime/object';
import type { Value } from '../../runtime/values';
import { equals, toNumber } from '../../runtime/values';

/** Массив BSL — обёртка над JS-массивом (поддерживает многомерность). */
export class BslArray implements BslObject {
  readonly typeName = 'Массив';
  private readonly items: Value[];

  constructor(args: Value[]) {
    const dims = args.map((a) => {
      if (typeof a !== 'number') throw new Error('Размерности массива должны быть числами');
      return a;
    });
    this.items = BslArray.build(dims);
  }

  private static build(dims: number[]): Value[] {
    if (dims.length === 0) return [];
    const first = dims[0]!;
    const rest = dims.slice(1);
    const result: Value[] = new Array(first);
    for (let i = 0; i < first; i++) {
      result[i] = rest.length === 0 ? undefined : new BslArray(rest);
    }
    return result;
  }

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'добавить':
      case 'add':
        this.items.push(args[0]);
        return undefined;
      case 'удалить':
      case 'delete':
        this.items.splice(toNumber(args[0]!), 1);
        return undefined;
      case 'найти':
      case 'find': {
        const idx = this.items.findIndex((x) => equals(x, args[0]!));
        return idx === -1 ? undefined : idx;
      }
      case 'количество':
      case 'count':
        return this.items.length;
      case 'вграница':
      case 'ubound':
        return this.items.length - 1;
      default:
        throw new Error(`Метод '${name}' не найден у типа Массив`);
    }
  }

  getIndex(index: Value): Value {
    return this.items[toNumber(index)];
  }

  setIndex(index: Value, value: Value): void {
    this.items[toNumber(index)] = value;
  }

  getProp(name: string): Value {
    throw new Error(`Свойство '${name}' не найдено у типа Массив`);
  }

  setProp(name: string, value: Value): void {
    throw new Error(`Свойство '${name}' не найдено у типа Массив`);
  }

  iterate(): Value[] {
    return this.items;
  }
}
