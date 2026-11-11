import type { Value } from './values';
import type { BslObject } from './object';
import type { Interpreter } from './interpreter';
import type { ImportDirective } from '../parser/preprocessor';

/** Глобальная функция BSL: принимает значения аргументов, возвращает значение. */
export type GlobalFunction = (args: Value[]) => Value;

/** Конструктор типа BSL (для `Новый <Тип>`). */
export type TypeConstructor = (args: Value[]) => BslObject;

/** Контракт, по которому интерпретатор вызывает глобальные функции, создаёт объекты и резолвит глобальные значения. */
export interface RuntimeEnvironment {
  call(name: string, args: Value[]): Value;
  construct(typeName: string, args: Value[]): Value;
  /** Резолвит глобальное значение (перечисление и т.п.); undefined, если нет. */
  resolveGlobal?(name: string): Value | undefined;
}

/** Реестр, достаточный загрузчику модулей: глобальные имена и типы. */
export interface ModuleRegistry extends RuntimeEnvironment {
  registerGlobal(name: string, value: Value): void;
  registerType(name: string, ctor: TypeConstructor): void;
  hasGlobal(name: string): boolean;
  hasType(name: string): boolean;
}

/** Загрузчик импорта, доступный динамическим сценариям того же запуска. */
export interface ModuleHost {
  importAll(directives: readonly ImportDirective[], importerPath: string): void;
}

/** Реестр глобальных функций, типов и значений. Имена регистронезависимы. */
export class GlobalContext implements RuntimeEnvironment {
  private readonly functions = new Map<string, GlobalFunction>();
  private readonly types = new Map<string, TypeConstructor>();
  private readonly globals = new Map<string, Value>();

  /** Путь к исполняемому сценарию (для `ТекущийСценарий`). */
  scriptPath?: string;
  /** Путь к стартовому сценарию (для `СтартовыйСценарий`). */
  startupScriptPath?: string;
  /** Интерпретатор исполняемого сценария (для `ТекущийСценарий`). */
  currentInterpreter?: Interpreter;
  /** База разрешения путей импорта главного файла (абсолютная, если задана платформой). */
  basePath?: string;
  /** Загрузчик импорта текущего запуска (для `ЗагрузитьСценарийИзСтроки`). */
  modules?: ModuleHost;
  /** Платформенное ленивое чтение исходника: Node ставит `fs`, браузер — нет. */
  loadSource?: (path: string) => string;

  register(name: string, fn: GlobalFunction): void {
    this.functions.set(name.toLowerCase(), fn);
  }

  /** Регистрирует функцию под русским и английским именем. */
  registerAlias(ru: string, en: string, fn: GlobalFunction): void {
    this.register(ru, fn);
    this.register(en, fn);
  }

  registerType(name: string, ctor: TypeConstructor): void {
    this.types.set(name.toLowerCase(), ctor);
  }

  registerGlobal(name: string, value: Value): void {
    this.globals.set(name.toLowerCase(), value);
  }

  hasGlobal(name: string): boolean {
    return this.globals.has(name.toLowerCase());
  }

  hasType(name: string): boolean {
    return this.types.has(name.toLowerCase());
  }

  call(name: string, args: Value[]): Value {
    const fn = this.functions.get(name.toLowerCase());
    if (!fn) throw new Error(`Неизвестная функция: ${name}`);
    return fn(args);
  }

  construct(typeName: string, args: Value[]): Value {
    const ctor = this.types.get(typeName.toLowerCase());
    if (!ctor) throw new Error(`Тип '${typeName}' не найден`);
    return ctor(args);
  }

  resolveGlobal(name: string): Value | undefined {
    return this.globals.get(name.toLowerCase());
  }
}
