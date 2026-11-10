import type { BslObject } from '../../runtime/object';
import { isBslObject } from '../../runtime/object';
import type { Value } from '../../runtime/values';
import { equals, sortCompare, toNumber } from '../../runtime/values';
import { BslArray } from './array';
import { BslStructure } from './structure';
import { BslValueTableColumn, BslValueTableColumnCollection } from './value-table';

const ERR_INVALID_TYPE = 'Неверный тип аргумента';

/** Строка `ДереваЗначений` — значения по колонкам + иерархия. */
export class BslValueTreeRow implements BslObject {
  readonly typeName = 'СтрокаДереваЗначений';
  readonly rows: BslValueTreeRowCollection;
  private readonly data = new Map<BslValueTableColumn, Value>();

  constructor(
    readonly owner: BslValueTree,
    readonly parent: BslValueTreeRow | null,
    readonly level: number,
  ) {
    this.rows = new BslValueTreeRowCollection(owner, this, level + 1);
  }

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'получить':
      case 'get':
        return this.data.get(this.owner.resolveColumn(args[0]!));
      case 'установить':
      case 'set':
        this.data.set(this.owner.resolveColumn(args[0]!), args[1]);
        return undefined;
      case 'владелец':
      case 'owner':
        return this.owner;
      case 'уровень':
      case 'level':
        return this.level;
      default:
        throw new Error(`Метод '${name}' не найден у типа СтрокаДереваЗначений`);
    }
  }

  getProp(name: string): Value {
    switch (name.toLowerCase()) {
      case 'родитель':
      case 'parent':
        return this.parent ?? undefined;
      case 'строки':
      case 'rows':
        return this.rows;
      default:
        return this.data.get(this.owner.resolveColumn(name));
    }
  }

  setProp(name: string, value: Value): void {
    const lower = name.toLowerCase();
    // Предопределённые свойства строки дерева — только для чтения.
    if (lower === 'родитель' || lower === 'parent' || lower === 'строки' || lower === 'rows') {
      throw new Error(`Свойство '${name}' доступно только для чтения`);
    }
    this.data.set(this.owner.resolveColumn(name), value);
  }

  getIndex(index: Value): Value {
    return this.data.get(this.owner.resolveColumn(index));
  }

  setIndex(index: Value, value: Value): void {
    this.data.set(this.owner.resolveColumn(index), value);
  }
}

/** Коллекция строк `ДереваЗначений` (в т.ч. дочерних строк). */
export class BslValueTreeRowCollection implements BslObject {
  readonly typeName = 'КоллекцияСтрокДереваЗначений';
  private readonly rows: BslValueTreeRow[] = [];

