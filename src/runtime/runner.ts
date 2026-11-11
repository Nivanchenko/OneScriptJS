import { tokenize } from '../lexer/lexer';
import { parse } from '../parser/parser';
import { preprocessScript } from '../parser/preprocessor';
import { Interpreter } from './interpreter';
import type { ModuleHost, ModuleRegistry, RuntimeEnvironment } from './context';
import { defaultResolve, ModuleLoader } from './modules';
import type { MaybePromise } from './async';
import { thenMaybe } from './async';

export interface RunOptions {
  /** Путь к исполняемому файлу сценария (для `ТекущийСценарий`). */
  path?: string;
  /** База для разрешения импортов главного файла (по умолчанию — `path`). */
  basePath?: string;
  /** Предзагруженные исходники: канонический путь → текст. Готовит платформа. */
  modules?: Map<string, string>;
  /** Платформенное разрешение пути импорта (Node: node:path, браузер: URL). */
  resolve?: (path: string, importer: string) => string;
  /** Ленивое чтение источника (Node): нужно динамическим сценариям и непредзагруженным файлам. */
  loadSource?: (path: string) => string;
}

interface ScriptState {
  scriptPath?: string;
  startupScriptPath?: string;
  basePath?: string;
  currentInterpreter?: Interpreter;
  modules?: ModuleHost;
}

/** Лексер → препроцессор → парсер → интерпретатор: выполняет исходник BSL. */
export function run(source: string, env: RuntimeEnvironment, options?: RunOptions): MaybePromise<void> {
  const state = env as ScriptState;
  if (options?.path !== undefined) {
    state.scriptPath = options.path;
    state.startupScriptPath = options.path;
  }
  if (options?.basePath !== undefined) state.basePath = options.basePath;

  const { tokens, imports } = preprocessScript(tokenize(source));

  const registry = env as Partial<ModuleRegistry>;
  const supportsModules =
    Boolean(registry.registerGlobal) &&
    Boolean(registry.registerType) &&
    Boolean(registry.hasGlobal) &&
    Boolean(registry.hasType);
  const loadSource =
    options?.loadSource ?? (env as { loadSource?: (path: string) => string }).loadSource;
  const loader = supportsModules
    ? new ModuleLoader(
        registry as ModuleRegistry,
        options?.modules ?? new Map(),
        options?.resolve ?? defaultResolve,
        loadSource,
      )
    : undefined;
  state.modules = loader;

  const runBody = (): MaybePromise<void> => {
    const interpreter = new Interpreter(env);
    state.currentInterpreter = interpreter;
    return thenMaybe(interpreter.run(parse(tokens)), () => env.flushAsync?.());
  };

  if (imports.length > 0) {
    if (!loader) throw new Error('Импорт файлов не поддерживается текущим контекстом исполнения');
    return thenMaybe(loader.importAll(imports, options?.basePath ?? options?.path ?? ''), runBody);
  }
  return runBody();
}
