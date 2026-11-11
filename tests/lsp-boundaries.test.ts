import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** Спецификаторы статических (`from '…'`) и динамических (`import('…')`) импортов. */
function importSpecifiers(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const specifiers: string[] = [];
  for (const pattern of [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
  ]) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) specifiers.push(match[1]);
    }
  }
  return specifiers;
}

describe('границы слоя LSP', () => {
  it('src/lsp не импортирует node:*', () => {
    // Слой ещё может отсутствовать до появления US2; тест включается автоматически.
    const offenders = walk(resolve(root, 'src/lsp'))
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => importSpecifiers(file).some((spec) => spec.startsWith('node:')))
      .map((file) => relative(root, file));

    expect(offenders).toEqual([]);
  });

  it('src/index.ts и src/browser не импортируют src/lsp', () => {
    const entrypoints = [resolve(root, 'src/index.ts'), ...walk(resolve(root, 'src/browser'))]
      .filter((file) => file.endsWith('.ts'));
    const offenders = entrypoints
      .filter((file) => importSpecifiers(file).some((spec) => /(?:^|\/)lsp(?:\/|$)/.test(spec)))
      .map((file) => relative(root, file));

    expect(offenders).toEqual([]);
  });
});
