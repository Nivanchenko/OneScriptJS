import type { GlobalContext } from '../runtime/context';
import { BslType } from '../runtime/type';
import { toStringValue, typeName } from '../runtime/values';

// Двуязычные имена типов → каноническое русское имя.
const TYPE_ALIASES: Record<string, string> = {
  'число': 'Число', 'number': 'Число',
  'строка': 'Строка', 'string': 'Строка',
  'булево': 'Булево', 'boolean': 'Булево',
  'дата': 'Дата', 'date': 'Дата',
  'неопределено': 'Неопределено', 'undefined': 'Неопределено',
  'null': 'Null',
  'массив': 'Массив', 'array': 'Массив',
  'структура': 'Структура', 'structure': 'Структура',
  'соответствие': 'Соответствие', 'map': 'Соответствие',
  'фиксированныймассив': 'ФиксированныйМассив', 'fixedarray': 'ФиксированныйМассив',
  'фиксированнаяструктура': 'ФиксированнаяСтруктура', 'fixedstructure': 'ФиксированнаяСтруктура',
  'фиксированноесоответствие': 'ФиксированноеСоответствие', 'fixedmap': 'ФиксированноеСоответствие',
  'тип': 'Тип', 'type': 'Тип',
  'информацияобошибке': 'ИнформацияОбОшибке', 'errorinfo': 'ИнформацияОбОшибке',
};

function canonicalTypeName(name: string): string {
  return TYPE_ALIASES[name.toLowerCase()] ?? name;
}

/** Функции системы типов: `Тип()` и `ТипЗнч()`. */
export function registerTypeFunctions(ctx: GlobalContext): void {
  ctx.registerAlias('Тип', 'Type', (args) => new BslType(canonicalTypeName(toStringValue(args[0] ?? ''))));
  ctx.registerAlias('ТипЗнч', 'TypeOf', (args) => new BslType(typeName(args[0]!)));
}
