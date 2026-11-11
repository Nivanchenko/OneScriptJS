import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/runtime/runner';
import { createGlobalContext } from '../src/stdlib/global-context';
import { createNodeGlobalContext } from '../src/node/context';
import { defaultResolve } from '../src/runtime/modules';
import { resolveNodePath, stripBom } from '../src/node/module-source';
import { runWithModules, makeTempDir } from './helpers/module-fixtures';

const MODULE = '/app/lib/Модуль.os';
const MODULE_SOURCE = 'Перем Поле Экспорт;\nПоле = 7;\nСообщить("init");';

const loadDynamic = (name?: string): string =>
  [
    `Код = "#Использовать ""lib/Модуль.os""" + Символы.ПС + "Сообщить(Модуль.Поле);";`,
    name === undefined
      ? 'ЗагрузитьСценарийИзСтроки(Код);'
      : `ЗагрузитьСценарийИзСтроки(Код, "${name}");`,
  ].join('\n');

describe('импорт из ЗагрузитьСценарийИзСтроки', () => {
  afterEach(() => vi.restoreAllMocks());

  it('резолвит импорт относительно переданного имени', () => {
    const logs = runWithModules(loadDynamic('/app/dyn.os'), { [MODULE]: MODULE_SOURCE });
    expect(logs).toEqual(['init', '7']);
  });

  it('без имени использует путь текущего сценария', () => {
    const logs: unknown[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(...args);
    });
    try {
      run(loadDynamic(), createGlobalContext(), {
        // как CLI: path — как передал пользователь, basePath — абсолютный
        path: 'main.os',
        basePath: '/app/main.os',
        modules: new Map([[MODULE, MODULE_SOURCE]]),
        resolve: defaultResolve,
      });
    } finally {
      spy.mockRestore();
    }
    expect(logs).toEqual(['init', '7']);
  });

  it('кеширует модуль между двумя динамическими сценариями', () => {
    const logs = runWithModules(
      [
        loadDynamic('/app/one.os').split('\n')[0]!,
        'ЗагрузитьСценарийИзСтроки(Код, "/app/one.os");',
        'ЗагрузитьСценарийИзСтроки(Код, "/app/two.os");',
      ].join('\n'),
      { [MODULE]: MODULE_SOURCE },
    );
    expect(logs).toEqual(['init', '7', '7']);
  });

  it('читает файл через loadSource (Node) вне предзагруженной карты', () => {
    const temp = makeTempDir({
      'lib/Модуль.os': 'Перем Поле Экспорт;\nПоле = 9;',
      'main.os': '',
    });
    const main = join(temp.dir, 'main.os');
    const source = loadDynamic(join(temp.dir, 'dyn.os'));
    const logs: unknown[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(...args);
    });
    try {
      run(source, createNodeGlobalContext(), {
        path: main,
        basePath: main,
        modules: new Map(),
        resolve: resolveNodePath,
        loadSource: (file) => stripBom(readFileSync(file, 'utf8')),
      });
    } finally {
      spy.mockRestore();
      temp.cleanup();
    }
    expect(logs).toEqual(['9']);
  });

  it('без loadSource о непредзагруженном файле сообщает ошибкой', () => {
    const temp = makeTempDir({ 'lib/Модуль.os': 'Перем Поле Экспорт;\nПоле = 9;', 'main.os': '' });
    const main = join(temp.dir, 'main.os');
    try {
      // createGlobalContext не предоставляет loadSource — файл недоступен.
      expect(() =>
        run(loadDynamic(join(temp.dir, 'dyn.os')), createGlobalContext(), {
          path: main,
          basePath: main,
          modules: new Map(),
          resolve: resolveNodePath,
        }),
      ).toThrow("Файл не найден: '" + join(temp.dir, 'lib', 'Модуль.os') + "'");
    } finally {
      temp.cleanup();
    }
  });
});
