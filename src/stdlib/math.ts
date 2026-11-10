import type { GlobalContext } from '../runtime/context';
import { toNumber } from '../runtime/values';

/** Минимальный decimal: коэффициент + масштаб (число знаков после запятой). */
interface Decimal {
  c: bigint;
  s: number;
}

/** System.Decimal держит максимум ~29 значащих цифр. */
const MAX_DECIMAL_DIGITS = 29;

function absBig(x: bigint): bigint {
  return x < 0n ? -x : x;
}

function decFromNumber(x: number): Decimal | null {
  if (!Number.isFinite(x)) return null;
  const str = String(x);
  if (str.includes('e') || str.includes('E')) return null; // экспоненциальная запись не нужна для Pow
  const neg = str.startsWith('-');
  const body = neg ? str.slice(1) : str;
  const dot = body.indexOf('.');
  const intPart = dot === -1 ? body : body.slice(0, dot);
  const fracPart = dot === -1 ? '' : body.slice(dot + 1);
  const coefficient = BigInt(intPart + fracPart);
  return { c: neg ? -coefficient : coefficient, s: fracPart.length };
}

function decMul(a: Decimal, b: Decimal): Decimal {
  let c = a.c * b.c;
  let s = a.s + b.s;
  const digits = absBig(c).toString().length;
  if (digits > MAX_DECIMAL_DIGITS) {
    const drop = digits - MAX_DECIMAL_DIGITS;
    const div = 10n ** BigInt(drop);
    let q = c / div;
    const r = absBig(c % div);
    if (r * 2n >= div) q += c < 0n ? -1n : 1n; // округление половины вверх
    c = q;
    s -= drop;
    if (s < 0) {
      c *= 10n ** BigInt(-s);
      s = 0;
    }
  }
  return { c, s };
}

function decToNumber(d: Decimal): number {
  const neg = d.c < 0n;
  let str = absBig(d.c).toString();
  if (d.s > 0) {
    str = str.padStart(d.s + 1, '0');
    str = `${str.slice(0, str.length - d.s)}.${str.slice(str.length - d.s)}`;
  }
  return Number((neg ? '-' : '') + str);
}

/** `Pow` для целой неотрицательной степени — decimal-арифметика, как PowInt в эталоне. */
function powIntDecimal(base: number, exp: number): number | null {
  const start = decFromNumber(base);
  if (!start) return null;
  let result: Decimal = { c: 1n, s: 0 };
  let current = start;
  let e = exp;
  for (;;) {
    if (e & 1) result = decMul(result, current);
    e = Math.floor(e / 2);
    if (e === 0) break;
    current = decMul(current, current);
  }
  return decToNumber(result);
}

/** Округление до 15 значащих цифр — аналог `(decimal)double` в .NET. */
function toDecimal15(x: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const exponent = Math.floor(Math.log10(Math.abs(x)));
  const fracDigits = 14 - exponent;
  if (fracDigits >= 0 && fracDigits <= 300) {
    const factor = 10 ** fracDigits;
    return Math.round(x * factor) / factor;
  }
  if (fracDigits < 0) {
    const factor = 10 ** -fracDigits;
    return Math.round(x / factor) * factor;
  }
  return x; // слишком малые числа — оставляем как есть
}

/**
 * `Pow` с точностью 1С: целая неотрицательная степень считается в decimal,
 * иначе — `Math.Pow` с приведением к decimal (15 значащих цифр).
 */
export function bslPow(base: number, power: number): number {
  if (Number.isInteger(power) && power >= 0) {
    const exact = powIntDecimal(base, power);
    if (exact !== null) return exact;
  }
  return toDecimal15(Math.pow(base, power));
}

/** Глобальные математические и системные функции. */
export function registerMathFunctions(ctx: GlobalContext): void {
  ctx.registerAlias('Мин', 'Min', (args) => Math.min(...args.map((a) => toNumber(a!))));
  ctx.registerAlias('Макс', 'Max', (args) => Math.max(...args.map((a) => toNumber(a!))));
  ctx.registerAlias('Окр', 'Round', (args) => Math.round(toNumber(args[0]!)));
  ctx.registerAlias('Цел', 'Int', (args) => Math.trunc(toNumber(args[0]!)));
  ctx.register('Pow', (args) => bslPow(toNumber(args[0]!), toNumber(args[1]!)));
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
