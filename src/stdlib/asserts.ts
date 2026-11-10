import type { BslObject } from '../runtime/object';
import { isBslObject } from '../runtime/object';
import type { Value } from '../runtime/values';
import { compare, equals, toBoolean, toNumber, toStringValue, typeName } from '../runtime/values';

/** Матчер `Ожидаем.Что(факт)` — флюент-утверждения из библиотеки `asserts`. */
class BslExpectation implements BslObject {
  readonly typeName = 'Ожидание';

  constructor(
    private readonly actual: Value,
    private readonly message: string,
    private readonly negated: boolean,
  ) {}

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'равно':
      case 'equals':
        return this.check(equals(this.actual, args[0]!), `ожидалось '${fmt(args[0])}', получено '${fmt(this.actual)}'`);
      case 'неравно':
      case 'notequals':
        return this.check(!equals(this.actual, args[0]!), `значения равны '${fmt(this.actual)}'`);
      case 'больше':
      case 'greater':
        return this.check(compare(this.actual, args[0]!) > 0, `ожидалось значение больше '${fmt(args[0])}'`);
      case 'меньше':
      case 'less':
        return this.check(compare(this.actual, args[0]!) < 0, `ожидалось значение меньше '${fmt(args[0])}'`);
      case 'большеилиравно':
      case 'greaterorequal':
        return this.check(compare(this.actual, args[0]!) >= 0, `ожидалось значение не меньше '${fmt(args[0])}'`);
      case 'меньшеилиравно':
      case 'lessorequal':
        return this.check(compare(this.actual, args[0]!) <= 0, `ожидалось значение не больше '${fmt(args[0])}'`);
      case 'этоистина':
      case 'istrue':
        return this.check(toBoolean(this.actual), 'ожидалась истина');
      case 'этоложь':
      case 'isfalse':
        return this.check(!toBoolean(this.actual), 'ожидалась ложь');
      case 'этоне':
      case 'not':
        return new BslExpectation(this.actual, this.message, !this.negated);
      case 'имеетдлину':
      case 'haslength':
        return this.check(lengthOf(this.actual) === toNumber(args[0]!), `ожидалась длина '${fmt(args[0])}'`);
      case 'существует':
      case 'exists':
        return this.check(this.actual !== undefined && this.actual !== null, 'ожидалось существующее значение');
      case 'содержит':
      case 'contains':
        return this.check(
          toStringValue(this.actual).includes(toStringValue(args[0]!)),
          `ожидалось, что строка содержит '${fmt(args[0])}'`,
        );
      default:
        throw new Error(`Метод '${name}' не найден у типа Ожидание`);
    }
  }

  /** Фиксирует прохождение проверки с учётом инверсии `ЭтоНе()`. */
  private check(passIf: boolean, description: string): Value {
    const ok = this.negated ? !passIf : passIf;
    if (!ok) {
      throw new Error(this.message ? `${this.message} — ${description}` : `Ожидание не выполнено: ${description}`);
    }
    return undefined;
  }

  getProp(name: string): Value {
    throw new Error(`Свойство '${name}' не найдено у типа Ожидание`);
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа Ожидание');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа Ожидание');
  }
}

/** Глобальный объект `Ожидаем`/`Expect` — точка входа библиотеки asserts. */
export class BslExpect implements BslObject {
  readonly typeName = 'Ожидаем';

  callMethod(name: string, args: Value[]): Value {
    const lower = name.toLowerCase();
    if (lower === 'что' || lower === 'what') {
      const message = args.length > 1 ? toStringValue(args[1]) : '';
      return new BslExpectation(args[0], message, false);
    }
    throw new Error(`Метод '${name}' не найден у типа Ожидаем`);
  }

  getProp(name: string): Value {
    throw new Error(`Свойство '${name}' не найдено у типа Ожидаем`);
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа Ожидаем');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа Ожидаем');
  }
}

function lengthOf(value: Value): number {
  if (typeof value === 'string') return value.length;
  if (isBslObject(value) && value.iterate) return value.iterate().length;
  throw new Error(`Нельзя определить длину у значения типа ${typeName(value)}`);
}

function fmt(value: Value): string {
  return toStringValue(value ?? '');
}
