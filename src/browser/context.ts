import { createGlobalContext } from '../stdlib/global-context';
import { registerDomObjects } from './dom';
import { createBrowserHttpTransport } from './http-transport';
import type { GlobalContext } from '../runtime/context';

/** Глобальный контекст для браузера: стандартная библиотека + DOM-объекты + HTTP через XHR. */
export function createBrowserGlobalContext(): GlobalContext {
  const ctx = createGlobalContext(createBrowserHttpTransport());
  registerDomObjects(ctx);
  return ctx;
}
