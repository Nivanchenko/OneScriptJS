import { GlobalContext } from '../runtime/context';
import { toStringValue } from '../runtime/values';
import type { Value } from '../runtime/values';
import { BslArray } from './collections/array';
import { registerStringFunctions } from './strings';
import { registerMathFunctions } from './math';
import { registerJsonFunctions } from './json';

/** Создаёт стандартный глобальный контекст (`Сообщить`, типы и пр.). */
export function createGlobalContext(): GlobalContext {
  const ctx = new GlobalContext();
  ctx.registerAlias('Сообщить', 'Message', message);
  ctx.registerType('Массив', (args) => new BslArray(args));
  ctx.registerType('Array', (args) => new BslArray(args));
  registerStringFunctions(ctx);
  registerMathFunctions(ctx);
  registerJsonFunctions(ctx);
  return ctx;
}

// shortcut: второй аргумент — статус (СтатусСообщения.*), пока игнорируется — всё → console.log.
function message(args: Value[]): Value {
  console.log(toStringValue(args[0] ?? ''));
  return undefined;
}
