import { tokenize } from '../lexer/lexer';
import { parse } from '../parser/parser';
import { preprocess } from '../parser/preprocessor';
import { Interpreter } from './interpreter';
import type { RuntimeEnvironment } from './context';

export interface RunOptions {
  /** Путь к исполняемому файлу сценария (для `ТекущийСценарий`). */
  path?: string;
}

interface ScriptState {
  scriptPath?: string;
  startupScriptPath?: string;
  currentInterpreter?: Interpreter;
}

/** Лексер → препроцессор → парсер → интерпретатор: выполняет исходник BSL. */
export function run(source: string, env: RuntimeEnvironment, options?: RunOptions): void {
  const state = env as ScriptState;
  if (options?.path !== undefined) {
    state.scriptPath = options.path;
    state.startupScriptPath = options.path;
  }
  const interpreter = new Interpreter(env);
  state.currentInterpreter = interpreter;
  interpreter.run(parse(preprocess(tokenize(source))));
}
