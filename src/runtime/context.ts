import type { Value } from './values';

/** Глобальная функция BSL: принимает значения аргументов, возвращает значение. */
export type GlobalFunction = (args: Value[]) => Value;

/** Контракт, по которому интерпретатор вызывает глобальные функции. */
export interface RuntimeEnvironment {
  call(name: string, args: Value[]): Value;
}

/** Реестр глобальных функций. Имена регистронезависимы. */
export class GlobalContext implements RuntimeEnvironment {
  private readonly functions = new Map<string, GlobalFunction>();

  register(name: string, fn: GlobalFunction): void {
    this.functions.set(name.toLowerCase(), fn);
  }

  /** Регистрирует функцию под русским и английским именем. */
  registerAlias(ru: string, en: string, fn: GlobalFunction): void {
    this.register(ru, fn);
    this.register(en, fn);
  }

  call(name: string, args: Value[]): Value {
    const fn = this.functions.get(name.toLowerCase());
    if (!fn) throw new Error(`Неизвестная функция: ${name}`);
    return fn(args);
  }
}
