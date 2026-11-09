import type { GlobalContext } from '../runtime/context';
import { toNumber, typeName } from '../runtime/values';

/** Глобальные математические и системные функции. */
export function registerMathFunctions(ctx: GlobalContext): void {
  ctx.registerAlias('Мин', 'Min', (args) => Math.min(...args.map((a) => toNumber(a!))));
  ctx.registerAlias('Макс', 'Max', (args) => Math.max(...args.map((a) => toNumber(a!))));
  ctx.registerAlias('Окр', 'Round', (args) => Math.round(toNumber(args[0]!)));
  ctx.registerAlias('Цел', 'Int', (args) => Math.trunc(toNumber(args[0]!)));
  ctx.register('Pow', (args) => Math.pow(toNumber(args[0]!), toNumber(args[1]!)));
  ctx.registerAlias('ТекущаяДата', 'CurrentDate', () => new Date());
  ctx.registerAlias('ТекущаяУниверсальнаяДата', 'CurrentUniversalDate', () => new Date());
  ctx.registerAlias('ТипЗнч', 'TypeOf', (args) => typeName(args[0]!));
}
