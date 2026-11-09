import { tokenize } from '../lexer/lexer';
import { parse } from '../parser/parser';
import { preprocess } from '../parser/preprocessor';
import { Interpreter } from './interpreter';
import type { RuntimeEnvironment } from './context';

/** Лексер → препроцессор → парсер → интерпретатор: выполняет исходник BSL. */
export function run(source: string, env: RuntimeEnvironment): void {
  new Interpreter(env).run(parse(preprocess(tokenize(source))));
}
