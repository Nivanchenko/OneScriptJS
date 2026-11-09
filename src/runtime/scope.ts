import type { Value } from './values';

/** Область видимости переменных. Имена регистронезависимы (как в 1С). */
export class Scope {
  private readonly vars = new Map<string, Value>();

  constructor(private readonly parent?: Scope) {}

  get(name: string): Value {
    const key = name.toLowerCase();
    if (this.vars.has(key)) return this.vars.get(key);
    return this.parent?.get(name);
  }

  set(name: string, value: Value): void {
    this.vars.set(name.toLowerCase(), value);
  }
}
