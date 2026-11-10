import { createGlobalContext } from '../stdlib/global-context';
import { registerFileFunctions } from './files';
import type { GlobalContext } from '../runtime/context';

/** Глобальный контекст для Node.js (стандартный + файловые функции). */
export function createNodeGlobalContext(): GlobalContext {
  const ctx = createGlobalContext();
  registerFileFunctions(ctx);
  return ctx;
}
