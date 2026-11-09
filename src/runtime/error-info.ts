import type { BslObject } from './object';
import type { Value } from './values';

/** Объект `ИнформацияОбОшибке` — сведения о перехваченном исключении. */
export class BslErrorInfo implements BslObject {
  readonly typeName = 'ИнформацияОбОшибке';

  constructor(readonly description: string) {}

  getProp(name: string): Value {
    switch (name.toLowerCase()) {
      case 'описание':
      case 'description':
        return this.description;
      case 'подробноеописаниеошибки':
      case 'detailerrordescription':
        return this.description;
      case 'причина':
      case 'cause':
        return null;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа ИнформацияОбОшибке`);
    }
  }

  callMethod(name: string): Value {
    throw new Error(`Метод '${name}' не найден у типа ИнформацияОбОшибке`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа ИнформацияОбОшибке');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа ИнформацияОбОшибке');
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }
}
