import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_CATALOG } from '../src/lsp/generated/api-catalog';
import {
  arity,
  catalog,
  findEnum,
  findFunction,
  findType,
  knownGlobalNames,
} from '../src/lsp/api-catalog';

const IDENT = /^[A-Za-zА-Яа-яЁё\u0370-\u03FF_][A-Za-zА-Яа-яЁё\u0370-\u03FF0-9_]*$/u;

/** Запускает генератор каталога и возвращает код/вывод, не бросая на exit != 0. */
function runCatalog(args: string[]): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, ['scripts/build-api-catalog.mjs', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('каталог API из docs/reference.md', () => {
  it('закоммиченный каталог соответствует справочнику (drift)', () => {
    const result = runCatalog(['--check']);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('OK');
  });

  it('падает на пустом справочнике и подсказывает перегенерацию', () => {
    const dir = mkdtempSync(join(tmpdir(), 'onescriptjs-catalog-'));
    const docs = join(dir, 'reference.md');
    writeFileSync(docs, '# Пустой справочник\n');
    try {
      const result = runCatalog(['--check', '--docs', docs]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('build:catalog');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('содержит функции, типы, перечисления и глобалы движка', () => {
    expect(API_CATALOG.schemaVersion).toBe(1);
    expect(API_CATALOG.generatedFrom).toBe('docs/reference.md');

    const message = findFunction('Сообщить');
    expect(message?.en).toBe('Message');
    expect(message?.params.map((p) => p.name)).toEqual(['Текст', 'Статус']);
    expect(message?.params.every((p) => p.optional)).toBe(true);
    expect(message?.description).toContain('Выводит текст');

    const array = findType('Массив');
    expect(array?.en).toBe('Array');
    expect(array?.constructible).toBe(true);
    expect(array?.methods.map((m) => m.ru)).toContain('Добавить');

    const direction = findEnum('НаправлениеПоиска');
    expect(direction?.values.map((v) => v.ru)).toContain('СНачала');

    // английские алиасы индексируются так же, как русские
    expect(findFunction('message')?.ru).toBe('Сообщить');
    expect(findType('array')?.ru).toBe('Массив');

    expect(knownGlobalNames().has('сообщить')).toBe(true);
    expect(knownGlobalNames().has('массив')).toBe(true);
    expect(knownGlobalNames().has('направлениепоиска')).toBe(true);
  });

  it('соблюдает инварианты данных: имена, арность, алиасы', () => {
    for (const fn of catalog.functions) {
      expect(fn.ru).toMatch(IDENT);
      if (fn.en !== undefined) expect(fn.en).toMatch(IDENT);
      const { min, max } = arity(fn);
      expect(min).toBeLessThanOrEqual(max);
      if (fn.params.length > 0) {
        const variadic = fn.params.filter((p) => p.variadic);
        if (variadic.length > 0) expect(fn.params[fn.params.length - 1]?.variadic).toBe(true);
      }
    }
    for (const type of catalog.types) {
      expect(type.ru).toMatch(IDENT);
      if (type.en !== undefined) expect(type.en).toMatch(IDENT);
      for (const member of [...type.methods, ...type.properties]) {
        expect(member.ru).toMatch(IDENT);
      }
    }
    for (const e of catalog.enums) {
      expect(e.ru).toMatch(IDENT);
      for (const value of e.values) expect(value.ru).toMatch(IDENT);
    }
    for (const name of catalog.globals) expect(name).toMatch(IDENT);
    // нет дублей русских имён в одной категории
    expect(new Set(catalog.functions.map((f) => f.ru.toLowerCase())).size).toBe(
      catalog.functions.length,
    );
  });
});
