import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { vi } from 'vitest';
import { run } from '../../src/runtime/runner';
import { createGlobalContext } from '../../src/stdlib/global-context';
import { defaultResolve } from '../../src/runtime/modules';

/** Запускает главный скрипт с картой исходников и собирает console.log. */
export function runWithModules(
  mainSource: string,
  entries: Record<string, string> = {},
  mainPath = '/app/main.os',
): unknown[] {
  const logs: unknown[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(...args);
  });
  try {
    run(mainSource, createGlobalContext(), {
      basePath: mainPath,
      modules: new Map(Object.entries(entries)),
      resolve: defaultResolve,
    });
  } finally {
    spy.mockRestore();
  }
  return logs;
}

export interface TempDir {
  dir: string;
  cleanup(): void;
}

/** Создаёт временный каталог с файлами (ключи — относительные пути). */
export function makeTempDir(files: Record<string, string>): TempDir {
  const dir = mkdtempSync(join(tmpdir(), 'onescript-modules-'));
  for (const [relative, content] of Object.entries(files)) {
    const file = join(dir, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
