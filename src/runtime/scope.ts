import type { Value } from './values';

/** Область видимости переменных. Имена регистронезависимы (как в 1С). */
export class Scope {
  private readonly vars = new Map<string, Value>();

  get(name: string): Value {
    return this.vars.get(name.toLowerCase());
  }

  set(name: string, value: Value): void {
    this.vars.set(name.toLowerCase(), value);
  }
}
