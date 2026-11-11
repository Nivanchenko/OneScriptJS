import type { Interpreter } from '../../runtime/interpreter';
import type { BslObject } from '../../runtime/object';
import type { Value } from '../../runtime/values';
import { toNumber } from '../../runtime/values';
import type { MaybePromise } from '../../runtime/async';
import { isThenable, waitWithTimeout } from '../../runtime/async';
import { ScriptModuleObject } from '../../runtime/script-object';
import { BslErrorInfo } from '../../runtime/error-info';
import { BslEnumValue } from '../../runtime/enum';
import { BslArray } from '../collections/array';
import { BslUniqueIdentifier } from '../uuid';
import type { BackgroundTasksRegistry } from './registry';
import type { BackgroundJobState } from './state';
import { BACKGROUND_JOB_STATE_TYPE } from './state';

/** Окружение, в котором задача переключает `ТекущийСценарий`/`ПолучитьТекущее`. */
interface TaskRuntime {
  currentInterpreter?: Interpreter;
}

/** `ФоновоеЗадание` / `BackgroundTask`. */
export class BslBackgroundTask implements BslObject {
  readonly typeName = 'ФоновоеЗадание';
  readonly identifier = new BslUniqueIdentifier([]);
  readonly completion: Promise<void>;

  state: BackgroundJobState = 'НеВыполнялось';
  result: Value = undefined;
  error?: BslErrorInfo;

  private resolveCompletion!: () => void;
  private started = false;

  constructor(
    private readonly env: TaskRuntime,
    private readonly registry: BackgroundTasksRegistry,
    readonly taskId: number,
    readonly target: BslObject,
    readonly methodName: string,
    readonly parameters?: BslArray,
  ) {
    this.completion = new Promise<void>((resolve) => {
      this.resolveCompletion = resolve;
    });
  }

  /** Стартует исполнение в ближайшем кванте; повторный вызов — no-op. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.state = 'Активно';

    try {
      const args = this.parameters ? [...this.parameters.iterate()] : [];
      const previous = this.env.currentInterpreter;
      let driven: MaybePromise<Value>;
      if (this.target instanceof ScriptModuleObject) {
        const fork = this.target.forkForJob(this);
        driven = fork.callExportedMethod(this.methodName, args, {
          beforeStep: () => {
            this.env.currentInterpreter = fork;
          },
          afterStep: () => {
            this.env.currentInterpreter = previous;
          },
        });
      } else {
        driven = this.target.callMethod(this.methodName, args);
      }

      if (isThenable(driven)) {
        void driven.then(
          (value) => this.finish(value),
          (error: unknown) => this.finishWithError(error),
        );
      } else {
        this.finish(driven);
      }
    } catch (error) {
      // Синхронная ошибка старта не должна всплывать из queueMicrotask.
      this.finishWithError(error);
    }
  }

  private finish(value: Value): void {
    this.result = value;
    this.state = 'Завершено';
    this.registry.markCompleted(this);
    this.resolveCompletion();
  }

  private finishWithError(error: unknown): void {
    this.state = 'ЗавершеноАварийно';
    this.error = new BslErrorInfo(error instanceof Error ? error.message : String(error));
    this.registry.markCompleted(this);
    this.resolveCompletion();
  }

  callMethod(name: string, args: Value[]): MaybePromise<Value> {
    switch (name.toLowerCase()) {
      case 'ожидатьзавершения':
      case 'wait': {
        const timeout = toNumber(args[0] ?? 0);
        return waitWithTimeout(this.completion, timeout);
      }
      default:
        throw new Error(`Метод '${name}' не найден у типа ФоновоеЗадание`);
    }
  }

  getProp(name: string): MaybePromise<Value> {
    switch (name.toLowerCase()) {
      case 'уникальныйидентификатор':
      case 'uuid':
        return this.identifier;
      case 'имяметода':
      case 'methodname':
        return this.methodName;
      case 'объект':
      case 'object':
        return this.target;
      case 'состояние':
      case 'state':
        return new BslEnumValue(BACKGROUND_JOB_STATE_TYPE, this.state);
      case 'параметры':
      case 'parameters':
        return this.parameters;
      case 'результат':
      case 'result':
        return this.result;
      case 'информацияобошибке':
      case 'exceptioninfo':
        return this.error;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа ФоновоеЗадание`);
    }
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа ФоновоеЗадание');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа ФоновоеЗадание');
  }
}
