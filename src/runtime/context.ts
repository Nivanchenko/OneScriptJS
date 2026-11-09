import type { Value } from './values';
import type { BslObject } from './object';

/** Глобальная функция BSL: принимает значения аргументов, возвращает значение. */
export type GlobalFunction = (args: Value[]) => Value;

/** Конструктор типа BSL (для `Новый <Тип>`). */
export type TypeConstructor = (args: Value[]) => BslObject;

/** Контракт, по которому интерпретатор вызывает глобальные функции и создаёт объекты. */
export interface RuntimeEnvironment {
  call(name: string, args: Value[]): Value;
  construct(typeName: string, args: Value[]): Value;
}

/** Реестр глобальных функций и типов. Имена регистронезависимы. */
export class GlobalContext implements RuntimeEnvironment {
  private readonly functions = new Map<string, GlobalFunction>();
  private readonly types = new Map<string, TypeConstructor>();

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
}
