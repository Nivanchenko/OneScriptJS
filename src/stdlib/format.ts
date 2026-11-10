import type { GlobalContext } from '../runtime/context';
import { toStringValue } from '../runtime/values';
import type { Value } from '../runtime/values';

/**
 * Глобальная функция `Формат`. Покрывает формат 1С:
 * булево (`БИ`/`БЛ`), число (`ЧЦ`, `ЧДЦ`, `ЧН`, `ЧГ`, `ЧРД`, `ЧРГ`, `ЧВН`, `ЧО`, `Л`),
 * дата (`ДФ`, `ДЛФ`). Отложено: `ДП` (пустая дата), длинный формат даты `ДД`.
 */
export function registerFormatFunction(ctx: GlobalContext): void {
  ctx.registerAlias('Формат', 'Format', (args) => format(args));
}

function format(args: Value[]): Value {
  const value = args[0];
  const fs = args[1] !== undefined ? toStringValue(args[1]) : '';
  if (fs === '') return toStringValue(value ?? '');

  if (typeof value === 'boolean') {
    const bt = matchParam(fs, 'БИ');
    const bf = matchParam(fs, 'БЛ');
    if (bt !== null || bf !== null) return value ? (bt ?? 'Истина') : (bf ?? 'Ложь');
    return value ? 'Истина' : 'Ложь';
  }

  if (typeof value === 'number') return formatNumber(value, fs);

  if (value instanceof Date) {
    const df = matchParam(fs, 'ДФ');
    if (df !== null && df !== '') return formatDateCustom(value, df);
    const dlf = matchParam(fs, 'ДЛФ');
    if (dlf !== null && dlf !== '') return formatDateCustom(value, localDatePattern(dlf));
  }

  return toStringValue(value ?? '');
}

/** Числовой параметр формата: `ЧДЦ=2` → 2; `ЧДЦ=-2` → -2; пусто/нет → null. */
function matchInt(fs: string, key: string): number | null {
  const m = fs.match(new RegExp(`${key}\\s*=\\s*(-?\\d+)`));
  return m ? Number(m[1]) : null;
}

/** Строковый параметр формата: `БИ='Да'` → `Да`; `ЧН=Z` → `Z`; пусто/нет → null. */
function matchParam(fs: string, key: string): string | null {
  const m = fs.match(new RegExp(`${key}\\s*=\\s*([^;]*)`));
  if (!m) return null;
  let v = m[1]!.trim();
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
    v = v.slice(1, -1);
  }
  return v;
}

/** Округление half-away-from-zero с компенсацией погрешности double (как decimal в 1С). */
function roundHalfAway(value: number, digits: number): number {
  const factor = 10 ** digits;
  const scaled = value * factor;
  return Math.round(scaled + Number.EPSILON * Math.abs(scaled)) / factor;
}

function isRuLocale(locale: string | null): boolean {
  return locale !== null && /^ru/i.test(locale);
}

function groupDigits(digits: string, sep: string): string {
  let result = '';
  while (digits.length > 3) {
    result = sep + digits.slice(-3) + result;
    digits = digits.slice(0, -3);
  }
  return digits + result;
}

function applyNegativePattern(n: string, pattern: number): string {
  switch (pattern) {
    case 0: return `(${n})`;
    case 2: return `- ${n}`;
    case 3: return `${n}-`;
    case 4: return `${n} -`;
    default: return `-${n}`;
  }
}

function formatNumber(value: number, fs: string): string {
  const zero = matchParam(fs, 'ЧН');
  if (value === 0 && zero !== null) return zero;

  const decimalsRaw = matchInt(fs, 'ЧДЦ');
  const decimals = decimalsRaw !== null ? Math.max(0, decimalsRaw) : null;
  const total = matchInt(fs, 'ЧЦ');
  const locale = matchParam(fs, 'Л');
  const fracSep = matchParam(fs, 'ЧРД');
  const groupSep = matchParam(fs, 'ЧРГ');
  const groupingParam = matchParam(fs, 'ЧГ');
  const hasLeadingZero = matchParam(fs, 'ЧВН') !== null;
  const negPattern = matchInt(fs, 'ЧО');

  const dec = fracSep !== null && fracSep !== '' ? fracSep[0]! : isRuLocale(locale) ? ',' : '.';
  const grp = groupSep !== null && groupSep !== '' ? groupSep[0]! : isRuLocale(locale) ? '\u00A0' : ',';
  const grouping = groupingParam !== '0';

  const neg = value < 0;
  const abs = Math.abs(value);
  const fixed = decimals !== null ? roundHalfAway(abs, decimals).toFixed(decimals) : String(abs);
  let [intPart, fracPart] = fixed.split('.');

  if (total !== null && total > 0) {
    const targetInt = total - (decimals ?? 0);
    if (targetInt <= 0) {
      intPart = '';
      if ((decimals ?? 0) > 0) fracPart = '9'.repeat(decimals!);
    } else if (intPart!.length > targetInt) {
      intPart = '9'.repeat(targetInt);
      if ((decimals ?? 0) > 0) fracPart = '9'.repeat(decimals!);
    } else if (hasLeadingZero && intPart!.length < targetInt) {
      intPart = intPart!.padStart(targetInt, '0');
    }
  }

  if (grouping && intPart!.length > 3) {
    intPart = groupDigits(intPart!, grp);
  }

  let result = intPart!;
  if (fracPart !== undefined) result += dec + fracPart;

  if (neg) result = applyNegativePattern(result, negPattern ?? 1);

  return result;
}

function localDatePattern(code: string): string {
  switch (code.toLowerCase()) {
    case 'д': case 'd': return 'dd.MM.yyyy';
    case 'в': case 't': return 'HH:mm:ss';
    case 'дв': case 'dt': return 'dd.MM.yyyy HH:mm:ss';
    default: return 'dd.MM.yyyy';
  }
}

function formatDateCustom(d: Date, pattern: string): string {
  const en = pattern
    .replace(/д/g, 'd')
    .replace(/М/g, 'M')
    .replace(/г/g, 'y')
    .replace(/Ч/g, 'H')
    .replace(/ч/g, 'h')
    .replace(/м/g, 'm')
    .replace(/с/g, 's');
  const p = (n: number): string => String(n).padStart(2, '0');
  return en.replace(/dd|MM|yyyy|yy|HH|mm|ss|d|M|y|H|h|m|s/g, (tok) => {
    switch (tok) {
      case 'dd': return p(d.getUTCDate());
      case 'd': return String(d.getUTCDate());
      case 'MM': return p(d.getUTCMonth() + 1);
      case 'M': return String(d.getUTCMonth() + 1);
      case 'yyyy': return String(d.getUTCFullYear());
      case 'yy': return p(d.getUTCFullYear() % 100);
      case 'HH': return p(d.getUTCHours());
      case 'H': return String(d.getUTCHours());
      case 'mm': return p(d.getUTCMinutes());
      case 'm': return String(d.getUTCMinutes());
      case 'ss': return p(d.getUTCSeconds());
      case 's': return String(d.getUTCSeconds());
      default: return tok;
    }
  });
}
