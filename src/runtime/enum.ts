import type { BslObject } from './object';
import type { Value } from './values';

/** Значение перечисления (`НаправлениеПоиска.СНачала` и т.п.). */
export class BslEnumValue implements BslObject {
  readonly typeName: string;

  constructor(typeName: string, readonly name: string) {
    this.typeName = typeName;
  }

  equals(other: BslObject): boolean {
    return other instanceof BslEnumValue && other.typeName === this.typeName && other.name === this.name;
  }

  toDisplayString(): string {
    return this.name;
  }

  callMethod(name: string): Value {
    throw new Error(`Метод '${name}' не найден у перечисления ${this.typeName}`);
  }
  getIndex(): Value {
    throw new Error(`Индексация недоступна для ${this.typeName}`);
  }
  setIndex(): void {
    throw new Error(`Индексация недоступна для ${this.typeName}`);
  }
  getProp(name: string): Value {
    throw new Error(`Свойство '${name}' не найдено у ${this.typeName}`);
  }
  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }
}

/** Пространство перечисления (`НаправлениеПоиска`) — значения через свойства. */
export class BslEnumNamespace implements BslObject {
  readonly typeName: string;
  private readonly values: Map<string, string>;

  constructor(typeName: string, values: Record<string, string>) {
    this.typeName = typeName;
    this.values = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]));
  }

  getProp(name: string): Value {
    const v = this.values.get(name.toLowerCase());
    if (!v) throw new Error(`Значение '${name}' не найдено у перечисления ${this.typeName}`);
    return new BslEnumValue(this.typeName, v);
  }

  callMethod(name: string): Value {
    throw new Error(`Метод '${name}' не найден у ${this.typeName}`);
  }
  getIndex(): Value {
    throw new Error(`Индексация недоступна для ${this.typeName}`);
  }
  setIndex(): void {
    throw new Error(`Индексация недоступна для ${this.typeName}`);
  }
  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }
}

/** Глобальный объект с константными значениями (`Символы.ПС` и т.п.). */
export class BslConstants implements BslObject {
  readonly typeName: string;
  private readonly values: Map<string, Value>;

  constructor(typeName: string, values: Record<string, Value>) {
    this.typeName = typeName;
    this.values = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]));
  }

  getProp(name: string): Value {
    const key = name.toLowerCase();
    if (!this.values.has(key)) throw new Error(`Свойство '${name}' не найдено у ${this.typeName}`);
    return this.values.get(key);
  }

  callMethod(name: string): Value {
    throw new Error(`Метод '${name}' не найден у ${this.typeName}`);
  }
  getIndex(): Value {
    throw new Error(`Индексация недоступна для ${this.typeName}`);
  }
  setIndex(): void {
    throw new Error(`Индексация недоступна для ${this.typeName}`);
  }
  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }
}
