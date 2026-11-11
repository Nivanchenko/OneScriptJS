import type { Program } from '../ast/nodes';
import { tokenize } from '../lexer/lexer';
import { parse } from '../parser/parser';
import { preprocessScript } from '../parser/preprocessor';
import type { ImportDirective } from '../parser/preprocessor';
import type { ModuleRegistry } from './context';
import { Interpreter } from './interpreter';
import { BslClassRef, BslInstance, BslModule, isBslIdentifier, nameFromPath } from './module-objects';
import type { Value } from './values';
import type { MaybePromise } from './async';
import { isThenable, thenMaybe } from './async';

export type ScriptKind = 'module' | 'class';

export interface ScriptModuleDef {
  path: string;
  name: string;
  kind: ScriptKind;
  program: Program;
  imports: ImportDirective[];
}

interface CacheEntry {
  path: string;
  name: string;
  kind: ScriptKind;
  state: 'loading' | 'ready';
  module?: BslModule;
  def?: ScriptModuleDef;
}

export type PathResolver = (path: string, importer: string) => string;

const CONSTRUCTOR_NAMES = new Set(['присозданииобъекта', 'onobjectcreate']);

/** Разрешение пути для ядра/тестов: posix-нормализация без обращения к платформе. */
export function defaultResolve(importPath: string, importerPath: string): string {
  const drive = /^[A-Za-z]:/.exec(importPath)?.[0] ?? /^[A-Za-z]:/.exec(importerPath)?.[0];
  const importAbsolute =
    importPath.startsWith('/') || importPath.startsWith('\\') || /^[A-Za-z]:/.test(importPath);
  const importerAbsolute =
    importerPath.startsWith('/') || importerPath.startsWith('\\') || /^[A-Za-z]:/.test(importerPath);

  const parts: string[] = [];
  const pushPath = (path: string): void => {
    for (const segment of path.split(/[\\/]/)) {
      if (!segment || segment === '.' || segment === drive || segment.endsWith(':')) continue;
      if (segment === '..') {
        parts.pop();
        continue;
      }
      parts.push(segment);
    }
  };

  if (!importAbsolute) {
    pushPath(importerPath.split(/[\\/]/).slice(0, -1).join('/'));
  }
  pushPath(importPath);

  const prefix = drive ? `${drive}/` : importAbsolute || importerAbsolute ? '/' : '';
  return prefix + parts.join('/');
}

/** Разбирает импортируемый файл: AST, вид (модуль/класс), зависимости. */
export function parseModuleSource(path: string, source: string): ScriptModuleDef {
  let program: Program;
  let imports: ImportDirective[];
  try {
    const preprocessed = preprocessScript(tokenize(source));
    imports = preprocessed.imports;
    program = parse(preprocessed.tokens);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(`Ошибка в импортируемом файле '${path}': ${reason}`);
  }

  const name = nameFromPath(path);
  if (!isBslIdentifier(name)) {
    throw new Error(
      `Имя импортируемого файла '${name}' не является допустимым идентификатором: '${path}'`,
    );
  }

  const kind: ScriptKind = program.body.some(
    (stmt) => stmt.kind === 'MethodDeclaration' && CONSTRUCTOR_NAMES.has(stmt.name.toLowerCase()),
  )
    ? 'class'
    : 'module';

  return { path, name, kind, program, imports };
}

/**
 * Кеш импорта на время `run()`: запись создаётся до зависимостей и тела,
 * поэтому цикл A↔B не зацикливается, а ранний доступ даёт ошибку.
 */
export class ModuleLoader {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly owned = new Map<string, string>();

  constructor(
    private readonly env: ModuleRegistry,
    private readonly sources: Map<string, string>,
    private readonly resolve: PathResolver = defaultResolve,
    private readonly loadSource?: (path: string) => string,
  ) {}

