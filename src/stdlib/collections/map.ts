import type { BslObject } from '../../runtime/object';
import { isBslObject } from '../../runtime/object';
import type { Value } from '../../runtime/values';
import { equals } from '../../runtime/values';

/** Соответствие BSL — коллекция «ключ-значение» с индексацией по ключу (сравнение по значению). */
export class BslMap implements BslObject {
  readonly typeName: string;
  private readonly entries: { key: Value; value: Value }[] = [];
  private readonly readOnly: boolean;

  constructor(args: Value[], readOnly = false, typeName = 'Соответствие') {
    this.readOnly = readOnly;
    this.typeName = typeName;
    if (args.length > 0) {
      const first = args[0];
      if (isBslObject(first) && first instanceof BslMap) {
        for (const e of first.entries) this.entries.push({ key: e.key, value: e.value });
      } else {
        throw new Error('Недопустимый первый параметр конструктора Соответствия');
      }
    }
  }

  private ensureWritable(): void {
    if (this.readOnly) throw new Error(`Коллекция '${this.typeName}' только для чтения`);
  }

  private indexOf(key: Value): number {
    return this.entries.findIndex((e) => equals(e.key, key));
  }

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'вставить':
      case 'insert':
        this.ensureWritable();
        this.setKey(args[0]!, args[1]);
        return undefined;
      case 'получить':
      case 'get':
        return this.getKey(args[0]!);
      case 'удалить':
      case 'delete':
        this.ensureWritable();
        this.deleteKey(args[0]!);
        return undefined;
      case 'количество':
      case 'count':
        return this.entries.length;
      default:
        throw new Error(`Метод '${name}' не найден у типа ${this.typeName}`);
    }
  }

  private getKey(key: Value): Value {
    const i = this.indexOf(key);
    return i === -1 ? undefined : this.entries[i]!.value;
  }

  private setKey(key: Value, value: Value): void {
    const i = this.indexOf(key);
    if (i === -1) this.entries.push({ key, value });
    else this.entries[i]!.value = value;
  }

  private deleteKey(key: Value): void {
    const i = this.indexOf(key);
    if (i !== -1) this.entries.splice(i, 1);
  }

  getIndex(index: Value): Value {
    return this.getKey(index);
  }

  setIndex(index: Value, value: Value): void {
    this.ensureWritable();
    this.setKey(index, value);
  }

  getProp(name: string): Value {
    throw new Error(`Свойство '${name}' недоступно для типа ${this.typeName}`);
  }

  setProp(name: string, _value: Value): void {
    throw new Error(`Свойство '${name}' недоступно для типа ${this.typeName}`);
  }

  iterate(): Value[] {
    return this.entries.map((e) => e.key);
  }
}
