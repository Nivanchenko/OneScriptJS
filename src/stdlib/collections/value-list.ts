import type { BslObject } from '../../runtime/object';
import { isBslObject } from '../../runtime/object';
import type { Value } from '../../runtime/values';
import { equals, sortCompare, toNumber, toStringValue } from '../../runtime/values';
import { BslArray } from './array';

const ERR_INDEX_OUT_OF_RANGE = 'Значение индекса выходит за пределы диапазона';
const ERR_READ_ONLY = 'Индексированное значение доступно только для чтения';
const ERR_NOT_BELONG = 'Элемент не принадлежит списку значений';
const ERR_INVALID_TYPE = 'Неверный тип аргумента';
const ERR_INVALID_ARG_2 = 'Неверное значение аргумента номер 2';

/** Элемент `СписокЗначений` — значение + представление/пометка/картинка. */
export class BslValueListItem implements BslObject {
  readonly typeName = 'ЭлементСпискаЗначений';
  value: Value;
  presentation: string;
  check: boolean;
  picture: Value;

  constructor(readonly id: number, value: Value, presentation?: string, check = false, picture?: Value) {
    this.value = value;
    this.presentation = presentation ?? '';
    this.check = check;
    this.picture = picture ?? undefined;
  }

  toDisplayString(): string {
    if (this.presentation !== '') return this.presentation;
    if (this.value === undefined || this.value === null) return '<Пустое значение>';
    return toStringValue(this.value);
  }

  callMethod(name: string): Value {
    switch (name.toLowerCase()) {
      case 'получитьидентификатор':
      case 'getid':
        return this.id;
      default:
        throw new Error(`Метод '${name}' не найден у типа ЭлементСпискаЗначений`);
    }
  }

  getProp(name: string): Value {
    switch (name.toLowerCase()) {
      case 'значение':
      case 'value':
        return this.value;
      case 'представление':
      case 'presentation':
        return this.presentation;
      case 'пометка':
      case 'check':
        return this.check;
      case 'картинка':
      case 'picture':
        return this.picture;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа ЭлементСпискаЗначений`);
    }
  }

  setProp(name: string, value: Value): void {
    switch (name.toLowerCase()) {
      case 'значение':
      case 'value':
        this.value = value;
        return;
      case 'представление':
      case 'presentation':
        this.presentation = value === null || value === undefined ? '' : String(value);
        return;
      case 'пометка':
      case 'check':
        this.check = value === true;
        return;
      case 'картинка':
      case 'picture':
        this.picture = value ?? undefined;
        return;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа ЭлементСпискаЗначений`);
    }
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа ЭлементСпискаЗначений');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа ЭлементСпискаЗначений');
  }
}

/** Коллекция `СписокЗначений` (ValueList). */
export class BslValueList implements BslObject {
  readonly typeName = 'СписокЗначений';
  private readonly items: BslValueListItem[] = [];
  private maxId = 0;
  private valueType: Value = undefined;
  private availableValues: Value = undefined;

