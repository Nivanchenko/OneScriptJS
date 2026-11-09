import type { BslObject } from '../../runtime/object';
import { isBslObject } from '../../runtime/object';
import type { Value } from '../../runtime/values';

/** Соответствие BSL — коллекция «ключ-значение» с индексацией по ключу. */
export class BslMap implements BslObject {
  readonly typeName: string;
  private readonly entries = new Map<Value, Value>();
  private readonly readOnly: boolean;

  constructor(args: Value[], readOnly = false, typeName = 'Соответствие') {
    this.readOnly = readOnly;
    this.typeName = typeName;
    if (args.length > 0) {
      const first = args[0];
      if (isBslObject(first) && first instanceof BslMap) {
        first.entries.forEach((v, k) => this.entries.set(k, v));
      } else {
        throw new Error('Недопустимый первый параметр конструктора Соответствия');
      }
    }
  }

  private ensureWritable(): void {
    if (this.readOnly) throw new Error(`Коллекция '${this.typeName}' только для чтения`);
  }

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'вставить':
      case 'insert':
        this.ensureWritable();
        this.entries.set(args[0]!, args[1]);
        return undefined;
      case 'получить':
      case 'get':
        return this.entries.get(args[0]!);
      case 'удалить':
      case 'delete':
        this.ensureWritable();
        this.entries.delete(args[0]!);
        return undefined;
      case 'количество':
      case 'count':
        return this.entries.size;
      default:
        throw new Error(`Метод '${name}' не найден у типа ${this.typeName}`);
    }
  }

  getIndex(index: Value): Value {
    return this.entries.get(index);
  }

  setIndex(index: Value, value: Value): void {
    this.ensureWritable();
    this.entries.set(index, value);
  }

  getProp(name: string): Value {
    throw new Error(`Свойство '${name}' недоступно для типа ${this.typeName}`);
  }

  setProp(name: string, _value: Value): void {
    throw new Error(`Свойство '${name}' недоступно для типа ${this.typeName}`);
  }

  iterate(): Value[] {
    return [...this.entries.keys()];
  }
}
