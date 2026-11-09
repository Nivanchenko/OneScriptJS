import { tokenize } from '../lexer/lexer';
import { preprocess } from '../parser/preprocessor';
import { parse } from '../parser/parser';
import { Interpreter } from '../runtime/interpreter';
import type { RuntimeEnvironment } from '../runtime/context';
import { BslArray } from '../stdlib/collections/array';
import { BslTestContext } from './test-context';

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

/**
 * Прогоняет тестовый модуль в формате xUnitFor1C
 * (`ПолучитьСписокТестов` + процедуры-тесты) и возвращает результаты.
 */
export function runTests(source: string, env: RuntimeEnvironment): TestResult[] {
  const interpreter = new Interpreter(env);
  interpreter.run(parse(preprocess(tokenize(source))));

  const context = new BslTestContext();
  const names = interpreter.invokeMethod('ПолучитьСписокТестов', [context]);

  const results: TestResult[] = [];
  const items = names instanceof BslArray ? names.iterate() : [];
  for (const item of items) {
    const name = String(item);
    try {
      interpreter.invokeMethod(name, []);
      results.push({ name, passed: true });
    } catch (e) {
      results.push({ name, passed: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