  importAll(directives: readonly ImportDirective[], importerPath: string): MaybePromise<void> {
    const step = (index: number): MaybePromise<void> => {
      const directive = directives[index];
      if (!directive) return;
      return thenMaybe(this.importOne(directive.path, importerPath, directive), () => step(index + 1));
    };
    return step(0);
  }

  private importOne(importPath: string, importerPath: string, directive: ImportDirective): MaybePromise<void> {
    const resolved = this.resolve(importPath, importerPath);
    if (this.cache.has(resolved)) return;

    let source = this.sources.get(resolved);
    if (source === undefined && this.loadSource) {
      try {
        source = this.loadSource(resolved);
        this.sources.set(resolved, source);
      } catch {
        // ниже — общая ошибка «файл не найден»
      }
    }
    if (source === undefined) {
      throw new Error(
        `Файл не найден: '${resolved}' (директива #Использовать, строка ${directive.line})`,
      );
    }

    const def = parseModuleSource(resolved, source);
    this.claimName(def);

    const entry: CacheEntry = { path: resolved, name: def.name, kind: def.kind, state: 'loading' };
    this.cache.set(resolved, entry);

    const track = (value: MaybePromise<void>): MaybePromise<void> => {
      if (!isThenable(value)) return value;
      return value.catch((error: unknown) => {
        this.cache.delete(resolved);
        throw error;
      });
    };
    try {
      if (def.kind === 'module') {
        const module = new BslModule(def.name, () => entry.state === 'ready');
        entry.module = module;
        this.registerModule(def.name, module);
        return track(
          thenMaybe(this.importAll(def.imports, resolved), () => {
            const interpreter = new Interpreter(this.env);
            return thenMaybe(interpreter.run(def.program), () => {
              module.attach(interpreter);
              entry.state = 'ready';
            });
          }),
        );
      }
      entry.def = def;
      this.registerClass(def);
      return track(
        thenMaybe(this.importAll(def.imports, resolved), () => {
          entry.state = 'ready';
        }),
      );
    } catch (e) {
      this.cache.delete(resolved);
      throw e;
    }
  }

  private claimName(def: ScriptModuleDef): void {
    const lower = def.name.toLowerCase();
    const owner = this.owned.get(lower);
    if (owner !== undefined) {
      if (owner === def.path) return;
      throw new Error(`Имя '${def.name}' уже занято (файл '${def.path}')`);
    }
    if (this.env.hasGlobal(def.name) || this.env.hasType(def.name)) {
      throw new Error(`Имя '${def.name}' уже занято (файл '${def.path}')`);
    }
    this.owned.set(lower, def.path);
  }

  private registerModule(name: string, module: BslModule): void {
    this.env.registerGlobal(name, module);
    // `Новый Модуль` должен ругаться на вид скрипта, а не «тип не найден».
    this.env.registerType(name, () => {
      throw new Error(`Модуль '${name}' не является классом; создание через Новый невозможно`);
    });
  }

  private registerClass(def: ScriptModuleDef): void {
    this.env.registerGlobal(def.name, new BslClassRef(def.name));
    this.env.registerType(def.name, (args) => this.createInstance(def, args));
  }

  private createInstance(def: ScriptModuleDef, args: Value[]): MaybePromise<BslInstance> {
    const interpreter = new Interpreter(this.env);
    return thenMaybe(interpreter.run(def.program), () => this.finishInstance(def, interpreter, args));
  }

  private finishInstance(def: ScriptModuleDef, interpreter: Interpreter, args: Value[]): MaybePromise<BslInstance> {
    const constructor = interpreter.getConstructor();
    if (!constructor) {
      throw new Error('Конструктор не определен, но переданы параметры конструктора.');
    }
    const total = constructor.params.length;
    const required = constructor.params.filter((p) => p.defaultValue === undefined).length;
    if (args.length < required || args.length > total) {
      throw new Error(
        `Параметры конструктора: необходимых параметров: ${required}, передано параметров: ${args.length}`,
      );
    }

    return thenMaybe(interpreter.invokeMethod(constructor.name, args), () => new BslInstance(def.name, interpreter));
  }
}
