import { run } from './runtime/runner';
import type { MaybePromise } from './runtime/async';
import { createGlobalContext } from './stdlib/global-context';

// Публичное API движка.
export { Interpreter } from './runtime/interpreter';
export { GlobalContext } from './runtime/context';
export { Scope } from './runtime/scope';
export { tokenize } from './lexer/lexer';
export { parse } from './parser/parser';
export { preprocess } from './parser/preprocessor';
export { createGlobalContext } from './stdlib/global-context';
export { run } from './runtime/runner';
export type { RunOptions } from './runtime/runner';
export { runTests } from './testing/runner';
export type { TestResult } from './testing/runner';
export { BslTestContext } from './testing/test-context';
export type { RuntimeEnvironment, GlobalFunction, TypeConstructor } from './runtime/context';
export type { HttpTransport } from './stdlib/http';
export type { Value } from './runtime/values';
export type { BslObject } from './runtime/object';

export const ONESCRIPT_VERSION = '0.1.1';

/** Возвращает версию движка. */
export function version(): string {
  return ONESCRIPT_VERSION;
}

/** Выполняет исходник BSL со стандартной библиотекой (вывод `Сообщить` → console.log). */
export function runScript(source: string): MaybePromise<void> {
  return run(source, createGlobalContext());
}
