import type { GlobalContext } from '../runtime/context';
import { toNumber } from '../runtime/values';

/** Глобальные математические и системные функции. */
export function registerMathFunctions(ctx: GlobalContext): void {
  ctx.registerAlias('Мин', 'Min', (args) => Math.min(...args.map((a) => toNumber(a!))));
  ctx.registerAlias('Макс', 'Max', (args) => Math.max(...args.map((a) => toNumber(a!))));
  ctx.registerAlias('Окр', 'Round', (args) => Math.round(toNumber(args[0]!)));
  ctx.registerAlias('Цел', 'Int', (args) => Math.trunc(toNumber(args[0]!)));
  ctx.register('Pow', (args) => Math.pow(toNumber(args[0]!), toNumber(args[1]!)));
  ctx.registerAlias('ТекущаяДата', 'CurrentDate', () => new Date());
  ctx.registerAlias('ТекущаяУниверсальнаяДата', 'CurrentUniversalDate', () => new Date());
  ctx.registerAlias('Дата', 'Date', (args) => {
    const y = toNumber(args[0]!);
    const m = toNumber(args[1] ?? 1);
    const d = toNumber(args[2] ?? 1);
    const hh = args[3] !== undefined ? toNumber(args[3]) : 0;
    const mm = args[4] !== undefined ? toNumber(args[4]) : 0;
    const ss = args[5] !== undefined ? toNumber(args[5]) : 0;
    return new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  });
}
