import { tokenize } from '../lexer/lexer';
import { preprocess } from '../parser/preprocessor';
import { parse } from '../parser/parser';
import { Interpreter } from '../runtime/interpreter';
import type { RuntimeEnvironment } from '../runtime/context';
import { BslArray } from '../stdlib/collections/array';
import { BslTestContext } from './test-context';
import { isThenable } from '../runtime/async';

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

/**
 * Прогоняет тестовый модуль в формате xUnitFor1C
 * (`ПолучитьСписокТестов` + процедуры-тесты) и возвращает результаты.
 *
 * shortcut: тестовый раннер синхронный; тесты с приостановкой (`Приостановить`,
 * ожидание фоновых заданий) не поддерживаются — ошибка с понятным текстом.
 */
export function runTests(source: string, env: RuntimeEnvironment): TestResult[] {
  const requireSync = <T>(value: T | Promise<T>): T => {
    if (isThenable(value)) {
      throw new Error('xUnit-тесты с приостановкой не поддерживаются');
    }
    return value;
  };
  const interpreter = new Interpreter(env);
  // `ТекущийСценарий()` внутри теста должен ссылаться на сам тестовый модуль.
  (env as { currentInterpreter?: Interpreter }).currentInterpreter = interpreter;
  requireSync(interpreter.run(parse(preprocess(tokenize(source)))));

  const context = new BslTestContext();
  const names = requireSync(interpreter.invokeMethod('ПолучитьСписокТестов', [context]));

  const results: TestResult[] = [];
  const items = names instanceof BslArray ? names.iterate() : [];
  for (const item of items) {
    const name = String(item);
    try {
      requireSync(interpreter.invokeMethod(name, []));
      results.push({ name, passed: true });
    } catch (e) {
      results.push({ name, passed: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
