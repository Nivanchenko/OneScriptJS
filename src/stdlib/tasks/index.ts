import type { GlobalContext } from '../../runtime/context';
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
  ctx.flushAsync = () => manager.flushAsync();
}
