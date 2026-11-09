import { GlobalContext } from '../runtime/context';
import { toStringValue } from '../runtime/values';
import type { Value } from '../runtime/values';
import { BslArray } from './collections/array';
import { BslMap } from './collections/map';
import { BslStructure } from './collections/structure';
import { registerStringFunctions } from './strings';
import { registerMathFunctions } from './math';
import { registerJsonFunctions } from './json';
import { registerTypeFunctions } from './types';

/** Создаёт стандартный глобальный контекст (`Сообщить`, типы и пр.). */
export function createGlobalContext(): GlobalContext {
  const ctx = new GlobalContext();
  ctx.registerAlias('Сообщить', 'Message', message);

  ctx.registerType('Массив', (args) => new BslArray(args));
  ctx.registerType('Array', (args) => new BslArray(args));
  ctx.registerType('Структура', (args) => new BslStructure(args));
  ctx.registerType('Structure', (args) => new BslStructure(args));
  ctx.registerType('Соответствие', (args) => new BslMap(args));
  ctx.registerType('Map', (args) => new BslMap(args));
  ctx.registerType('ФиксированныйМассив', (args) => new BslArray(args, true, 'ФиксированныйМассив'));
  ctx.registerType('FixedArray', (args) => new BslArray(args, true, 'ФиксированныйМассив'));
  ctx.registerType('ФиксированнаяСтруктура', (args) => new BslStructure(args, true, 'ФиксированнаяСтруктура'));
  ctx.registerType('FixedStructure', (args) => new BslStructure(args, true, 'ФиксированнаяСтруктура'));
  ctx.registerType('ФиксированноеСоответствие', (args) => new BslMap(args, true, 'ФиксированноеСоответствие'));
  ctx.registerType('FixedMap', (args) => new BslMap(args, true, 'ФиксированноеСоответствие'));

  registerStringFunctions(ctx);
  registerMathFunctions(ctx);
  registerJsonFunctions(ctx);
  registerTypeFunctions(ctx);
  return ctx;
}

// shortcut: второй аргумент — статус (СтатусСообщения.*), пока игнорируется — всё → console.log.
function message(args: Value[]): Value {
  console.log(toStringValue(args[0] ?? ''));
  return undefined;
}
