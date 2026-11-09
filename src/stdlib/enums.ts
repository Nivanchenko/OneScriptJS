import type { GlobalContext } from '../runtime/context';
import { BslEnumNamespace } from '../runtime/enum';

/** Системные перечисления. */
export function registerEnums(ctx: GlobalContext): void {
  const searchDirection = new BslEnumNamespace('НаправлениеПоиска', {
    'СНачала': 'СНачала',
    'FromBegin': 'СНачала',
    'СКонца': 'СКонца',
    'FromEnd': 'СКонца',
  });
  ctx.registerGlobal('НаправлениеПоиска', searchDirection);
  ctx.registerGlobal('SearchDirection', searchDirection);

  const messageStatus = new BslEnumNamespace('СтатусСообщения', {
    'БезСтатуса': 'БезСтатуса',
    'WithoutStatus': 'БезСтатуса',
    'Важное': 'Важное',
    'Important': 'Важное',
    'Внимание': 'Внимание',
    'Attention': 'Внимание',
    'Информация': 'Информация',
    'Information': 'Информация',
    'Обычное': 'Обычное',
    'Ordinary': 'Обычное',
    'ОченьВажное': 'ОченьВажное',
    'VeryImportant': 'ОченьВажное',
  });
  ctx.registerGlobal('СтатусСообщения', messageStatus);
  ctx.registerGlobal('MessageStatus', messageStatus);
}
