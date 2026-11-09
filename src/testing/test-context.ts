import type { BslObject } from '../runtime/object';
import type { Value } from '../runtime/values';
import { equals, toBoolean, toStringValue } from '../runtime/values';

/** Контекст `ЮнитТестирование` (xUnitFor1C): методы-утверждения. */
export class BslTestContext implements BslObject {
  readonly typeName = 'ЮнитТестирование';

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'проверитьравенство':
      case 'assertequals':
        if (!equals(args[0], args[1])) {
          throw new Error(`ПроверитьРавенство: ожидалось '${fmt(args[0])}', получено '${fmt(args[1])}'`);
        }
        return undefined;
      case 'проверитьнеравенство':
      case 'assertnotequals':
        if (equals(args[0], args[1])) {
          throw new Error(`ПроверитьНеРавенство: значения равны '${fmt(args[0])}'`);
        }
        return undefined;
      case 'проверить':
      case 'assert':
        if (!toBoolean(args[0]!)) throw new Error('Проверить: условие ложно');
        return undefined;
      case 'проверитьистина':
      case 'asserttrue':
        if (!toBoolean(args[0]!)) throw new Error('ПроверитьИстина: получена ложь');
        return undefined;
      case 'проверитьложь':
      case 'assertfalse':
        if (toBoolean(args[0]!)) throw new Error('ПроверитьЛожь: получена истина');
        return undefined;
      default:
        throw new Error(`Метод '${name}' не найден у типа ЮнитТестирование`);
    }
  }

  getProp(name: string): Value {
    throw new Error(`Свойство '${name}' не найдено у типа ЮнитТестирование`);
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа ЮнитТестирование');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа ЮнитТестирование');
  }
}

function fmt(value: Value): string {
  return toStringValue(value ?? '');
}
