import type { BslObject } from '../../runtime/object';
import { isBslObject } from '../../runtime/object';
import type { Value } from '../../runtime/values';
import { equals, sortCompare, toNumber, toStringValue } from '../../runtime/values';
import { BslArray } from './array';
import { BslStructure } from './structure';

const ERR_INDEX_OUT_OF_RANGE = 'Значение индекса выходит за пределы диапазона';
const ERR_INVALID_TYPE = 'Неверный тип аргумента';
const ERR_NOT_BELONG = 'Строка не принадлежит таблице значений';

const key = (name: string): string => name.toLowerCase();

const IDENT_RE = /^[A-Za-zА-Яа-яЁё_\u0370-\u03FF][A-Za-zА-Яа-яЁё\u0370-\u03FF0-9_]*$/;

function isValidIdentifier(name: string): boolean {
  return IDENT_RE.test(name);
}

/** Колонка `ТаблицыЗначений`. */
export class BslValueTableColumn implements BslObject {
  readonly typeName = 'КолонкаТаблицыЗначений';
  name: string;
  title: string;
  valueType: Value;
  width: number;

  constructor(name: string, title: string, valueType?: Value, width = 0) {
    this.name = name;
    this.title = title || name;
    this.valueType = valueType ?? undefined;
    this.width = width;
  }

  getProp(name: string): Value {
    switch (name.toLowerCase()) {
      case 'имя':
      case 'name':
        return this.name;
      case 'заголовок':
      case 'title':
        return this.title;
      case 'типзначения':
      case 'valuetype':
        return this.valueType;
      case 'ширина':
      case 'width':
        return this.width;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа КолонкаТаблицыЗначений`);
    }
  }

  setProp(name: string, value: Value): void {
    switch (name.toLowerCase()) {
      case 'имя':
      case 'name':
        this.name = String(value);
        return;
      case 'заголовок':
      case 'title':
        this.title = String(value ?? '');
        return;
      case 'ширина':
      case 'width':
        this.width = toNumber(value);
        return;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа КолонкаТаблицыЗначений`);
    }
  }

  callMethod(name: string): Value {
    throw new Error(`Метод '${name}' не найден у типа КолонкаТаблицыЗначений`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа КолонкаТаблицыЗначений');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа КолонкаТаблицыЗначений');
  }
}

/** Строка `ТаблицыЗначений` — значения по колонкам. */
export class BslValueTableRow implements BslObject {
  readonly typeName = 'СтрокаТаблицыЗначений';
  private readonly data = new Map<BslValueTableColumn, Value>();

  constructor(readonly owner: BslValueTable) {}

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'получить':
      case 'get':
        return this.value(this.owner.resolveColumn(args[0]!));
      case 'установить':
      case 'set':
        this.data.set(this.owner.resolveColumn(args[0]!), args[1]);
        return undefined;
      case 'владелец':
      case 'owner':
        return this.owner;
      case 'количество':
      case 'count':
        return this.owner.columns.count();
      default:
        throw new Error(`Метод '${name}' не найден у типа СтрокаТаблицыЗначений`);
    }
  }

  value(column: BslValueTableColumn): Value {
    return this.data.get(column);
  }

  setValue(column: BslValueTableColumn, value: Value): void {
    this.data.set(column, value);
  }

  getProp(name: string): Value {
    return this.data.get(this.owner.columns.findByName(name)!);
  }

  setProp(name: string, value: Value): void {
    this.data.set(this.owner.columns.findByName(name)!, value);
  }

  getIndex(index: Value): Value {
    return this.data.get(this.owner.resolveColumn(index));
  }

  setIndex(index: Value, value: Value): void {
    this.data.set(this.owner.resolveColumn(index), value);
  }

  iterate(): Value[] {
    return this.owner.columns.all().map((c) => this.data.get(c));
  }
}

/** Индекс коллекции — список имён индексированных колонок. */
export class BslCollectionIndex implements BslObject {
  readonly typeName = 'ИндексКоллекции';
  constructor(readonly columns: BslValueTableColumn[]) {}

