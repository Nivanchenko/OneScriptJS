import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GlobalContext } from '../runtime/context';
import { toStringValue } from '../runtime/values';
import type { Value } from '../runtime/values';

const str = (args: Value[], i: number): string => toStringValue(args[i] ?? '');

/** Файловые функции (Node-only — в браузере недоступны). */
export function registerFileFunctions(ctx: GlobalContext): void {
  ctx.registerAlias('ОбъединитьПути', 'PathCombine', (args) => join(...args.map((a) => str([a], 0))));
  ctx.registerAlias('ЧтениеТекста', 'ReadText', (args) => readFileSync(str(args, 0), 'utf8'));
  ctx.registerAlias('ЗаписьТекста', 'WriteText', (args) => {
    writeFileSync(str(args, 0), str(args, 1));
    return undefined;
  });
}
