#!/usr/bin/env node
/**
 * Собирает DAP-адаптер Node launch: `src/node/debug-adapter.ts` →
 * `dist/debug/adapter.cjs` (CJS-бандл, движок внутри). Артефакт нужен
 * stdio-smoke и ручному запуску по quickstart §1.
 *
 * `bufferutil`/`utf-8-validate` — необязательные нативные зависимости `ws`
 * (браузерный attach, W3): в бандл они не входят.
 *
 * Код возврата: 0 — успех, 1 — ошибка сборки.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';

const ROOT = process.cwd();
const OUT = join(ROOT, 'dist/debug/adapter.cjs');

mkdirSync(dirname(OUT), { recursive: true });
await build({
  entryPoints: [join(ROOT, 'src/node/debug-adapter.ts')],
  outfile: OUT,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['bufferutil', 'utf-8-validate'],
  sourcemap: false,
  logLevel: 'info',
});
console.log(`OK: ${OUT}`);
