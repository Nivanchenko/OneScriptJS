// Копирует HTML-примеры в dist/, чтобы `vite preview` мог их отдать.
// Использование: node scripts/copy-examples.mjs
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const from = 'examples';
const to = 'dist';

if (!existsSync(to)) mkdirSync(to, { recursive: true });

let copied = 0;
for (const file of readdirSync(from)) {
  if (!file.endsWith('.html')) continue;
  copyFileSync(join(from, file), join(to, file));
  copied += 1;
}

console.log(`Скопировано примеров в ${to}/: ${copied}`);