  removeColumn(col: BslValueTableColumn): void {
    for (let i = this.columns.length - 1; i >= 0; i--) {
      if (this.columns[i] === col) this.columns.splice(i, 1);
    }
  }

  toDisplayString(): string {
    return this.columns.map((c) => c.name).join(', ');
  }

  getIndex(index: Value): Value {
    return this.columns[toNumber(index)]?.name;
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа ИндексКоллекции');
  }

  getProp(name: string): Value {
    throw new Error(`Свойство '${name}' не найдено у типа ИндексКоллекции`);
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  callMethod(name: string): Value {
    throw new Error(`Метод '${name}' не найден у типа ИндексКоллекции`);
  }

  iterate(): Value[] {
    return this.columns.map((c) => c.name);
  }
}

/** Коллекция индексов `ТаблицыЗначений`. */
export class BslCollectionIndexes implements BslObject {
  readonly typeName = 'ИндексыКоллекции';
  private readonly items: BslCollectionIndex[] = [];

  constructor(private readonly owner: BslValueTable) {}

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'добавить':
      case 'add': {
        const cols = String(args[0] ?? '')
          .split(',')
          .map((n) => n.trim())
          .filter((n) => n !== '')
          .map((n) => this.owner.columns.findByName(n));
        if (cols.some((c) => c === undefined)) throw new Error('Колонка не найдена');
        const index = new BslCollectionIndex(cols as BslValueTableColumn[]);
        this.items.push(index);
        return index;
      }
      case 'удалить':
      case 'delete':
        this.items.splice(this.resolveIndex(args[0]!), 1);
        return undefined;
      case 'количество':
      case 'count':
        return this.items.length;
      case 'очистить':
      case 'clear':
        this.items.length = 0;
        return undefined;
      default:
        throw new Error(`Метод '${name}' не найден у типа ИндексыКоллекции`);
    }
  }

  getIndex(index: Value): Value {
    const i = toNumber(index);
    if (i < 0 || i >= this.items.length) throw new Error(ERR_INDEX_OUT_OF_RANGE);
    return this.items[i];
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа ИндексыКоллекции');
  }

  getProp(name: string): Value {
    throw new Error(`Свойство '${name}' не найдено у типа ИндексыКоллекции`);
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  iterate(): Value[] {
    return this.items;
  }

  /** Убирает колонку из всех индексов (при её удалении из таблицы). */
  removeColumn(col: BslValueTableColumn): void {
    for (const idx of this.items) idx.removeColumn(col);
  }

  private resolveIndex(arg: Value): number {
    if (isBslObject(arg) && arg instanceof BslCollectionIndex) {
      const i = this.items.indexOf(arg);
      if (i === -1) throw new Error(ERR_NOT_BELONG);
      return i;
    }
    if (typeof arg === 'number' || typeof arg === 'string') return toNumber(arg);
    throw new Error(ERR_INVALID_TYPE);
  }
}

/** Коллекция колонок `ТаблицыЗначений`. */
export class BslValueTableColumnCollection implements BslObject {
  readonly typeName = 'КоллекцияКолонокТаблицыЗначений';
  private readonly items: BslValueTableColumn[] = [];

  constructor(private readonly owner: BslValueTable) {}

  all(): BslValueTableColumn[] {
    return this.items;
  }

  count(): number {
    return this.items.length;
  }

  findByName(name: string): BslValueTableColumn | undefined {
    return this.items.find((c) => key(c.name) === key(name));
  }

