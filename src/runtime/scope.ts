import type { Value } from './values';

/** Ссылка на переменную вызывающего (для передачи параметра по ссылке). */
export class Ref {
  constructor(
    private readonly getter: () => Value,
    private readonly setter: (value: Value) => void,
  ) {}

  get(): Value {
    return this.getter();
  }

  set(value: Value): void {
    this.setter(value);
  }
}

/** Область видимости переменных. Имена регистронезависимы (как в 1С). */
export class Scope {
  private readonly vars = new Map<string, Value | Ref>();

  constructor(private readonly parent?: Scope) {}

  get(name: string): Value {
    const binding = this.vars.get(name.toLowerCase());
    if (binding !== undefined) return binding instanceof Ref ? binding.get() : binding;
    return this.parent?.get(name);
  }

  set(name: string, value: Value): void {
    this.vars.set(name.toLowerCase(), value);
  }

  /** Связывает имя со ссылкой на переменную (передача по ссылке). */
  bindRef(name: string, ref: Ref): void {
    this.vars.set(name.toLowerCase(), ref);
  }

  /** Ищет привязку по имени (Ref или значение), обходя цепочку. */
  findBinding(name: string): Value | Ref | undefined {
    const binding = this.vars.get(name.toLowerCase());
    if (binding !== undefined) return binding;
    return this.parent?.findBinding(name);
  }
}
