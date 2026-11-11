import type { Interpreter } from './interpreter';
import type { BslObject } from './object';
import type { Value } from './values';
import type { MaybePromise } from './async';

/**
 * Объект текущего модуля скрипта (`ЭтотОбъект`): доступны только экспортные методы.
 * `shortcut: доступ к модульным переменным через ЭтотОбъект не поддержан — вместе с рефлексией (T45)`.
 */
export class ScriptModuleObject implements BslObject {
  readonly typeName = 'Сценарий';

  constructor(private readonly interpreter: Interpreter) {}

  callMethod(name: string, args: Value[]): MaybePromise<Value> {
    if (!this.hasMethod(name)) throw new Error(`Метод объекта не обнаружен (${name})`);
    return this.interpreter.callExportedMethod(name, args);
  }

  /** Форкает интерпретатор для фонового задания (общие данные модуля, свой контекст). */
  forkForJob(task: unknown): Interpreter {
    return this.interpreter.forkForJob(task);
  }

  hasMethod(name: string): boolean {
    return this.interpreter.hasExportedMethod(name);
  }

  getProp(name: string): Value {
    throw new Error(`Свойство "${name}" недоступно для типа Сценарий`);
  }

  setProp(name: string): void {
    throw new Error(`Свойство "${name}" недоступно для типа Сценарий`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа Сценарий');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа Сценарий');
  }
}