  resolveColumn(index: Value): BslValueTableColumn {
    if (typeof index === 'string') {
      const col = this.findByName(index);
      if (!col) throw new Error(`Поле объекта не обнаружено: '${index}'`);
      return col;
    }
    if (typeof index === 'number') {
      if (index < 0 || index >= this.items.length) throw new Error(ERR_INDEX_OUT_OF_RANGE);
      return this.items[index]!;
    }
    if (isBslObject(index) && index instanceof BslValueTableColumn) return index;
    throw new Error(ERR_INVALID_TYPE);
  }

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'добавить':
      case 'add': {
        const name = String(args[0]);
        this.checkColumnName(name);
        const col = new BslValueTableColumn(name, String(args[2] ?? name), args[1], toNumber(args[3] ?? 0));
        this.items.push(col);
        return col;
      }
      case 'вставить':
      case 'insert': {
        const name = String(args[1]);
        this.checkColumnName(name);
        const col = new BslValueTableColumn(name, String(args[3] ?? name), args[2], toNumber(args[4] ?? 0));
        this.items.splice(toNumber(args[0]), 0, col);
        return col;
      }
      case 'удалить':
      case 'delete': {
        const col = this.resolveColumn(args[0]!);
        this.items.splice(this.items.indexOf(col), 1);
        this.owner.indexes.removeColumn(col);
        return undefined;
      }
      case 'индекс':
      case 'indexof':
        if (!(isBslObject(args[0]) && args[0] instanceof BslValueTableColumn)) throw new Error(ERR_INVALID_TYPE);
        return this.items.indexOf(args[0]);
      case 'количество':
      case 'count':
        return this.items.length;
      case 'найти':
      case 'find':
        return this.findByName(String(args[0])) ?? undefined;
      case 'очистить':
      case 'clear':
        for (const col of [...this.items]) this.owner.indexes.removeColumn(col);
        this.items.length = 0;
        return undefined;
      default:
        throw new Error(`Метод '${name}' не найден у типа КоллекцияКолонокТаблицыЗначений`);
    }
  }

  private checkColumnName(name: string): void {
    if (!isValidIdentifier(name)) throw new Error(`Неверное имя колонки: '${name}'`);
    if (this.findByName(name)) throw new Error(`Дублирующееся имя колонки: '${name}'`);
  }

  getIndex(index: Value): Value {
    return this.resolveColumn(index);
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа КоллекцияКолонокТаблицыЗначений');
  }

  getProp(name: string): Value {
    const col = this.findByName(name);
    if (!col) throw new Error(`Поле объекта не обнаружено: '${name}'`);
    return col;
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  iterate(): Value[] {
    return this.items;
  }
}

/** `ТаблицаЗначений` (ValueTable). */
export class BslValueTable implements BslObject {
  readonly typeName = 'ТаблицаЗначений';
  readonly columns: BslValueTableColumnCollection;
  readonly indexes: BslCollectionIndexes;
  private readonly rows: BslValueTableRow[] = [];

  constructor() {
    this.columns = new BslValueTableColumnCollection(this);
    this.indexes = new BslCollectionIndexes(this);
  }

