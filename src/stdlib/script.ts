import { tokenize } from '../lexer/lexer';
import { parse } from '../parser/parser';
import { preprocessScript } from '../parser/preprocessor';
import { Interpreter } from '../runtime/interpreter';
import type { GlobalContext } from '../runtime/context';
import type { BslObject } from '../runtime/object';
import type { Value } from '../runtime/values';
import { toStringValue } from '../runtime/values';
import type { MaybePromise } from '../runtime/async';
import { finallyMaybe, isThenable, thenMaybe } from '../runtime/async';

function dirName(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i === -1 ? '' : path.slice(0, i);
}

function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i === -1 ? path : path.slice(i + 1);
}

/** `Сценарий` — загруженный (динамически) модуль BSL. */
export class BslScript implements BslObject {
  readonly typeName = 'Сценарий';

  constructor(
    private readonly interpreter: Interpreter,
    private readonly path?: string,
  ) {}

  /** Пока метод исполняется, `ТекущийСценарий()` указывает на этот сценарий. */
  private withCurrent<T>(action: () => MaybePromise<T>): MaybePromise<T> {
    const state = this.interpreter.env as {
      currentInterpreter?: Interpreter;
      scriptPath?: string;
    };
    const previousInterpreter = state.currentInterpreter;
    const previousPath = state.scriptPath;
    state.currentInterpreter = this.interpreter;
    state.scriptPath = this.path;
    const restore = (): void => {
      state.currentInterpreter = previousInterpreter;
      state.scriptPath = previousPath;
    };
    try {
      return finallyMaybe(action(), restore);
    } catch (e) {
      restore();
      throw e;
    }
  }

  callMethod(name: string, args: Value[]): MaybePromise<Value> {
    if (!this.interpreter.hasExportedMethod(name)) {
      throw new Error(`Метод '${name}' не найден у типа Сценарий`);
    }
    return this.withCurrent(() => this.interpreter.callExportedMethod(name, args));
  }

  /** Экспортный метод доступен снаружи (проверка подписки на событие, FR-011). */
  hasMethod(name: string): boolean {
    return this.interpreter.hasExportedMethod(name);
  }

  getProp(name: string): Value {
    switch (name.toLowerCase()) {
      case 'источник':
      case 'source':
        return this.path ?? '';
      case 'каталог':
      case 'directory':
        return dirName(this.path ?? '');
      case 'имя':
      case 'name':
        return baseName(this.path ?? '');
      default:
        if (this.interpreter.hasExportedVar(name)) return this.interpreter.getExportedVar(name);
        throw new Error(`Свойство '${name}' не найдено у типа Сценарий`);
    }
  }

  setProp(name: string, value: Value): void {
    if (this.interpreter.hasExportedVar(name)) {
      this.interpreter.setExportedVar(name, value);
      return;
    }
    throw new Error(`Свойство '${name}' недоступно для записи`);
  }

  getIndex(): Value {
    throw new Error('Индексация недоступна для типа Сценарий');
  }

  setIndex(): void {
    throw new Error('Индексация недоступна для типа Сценарий');
  }

  /** `Строка(Сценарий)`; учитывает `ОбработкаПолученияПредставления`. */
  toDisplayString(): string {
    if (this.interpreter.hasMethod('ОбработкаПолученияПредставления')) {
      const out = this.withCurrent(() =>
        this.interpreter.invokeMethodWithOutputs('ОбработкаПолученияПредставления', ['', true]),
      );
      // shortcut: представление синхронно; приостанавливающийся обработчик не поддержан.
      if (isThenable(out)) {
        throw new Error('Строка(Сценарий): обработчик представления не может приостанавливаться');
      }
      if (out[1] === false) return toStringValue(out[0] ?? '');
    }
    return 'Сценарий';
  }
}

/**
 * Загружает исходник как `Сценарий`: разбирает и исполняет его тело.
 * Импорты резолвятся загрузчиком текущего запуска относительно `path`
 * (или пути исполняемого сценария), поэтому работают и в динамике.
 */
export function loadScriptFromSource(
  env: GlobalContext,
  source: string,
  path?: string,
): MaybePromise<BslScript> {
  const { tokens, imports } = preprocessScript(tokenize(source));
  const runBody = (): MaybePromise<BslScript> => {
    const interpreter = new Interpreter(env);
    // `ЭтотОбъект`/`ВызватьСобытие` внутри сценария относятся к объекту этого сценария.
    const scriptObject = new BslScript(interpreter, path);
    interpreter.ownerObject = scriptObject;
    // Во время тела сценария `ТекущийСценарий()` уже указывает на него.
    const previousInterpreter = env.currentInterpreter;
    const previousPath = env.scriptPath;
    env.currentInterpreter = interpreter;
    env.scriptPath = path;
    const restore = (): void => {
      env.currentInterpreter = previousInterpreter;
      env.scriptPath = previousPath;
    };
    try {
      return thenMaybe(finallyMaybe(interpreter.run(parse(tokens)), restore), () => scriptObject);
    } catch (e) {
      restore();
      throw e;
    }
  };
  if (imports.length > 0) {
    const host = env.modules;
    if (!host) throw new Error('Импорт файлов не поддерживается текущим контекстом исполнения');
    return thenMaybe(host.importAll(imports, path ?? env.basePath ?? env.scriptPath ?? ''), runBody);
  }
  return runBody();
}

/** Регистрирует `ЗагрузитьСценарийИзСтроки`, `ТекущийСценарий`, `СтартовыйСценарий`. */
export function registerScriptFunctions(ctx: GlobalContext): void {
  ctx.registerAlias('ЗагрузитьСценарийИзСтроки', 'LoadScriptFromString', (args) => {
    const name = args[1] === undefined ? undefined : toStringValue(args[1]);
    return loadScriptFromSource(ctx, toStringValue(args[0] ?? ''), name || undefined);
  });

  // shortcut: текущий сценарий — тот, что запущен через run(); вложенные
  // ЗагрузитьСценарийИзСтроки не подменяют его (нужно для рефлексии, T45).
  ctx.registerAlias('ТекущийСценарий', 'CurrentScript', () => {
    if (ctx.currentInterpreter) return new BslScript(ctx.currentInterpreter, ctx.scriptPath);
    return new BslScript(new Interpreter(ctx), ctx.scriptPath);
  });

  ctx.registerAlias('СтартовыйСценарий', 'StartupScript', () => {
    if (ctx.currentInterpreter) return new BslScript(ctx.currentInterpreter, ctx.startupScriptPath);
    return new BslScript(new Interpreter(ctx), ctx.startupScriptPath);
  });
}
