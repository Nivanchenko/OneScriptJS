import type { GlobalContext } from '../runtime/context';
import { toStringValue } from '../runtime/values';
import type { Value } from '../runtime/values';

/**
 * Глобальная функция `Формат`. Подмножество: значение по умолчанию, `ЧДЦ=N`
 * (десятичные знаки числа), `БИ`/`БЛ` (представление булево).
 */
export function registerFormatFunction(ctx: GlobalContext): void {
  ctx.registerAlias('Формат', 'Format', (args) => format(args));
}

function format(args: Value[]): Value {
  const value = args[0];
  const fs = args[1] !== undefined ? toStringValue(args[1]) : '';
  if (fs === '') return toStringValue(value ?? '');

  if (typeof value === 'boolean') {
    const bi = fs.match(/БИ\s*=\s*'([^']*)'/);
    const bl = fs.match(/БЛ\s*=\s*'([^']*)'/);
    if (bi || bl) return value ? (bi?.[1] ?? 'Истина') : (bl?.[1] ?? 'Ложь');
  }

  if (typeof value === 'number') {
    const d = fs.match(/ЧДЦ\s*=\s*(\d+)/);
    if (d) return value.toFixed(Number(d[1]));
  }

  return toStringValue(value ?? '');
}
