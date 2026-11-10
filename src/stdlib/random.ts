import type { BslObject } from '../runtime/object';
import type { GlobalContext } from '../runtime/context';
import type { Value } from '../runtime/values';
import { toNumber } from '../runtime/values';

const UINT32_MAX = 4294967295;
const INT32_MIN = -2147483648;

/** Детерминированный ГПСЧ (mulberry32): нужен для воспроизводимости по seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/**
 * Начальное число по значению BSL: как в эталоне, если оно не влезает в int32,
 * берутся младшие 32 бита мантиссы decimal. Здесь — младшие 32 бита IEEE-754:
 * результат детерминирован, чего достаточно для воспроизводимости последовательности.
 */
function deriveSeed(seed: number): number | undefined {
  if (seed === 0) return undefined; // 0 → неинициализированный генератор
  if (Number.isInteger(seed) && seed >= INT32_MIN && seed <= 2147483647) return seed;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, seed, true);
  return view.getUint32(0, true);
}

/** `ГенераторСлучайныхЧисел`. */
export class BslRandomNumberGenerator implements BslObject {
  readonly typeName = 'ГенераторСлучайныхЧисел';
  /** Возвращает целое в [0, 2^32). */
  private readonly next32: () => number;

  constructor(args: Value[]) {
    const seed = args.length > 0 && args[0] !== undefined ? toNumber(args[0]) : 0;
    const derived = deriveSeed(seed);
    this.next32 =
      derived === undefined ? () => Math.floor(Math.random() * 4294967296) : mulberry32(derived);
  }

  callMethod(name: string, args: Value[]): Value {
    switch (name.toLowerCase()) {
      case 'случайноечисло':
      case 'randomnumber':
        return this.randomNumber(args);
      default:
        throw new Error(`Метод '${name}' не найден у типа ГенераторСлучайныхЧисел`);
    }
  }

  getProp(name: string): Value {
    throw new Error(`Свойство '${name}' не найдено у типа ГенераторСлучайныхЧисел`);
  }

  setProp(name: string): void {
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа ГенераторСлучайныхЧисел');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа ГенераторСлучайныхЧисел');
  }

  private randomNumber(args: Value[]): number {
    const lo = args[0] === undefined || args[0] === null ? 0 : toNumber(args[0]);
    const hi = args[1] === undefined || args[1] === null ? UINT32_MAX : toNumber(args[1]);

    if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw new Error('Неверное значение аргумента');
    if (lo < 0 || lo > UINT32_MAX) throw new Error('Неверное значение аргумента');
    if (hi < 0 || hi > UINT32_MAX) throw new Error('Неверное значение аргумента');
    if (hi < lo) throw new Error('Неверное значение аргумента');

    const range = hi - lo;
    if (range === UINT32_MAX) return this.next32();

    // [int.MinValue, int.MinValue + range] → сдвиг в [lo, hi]
    const raw = INT32_MIN + this.nextIntInclusive(range);
    return raw - INT32_MIN + lo;
  }

  /** Целое в [0, range] (включительно). */
  private nextIntInclusive(range: number): number {
    // 2^32 делится на (range+1) не всегда, поэтому берём по модулю — смещение пренебрежимо.
    return this.next32() % (range + 1);
  }
}

/** Регистрирует `ГенераторСлучайныхЧисел`. */
export function registerRandomFunctions(ctx: GlobalContext): void {
  ctx.registerType('ГенераторСлучайныхЧисел', (args) => new BslRandomNumberGenerator(args));
  ctx.registerType('RandomNumberGenerator', (args) => new BslRandomNumberGenerator(args));
}
