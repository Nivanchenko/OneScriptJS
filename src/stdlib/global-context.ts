import { GlobalContext } from '../runtime/context';
import { toStringValue } from '../runtime/values';
import type { Value } from '../runtime/values';

/** Создаёт стандартный глобальный контекст (`Сообщить` и пр.). */
export function createGlobalContext(): GlobalContext {
  const ctx = new GlobalContext();
  ctx.registerAlias('Сообщить', 'Message', message);
  return ctx;
}

// shortcut: второй аргумент — статус (СтатусСообщения.*), пока игнорируется — всё → console.log.
function message(args: Value[]): Value {
  console.log(toStringValue(args[0] ?? ''));
  return undefined;
}
