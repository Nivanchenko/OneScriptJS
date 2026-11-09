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
}
