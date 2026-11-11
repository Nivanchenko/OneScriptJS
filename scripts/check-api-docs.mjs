#!/usr/bin/env node
/**
 * Проверяет, что публичный API движка упомянут в docs/reference.md.
 *
 * Публичный API берётся из исходников:
 *  - `registerAlias('Рус', 'Eng')` — глобальные функции;
 *  - `registerType(...)` — конструкторы типов;
 *  - `registerGlobal(...)` — глобальные объекты и перечисления;
 *  - `registerEnum(...)` (src/stdlib/enums.ts) — имена и все значения;
 *  - case-метки методов/свойств классов, реализующих `BslObject`;
 *  - встроенные функции языка (наборы `KW_*` в парсере и специальные имена
 *    в интерпретаторе).
 *
 * Имя считается задокументированным, если оно встречается в docs/reference.md
 * как code-span (`Имя`), в заголовке раздела или как часть пары `Рус / Eng`.
 *
 * Использование: node scripts/check-api-docs.mjs [--docs <путь к reference.md>]
 * Код возврата: 0 — всё задокументировано, 1 — есть пропуски, 2 — ошибка аргументов.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
let docsPath = join(ROOT, 'docs/reference.md');
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--docs' && args[i + 1]) {
    docsPath = resolve(args[++i]);
  } else {
    console.error(`Неизвестный аргумент: ${args[i]}`);
    console.error('Использование: node scripts/check-api-docs.mjs [--docs <путь>]');
    process.exit(2);
  }
}

/** Все .ts-файлы рекурсивно (без node_modules/dist). */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (path.endsWith('.ts')) out.push(path);
  }
  return out.sort();
}

/** Кандидаты API: нормализованное имя → первый источник. */
const candidates = new Map();

function add(name, source) {
  const key = name.trim().toLowerCase();
  if (key && !candidates.has(key)) candidates.set(key, source);
}

/**
 * Тела классов, реализующих BslObject, и case-метки их публичных методов.
 * Нужно, чтобы не принимать внутренние `case`-метки (например, switch по
 * `process.platform` внутри свойства) за публичный API.
 */
