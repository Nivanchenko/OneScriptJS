import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/runtime/runner';
import { createNodeGlobalContext } from '../src/node/context';
import { collectModuleSources, resolveNodePath } from '../src/node/module-source';
import { makeTempDir } from './helpers/module-fixtures';

function runFile(file: string, source: string): unknown[] {
  const logs: unknown[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(...args);
  });
  try {
    const modules = collectModuleSources(file, source);
    run(source, createNodeGlobalContext(), {
      path: file,
      basePath: file,
      modules,
      resolve: resolveNodePath,
    });
  } finally {
    spy.mockRestore();
  }
  return logs;
}

describe('Node-загрузчик модулей', () => {
  afterEach(() => vi.restoreAllMocks());

  it('загружает модуль по относительному пути', () => {
    const temp = makeTempDir({
      'lib/Модуль.os': 'Перем Поле Экспорт;\nФункция Сложить(А, Б) Экспорт\n  Возврат А + Б;\nКонецФункции\nПоле = 42;',
      'main.os': '#Использовать "lib/Модуль.os"\nСообщить(Модуль.Поле);\nСообщить(Модуль.Сложить(2, 3));',
    });
    try {
      const main = join(temp.dir, 'main.os');
      expect(runFile(main, readFileSync(main, 'utf8'))).toEqual(['42', '5']);
    } finally {
      temp.cleanup();
    }
  });

  it('загружает модуль по абсолютному пути', () => {
    const temp = makeTempDir({
      'lib/Модуль.os': 'Перем Поле Экспорт;\nПоле = 7;',
      'main.os': '',
    });
    try {
      const modulePath = join(temp.dir, 'lib', 'Модуль.os');
      const main = join(temp.dir, 'main.os');
      const source = `#Использовать "${modulePath}"\nСообщить(Модуль.Поле);`;
      expect(runFile(main, source)).toEqual(['7']);
    } finally {
      temp.cleanup();
    }
  });

  it('находит все транзитивные импорты в карте исходников', () => {
    const temp = makeTempDir({
      'a/Первый.os': '#Использовать "Второй.os"\nПерем А Экспорт;',
      'a/Второй.os': 'Перем Б Экспорт;\nБ = 2;',
      'main.os': '#Использовать "a/Первый.os"\nСообщить(Первый.А);\nСообщить(Второй.Б);',
    });
    try {
      const main = join(temp.dir, 'main.os');
      const source = readFileSync(main, 'utf8');
      const modules = collectModuleSources(main, source);
      expect(modules.has(join(temp.dir, 'a', 'Второй.os'))).toBe(true);
      expect(runFile(main, source)).toEqual(['', '2']);
    } finally {
      temp.cleanup();
    }
  });

  it('сообщает об отсутствующем файле при сборе', () => {
    const temp = makeTempDir({ 'main.os': '' });
    try {
      const main = join(temp.dir, 'main.os');
      expect(() => collectModuleSources(main, '#Использовать "lib/Нет.os"')).toThrow(
        "Файл не найден: '" + join(temp.dir, 'lib', 'Нет.os') + "'",
      );
    } finally {
      temp.cleanup();
    }
  });
});
