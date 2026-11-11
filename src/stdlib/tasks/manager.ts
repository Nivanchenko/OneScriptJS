import type { GlobalContext } from '../../runtime/context';
import type { BslObject } from '../../runtime/object';
import { isBslObject } from '../../runtime/object';
import type { Value } from '../../runtime/values';
import { equals, toBoolean, toNumber, toStringValue, typeName } from '../../runtime/values';
import type { MaybePromise } from '../../runtime/async';
import { waitAllPromises, waitAnyPromises } from '../../runtime/async';
import { BslArray } from '../collections/array';
import { BslStructure } from '../collections/structure';
import { BslEnumValue } from '../../runtime/enum';
import { BackgroundTasksRegistry } from './registry';
import { BslBackgroundTask } from './task';
import { BACKGROUND_JOB_STATE_TYPE } from './state';

/**
 * `МенеджерФоновыхЗаданий` — единственный экземпляр, доступный как `ФоновыеЗадания`.
 * Создаёт задания, хранит реестр и управляет ожиданиями.
 */
export class BslBackgroundTasksManager implements BslObject {
  readonly typeName = 'МенеджерФоновыхЗаданий';

  private readonly registry = new BackgroundTasksRegistry(1000);
  private nextId = 1;

  constructor(private readonly ctx: GlobalContext) {}

  callMethod(name: string, args: Value[]): MaybePromise<Value> {
    switch (name.toLowerCase()) {
      case 'выполнить':
      case 'execute':
        return this.execute(args);
      case 'очистить':
      case 'clear':
        this.registry.clear();
        return undefined;
      case 'ожидатьвсе':
      case 'waitall': {
        const tasks = this.toTasks(args[0]);
        const timeout = toNumber(args[1] ?? 0);
        return waitAllPromises(tasks.map((task) => task.completion), timeout);
      }
      case 'ожидатьлюбое':
      case 'waitany': {
        const tasks = this.toTasks(args[0]);
        const timeout = toNumber(args[1] ?? 0);
        return waitAnyPromises(tasks.map((task) => task.completion), timeout);
      }
      case 'ожидатьзавершениязадач':
      case 'waitcompletionoftasks':
        return this.waitCompletionOfTasks();
      case 'получитьфоновыезадания':
      case 'getbackgroundjobs':
        return this.arrayOf(this.getBackgroundJobs(args[0]));
      case 'получитьтекущее':
      case 'getcurrent': {
        const current = this.ctx.currentInterpreter?.currentJob;
        return current as Value;
      }
      default:
        throw new Error(`Метод '${name}' не найден у типа МенеджерФоновыхЗаданий`);
    }
  }

  /** Дожидается завершения всех активных заданий (вызывается хостом после тела скрипта). */
  flushAsync(): MaybePromise<void> {
    // Если заданий нет — остаёмся синхронными (sync fast-path не ломается).
    if (this.activeTasks().length === 0) return;
    return this.waitAllActive();
  }

  private activeTasks(): BslBackgroundTask[] {
    return this.registry
      .values()
      .filter((task) => task.state === 'НеВыполнялось' || task.state === 'Активно');
  }

  private waitAllActive(): Promise<void> {
    const active = this.activeTasks();
    if (active.length === 0) return Promise.resolve();
    return Promise.all(active.map((task) => task.completion)).then(() => this.waitAllActive());
  }

  private execute(args: Value[]): BslBackgroundTask {
    const target = args[0];
    if (!isBslObject(target)) {
      throw new Error(`Объект фонового задания должен быть объектом, а не ${typeName(target)}`);
    }
    const methodName = toStringValue(args[1] ?? '');
    if (methodName === '') {
      throw new Error('Ожидается имя метода фонового задания');
    }
    if (target.hasMethod && !target.hasMethod(methodName)) {
      throw new Error(`Метод объекта не обнаружен (${methodName})`);
    }
    const parametersArg = args[2];
    let parameters: BslArray | undefined;
    if (parametersArg === undefined || parametersArg === null) {
      parameters = undefined;
    } else if (parametersArg instanceof BslArray) {
      // Копия массива на момент запуска: значения элементов общие, состав — фиксируется.
      parameters = new BslArray([]);
      for (const item of parametersArg.iterate()) parameters.callMethod('Добавить', [item]);
    } else {
      throw new Error('Параметры фонового задания должны быть Массивом');
    }
    // Четвёртый аргумент `Длительное` принимается для совместимости с эталоном.
    toBoolean(args[3] ?? false);

    const task = new BslBackgroundTask(
      this.ctx,
      this.registry,
      this.nextId++,
      target,
      methodName,
      parameters,
    );
    this.registry.add(task);
    queueMicrotask(() => task.start());
    return task;
  }

  private getBackgroundJobs(filterArg: Value): Value[] {
    if (filterArg === undefined || filterArg === null) return this.registry.values();
    if (!(filterArg instanceof BslStructure)) {
      throw new Error('Фильтр фоновых заданий должен быть Структурой');
    }
    const criteria: { key: string; value: Value }[] = [];
    for (const key of filterArg.iterate()) {
      const name = toStringValue(key);
      criteria.push({ key: name.toLowerCase(), value: filterArg.getProp(name) as Value });
    }
    return this.registry.values().filter((task) =>
      criteria.every(({ key, value }) => {
        switch (key) {
          case 'состояние':
          case 'state':
            if (!(value instanceof BslEnumValue) || value.typeName !== BACKGROUND_JOB_STATE_TYPE) {
              return true; // неверный тип значения — критерий игнорируется (как в эталоне)
            }
            return task.state === value.name;
          case 'имяметода':
          case 'methodname':
            return task.methodName.toLowerCase() === toStringValue(value).toLowerCase();
          case 'объект':
          case 'object':
            return equals(value, task.target);
          case 'уникальныйидентификатор':
          case 'uuid':
            return equals(value, task.identifier);
          default:
            return true; // неизвестные ключи игнорируются
        }
      }),
    );
  }

  /** Снимок заданий снимка; при аварии — исключение, успешные удаляются из реестра. */
  private waitCompletionOfTasks(): MaybePromise<Value> {
    const snapshot = this.registry.values();
    if (snapshot.length === 0) return;
    return Promise.all(snapshot.map((task) => task.completion)).then(() => {
      const failed = snapshot.filter((task) => task.state === 'ЗавершеноАварийно');
      if (failed.length > 0) {
        const details = failed
          .map((task) => `${task.methodName}: ${task.error?.description ?? ''}`)
          .join('; ');
        throw new Error(`Задания завершились с ошибками: ${details}`);
      }
      for (const task of snapshot) this.registry.remove(task);
      return undefined;
    });
  }

  private toTasks(value: Value): BslBackgroundTask[] {
    if (!(value instanceof BslArray)) {
      throw new Error('Ожидание: первым аргументом должен быть Массив заданий');
    }
    const tasks: BslBackgroundTask[] = [];
    for (const item of value.iterate()) {
      if (!(item instanceof BslBackgroundTask)) {
        throw new Error('Ожидание: элемент массива не является ФоновымЗаданием');
      }
      tasks.push(item);
    }
    return tasks;
  }

  private arrayOf(values: Value[]): BslArray {
    const result = new BslArray([]);
    for (const value of values) result.callMethod('Добавить', [value]);
    return result;
  }

  getProp(name: string): Value {
    throw new Error(`Свойство '${name}' не найдено у типа МенеджерФоновыхЗаданий`);
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа МенеджерФоновыхЗаданий');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа МенеджерФоновыхЗаданий');
  }
}
