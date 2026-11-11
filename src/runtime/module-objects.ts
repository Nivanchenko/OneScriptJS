import type { BslObject } from './object';
import type { Interpreter } from './interpreter';
import type { Value } from './values';
import type { MaybePromise } from './async';

/** Имя файла без пути и расширения: `lib/НекийСкрипт.osjs` → `НекийСкрипт`. */
export function nameFromPath(path: string): string {
  const base = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  // В браузере путь приходит URL-кодированным — имя должно остаться BSL-идентификатором.
  let decoded = base;
  try {
    decoded = decodeURIComponent(base);
  } catch {
    // не URL-кодирование — оставляем как есть
  }
  const dot = decoded.lastIndexOf('.');
  return dot > 0 ? decoded.slice(0, dot) : decoded;
}

const IDENTIFIER = /^[A-Za-zА-Яа-яЁё\u0370-\u03FF_][A-Za-zА-Яа-яЁё\u0370-\u03FF0-9_]*$/;

/** Проверка, что из имени файла можно сделать BSL-идентификатор. */
export function isBslIdentifier(name: string): boolean {
  return IDENTIFIER.test(name);
}

/** Модуль-синглтон: тело исполнено один раз, снаружи — только экспорт. */
export class BslModule implements BslObject {
  readonly typeName = 'Модуль';
  private interpreter?: Interpreter;

  constructor(
    private readonly name: string,
    private readonly isReady: () => boolean,
  ) {}

  attach(interpreter: Interpreter): void {
    this.interpreter = interpreter;
  }

  private requireInterpreter(): Interpreter {
    if (!this.isReady() || !this.interpreter) {
      throw new Error(`Модуль '${this.name}' ещё загружается (циклический импорт)`);
    }
    return this.interpreter;
  }

  callMethod(name: string, args: Value[]): MaybePromise<Value> {
    const interpreter = this.requireInterpreter();
    if (!interpreter.hasExportedMethod(name)) {
      throw new Error(`Метод '${name}' не найден у типа ${this.name}`);
    }
    return interpreter.callExportedMethod(name, args);
  }

  getProp(name: string): Value {
    const interpreter = this.requireInterpreter();
    if (!interpreter.hasExportedVar(name)) {
      throw new Error(`Свойство '${name}' не найдено у типа ${this.name}`);
    }
    return interpreter.getExportedVar(name);
  }

  setProp(name: string, value: Value): void {
    const interpreter = this.requireInterpreter();
    if (!interpreter.hasExportedVar(name)) {
      throw new Error(`Свойство '${name}' не найдено у типа ${this.name}`);
    }
    interpreter.setExportedVar(name, value);
  }

  getIndex(index: Value): Value {
    throw new Error(`Индексация недоступна для типа ${this.name} (${String(index)})`);
  }

  setIndex(index: Value): void {
    throw new Error(`Индексация недоступна для типа ${this.name} (${String(index)})`);
  }

  toDisplayString(): string {
    return this.name;
  }
}

/** Экземпляр класса: собственный интерпретатор и состояние, только экспорт наружу. */
export class BslInstance implements BslObject {
  constructor(
    readonly typeName: string,
    private readonly interpreter: Interpreter,
  ) {}

  callMethod(name: string, args: Value[]): MaybePromise<Value> {
    if (!this.interpreter.hasExportedMethod(name)) {
      throw new Error(`Метод '${name}' не найден у типа ${this.typeName}`);
    }
    return this.interpreter.callExportedMethod(name, args);
  }

  getProp(name: string): Value {
    if (!this.interpreter.hasExportedVar(name)) {
      throw new Error(`Свойство '${name}' не найдено у типа ${this.typeName}`);
    }
    return this.interpreter.getExportedVar(name);
  }

  setProp(name: string, value: Value): void {
    if (!this.interpreter.hasExportedVar(name)) {
      throw new Error(`Свойство '${name}' не найдено у типа ${this.typeName}`);
    }
    this.interpreter.setExportedVar(name, value);
  }

  getIndex(index: Value): Value {
    throw new Error(`Индексация недоступна для типа ${this.typeName} (${String(index)})`);
  }

  setIndex(index: Value): void {
    throw new Error(`Индексация недоступна для типа ${this.typeName} (${String(index)})`);
  }

  toDisplayString(): string {
    return this.typeName;
  }
}

/** Имя класса в глобальной области: подсказывает, что класс создаётся через `Новый`. */
export class BslClassRef implements BslObject {
  readonly typeName = 'Класс';

  constructor(private readonly name: string) {}

  private fail(): never {
    throw new Error(
      `Класс '${this.name}' не является модулем; создайте экземпляр: Новый ${this.name}(...)`,
    );
  }

  callMethod(): Value {
    return this.fail();
  }

  getProp(): Value {
    return this.fail();
  }

  setProp(): void {
    this.fail();
  }

  getIndex(): Value {
    return this.fail();
  }

  setIndex(): void {
    this.fail();
  }

  toDisplayString(): string {
    return this.name;
  }
}
