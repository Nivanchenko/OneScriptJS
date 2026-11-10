import { createGlobalContext } from '../stdlib/global-context';
import { registerDomObjects } from './dom';
import type { GlobalContext } from '../runtime/context';

/** Глобальный контекст для браузера: стандартная библиотека + DOM-объекты. */
export function createBrowserGlobalContext(): GlobalContext {
  const ctx = createGlobalContext();
  registerDomObjects(ctx);
  return ctx;
}
