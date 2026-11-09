import { tokenize } from '../lexer/lexer';
import { parse } from '../parser/parser';
import { Interpreter } from './interpreter';
import type { RuntimeEnvironment } from './context';

/** Лексер → парсер → интерпретатор: выполняет исходник BSL в окружении. */
export function run(source: string, env: RuntimeEnvironment): void {
  new Interpreter(env).run(parse(tokenize(source)));
}
