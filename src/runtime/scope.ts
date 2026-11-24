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

/** Собственная переменная области (для отладчика). */
export interface ScopeEntry {
  name: string;
  value: Value;
}

interface Binding {
  /** Исходное написание имени: ключ Map — нижний регистр. */
  readonly name: string;
  readonly ref: Ref;
}

/** Область видимости переменных. Имена регистронезависимы (как в 1С). */
export class Scope {
  // Значения лежат в ячейках-Ref: присваивание из вложенной области (например,
  // из `Выполнить`) должно менять исходную переменную, а не создавать тень.
  private readonly vars = new Map<string, Binding>();

  constructor(private readonly parent?: Scope) {}

  get(name: string): Value {
    const binding = this.vars.get(name.toLowerCase());
    if (binding !== undefined) return binding.ref.get();
    return this.parent?.get(name);
  }

  /** Присваивает значение в этой области (создаёт или перезаписывает привязку). */
  set(name: string, value: Value): void {
    const existing = this.vars.get(name.toLowerCase());
    // Первое написание имени сохраняем: оно пришло из объявления и читаемо в отладчике.
    this.vars.set(name.toLowerCase(), {
      name: existing?.name ?? name,
      ref: Scope.cell(value),
    });
  }

  /** Объявляет переменную: видна в цепочке областей даже при значении `Неопределено`. */
  declare(name: string): void {
    const existing = this.vars.get(name.toLowerCase());
    this.vars.set(name.toLowerCase(), {
      name: existing?.name ?? name,
      ref: Scope.cell(undefined),
    });
  }

  /** Связывает имя со ссылкой на переменную (передача по ссылке). */
  bindRef(name: string, ref: Ref): void {
    const existing = this.vars.get(name.toLowerCase());
    this.vars.set(name.toLowerCase(), { name: existing?.name ?? name, ref });
  }

  /** Ищет привязку по имени (Ref), обходя цепочку. */
  findBinding(name: string): Ref | undefined {
    return this.vars.get(name.toLowerCase())?.ref ?? this.parent?.findBinding(name);
  }

  /** Только собственные переменные области (без parent), с исходным написанием имён. */
  ownEntries(): ScopeEntry[] {
    const entries: ScopeEntry[] = [];
    for (const binding of this.vars.values()) {
      entries.push({ name: binding.name, value: binding.ref.get() });
    }
    return entries;
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
