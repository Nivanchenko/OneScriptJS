#!/usr/bin/env node
/**
 * Строит каталог API движка (src/lsp/generated/api-catalog.ts) из docs/reference.md.
 *
 * Источник истины — таблицы справочника: функции, методы/свойства объектов,
 * значения перечислений, описания и параметры. Каталог нужен completion/hover и
 * семантическим проверкам LSP-сервера (FR-012: никакого ручного списка).
 *
 * Использование:
 *   node scripts/build-api-catalog.mjs               # перезаписать каталог
 *   node scripts/build-api-catalog.mjs --check       # только сравнить (drift-тест)
 *   node scripts/build-api-catalog.mjs --docs <path> # другой справочник
 *   node scripts/build-api-catalog.mjs --out <path>  # другой файл каталога
 *
 * Код возврата: 0 — успех/нет drift, 1 — drift или неполный каталог, 2 — ошибка аргументов.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = process.cwd();
const DEFAULT_DOCS = join(ROOT, 'docs/reference.md');
const DEFAULT_OUT = join(ROOT, 'src/lsp/generated/api-catalog.ts');
const SRC = join(ROOT, 'src');

const IDENT = /^[A-Za-zА-Яа-яЁё\u0370-\u03FF_][A-Za-zА-Яа-яЁё\u0370-\u03FF0-9_]*$/u;

// --- аргументы ---

let docsPath = DEFAULT_DOCS;
let outPath = DEFAULT_OUT;
let check = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--check') check = true;
  else if (argv[i] === '--docs' && argv[i + 1]) docsPath = resolve(argv[++i]);
  else if (argv[i] === '--out' && argv[i + 1]) outPath = resolve(argv[++i]);
  else {
    console.error(`Неизвестный аргумент: ${argv[i]}`);
    console.error('Использование: node scripts/build-api-catalog.mjs [--check] [--docs <path>] [--out <path>]');
    process.exit(2);
  }
}

// --- разбор markdown-таблиц ---

/** Ячейки строки таблицы; `\|` внутри ячейки — литеральный `|`. */
function parseRow(line) {
  const cells = [];
  let cur = '';
  const s = line.trim();
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  if (cells[0]?.trim() === '') cells.shift();
  if (cells[cells.length - 1]?.trim() === '') cells.pop();
  return cells.map((c) => c.trim());
}

const SEPARATOR = /^\|[\s:|-]+\|$/;

/** Имена из ячейки/заголовка: `Рус / Eng`, `` `Рус` / `Eng` ``, один токен. */
function names(cell) {
  const raw = cell.replace(/`/g, '').trim();
  if (!raw) return [];
  const parts = raw.split(/\s+\/\s+/).map((p) => p.trim()).filter(Boolean);
  return parts;
}

/** Параметры: `Имя?: Тип, Имя2…: Любое` (внешние бэктики снимаются). */
function parseParams(cell) {
  let text = cell.trim();
  if (text === '' || text === '—' || text === '-') return [];
  if (text.startsWith('`') && text.endsWith('`') && (text.match(/`/g) ?? []).length === 2) {
    text = text.slice(1, -1);
  }
  const params = [];
  for (const part of splitTopLevel(text)) {
    const raw = part.trim();
    if (!raw) continue;
    const p = raw.replace(/^`|`$/g, '').trim();
    if (!p || p.startsWith('<') || p.startsWith('[')) continue; // синтаксис оператора
    const variadic = /…|\.\.\./.test(p);
    const colon = p.indexOf(':');
    let name = colon >= 0 ? p.slice(0, colon).trim() : p;
    const type = colon >= 0 ? p.slice(colon + 1).trim() : 'Любое';
    const optional = name.endsWith('?');
    name = name.replace(/\?$/g, '').replace(/…|\.\.\./g, '').trim();
    if (!IDENT.test(name)) continue;
    params.push({ name, type, optional, variadic });
  }
  return params;
}

