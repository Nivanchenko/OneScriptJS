import type { GlobalContext } from '../runtime/context';
import { BslEnumValue } from '../runtime/enum';
import { isBslObject } from '../runtime/object';
import { toNumber, toStringValue } from '../runtime/values';
import type { Value } from '../runtime/values';
import { BslArray } from './collections/array';

function s(args: Value[], i: number): string {
  return toStringValue(args[i] ?? '');
}
function n(args: Value[], i: number): number {
  return toNumber(args[i]!);
}

/** Глобальные строковые функции и конвертации. */
export function registerStringFunctions(ctx: GlobalContext): void {
  ctx.registerAlias('Строка', 'String', (args) => toStringValue(args[0] ?? ''));
  ctx.registerAlias('Число', 'Number', (args) => toNumber(args[0]!));

  ctx.registerAlias('СтрДлина', 'StrLen', (args) => s(args, 0).length);
  ctx.registerAlias('ВРег', 'Upper', (args) => s(args, 0).toUpperCase());
  ctx.registerAlias('НРег', 'Lower', (args) => s(args, 0).toLowerCase());
  ctx.registerAlias('СокрЛП', 'TrimAll', (args) => s(args, 0).trim());
  ctx.registerAlias('СокрЛ', 'TrimL', (args) => s(args, 0).replace(/^\s+/, ''));
  ctx.registerAlias('СокрП', 'TrimR', (args) => s(args, 0).replace(/\s+$/, ''));
  ctx.registerAlias('ПустаяСтрока', 'IsBlankString', (args) => s(args, 0).trim() === '');

  ctx.registerAlias('Лев', 'Left', (args) => s(args, 0).slice(0, n(args, 1)));
  ctx.registerAlias('Прав', 'Right', (args) => {
    const str = s(args, 0);
    return str.slice(str.length - n(args, 1));
  });
  ctx.registerAlias('Сред', 'Mid', (args) => s(args, 0).slice(n(args, 1) - 1, n(args, 1) - 1 + n(args, 2)));

  ctx.registerAlias('Найти', 'Find', (args) => s(args, 0).indexOf(s(args, 1)) + 1);
  ctx.registerAlias('СтрЗаменить', 'StrReplace', (args) => s(args, 0).split(s(args, 1)).join(s(args, 2)));
  ctx.registerAlias('СтрЧислоВхождений', 'StrOccurrenceCount', (args) => {
    const str = s(args, 0);
    const sub = s(args, 1);
    if (sub === '') return 0;
    let count = 0;
    let idx = str.indexOf(sub);
    while (idx !== -1) {
      count++;
      idx = str.indexOf(sub, idx + sub.length);
    }
    return count;
  });
  ctx.registerAlias('СтрНачинаетсяС', 'StrStartsWith', (args) => s(args, 0).startsWith(s(args, 1)));
  ctx.registerAlias('СтрЗаканчиваетсяНа', 'StrEndsWith', (args) => s(args, 0).endsWith(s(args, 1)));

  ctx.registerAlias('СтрРазделить', 'StrSplit', (args) => {
    const str = s(args, 0);
    const sep = s(args, 1);
    const arr = new BslArray([]);
    const parts = sep === '' ? [...str] : str.split(sep);
    for (const p of parts) arr.callMethod('Добавить', [p]);
    return arr;
  });
  ctx.registerAlias('СтрСоединить', 'StrJoin', (args) => {
    const arr = args[0]!;
    if (!isBslObject(arr)) throw new Error('СтрСоединить: первый аргумент должен быть массивом');
    return (arr.iterate?.() ?? []).map(toStringValue).join(s(args, 1));
  });

  ctx.registerAlias('Символ', 'Char', (args) => String.fromCharCode(n(args, 0)));
  ctx.registerAlias('КодСимвола', 'CharCode', (args) => s(args, 0).charCodeAt((args[1] === undefined ? 1 : n(args, 1)) - 1));
  ctx.registerAlias('НСтр', 'NStr', (args) => s(args, 0));

  ctx.registerAlias('ТРег', 'Title', (args) => titleCase(s(args, 0)));
  ctx.registerAlias('СтрЧислоСтрок', 'StrLineCount', (args) => s(args, 0).split('\n').length);
  ctx.registerAlias('СтрПолучитьСтроку', 'StrGetLine', (args) => s(args, 0).split('\n')[n(args, 1) - 1] ?? '');
  ctx.registerAlias('СтрНайти', 'StrFind', (args) => strFind(args));
  ctx.registerAlias('СтрШаблон', 'StrTemplate', (args) => strTemplate(args));
}

function titleCase(str: string): string {
  return str.replace(/[а-яёa-z]+/gi, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function isFromEnd(value: Value | undefined): boolean {
  if (value === undefined) return false;
  if (value instanceof BslEnumValue) return value.name === 'СКонца';
  const s = toStringValue(value).toLowerCase();
  return s === 'сконца' || s === 'fromend';
}

function strFind(args: Value[]): number {
  const haystack = s(args, 0);
  const needle = s(args, 1);
  if (needle === '') return 1;
  const len = haystack.length;
  if (len === 0) return 0;

  const fromBegin = !(args[2] !== undefined && isFromEnd(args[2]));
  let startPos = args[3] !== undefined ? n(args, 3) : 0;
  const occurance = args[4] !== undefined ? n(args, 4) : 1;

  if (startPos === 0) startPos = fromBegin ? 1 : len;
  else if (startPos < 1 || startPos > len) throw new Error('Недопустимое значение начальной позиции');
  if (occurance < 0) return 0;
  else if (occurance === 0) throw new Error('Недопустимое значение номера вхождения');

  let startIndex = startPos - 1;
  let foundTimes = 0;
  let index = len + 1;

  if (fromBegin) {
    while (foundTimes < occurance && index >= 0) {
      index = haystack.indexOf(needle, startIndex);
      if (index >= 0) {
        startIndex = index + 1;
        foundTimes++;
      }
      if (startIndex >= len) break;
    }
  } else {
    while (foundTimes < occurance && index >= 0) {
      index = haystack.lastIndexOf(needle, startIndex);
      if (index >= 0) {
        startIndex = index - 1;
        foundTimes++;
      }
      if (startIndex < 0) break;
    }
  }

  return foundTimes === occurance ? index + 1 : 0;
}

function strTemplate(args: Value[]): string {
  return s(args, 0).replace(/%(\d+)/g, (_m, num) => {
    const idx = Number(num);
    return idx >= 1 && idx < args.length ? toStringValue(args[idx]!) : '';
  });
}
