import { GlobalContext } from '../runtime/context';
import { BslEnumValue } from '../runtime/enum';
import { BslType } from '../runtime/type';
import { toStringValue } from '../runtime/values';
import type { Value } from '../runtime/values';
import { BslArray } from './collections/array';
import { BslMap } from './collections/map';
import { BslStructure } from './collections/structure';
import { BslValueList } from './collections/value-list';
import { registerStringFunctions } from './strings';
import { registerMathFunctions } from './math';
import { registerJsonFunctions } from './json';
import { registerTypeFunctions } from './types';
import { registerBitFunctions } from './bitwise';
import { registerEnums } from './enums';
import { registerFormatFunction } from './format';
import { BslExpect } from './asserts';

/** Создаёт стандартный глобальный контекст (`Сообщить`, типы и пр.). */
export function createGlobalContext(): GlobalContext {
  const ctx = new GlobalContext();
  ctx.registerAlias('Сообщить', 'Message', message);
  // Динамический конструктор: `Новый("Массив", …)` / `Новый(ИмяТипа, …)`.
  ctx.registerAlias('Новый', 'New', (args) => {
    const typeArg = args[0];
    const name = typeArg instanceof BslType ? typeArg.name : toStringValue(typeArg);
    return ctx.construct(name, args.slice(1));
  });

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
  ctx.registerType('СписокЗначений', () => new BslValueList());
  ctx.registerType('ValueList', () => new BslValueList());

  registerStringFunctions(ctx);
  registerMathFunctions(ctx);
  registerJsonFunctions(ctx);
  registerTypeFunctions(ctx);
  registerBitFunctions(ctx);
  registerEnums(ctx);
  registerFormatFunction(ctx);

  // Библиотека asserts (`#Использовать asserts`): Ожидаем.Что(факт).Равно(…).
  ctx.registerGlobal('Ожидаем', new BslExpect());
  ctx.registerGlobal('Expect', new BslExpect());
  return ctx;
}

function message(args: Value[]): Value {
  const text = toStringValue(args[0] ?? '');
  const status = args[1];
  const level = status instanceof BslEnumValue ? status.name : 'Обычное';
  switch (level) {
    case 'Информация':
      console.info(text);
      break;
    case 'Внимание':
      console.warn(text);
      break;
    case 'Важное':
    case 'ОченьВажное':
      console.error(text);
      break;
    default:
      console.log(text);
      break;
  }
  return undefined;
}
