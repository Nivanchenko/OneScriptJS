import type { BslObject } from '../runtime/object';
import type { Value } from '../runtime/values';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `УникальныйИдентификатор` (UUID). */
export class BslUniqueIdentifier implements BslObject {
  readonly typeName = 'УникальныйИдентификатор';
  readonly value: string;

  constructor(args: Value[]) {
    if (args[0] !== undefined && args[0] !== null) {
      const s = String(args[0]).toLowerCase();
      if (!UUID_RE.test(s)) throw new Error('Неверный формат УникальногоИдентификатора');
      this.value = s;
    } else {
      this.value = crypto.randomUUID();
    }
  }

  toDisplayString(): string {
    return this.value;
  }

  equals(other: BslObject): boolean {
    return other instanceof BslUniqueIdentifier && other.value === this.value;
  }

  callMethod(name: string): Value {
    throw new Error(`Метод '${name}' не найден у типа УникальныйИдентификатор`);
  }

  getProp(name: string): Value {
    throw new Error(`Свойство '${name}' не найдено у типа УникальныйИдентификатор`);
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа УникальныйИдентификатор');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа УникальныйИдентификатор');
  }
}