  constructor(
    private readonly owner: BslValueTree,
    private readonly parent: BslValueTreeRow | null,
    private readonly level: number,
  ) {}

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'добавить':
      case 'add': {
        const row = new BslValueTreeRow(this.owner, this.parent, this.level);
        this.rows.push(row);
        return row;
      }
      case 'вставить':
      case 'insert': {
        const row = new BslValueTreeRow(this.owner, this.parent, this.level);
        this.rows.splice(toNumber(args[0]), 0, row);
        return row;
      }
      case 'удалить':
      case 'delete':
        this.rows.splice(this.resolveRowIndex(args[0]!), 1);
        return undefined;
      case 'индекс':
      case 'indexof':
        return this.rows.indexOf(args[0] as BslValueTreeRow);
      case 'количество':
      case 'count':
        return this.rows.length;
      case 'получить':
      case 'get':
        return this.rows[this.checkIndex(toNumber(args[0]))]!;
      case 'очистить':
      case 'clear':
        this.rows.length = 0;
        return undefined;
      case 'владелец':
      case 'owner':
        return this.owner;
      case 'сдвинуть':
      case 'move':
        this.move(args[0]!, toNumber(args[1]));
        return undefined;
      case 'выгрузитьколонку':
      case 'unloadcolumn': {
        const col = this.owner.resolveColumn(args[0]!);
        const arr = new BslArray([]);
        for (const r of this.rows) arr.callMethod('Добавить', [r.getProp(col.name)]);
        return arr;
      }
      case 'загрузитьколонку':
      case 'loadcolumn': {
        const src = args[0];
        const col = this.owner.resolveColumn(args[1]!);
        if (!(isBslObject(src) && src instanceof BslArray)) throw new Error(ERR_INVALID_TYPE);
        const values = src.iterate();
        this.rows.forEach((r, i) => r.setProp(col.name, values[i]));
        return undefined;
      }
      case 'итог':
      case 'total': {
        const col = this.owner.resolveColumn(args[0]!);
        const includeChildren = args[1] === true;
        let sum = 0;
        for (const r of this.rows) {
          const v = r.getProp(col.name);
          if (typeof v === 'number') sum += v;
          if (includeChildren) sum += toNumber(r.rows.callMethod('Итог', [args[0]!, true]));
        }
        return sum;
      }
      case 'найти':
      case 'find': {
        const value = args[0];
        const names = args[1] === undefined || args[1] === null ? '' : String(args[1]);
        const includeChildren = args[2] === true;
        const cols = this.owner.columnList(names);
        for (const r of this.rows) {
          for (const c of cols) if (equals(r.getProp(c.name), value)) return r;
          if (includeChildren) {
            const child = r.rows.callMethod('Найти', [value, names, true]);
            if (child !== undefined) return child;
          }
        }
        return undefined;
      }
      case 'найтистроки':
      case 'findrows': {
        const filter = args[0];
        const includeChildren = args[1] === true;
        if (!(isBslObject(filter) && filter instanceof BslStructure)) throw new Error(ERR_INVALID_TYPE);
        const result = new BslArray([]);
        for (const r of this.rows) {
          if (this.matchesFilter(r, filter)) result.callMethod('Добавить', [r]);
          if (includeChildren) {
            const children = r.rows.callMethod('НайтиСтроки', [filter, true]) as BslArray;
            for (const child of children.iterate()) result.callMethod('Добавить', [child]);
          }
        }
        return result;
      }
      case 'сортировать':
      case 'sort': {
        const rules = this.owner.sortRules(String(args[0] ?? ''));
        const sortChildren = args[1] === true;
        this.rows.sort((a, b) => {
          for (const rule of rules) {
            const r = sortCompare(a.getProp(rule.col.name), b.getProp(rule.col.name)) * rule.dir;
            if (r !== 0) return r;
          }
          return 0;
        });
        if (sortChildren) for (const r of this.rows) r.rows.callMethod('Сортировать', [args[0], true]);
        return undefined;
      }
      default:
        throw new Error(`Метод '${name}' не найден у типа КоллекцияСтрокДереваЗначений`);
    }
  }

  getProp(name: string): Value {
    if (name.toLowerCase() === 'родитель' || name.toLowerCase() === 'parent') {
      return this.parent ?? undefined;
    }
    throw new Error(`Свойство '${name}' не найдено у типа КоллекцияСтрокДереваЗначений`);
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(index: Value): Value {
    return this.rows[this.checkIndex(toNumber(index))]!;
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа КоллекцияСтрокДереваЗначений');
  }

  iterate(): Value[] {
    return this.rows;
  }

  private resolveRowIndex(arg: Value): number {
    if (isBslObject(arg) && arg instanceof BslValueTreeRow) {
      const i = this.rows.indexOf(arg);
      if (i === -1) throw new Error('Неверное значение аргумента');
      return i;
    }
    if (typeof arg === 'number' || typeof arg === 'string') {
      let n: number;
      try {
        n = toNumber(arg);
      } catch {
        throw new Error(ERR_INVALID_TYPE);
      }
      return this.checkIndex(n);
    }
    throw new Error(ERR_INVALID_TYPE);
  }

  private checkIndex(index: number): number {
    if (index < 0 || index >= this.rows.length) throw new Error('Значение индекса выходит за пределы диапазона');
    return index;
  }

  private move(arg: Value, offset: number): void {
    const source = this.resolveRowIndex(arg);
    if (source < 0 || source >= this.rows.length) throw new Error('Неверное значение аргумента');
    let dest = (source + offset) % this.rows.length;
    while (dest < 0) dest += this.rows.length;
    const [row] = this.rows.splice(source, 1);
    this.rows.splice(dest, 0, row!);
  }

  private matchesFilter(row: BslValueTreeRow, filter: BslStructure): boolean {
    for (const colName of filter.iterate() as string[]) {
      const col = this.owner.resolveColumn(colName);
      if (!equals(row.getProp(col.name), filter.getProp(colName))) return false;
    }
    return true;
  }
}

/** `ДеревоЗначений` (ValueTree). */
export class BslValueTree implements BslObject {
  readonly typeName = 'ДеревоЗначений';
  readonly columns: BslValueTableColumnCollection;
  readonly rows: BslValueTreeRowCollection;

  constructor() {
    this.columns = new BslValueTableColumnCollection();
    this.rows = new BslValueTreeRowCollection(this, null, 0);
  }

  resolveColumn(index: Value): BslValueTableColumn {
    return this.columns.resolveColumn(index);
  }

  columnList(names: string): BslValueTableColumn[] {
    if (names === '') return this.columns.all();
    return names
      .split(',')
      .map((raw) => raw.trim())
      .filter((n) => n !== '')
      .map((n) => {
        const col = this.columns.findByName(n);
        if (!col) throw new Error(`Колонка не найдена: '${n}'`);
        return col;
      });
  }

  sortRules(spec: string): { col: BslValueTableColumn; dir: number }[] {
    return spec
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c !== '')
      .map((c) => {
        const parts = c.split(/\s+/).filter((p) => p !== '');
        const col = this.columns.findByName(parts[0]!);
        if (!col) throw new Error(`Колонка не найдена: '${parts[0]}'`);
        const dir = parts.length > 1 && (parts[1]!.toLowerCase() === 'убыв' || parts[1]!.toLowerCase() === 'desc') ? -1 : 1;
        return { col, dir };
      });
  }

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'скопировать':
      case 'copy':
        return this.copy();
      default:
        throw new Error(`Метод '${name}' не найден у типа ДеревоЗначений`);
    }
  }

  getProp(name: string): Value {
    switch (name.toLowerCase()) {
      case 'колонки':
      case 'columns':
        return this.columns;
      case 'строки':
      case 'rows':
        return this.rows;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа ДеревоЗначений`);
    }
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа ДеревоЗначений');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа ДеревоЗначений');
  }

  private copy(): BslValueTree {
    const result = new BslValueTree();
    for (const col of this.columns.all()) {
      result.columns.callMethod('Добавить', [col.name, col.valueType, col.title, col.width]);
    }
    this.copyRows(this.rows, result.rows);
    return result;
  }

  private copyRows(src: BslValueTreeRowCollection, dst: BslValueTreeRowCollection): void {
    for (const row of src.iterate() as BslValueTreeRow[]) {
      const newRow = dst.callMethod('Добавить', []) as BslValueTreeRow;
      for (const col of this.columns.all()) {
        newRow.setProp(col.name, row.getProp(col.name));
      }
      this.copyRows(row.rows, newRow.rows);
    }
  }
}
