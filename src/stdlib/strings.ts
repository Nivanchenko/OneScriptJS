import type { GlobalContext } from '../runtime/context';
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
  ctx.registerAlias('КодСимвола', 'CharCode', (args) => s(args, 0).charCodeAt(n(args, 1) - 1));
  ctx.registerAlias('НСтр', 'NStr', (args) => s(args, 0));
}
