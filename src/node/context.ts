import { readFileSync } from 'node:fs';
import { createGlobalContext } from '../stdlib/global-context';
import { registerFileFunctions } from './files';
import { createNodeHttpTransport } from './http-transport';
import type { GlobalContext } from '../runtime/context';
import { stripBom } from './module-source';

/** Глобальный контекст для Node.js (стандартный + файловые функции + HTTP через дочерний процесс). */
export function createNodeGlobalContext(): GlobalContext {
  const ctx = createGlobalContext(createNodeHttpTransport());
  registerFileFunctions(ctx);
  // Динамический импорт и ЗагрузитьСценарий читают файлы с диска в Node.
  ctx.loadSource = (file) => stripBom(readFileSync(file, 'utf8'));
  return ctx;
}
