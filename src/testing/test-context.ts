import type { BslObject } from '../runtime/object';
import type { Value } from '../runtime/values';
import { compare, equals, toBoolean, toStringValue, typeName } from '../runtime/values';
import { BslType } from '../runtime/type';

/** Контекст `ЮнитТестирование` (xUnitFor1C): методы-утверждения. */
export class BslTestContext implements BslObject {
  readonly typeName = 'ЮнитТестирование';
  private readonly tempFiles: string[] = [];
  private detailedErrors = false;

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'подробныеописанияошибок':
      case 'showdetailederrors':
        // Влияет только на формат вывода раннера; для нас — запоминаем флаг.
        this.detailedErrors = toBoolean(args[0]!);
        return undefined;
      case 'тестпровален':
      case 'fail':
        throw new Error(`Тест провален.${args[0] !== undefined && args[0] !== '' ? ` ${toStringValue(args[0])}` : ''}`);
      case 'имявременногофайла':
      case 'tempfilename': {
        const ext = args[0] === undefined ? 'tmp' : toStringValue(args[0]);
        const file = `${tempDir()}/oscript_${randomSuffix()}${ext ? `.${ext}` : ''}`;
        this.tempFiles.push(file);
        return file;
      }
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
      case 'проверитьверно':
      case 'asserttrue':
        if (!toBoolean(args[0]!)) throw new Error('Проверить: условие ложно');
        return undefined;
      case 'проверитьистина':
      case 'проверитьистину':
        if (!toBoolean(args[0]!)) throw new Error('ПроверитьИстина: получена ложь');
        return undefined;
      case 'проверитьложь':
      case 'assertfalse':
        if (toBoolean(args[0]!)) throw new Error('ПроверитьЛожь: получена истина');
        return undefined;
      case 'проверитьзаполнено':
        if (!toBoolean(args[0]!)) throw new Error('ПроверитьЗаполнено: значение пустое');
        return undefined;
      case 'проверитьбольше':
        if (!(compare(args[0]!, args[1]!) > 0)) throw new Error('ПроверитьБольше: не больше');
        return undefined;
      case 'проверитьменьше':
        if (!(compare(args[0]!, args[1]!) < 0)) throw new Error('ПроверитьМеньше: не меньше');
        return undefined;
      case 'проверитьвхождение':
        if (!toStringValue(args[0]).includes(toStringValue(args[1]))) {
          throw new Error(`ПроверитьВхождение: '${fmt(args[0])}' не содержит '${fmt(args[1])}'`);
        }
        return undefined;
      case 'проверитьтип': {
        const actual = typeName(args[0]!);
        const expected = args[1] instanceof BslType ? args[1].name : toStringValue(args[1]);
        if (actual !== expected) throw new Error(`ПроверитьТип: ожидалось '${expected}', получено '${actual}'`);
        return undefined;
      }
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

function tempDir(): string {
  const proc = (globalThis as { process?: { env: Record<string, string | undefined> } }).process;
  return proc?.env['TMPDIR'] ?? proc?.env['TEMP'] ?? proc?.env['TMP'] ?? '/tmp';
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}
