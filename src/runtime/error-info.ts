import type { BslObject } from './object';
import { toNumber } from './values';
import type { Value } from './values';
import {
  EMPTY_SNAPSHOT,
  formatErrorDetails,
  type ErrorSnapshot,
  type FrameSnapshot,
} from './error-snapshot';

/** `КадрСтекаВызовов` / `CallStackFrame` — один BSL-кадр снимка стека. */
export class BslCallStackFrame implements BslObject {
  readonly typeName = 'КадрСтекаВызовов';

  constructor(private readonly frame: FrameSnapshot) {}

  getProp(name: string): Value {
    switch (name.toLowerCase()) {
      case 'метод':
      case 'method':
        return this.frame.method;
      case 'номерстроки':
      case 'linenumber':
        return this.frame.line;
      case 'имямодуля':
      case 'modulename':
        return this.frame.module;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа КадрСтекаВызовов`);
    }
  }

  callMethod(name: string): Value {
    throw new Error(`Метод '${name}' не найден у типа КадрСтекаВызовов`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа КадрСтекаВызовов');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа КадрСтекаВызовов');
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  /** `Строка(кадр)` — как `ToString()` эталонного `StackTraceItemContext`. */
  toDisplayString(): string {
    return `${this.frame.method}: ${this.frame.line} (${this.frame.module})`;
  }
}

/**
 * `ИнформацияОбОшибке` / `ErrorInfo` — сведения о перехваченном исключении.
 * Обёртка над снимком: описание, позиция, исходная строка и BSL-стек.
 */
export class BslErrorInfo implements BslObject {
  readonly typeName = 'ИнформацияОбОшибке';

  /** Снимок; `undefined` — пустая ошибка (вне блока `Исключение`). */
  constructor(readonly snapshot?: ErrorSnapshot) {}

  /** Текст ошибки; не меняется относительно прежнего поведения. */
  get description(): string {
    return this.snapshot?.description ?? '';
  }

  getProp(name: string): Value {
    const snapshot = this.snapshot ?? EMPTY_SNAPSHOT;
    switch (name.toLowerCase()) {
      case 'описание':
      case 'description':
        return snapshot.description;
      case 'имямодуля':
      case 'modulename':
        return snapshot.module;
      case 'номерстроки':
      case 'linenumber':
        return snapshot.line;
      case 'исходнаястрока':
      case 'sourceline':
        return snapshot.sourceLine;
      case 'подробноеописаниеошибки':
      case 'detailerrordescription':
      case 'detaileddescription':
        return formatErrorDetails(this.snapshot);
      case 'причина':
      case 'cause':
        return null;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа ИнформацияОбОшибке`);
    }
  }

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'подробноеописаниеошибки':
      case 'detailerrordescription':
      case 'detaileddescription':
        requireNoArguments(name, args);
        return formatErrorDetails(this.snapshot);
      case 'получитьстеквызовов':
      case 'getstacktrace':
        requireNoArguments(name, args);
        return this.stackTrace();
      default:
        throw new Error(`Метод '${name}' не найден у типа ИнформацияОбОшибке`);
    }
  }

  /** Стек кадров как `КоллекцияКадровСтекаВызовов` (изнутри наружу). */
  private stackTrace(): BslCallStackFrames {
    return new BslCallStackFrames(this.snapshot?.frames ?? []);
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

  /** `Строка(ИнформацияОбОшибке)` — краткое описание (как `ToString()` эталона). */
  toDisplayString(): string {
    return this.description;
  }
}

/**
 * `КоллекцияКадровСтекаВызовов` / `CallStackFramesCollection` — BSL-коллекция кадров
 * снимка стека: `Количество()`, индексация 0-based, обход `Для Каждого`.
 * Живёт в ядре (не stdlib), чтобы не нарушать направление слоёв.
 */
export class BslCallStackFrames implements BslObject {
  readonly typeName = 'КоллекцияКадровСтекаВызовов';
  private readonly frames: BslCallStackFrame[];

  constructor(frames: readonly FrameSnapshot[]) {
    this.frames = frames.map((frame) => new BslCallStackFrame(frame));
  }

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'количество':
      case 'count':
        requireNoArguments(name, args);
        return this.frames.length;
      default:
        throw new Error(`Метод '${name}' не найден у типа КоллекцияКадровСтекаВызовов`);
    }
  }

  getIndex(index: Value): Value {
    const position = toNumber(index);
    if (!Number.isInteger(position) || position < 0 || position >= this.frames.length) {
      throw new Error('Значение индекса выходит за пределы диапазона');
    }
    return this.frames[position]!;
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа КоллекцияКадровСтекаВызовов');
  }

  getProp(name: string): Value {
    throw new Error(`Свойство '${name}' не найдено у типа КоллекцияКадровСтекаВызовов`);
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  iterate(): Value[] {
    return [...this.frames];
  }
}

function requireNoArguments(name: string, args: Value[]): void {
  if (args.length > 0) {
    throw new Error(`Метод '${name}' не принимает параметров`);
  }
}