/** Делит по запятым верхнего уровня (вне бэктиков). */
function splitTopLevel(text) {
  const out = [];
  let cur = '';
  let inTick = false;
  for (const ch of text) {
    if (ch === '`') {
      inTick = !inTick;
      cur += ch;
      continue;
    }
    if (ch === ',' && !inTick) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** «Возвращает»: `—` → null, иначе текст без внешних бэктиков. */
function parseReturns(cell) {
  const text = cell.replace(/`/g, '').trim();
  if (text === '' || text === '—' || text === '-') return null;
  return text;
}

/** Среда по заголовкам раздела/подраздела. */
function sectionEnv(section, subsection) {
  const text = `${section} ${subsection}`;
  if (/только Node|\[Node\]/i.test(text)) return 'node';
  if (/браузер/i.test(text)) return 'browser';
  return undefined;
}

/** Имена из заголовка `### Имя / Alias` (снимает префикс «Объект »). */
function headingNames(heading) {
  const text = heading.replace(/`/g, '').replace(/^Объект\s+/i, '').trim();
  return text.split(/\s+\/\s+/).map((p) => p.trim()).filter(Boolean);
}

// --- сбор каталога ---

function buildCatalog(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const functions = [];
  const functionNames = new Set();
  const types = new Map();
  const enums = new Map();
  let section = '';
  let subsection = '';

  const ensureType = (heading) => {
    const [ru, en] = headingNames(heading);
    if (!ru || !IDENT.test(ru)) return undefined;
    const key = ru.toLowerCase();
    let type = types.get(key);
    if (!type) {
      type = { ru, ...(en ? { en } : {}), constructible: false, methods: [], properties: [] };
      types.set(key, type);
    }
    return type;
  };

  const ensureEnum = (heading) => {
    const [ru, en] = headingNames(heading);
    if (!ru || !IDENT.test(ru)) return undefined;
    const key = ru.toLowerCase();
    let item = enums.get(key);
    if (!item) {
      item = { ru, ...(en ? { en } : {}), values: [] };
      enums.set(key, item);
    }
    return item;
  };

  const addFunction = (row, builtinOps) => {
    const rowNames = names(row[0]);
    if (rowNames.length === 0 || !IDENT.test(rowNames[0])) return;
    const ru = rowNames[0];
    const key = ru.toLowerCase();
    if (functionNames.has(key)) return; // дубли в справочнике не размножаем
    functionNames.add(key);
    const env = sectionEnv(section, subsection);
    const fn = {
      ru,
      ...(rowNames[1] ? { en: rowNames[1] } : {}),
      params: builtinOps ? [] : parseParams(row[1]),
      returns: parseReturns(row[2]),
      description: row[3] ?? '',
      section: subsection || section,
      ...(env ? { env } : {}),
      ...(builtinOps ? { arityKnown: false } : {}),
    };
    functions.push(fn);
  };

  const addMember = (row, kind) => {
    const rowNames = names(row[0]);
    if (rowNames.length === 0 || !IDENT.test(rowNames[0])) return;
    const target = ensureType(subsection);
    if (!target) return;
    if (kind === 'method') {
      target.methods.push({
        ru: rowNames[0],
        ...(rowNames[1] ? { en: rowNames[1] } : {}),
        params: parseParams(row[1]),
        returns: parseReturns(row[2]),
        description: row[3] ?? '',
      });
    } else {
      target.properties.push({
        ru: rowNames[0],
        ...(rowNames[1] ? { en: rowNames[1] } : {}),
        type: (row[1] ?? '').replace(/`/g, '').trim(),
        access: normalizeAccess(row[2]),
        description: row[3] ?? '',
      });
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const h2 = /^## (.+)$/.exec(line);
    if (h2) {
      section = h2[1].trim();
      subsection = '';
      i++;
      continue;
    }
    const h3 = /^### (.+)$/.exec(line);
    if (h3) {
      subsection = h3[1].trim();
      i++;
      continue;
    }
    if (!line.startsWith('|') || !SEPARATOR.test((lines[i + 1] ?? '').trim())) {
      i++;
      continue;
    }
    const header = parseRow(line).map((c) => c.replace(/`/g, '').toLowerCase());
    i += 2;
    while (i < lines.length && lines[i].startsWith('|')) {
      const row = parseRow(lines[i]);
      i++;
      if (row.length === 0) continue;
      const first = header[0];
      if (first === 'функция' || first === 'функция/оператор') {
        if (row.length >= 4) addFunction(row, first === 'функция/оператор');
      } else if ((first === 'метод' || first === 'свойство') && subsection) {
        if (row.length >= 4) addMember(row, first === 'метод' ? 'method' : 'property');
      } else if (first === 'значение' && section === 'Перечисления' && subsection) {
        const item = ensureEnum(subsection);
        const valueNames = names(row[0]);
        if (item && valueNames.length > 0 && IDENT.test(valueNames[0])) {
          const en = names(row[1])[0];
          item.values.push({
            ru: valueNames[0],
            ...(en && IDENT.test(en) ? { en } : {}),
            meaning: row[2] ?? '',
          });
        }
      }
    }
  }

  // constructible — только реально зарегистрированные через registerType
  const registeredTypes = scanSrc((source, add) => {
    for (const m of source.matchAll(/registerType\(\s*'([^']+)'/g)) add(m[1]);
  });
  for (const type of types.values()) {
    type.constructible =
      registeredTypes.has(type.ru.toLowerCase()) ||
      (type.en !== undefined && registeredTypes.has(type.en.toLowerCase()));
  }

  return {
    schemaVersion: 1,
    generatedFrom: 'docs/reference.md',
    functions,
    types: [...types.values()],
    enums: [...enums.values()],
    globals: [...scanSrc((source, add) => {
      for (const m of source.matchAll(/registerGlobal\(\s*'([^']+)'/g)) add(m[1]);
    })].sort((a, b) => a.localeCompare(b, 'ru')),
  };
}

function normalizeAccess(cell) {
  const text = (cell ?? '').replace(/`/g, '').toLowerCase();
  if (text.includes('чтение/запись') || text.includes('чтение, запись')) return 'readwrite';
  if (text.includes('запись')) return 'write';
  return 'read';
}

// --- проверка полноты относительно src/ ---

/** Имена публичного API из src/: registerAlias/Type/Global/Enum (и значения перечислений). */
function requiredSourceNames() {
  const required = new Set();
  scanSrc((source, add) => {
    for (const m of source.matchAll(/registerAlias\(\s*'([^']+)'\s*,\s*'([^']+)'/g)) {
      add(m[1]);
      add(m[2]);
    }
    for (const m of source.matchAll(/registerType\(\s*'([^']+)'/g)) add(m[1]);
    for (const m of source.matchAll(/registerGlobal\(\s*'([^']+)'/g)) add(m[1]);
    for (const m of source.matchAll(
      /registerEnum\(\s*ctx\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*\{([\s\S]*?)\}\s*\)/g,
    )) {
      add(m[1]);
      add(m[2]);
      add(m[3]);
      for (const value of m[4].matchAll(/'([^']+)'\s*:/g)) add(value[1]);
    }
  });
  return required;
}

function scanSrc(collect) {
  const found = new Set();
  const add = (name) => {
    const key = name.trim().toLowerCase();
    if (key) found.add(key);
  };
  for (const file of walk(SRC)) collect(readFileSync(file, 'utf8'), add);
  return found;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (path.endsWith('.ts')) out.push(path);
  }
  return out.sort();
}

/** Все имена каталога (нижний регистр) для кросс-сверки и проверки полноты. */
function catalogNameSet(catalog) {
  const names = new Set();
  const add = (name) => {
    if (name) names.add(name.toLowerCase());
  };
  for (const fn of catalog.functions) {
    add(fn.ru);
    add(fn.en);
  }
  for (const type of catalog.types) {
    add(type.ru);
    add(type.en);
    for (const member of [...type.methods, ...type.properties]) {
      add(member.ru);
      add(member.en);
    }
  }
  for (const e of catalog.enums) {
    add(e.ru);
    add(e.en);
    for (const value of e.values) {
      add(value.ru);
      add(value.en);
    }
  }
  for (const name of catalog.globals) add(name);
  return names;
}

/** Проверяет, что все имена каталога — BSL-идентификаторы. */
function validateIdentifiers(catalog) {
  const bad = [];
  const check = (name, where) => {
    if (name !== undefined && !IDENT.test(name)) bad.push(`${where}: '${name}'`);
  };
  for (const fn of catalog.functions) check(fn.ru, 'функция');
  for (const type of catalog.types) {
    check(type.ru, 'тип');
    for (const member of [...type.methods, ...type.properties]) check(member.ru, `член ${type.ru}`);
  }
  for (const e of catalog.enums) {
    check(e.ru, 'перечисление');
    for (const value of e.values) check(value.ru, `значение ${e.ru}`);
  }
  for (const name of catalog.globals) check(name, 'глобал');
  return bad;
}

// --- вывод ---

function render(catalog) {
  return (
    '// Сгенерировано scripts/build-api-catalog.mjs из docs/reference.md. Не редактировать вручную.\n' +
    '// Перегенерация: pnpm build:catalog\n\n' +
    `export const API_CATALOG = ${JSON.stringify(catalog, null, 2)};\n`
  );
}

function main() {
  const catalog = buildCatalog(docsPath);

  const identifiers = validateIdentifiers(catalog);
  if (identifiers.length > 0) {
    console.error('Недопустимые имена в каталоге API:');
    for (const item of identifiers.slice(0, 20)) console.error(`  - ${item}`);
    process.exit(1);
  }

  const catalogNames = catalogNameSet(catalog);
  const missing = [...requiredSourceNames()].filter((name) => !catalogNames.has(name));
  if (missing.length > 0) {
    console.error(`В каталоге не найдено ${missing.length} имён API из src/:`);
    for (const name of missing.slice(0, 50)) console.error(`  - ${name}`);
    console.error('\nПроверьте разбор docs/reference.md и полноту справочника.');
    process.exit(1);
  }

  const rendered = render(catalog);
  if (check) {
    let actual = '';
    try {
      actual = readFileSync(outPath, 'utf8');
    } catch {
      console.error(`Файл каталога не найден: ${outPath}`);
      console.error('Перегенерируйте: pnpm build:catalog');
      process.exit(1);
    }
    if (actual !== rendered) {
      console.error('Каталог API устарел относительно docs/reference.md.');
      console.error('Перегенерируйте: pnpm build:catalog');
      process.exit(1);
    }
    console.log(
      `Проверено: функций ${catalog.functions.length}, типов ${catalog.types.length}, ` +
        `перечислений ${catalog.enums.length}, глобалов ${catalog.globals.length}`,
    );
    console.log('OK: каталог соответствует docs/reference.md');
    return;
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, rendered);
  console.log(
    `Каталог API: функций ${catalog.functions.length}, типов ${catalog.types.length}, ` +
      `перечислений ${catalog.enums.length}, глобалов ${catalog.globals.length}`,
  );
  console.log(`Записан: ${outPath}`);
  console.log('OK: каталог перегенерирован');
}

main();
