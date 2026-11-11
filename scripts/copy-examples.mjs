// Копирует HTML-примеры и их локальные данные (например, examples/lib/*.os)
// в dist/, чтобы `vite preview` мог их отдать.
// Использование: node scripts/copy-examples.mjs
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const from = 'examples';
const to = 'dist';

if (!existsSync(to)) mkdirSync(to, { recursive: true });

let copied = 0;
for (const entry of readdirSync(from, { withFileTypes: true })) {
  const source = join(from, entry.name);
  if (entry.isDirectory()) {
    cpSync(source, join(to, entry.name), { recursive: true });
  } else if (entry.name.endsWith('.html')) {
    copyFileSync(source, join(to, entry.name));
    copied += 1;
  }
}

console.log(`Скопировано примеров в ${to}/: ${copied}`);
