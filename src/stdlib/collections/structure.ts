import type { BslObject } from '../../runtime/object';
import { isBslObject } from '../../runtime/object';
import { toStringValue } from '../../runtime/values';
import type { Value } from '../../runtime/values';

/** Структура BSL — коллекция «ключ-значение» с доступом через свойства. */
export class BslStructure implements BslObject {
  readonly typeName: string;
  private readonly entries = new Map<string, Value>();
  private readonly readOnly: boolean;

  constructor(args: Value[], readOnly = false, typeName = 'Структура') {
    this.readOnly = readOnly;
    this.typeName = typeName;
    if (args.length === 0) return;
    const first = args[0];
    if (typeof first === 'string') {
      const keys = first.split(',').map((k) => k.trim()).filter((k) => k !== '');
      keys.forEach((key, i) => {
        this.entries.set(key.toLowerCase(), i + 1 < args.length ? args[i + 1] : undefined);
      });
    } else if (isBslObject(first) && first instanceof BslStructure) {
      first.entries.forEach((v, k) => this.entries.set(k, v));
    } else {
      throw new Error('Недопустимый первый параметр конструктора Структуры');
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
        this.entries.set(toStringValue(args[0]!).toLowerCase(), args[1]);
        return undefined;
      case 'свойство':
      case 'property':
        return this.entries.has(toStringValue(args[0]!).toLowerCase());
      case 'удалить':
      case 'delete':
        this.ensureWritable();
        this.entries.delete(toStringValue(args[0]!).toLowerCase());
        return undefined;
      case 'очистить':
      case 'clear':
        this.ensureWritable();
        this.entries.clear();
        return undefined;
      case 'количество':
      case 'count':
        return this.entries.size;
      default:
        throw new Error(`Метод '${name}' не найден у типа ${this.typeName}`);
    }
  }

  getProp(name: string): Value {
    return this.entries.get(name.toLowerCase());
  }

  setProp(name: string, value: Value): void {
    this.ensureWritable();
    this.entries.set(name.toLowerCase(), value);
  }

  getIndex(_index: Value): Value {
    throw new Error(`Индексация недоступна для типа ${this.typeName}`);
  }

  setIndex(_index: Value, _value: Value): void {
    throw new Error(`Индексация недоступна для типа ${this.typeName}`);
  }

  iterate(): Value[] {
    return [...this.entries.keys()];
  }
}
