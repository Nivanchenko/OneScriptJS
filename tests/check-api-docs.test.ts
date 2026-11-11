import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Запускает check-api-docs.mjs и возвращает код/вывод, не бросая на exit != 0. */
function runCheck(args: string[]): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, ['scripts/check-api-docs.mjs', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('check-api-docs', () => {
  it('текущий docs/reference.md покрывает публичный API', () => {
    const result = runCheck([]);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('OK: все публичные имена API упомянуты');
  });

  it('падает и перечисляет пропуски, если справочник пуст', () => {
    const dir = mkdtempSync(join(tmpdir(), 'onescriptjs-docs-'));
    const docs = join(dir, 'reference.md');
    writeFileSync(docs, '# Пустой справочник\n');
    try {
      const result = runCheck(['--docs', docs]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('не найдено');
      expect(result.stderr).toContain('Обновите docs/reference.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
