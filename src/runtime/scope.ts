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
  // Значения лежат в ячейках-Ref: присваивание из вложенной области (например,
  // из `Выполнить`) должно менять исходную переменную, а не создавать тень.
  private readonly vars = new Map<string, Ref>();

  constructor(private readonly parent?: Scope) {}

  get(name: string): Value {
    const binding = this.vars.get(name.toLowerCase());
    if (binding !== undefined) return binding.get();
    return this.parent?.get(name);
  }

  /** Присваивает значение в этой области (создаёт или перезаписывает привязку). */
  set(name: string, value: Value): void {
    this.vars.set(name.toLowerCase(), Scope.cell(value));
  }

  /** Объявляет переменную: видна в цепочке областей даже при значении `Неопределено`. */
  declare(name: string): void {
    this.vars.set(name.toLowerCase(), Scope.cell(undefined));
  }

  /** Связывает имя со ссылкой на переменную (передача по ссылке). */
  bindRef(name: string, ref: Ref): void {
    this.vars.set(name.toLowerCase(), ref);
  }

  /** Ищет привязку по имени (Ref), обходя цепочку. */
  findBinding(name: string): Ref | undefined {
    return this.vars.get(name.toLowerCase()) ?? this.parent?.findBinding(name);
  }

  private static cell(value: Value): Ref {
    let current = value;
    return new Ref(
      () => current,
      (next) => {
        current = next;
      },
    );
  }
}
