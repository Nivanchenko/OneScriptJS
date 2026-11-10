import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/runtime/runner';
import { createNodeGlobalContext } from '../src/node/context';

function execNode(source: string): unknown[] {
  const logs: unknown[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(...args);
  });
  try {
    run(source, createNodeGlobalContext());
  } finally {
    spy.mockRestore();
  }
  return logs;
}

describe('файлы (Node)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('ЗаписьТекста / ЧтениеТекста / ОбъединитьПути', () => {
    const dir = mkdtempSync(join(tmpdir(), 'onescript-test-'));
    const file = join(dir, 'test.txt');
    try {
      const logs = execNode(
        `ЗаписьТекста("${file}", "привет"); сообщить(ЧтениеТекста("${file}")); сообщить(ОбъединитьПути("${dir}", "a", "b"));`,
      );
      expect(logs[0]).toBe('привет');
      expect(logs[1]).toBe(join(dir, 'a', 'b'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