function bslObjectClassBodies(source) {
  const classes = [];
  const header = /\bclass\s+(\w+)[^{]*\bimplements\s+[^{]*\bBslObject\b[^{]*\{/g;
  for (const match of source.matchAll(header)) {
    const start = match.index + match[0].length - 1;
    classes.push({ name: match[1], body: blockBody(source, start) });
  }
  return classes;
}

/** Тело блока, начинающегося с `{` на позиции start. */
function blockBody(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

/**
 * Case-метки, лежащие прямо в `switch` метода (глубина 1 внутри тела метода).
 * Метки вложенных switch (как `case 'win32'` в `СистемнаяИнформация.ИмяЯдра`)
 * публичным API не являются.
 */
function publicCaseLabels(methodBody) {
  const labels = [];
  let depth = 0;
  for (const m of methodBody.matchAll(/\{|\}|case\s+'([^']+)'/g)) {
    if (m[0] === '{') depth++;
    else if (m[0] === '}') depth--;
    else if (depth === 1 && m[1]) labels.push(m[1]);
  }
  return labels;
}

function scanSourceFile(file) {
  const source = readFileSync(file, 'utf8');
  for (const m of source.matchAll(/registerAlias\(\s*'([^']+)'\s*,\s*'([^']+)'/g)) {
    add(m[1], file);
    add(m[2], file);
  }
  for (const m of source.matchAll(/registerType\(\s*'([^']+)'/g)) add(m[1], file);
  for (const m of source.matchAll(/registerGlobal\(\s*'([^']+)'/g)) add(m[1], file);
  // Однойзычные регистрации (`ctx.register('Pow', …)`) — без английского алиаса.
  for (const m of source.matchAll(/\.register\(\s*'([^']+)'/g)) add(m[1], file);
  const methods = /\b(?:callMethod|getProp|setProp|getIndex|setIndex)\s*\([^)]*\)\s*(?::\s*[^{;]+)?\{/g;
  for (const cls of bslObjectClassBodies(source)) {
    for (const method of cls.body.matchAll(methods)) {
      const body = blockBody(cls.body, method.index + method[0].length - 1);
      for (const label of publicCaseLabels(body)) add(label, `${file} (${cls.name})`);
    }
  }
}

function scanEnums(file) {
  const source = readFileSync(file, 'utf8');
  const call = /registerEnum\(\s*ctx\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*\{([\s\S]*?)\}\s*\)/g;
  for (const m of source.matchAll(call)) {
    add(m[1], file);
    add(m[2], file);
    add(m[3], file);
    for (const value of m[4].matchAll(/'([^']+)'/g)) add(value[1], file);
  }
}

function scanBuiltins() {
  const parser = readFileSync(join(ROOT, 'src/parser/parser.ts'), 'utf8');
  // Только встроенные функции-операторы; остальные KW_* — синтаксис языка.
  const builtins = /const (?:KW_RAISE|KW_EXECUTE|KW_ADD_HANDLER|KW_REMOVE_HANDLER) = new Set\(\[([^\]]+)\]\)/g;
  for (const set of parser.matchAll(builtins)) {
    for (const name of set[1].matchAll(/'([^']+)'/g)) add(name[1], 'src/parser/parser.ts');
  }
  const interpreter = readFileSync(join(ROOT, 'src/runtime/interpreter.ts'), 'utf8');
  for (const m of interpreter.matchAll(/lower === '([^']+)'/g)) {
    add(m[1], 'src/runtime/interpreter.ts');
  }
  for (const m of interpreter.matchAll(/key\(expr\.name\) === '([^']+)'/g)) {
    add(m[1], 'src/runtime/interpreter.ts');
  }
}

/** Имена, которые встречаются в reference.md как code-span или заголовок. */
function documentedNames(text) {
  const documented = new Set();
  const addToken = (raw) => {
    const token = raw.replace(/`/g, '').trim().toLowerCase();
    if (!token) return;
    documented.add(token);
    for (const part of token.split(/\s*\/\s*/)) {
      if (part.trim()) documented.add(part.trim());
    }
    // `Метод(Параметр)` в таблицах — имя метода без сигнатуры.
    const call = /^([\p{L}_][\p{L}\p{N}_]*)\s*\(/u.exec(token);
    if (call) documented.add(call[1]);
  };
  for (const span of text.matchAll(/`([^`]+)`/g)) addToken(span[1]);
  for (const heading of text.matchAll(/^#{1,6}\s+(.*)$/gm)) addToken(heading[1].replace(/`/g, ''));
  return documented;
}

// Собираем публичный API из src/.
for (const file of walk(join(ROOT, 'src'))) scanSourceFile(file);
scanEnums(join(ROOT, 'src/stdlib/enums.ts'));
scanBuiltins();

// Сверяем с документацией.
const documented = documentedNames(readFileSync(docsPath, 'utf8'));
const missing = [...candidates]
  .filter(([name]) => !documented.has(name))
  .sort((a, b) => a[0].localeCompare(b[0], 'ru'));

const sources = new Set(candidates.values());
console.log(`Проверено имён API: ${candidates.size} (источников: ${sources.size})`);
console.log(`Документация: ${docsPath}`);
if (missing.length === 0) {
  console.log('OK: все публичные имена API упомянуты в справочнике');
  process.exit(0);
}

console.error(`\nВ docs/reference.md не найдено ${missing.length} имён API:`);
for (const [name, source] of missing.slice(0, 200)) console.error(`  - ${name}  [${source}]`);
if (missing.length > 200) console.error(`  … ещё ${missing.length - 200}`);
console.error('\nОбновите docs/reference.md в этом же изменении (правило 9 в AGENTS.md).');
process.exit(1);