  resolveColumn(index: Value): BslValueTableColumn {
    return this.columns.resolveColumn(index);
  }

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'добавить':
      case 'add': {
        const row = new BslValueTableRow(this);
        this.rows.push(row);
        return row;
      }
      case 'вставить':
      case 'insert': {
        const index = toNumber(args[0]);
        const row = new BslValueTableRow(this);
        if (index < 0 || index > this.rows.length) {
          this.rows.push(row);
        } else {
          this.rows.splice(index, 0, row);
        }
        return row;
      }
      case 'удалить':
      case 'delete':
        this.rows.splice(this.resolveRowIndex(args[0]!), 1);
        return undefined;
      case 'индекс':
      case 'indexof':
        if (!(isBslObject(args[0]) && args[0] instanceof BslValueTableRow)) throw new Error(ERR_INVALID_TYPE);
        return this.rows.indexOf(args[0]);
      case 'количество':
      case 'count':
        return this.rows.length;
      case 'получить':
      case 'get':
        return this.rows[this.checkRowIndex(toNumber(args[0]))]!;
      case 'очистить':
      case 'clear':
        this.rows.length = 0;
        return undefined;
      case 'сдвинуть':
      case 'move':
        this.moveRow(args[0]!, toNumber(args[1]));
        return undefined;
      case 'выгрузитьколонку':
      case 'unloadcolumn': {
        const col = this.resolveColumn(args[0]!);
        const arr = new BslArray([]);
        for (const r of this.rows) arr.callMethod('Добавить', [r.value(col)]);
        return arr;
      }
      case 'загрузитьколонку':
      case 'loadcolumn': {
        const src = args[0];
        const col = this.resolveColumn(args[1]!);
        if (!(isBslObject(src) && src instanceof BslArray)) throw new Error(ERR_INVALID_TYPE);
        const values = src.iterate();
        this.rows.forEach((r, i) => r.setValue(col, values[i]));
        return undefined;
      }
      case 'заполнитьзначения':
      case 'fillvalues': {
        const value = args[0];
        const names = args[1] === undefined || args[1] === null ? '' : String(args[1]);
        const cols = this.columnList(names, true);
        for (const r of this.rows) for (const c of cols) r.setValue(c, value);
        return undefined;
      }
      case 'итог':
      case 'total': {
        const col = this.resolveColumn(args[0]!);
        let sum = 0;
        for (const r of this.rows) {
          const v = r.value(col);
          if (typeof v === 'number') sum += v;
        }
        return sum;
      }
      case 'найти':
      case 'find': {
        const value = args[0];
        const names = args[1] === undefined || args[1] === null ? '' : String(args[1]);
        const cols = this.columnList(names, true);
        for (const r of this.rows) {
          for (const c of cols) {
            if (equals(r.value(c), value)) return r;
          }
        }
        return undefined;
      }
      case 'найтистроки':
      case 'findrows': {
        const filter = args[0];
        if (!(isBslObject(filter) && filter instanceof BslStructure)) throw new Error(ERR_INVALID_TYPE);
        const result = new BslArray([]);
        for (const r of this.rows) {
          if (this.matchesFilter(r, filter)) result.callMethod('Добавить', [r]);
        }
        return result;
      }
      case 'сортировать':
      case 'sort': {
        const rules = this.sortRules(String(args[0] ?? ''));
        this.rows.sort((a, b) => {
          for (const rule of rules) {
            const r = sortCompare(a.value(rule.col), b.value(rule.col)) * rule.dir;
            if (r !== 0) return r;
          }
          return 0;
        });
        return undefined;
      }
      case 'свернуть':
      case 'groupby':
        this.groupBy(String(args[0] ?? ''), args[1] === undefined || args[1] === null ? '' : String(args[1]));
        return undefined;
      case 'скопироватьколонки':
      case 'copycolumns': {
        const result = new BslValueTable();
        for (const c of this.columnList(args[0] === undefined || args[0] === null ? '' : String(args[0]), true)) {
          result.columns.callMethod('Добавить', [c.name, c.valueType, c.title, c.width]);
        }
        return result;
      }
      case 'скопировать':
      case 'copy': {
        const colNames = args[1] === undefined || args[1] === null ? '' : String(args[1]);
        const cols = this.columnList(colNames, true);
        const result = this.callMethod('СкопироватьКолонки', [colNames]) as BslValueTable;
        const sourceRows = this.selectRows(args[0]);
        for (const src of sourceRows) {
          const nr = result.callMethod('Добавить', []) as BslValueTableRow;
          for (const c of cols) {
            const dst = result.columns.findByName(c.name)!;
            nr.setValue(dst, src.value(c));
          }
        }
        return result;
      }
      default:
        throw new Error(`Метод '${name}' не найден у типа ТаблицаЗначений`);
    }
  }

  getProp(name: string): Value {
    switch (name.toLowerCase()) {
      case 'колонки':
      case 'columns':
        return this.columns;
      case 'индексы':
      case 'indexes':
        return this.indexes;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа ТаблицаЗначений`);
    }
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(index: Value): Value {
    return this.rows[this.checkRowIndex(toNumber(index))]!;
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа ТаблицаЗначений');
  }

  iterate(): Value[] {
    return this.rows;
  }

  // --- служебные ---

  private resolveRowIndex(arg: Value): number {
    if (isBslObject(arg) && arg instanceof BslValueTableRow) {
      const i = this.rows.indexOf(arg);
      if (i === -1) throw new Error(ERR_NOT_BELONG);
      return i;
    }
    if (typeof arg === 'number' || typeof arg === 'string') {
      let n: number;
      try {
        n = toNumber(arg);
      } catch {
        throw new Error(ERR_INVALID_TYPE);
      }
      return this.checkRowIndex(n);
    }
    throw new Error(ERR_INVALID_TYPE);
  }

  private checkRowIndex(index: number): number {
    if (index < 0 || index >= this.rows.length) throw new Error(ERR_INDEX_OUT_OF_RANGE);
    return index;
  }

  private moveRow(arg: Value, offset: number): void {
    const source = this.resolveRowIndex(arg);
    const dest = source + offset;
    if (dest < 0 || dest >= this.rows.length) throw new Error('Неправильное смещение внутри коллекции');
    const [row] = this.rows.splice(source, 1);
    this.rows.splice(dest, 0, row!);
  }

  /** Разбирает список имён колонок через запятую; пустая строка → все колонки. */
  private columnList(names: string, emptyMeansAll: boolean): BslValueTableColumn[] {
    if (names === '') {
      return emptyMeansAll ? this.columns.all() : [];
    }
    return names
      .split(',')
      .filter((raw) => raw !== '')
      .map((raw) => {
        const name = raw.trim();
        const col = this.columns.findByName(name);
        if (!col) throw new Error(`Колонка не найдена: '${name}'`);
        return col;
      });
  }

  private matchesFilter(row: BslValueTableRow, filter: BslStructure): boolean {
    for (const colName of filter.iterate() as string[]) {
      const col = this.columns.findByName(colName);
      if (!col) throw new Error(`Колонка не найдена: '${colName}'`);
      if (!equals(row.value(col), filter.getProp(colName))) return false;
    }
    return true;
  }

  private sortRules(spec: string): { col: BslValueTableColumn; dir: number }[] {
    return spec
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c !== '')
      .map((c) => {
        const parts = c.split(/\s+/).filter((p) => p !== '');
        if (parts.length === 0 || parts.length > 2) throw new Error('Неверное значение аргумента номер 1');
        const col = this.columns.findByName(parts[0]!);
        if (!col) throw new Error(`Колонка не найдена: '${parts[0]}'`);
        const dir = parts.length > 1 && (parts[1]!.toLowerCase() === 'убыв' || parts[1]!.toLowerCase() === 'desc') ? -1 : 1;
        return { col, dir };
      });
  }

  private groupBy(groupNames: string, aggregateNames: string): void {
    const groups = this.columnList(groupNames, false);
    const aggregates = this.columnList(aggregateNames, false);
    const groupsKey = (row: BslValueTableRow): string =>
      JSON.stringify(groups.map((c) => row.value(c)));
    const map = new Map<string, BslValueTableRow>();
    const ordered: BslValueTableRow[] = [];
    for (const row of this.rows) {
      const k = groupsKey(row);
      const existing = map.get(k);
      if (!existing) {
        const nr = new BslValueTableRow(this);
        for (const c of [...groups, ...aggregates]) nr.setValue(c, row.value(c));
        map.set(k, nr);
        ordered.push(nr);
      } else {
        for (const c of aggregates) {
          const v = existing.value(c);
          const nv = row.value(c);
          const a = typeof v === 'number' ? v : 0;
          const b = typeof nv === 'number' ? nv : 0;
          existing.setValue(c, a + b);
        }
      }
    }
    this.rows.length = 0;
    this.rows.push(...ordered);
    // удалить колонки, не входящие ни в группы, ни в агрегаты
    const keep = new Set([...groups, ...aggregates]);
    for (const col of [...this.columns.all()]) {
      if (!keep.has(col)) this.columns.callMethod('Удалить', [col]);
    }
  }

  private selectRows(arg: Value | undefined): BslValueTableRow[] {
    if (arg === undefined || arg === null) return this.rows;
    if (isBslObject(arg) && arg instanceof BslArray) {
      return arg.iterate().map((r) => {
        if (!(isBslObject(r) && r instanceof BslValueTableRow && r.owner === this)) {
          throw new Error(ERR_INVALID_TYPE);
        }
        return r;
      });
    }
    if (isBslObject(arg) && arg instanceof BslStructure) {
      return this.rows.filter((r) => this.matchesFilter(r, arg));
    }
    throw new Error(ERR_INVALID_TYPE);
  }
}