  toDisplayString(): string {
    return this.items.map((i) => i.toDisplayString()).join('; ');
  }

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'добавить':
      case 'add': {
        const item = this.makeItem(args[0], args[1], args[2], args[3]);
        this.items.push(item);
        return item;
      }
      case 'вставить':
      case 'insert': {
        const index = this.checkInsertIndex(toNumber(args[0]));
        const item = this.makeItem(args[1], args[2], args[3], args[4]);
        this.items.splice(index, 0, item);
        return item;
      }
      case 'удалить':
      case 'delete':
        this.items.splice(this.resolveIndex(args[0]!), 1);
        return undefined;
      case 'индекс':
      case 'indexof':
        return this.items.indexOf(args[0] as BslValueListItem);
      case 'количество':
      case 'count':
        return this.items.length;
      case 'вграница':
      case 'ubound':
        return this.items.length - 1;
      case 'получить':
      case 'get':
        return this.items[this.checkIndex(toNumber(args[0]!))]!;
      case 'найтипозначению':
      case 'findbyvalue':
        return this.items.find((i) => equals(i.value, args[0])) ?? undefined;
      case 'сдвинуть':
      case 'move':
        this.move(args[0]!, toNumber(args[1]));
        return undefined;
      case 'сортироватьпозначению':
      case 'sortbyvalue':
        this.items.sort((a, b) => sortCompare(a.value, b.value) * this.direction(args[0]));
        return undefined;
      case 'сортироватьпопредставлению':
      case 'sortbypresentation':
        this.items.sort((a, b) => a.presentation.localeCompare(b.presentation) * this.direction(args[0]));
        return undefined;
      case 'выгрузитьзначения':
      case 'unloadvalues':
        return new BslArray(this.items.map((i) => i.value));
      case 'загрузитьзначения':
      case 'loadvalues': {
        const src = args[0];
        if (!(isBslObject(src) && src instanceof BslArray)) throw new Error(ERR_INVALID_TYPE);
        this.items.length = 0;
        for (const v of src.iterate()) this.items.push(this.makeItem(v));
        return undefined;
      }
      case 'очистить':
      case 'clear':
        this.items.length = 0;
        return undefined;
      case 'скопировать':
      case 'copy': {
        const copy = new BslValueList();
        for (const i of this.items) copy.items.push(copy.makeItem(i.value, i.presentation, i.check, i.picture));
        return copy;
      }
      default:
        throw new Error(`Метод '${name}' не найден у типа СписокЗначений`);
    }
  }

  getIndex(index: Value): Value {
    return this.items[this.checkIndex(toNumber(index))]!;
  }

  setIndex(): void {
    throw new Error(ERR_READ_ONLY);
  }

  getProp(name: string): Value {
    switch (name.toLowerCase()) {
      case 'типзначения':
      case 'valuetype':
        return this.valueType;
      case 'доступныезначения':
      case 'availablevalues':
        return this.availableValues;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа СписокЗначений`);
    }
  }

  setProp(name: string, value: Value): void {
    switch (name.toLowerCase()) {
      case 'типзначения':
      case 'valuetype':
        this.valueType = value;
        return;
      case 'доступныезначения':
      case 'availablevalues':
        this.availableValues = value;
        return;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа СписокЗначений`);
    }
  }

  iterate(): Value[] {
    return this.items;
  }

  private makeItem(value?: Value, presentation?: Value, check?: Value, picture?: Value): BslValueListItem {
    return new BslValueListItem(
      this.maxId++,
      value,
      presentation === undefined || presentation === null ? undefined : String(presentation),
      check === true,
      picture ?? undefined,
    );
  }

  private direction(directionValue: Value): number {
    // НаправлениеСортировки.Убыв/DESC — -1, иначе 1 (по умолчанию Возр).
    if (isBslObject(directionValue) && directionValue.typeName === 'НаправлениеСортировки') {
      const name = (directionValue as { name?: string }).name;
      if (name === 'Убыв') return -1;
    }
    return 1;
  }

  /** Индекс элемента: число/строка-число/элемент списка. */
  private resolveIndex(arg: Value): number {
    if (isBslObject(arg) && arg instanceof BslValueListItem) {
      const index = this.items.indexOf(arg);
      if (index === -1) throw new Error(ERR_NOT_BELONG);
      return index;
    }
    if (typeof arg === 'number' || typeof arg === 'string') {
      let index: number;
      try {
        index = toNumber(arg);
      } catch {
        throw new Error(ERR_INVALID_TYPE);
      }
      return this.checkIndex(index);
    }
    throw new Error(ERR_INVALID_TYPE);
  }

  private checkIndex(index: number): number {
    if (index < 0 || index >= this.items.length) throw new Error(ERR_INDEX_OUT_OF_RANGE);
    return index;
  }

  private checkInsertIndex(index: number): number {
    if (index < 0 || index > this.items.length) throw new Error(ERR_INDEX_OUT_OF_RANGE);
    return index;
  }

  private move(arg: Value, offset: number): void {
    const source = this.resolveIndex(arg);
    const dest = source + offset;
    if (dest < 0 || dest >= this.items.length) throw new Error(ERR_INVALID_ARG_2);
    const [item] = this.items.splice(source, 1);
    this.items.splice(dest, 0, item!);
  }
}
