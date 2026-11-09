import type { BslObject } from './object';
import type { Value } from './values';

/** Значение «Тип» (результат `Тип()`/`ТипЗнч()`). */
export class BslType implements BslObject {
  readonly typeName = 'Тип';

  constructor(readonly name: string) {}

  equals(other: BslObject): boolean {
    return other instanceof BslType && other.name === this.name;
  }

  toDisplayString(): string {
    return this.name;
  }

  callMethod(name: string): Value {
    throw new Error(`Метод '${name}' не найден у типа Тип`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа Тип');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа Тип');
  }

  getProp(name: string): Value {
    throw new Error(`Свойство '${name}' не найдено у типа Тип`);
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }
}
