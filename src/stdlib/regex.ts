import type { BslObject } from '../runtime/object';
import type { GlobalContext } from '../runtime/context';
import type { Value } from '../runtime/values';
import { toNumber, toStringValue } from '../runtime/values';
import { BslArray } from './collections/array';

/**
 * Захватывающие группы шаблона в порядке появления.
 * `name === null` — безымянная группа.
 */
interface CaptureGroup {
  /** Индекс группы в JS-движке (1..n, порядок появления). */
  jsIndex: number;
  name: string | null;
}

/**
 * Разбирает шаблон и возвращает нумерацию групп в порядке .NET:
 * сначала безымянные (1..u), затем именованные (u+1..).
 * В JS нумерация идёт по порядку появления, поэтому её нужно пересчитывать.
 */
function parseCaptureGroups(pattern: string): { unnamed: CaptureGroup[]; named: CaptureGroup[] } {
  const groups: CaptureGroup[] = [];
  let i = 0;
  let jsIndex = 0;

  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '[') {
      // класс символов: пропускаем до неэкранированной ']'
      i++;
      while (i < pattern.length && pattern[i] !== ']') {
        if (pattern[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === '(') {
      const rest = pattern.slice(i);
      const namedMatch = /^\(\?<([A-Za-z_]\w*)>/.exec(rest);
      if (namedMatch) {
        jsIndex++;
        groups.push({ jsIndex, name: namedMatch[1]! });
        i += namedMatch[0].length;
        continue;
      }
      // (?: (?= (?! (?<= (?<! — не захватывают
      if (/^\(\?[=!:]/.test(rest) || /^\(\?<[=!]/.test(rest)) {
        i += 2;
        continue;
      }
      jsIndex++;
      groups.push({ jsIndex, name: null });
      i++;
      continue;
    }
    i++;
  }

  return {
    unnamed: groups.filter((g) => g.name === null),
    named: groups.filter((g) => g.name !== null),
  };
}

/** `РегулярноеВыражение` (Regex). По умолчанию IgnoreCase + Multiline, как в .NET. */
export class BslRegex implements BslObject {
  readonly typeName = 'РегулярноеВыражение';
  private readonly pattern: string;
  private ignoreCase = true;
  private multiline = true;
  /** Группы в порядке нумерации .NET: [группа1, группа2, …]. */
  private readonly dotnetGroups: CaptureGroup[];

  constructor(args: Value[]) {
    this.pattern = toStringValue(args[0] ?? '');
    const { unnamed, named } = parseCaptureGroups(this.pattern);
    this.dotnetGroups = [...unnamed, ...named];
  }

  private flags(withGlobal: boolean): string {
    let f = '';
    if (withGlobal) f += 'g';
    if (this.ignoreCase) f += 'i';
    if (this.multiline) f += 'm';
    f += 'd'; // индексы групп
    return f;
  }

  private compile(withGlobal = true): RegExp {
    return new RegExp(this.pattern, this.flags(withGlobal));
  }

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'совпадает':
      case 'ismatch': {
        const input = toStringValue(args[0] ?? '');
        const startAt = args[1] === undefined ? 0 : toNumber(args[1]);
        const re = this.compile(true);
        re.lastIndex = startAt;
        const found = re.test(input);
        re.lastIndex = 0;
        return found;
      }
      case 'найтисовпадения':
      case 'matches': {
        const input = toStringValue(args[0] ?? '');
        const startAt = args[1] === undefined ? 0 : toNumber(args[1]);
        return new BslMatchCollection(this, input, startAt);
      }
      case 'разделить':
      case 'split': {
        const input = toStringValue(args[0] ?? '');
        const count = args[1] === undefined ? 0 : toNumber(args[1]);
        const startAt = args[2] === undefined ? 0 : toNumber(args[2]);
        return this.split(input, count, startAt);
      }
      case 'заменить':
      case 'replace': {
        const input = toStringValue(args[0] ?? '');
        // .NET использует $0 для всего совпадения; в JS это $&
        const replacement = toStringValue(args[1] ?? '').replace(/\$0/g, '$&');
        return input.replace(this.compile(true), replacement);
      }
      default:
        throw new Error(`Метод '${name}' не найден у типа РегулярноеВыражение`);
    }
  }

  getProp(name: string): Value {
    switch (name.toLowerCase()) {
      case 'игнорироватьрегистр':
      case 'ignorecase':
        return this.ignoreCase;
      case 'многострочный':
      case 'multiline':
        return this.multiline;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа РегулярноеВыражение`);
    }
  }

  setProp(name: string, value: Value): void {
    switch (name.toLowerCase()) {
      case 'игнорироватьрегистр':
      case 'ignorecase':
        this.ignoreCase = value === true;
        return;
      case 'многострочный':
      case 'multiline':
        this.multiline = value === true;
        return;
      default:
        throw new Error(`Свойство '${name}' не найдено у типа РегулярноеВыражение`);
    }
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа РегулярноеВыражение');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа РегулярноеВыражение');
  }

  /** Имя группы по её номеру в нумерации .NET. */
  groupName(dotnetIndex: number): string {
    if (dotnetIndex === 0) return '0';
    const group = this.dotnetGroups[dotnetIndex - 1];
    return group?.name ?? String(dotnetIndex);
  }

  /** JS-индекс группы по её номеру в нумерации .NET (0 — всё совпадение). */
  jsIndexOf(dotnetIndex: number): number {
    if (dotnetIndex === 0) return 0;
    return this.dotnetGroups[dotnetIndex - 1]?.jsIndex ?? -1;
  }

  /** Номер группы в нумерации .NET по имени. */
  dotnetIndexOf(name: string): number {
    if (name === '0') return 0;
    const i = this.dotnetGroups.findIndex((g) => g.name === name);
    return i === -1 ? -1 : i + 1;
  }

  /** Количество групп, включая нулевую (всё совпадение). */
  groupCount(): number {
    return this.dotnetGroups.length + 1;
  }

  /** Все совпадения от `startAt` (для `НайтиСовпадения`). */
  execAll(input: string, startAt: number): RegExpExecArray[] {
    const re = this.compile(true);
    re.lastIndex = startAt;
    const result: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      result.push(m);
      if (m[0].length === 0) re.lastIndex += 1; // защита от зацикливания на пустых совпадениях
      if (re.lastIndex > input.length) break;
    }
    return result;
  }

  private split(input: string, count: number, startAt: number): BslArray {
    const re = this.compile(true);
    re.lastIndex = startAt;
    const parts: string[] = [];
    let lastEnd = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(input)) !== null) {
      if (count > 0 && parts.length === count - 1) break;
      parts.push(input.slice(lastEnd, m.index));
      lastEnd = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex += 1;
      if (re.lastIndex > input.length) break;
    }
    parts.push(input.slice(lastEnd));

    const arr = new BslArray([]);
    for (const p of parts) arr.callMethod('Добавить', [p]);
    return arr;
  }
}

/** `СовпадениеРегулярногоВыражения`. */
export class BslRegexMatch implements BslObject {
  readonly typeName = 'СовпадениеРегулярногоВыражения';

  constructor(
    private readonly regex: BslRegex,
    private readonly match: RegExpExecArray,
  ) {}

  callMethod(name: string): Value {
    throw new Error(`Метод '${name}' не найден у типа СовпадениеРегулярногоВыражения`);
  }

  getProp(name: string): Value {
    switch (name.toLowerCase()) {
      case 'значение':
      case 'value':
        return this.match[0];
      case 'индекс':
      case 'index':
        return this.match.index;
      case 'длина':
      case 'length':
        return this.match[0].length;
      case 'группы':
      case 'groups':
        return new BslRegexGroupCollection(this.regex, this.match);
      default:
        throw new Error(`Свойство '${name}' не найдено у типа СовпадениеРегулярногоВыражения`);
    }
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа СовпадениеРегулярногоВыражения');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа СовпадениеРегулярногоВыражения');
  }
}

/** `ГруппаРегулярногоВыражения`. */
export class BslRegexGroup implements BslObject {
  readonly typeName = 'ГруппаРегулярногоВыражения';

  constructor(
    private readonly regex: BslRegex,
    private readonly match: RegExpExecArray,
    private readonly dotnetIndex: number,
  ) {}

  private jsIndex(): number {
    return this.regex.jsIndexOf(this.dotnetIndex);
  }

  private rawValue(): string | undefined {
    const i = this.jsIndex();
    return i <= 0 ? this.match[0] : this.match[i];
  }

  private bounds(): { start: number; end: number } | null {
    const indices = this.match.indices;
    if (!indices) return null;
    const b = indices[this.jsIndex()];
    return b ? { start: b[0], end: b[1] } : null;
  }

  callMethod(name: string): Value {
    throw new Error(`Метод '${name}' не найден у типа ГруппаРегулярногоВыражения`);
  }

  getProp(name: string): Value {
    switch (name.toLowerCase()) {
      case 'значение':
      case 'value':
        return this.rawValue() ?? '';
      case 'индекс':
      case 'index':
        return this.bounds()?.start ?? 0;
      case 'длина':
      case 'length': {
        const b = this.bounds();
        return b ? b.end - b.start : 0;
      }
      case 'имя':
      case 'name':
        return this.regex.groupName(this.dotnetIndex);
      default:
        throw new Error(`Свойство '${name}' не найдено у типа ГруппаРегулярногоВыражения`);
    }
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа ГруппаРегулярногоВыражения');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа ГруппаРегулярногоВыражения');
  }
}

/** `КоллекцияСовпаденийРегулярногоВыражения`. */
export class BslMatchCollection implements BslObject {
  readonly typeName = 'КоллекцияСовпаденийРегулярногоВыражения';
  private readonly matches: RegExpExecArray[];

  constructor(
    private readonly regex: BslRegex,
    input: string,
    startAt: number,
  ) {
    this.matches = regex.execAll(input, startAt);
  }

  callMethod(name: string): Value {
    switch (name.toLowerCase()) {
      case 'количество':
      case 'count':
        return this.matches.length;
      default:
        throw new Error(`Метод '${name}' не найден у типа КоллекцияСовпаденийРегулярногоВыражения`);
    }
  }

  getProp(name: string): Value {
    throw new Error(`Свойство '${name}' не найдено у типа КоллекцияСовпаденийРегулярногоВыражения`);
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(index: Value): Value {
    return new BslRegexMatch(this.regex, this.matches[toNumber(index)]!);
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа КоллекцияСовпаденийРегулярногоВыражения');
  }

  iterate(): Value[] {
    return this.matches.map((m) => new BslRegexMatch(this.regex, m));
  }
}

/** `КоллекцияГруппРегулярногоВыражения`. */
export class BslRegexGroupCollection implements BslObject {
  readonly typeName = 'КоллекцияГруппРегулярногоВыражения';

  constructor(
    private readonly regex: BslRegex,
    private readonly match: RegExpExecArray,
  ) {}

  private make(dotnetIndex: number): BslRegexGroup {
    return new BslRegexGroup(this.regex, this.match, dotnetIndex);
  }

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'количество':
      case 'count':
        return this.regex.groupCount();
      case 'поимени':
      case 'fromname': {
        const index = this.regex.dotnetIndexOf(toStringValue(args[0] ?? ''));
        if (index === -1) throw new Error(`Группа '${toStringValue(args[0])}' не найдена`);
        return this.make(index);
      }
      default:
        throw new Error(`Метод '${name}' не найден у типа КоллекцияГруппРегулярногоВыражения`);
    }
  }

  getProp(name: string): Value {
    throw new Error(`Свойство '${name}' не найдено у типа КоллекцияГруппРегулярногоВыражения`);
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(index: Value): Value {
    return this.make(toNumber(index));
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа КоллекцияГруппРегулярногоВыражения');
  }

  iterate(): Value[] {
    return Array.from({ length: this.regex.groupCount() }, (_v, i) => this.make(i));
  }
}

/** Регистрирует `РегулярноеВыражение`. */
export function registerRegexFunctions(ctx: GlobalContext): void {
  ctx.registerType('РегулярноеВыражение', (args) => new BslRegex(args));
  ctx.registerType('Regex', (args) => new BslRegex(args));
}
