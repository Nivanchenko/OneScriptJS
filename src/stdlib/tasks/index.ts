import type { GlobalContext } from '../../runtime/context';
import type { MaybePromise } from '../../runtime/async';
import { thenMaybe } from '../../runtime/async';
import { flushPendingPromises } from '../../runtime/promise';
import { BslBackgroundTasksManager } from './manager';

export { BslBackgroundTasksManager } from './manager';
export { BslBackgroundTask } from './task';
export { BackgroundTasksRegistry } from './registry';
export type { BackgroundJobState } from './state';

/** Регистрирует глобальное `ФоновыеЗадания`/`BackgroundJobs` и хук ожидания заданий. */
export function registerTasks(ctx: GlobalContext): void {
  const manager = new BslBackgroundTasksManager(ctx);
  ctx.registerGlobal('ФоновыеЗадания', manager);
  ctx.registerGlobal('BackgroundJobs', manager);
  ctx.flushAsync = (): MaybePromise<void> =>
    thenMaybe(manager.flushAsync(), () => flushPendingPromises(ctx.pendingPromises));
}
