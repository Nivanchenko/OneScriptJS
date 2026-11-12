#!/usr/bin/env node
/**
 * Собирает самодостаточный `.vsix` тонкого клиента VS Code (спека 017):
 *
 *   1. `pnpm build:lsp` — актуальный `dist/lsp/server.mjs`;
 *   2. esbuild — `extensions/vscode/src/extension.ts` → `out/extension.js` (CJS, `vscode` external);
 *   3. staging `dist/vscode/extension/` — манифест, README, NOTICE, сервер, грамматика,
 *      language-configuration (единые источники из `editors/osjs/`);
 *   4. `@vscode/vsce package --no-dependencies` → `dist/vscode/<name>-<version>.vsix`.
 *
 * Код возврата: 0 — успех, 1 — ошибка сборки (с понятным сообщением).
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';

const ROOT = process.cwd();
const EXTENSION_DIR = join(ROOT, 'extensions/vscode');
const MANIFEST_PATH = join(EXTENSION_DIR, 'package.json');
const STAGING = join(ROOT, 'dist/vscode/extension');
const OUT_DIR = join(ROOT, 'dist/vscode');

function fail(message) {
  console.error(`Ошибка сборки расширения VS Code: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
  if (result.error) fail(`${command}: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} завершился с кодом ${result.status}`);
}

function requireFile(path, hint) {
  if (!existsSync(path)) fail(`${path} не найден${hint ? ` — ${hint}` : ''}`);
}

/** Бин `@vscode/vsce`; запускаем через Node, чтобы не зависеть от `.cmd` на Windows. */
function vsceBin() {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve('@vscode/vsce/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.vsce;
  if (!bin) fail('в @vscode/vsce не найден исполняемый файл (bin.vsce)');
  return join(dirname(pkgPath), bin);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const { name, version } = manifest;
if (!name || !version) fail(`в ${MANIFEST_PATH} нет name/version`);

console.log(`Сборка расширения VS Code ${name}@${version}`);

// 1. Свежий LSP-сервер.
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
run(pnpm, ['build:lsp'], { shell: process.platform === 'win32' });

// 2. Источники, которые обязаны существовать до staging.
const serverSource = join(ROOT, 'dist/lsp/server.mjs');
const grammarSource = join(ROOT, 'editors/osjs/osjs.tmLanguage.json');
const languageConfigSource = join(ROOT, 'editors/osjs/language-configuration.json');
const noticeSource = join(ROOT, 'editors/osjs/NOTICE.md');
const readmeSource = join(EXTENSION_DIR, 'README.md');
requireFile(serverSource, 'сначала должна пройти сборка `pnpm build:lsp`');
requireFile(grammarSource, 'нет TextMate-грамматики для .osjs');
requireFile(languageConfigSource, 'нет language-configuration для .osjs');
requireFile(noticeSource, 'нет NOTICE с авторством грамматики');
requireFile(readmeSource, 'нет README расширения');

// 3. Чистый staging и бандл расширения.
rmSync(STAGING, { recursive: true, force: true });
mkdirSync(join(STAGING, 'out'), { recursive: true });
mkdirSync(join(STAGING, 'server'), { recursive: true });
mkdirSync(join(STAGING, 'syntaxes'), { recursive: true });

await build({
  entryPoints: [join(EXTENSION_DIR, 'src/extension.ts')],
  outfile: join(STAGING, 'out/extension.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  sourcemap: false,
  logLevel: 'info',
});

// 4. Runtime-файлы пакета; только они попадут в .vsix.
copyFileSync(MANIFEST_PATH, join(STAGING, 'package.json'));
copyFileSync(readmeSource, join(STAGING, 'README.md'));
copyFileSync(join(ROOT, 'LICENSE'), join(STAGING, 'LICENSE'));
copyFileSync(noticeSource, join(STAGING, 'NOTICE.md'));
copyFileSync(serverSource, join(STAGING, 'server/server.mjs'));
copyFileSync(grammarSource, join(STAGING, 'syntaxes/osjs.tmLanguage.json'));
copyFileSync(languageConfigSource, join(STAGING, 'language-configuration.json'));

// 5. Упаковка из staging: node_modules и исходники в .vsix не попадают.
const vsixPath = join(OUT_DIR, `${name}-${version}.vsix`);
rmSync(vsixPath, { force: true });
run(
  process.execPath,
  [vsceBin(), 'package', '--no-dependencies', '--out', vsixPath],
  { cwd: STAGING },
);

requireFile(vsixPath, 'vsce не создал пакет');
const sizeMb = (statSync(vsixPath).size / (1024 * 1024)).toFixed(2);
console.log(`OK: ${vsixPath} (${sizeMb} МБ)`);
