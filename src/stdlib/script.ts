import { tokenize } from '../lexer/lexer';
import { parse } from '../parser/parser';
import { preprocess } from '../parser/preprocessor';
import { Interpreter } from '../runtime/interpreter';
import type { GlobalContext } from '../runtime/context';
import type { BslObject } from '../runtime/object';
import type { Value } from '../runtime/values';
import { toStringValue } from '../runtime/values';

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

  callMethod(name: string, args: Value[]): Value {
    if (!this.interpreter.hasMethod(name)) {
      throw new Error(`Метод '${name}' не найден у типа Сценарий`);
    }
    return this.interpreter.invokeMethod(name, args);
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
        throw new Error(`Свойство '${name}' не найдено у типа Сценарий`);
    }
  }

  setProp(name: string): void {
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
      const out = this.interpreter.invokeMethodWithOutputs('ОбработкаПолученияПредставления', ['', true]);
      if (out[1] === false) return toStringValue(out[0] ?? '');
    }
    return 'Сценарий';
  }
}

/** Загружает исходник как `Сценарий`: разбирает и исполняет его тело. */
function loadScript(env: GlobalContext, source: string, path?: string): BslScript {
  const interpreter = new Interpreter(env);
  interpreter.run(parse(preprocess(tokenize(source))));
  return new BslScript(interpreter, path);
}

/** Регистрирует `ЗагрузитьСценарийИзСтроки`, `ТекущийСценарий`, `СтартовыйСценарий`. */
export function registerScriptFunctions(ctx: GlobalContext): void {
  ctx.registerAlias('ЗагрузитьСценарийИзСтроки', 'LoadScriptFromString', (args) =>
    loadScript(ctx, toStringValue(args[0] ?? '')),
  );

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
