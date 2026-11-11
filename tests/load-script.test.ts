import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/runtime/runner';
import { createNodeGlobalContext } from '../src/node/context';
import { makeTempDir } from './helpers/module-fixtures';

function exec(source: string): unknown[] {
  const logs: unknown[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(...args);
  });
  try {
    run(source, createNodeGlobalContext());
  } finally {
    spy.mockRestore();
  }
  return logs;
}

const LOADED_SCRIPT = [
  '#Использовать "lib/Модуль.os"',
  'Перем Счётчик Экспорт;',
  'Перем Поле Экспорт;',
  'Функция Прибавить() Экспорт',
  '  Счётчик = Счётчик + 1;',
  '  Возврат Счётчик;',
  'КонецФункции',
  'Функция МойПуть() Экспорт',
  '  Возврат ТекущийСценарий().Источник;',
  'КонецФункции',
  'Процедура Скрытая()',
  'КонецПроцедуры',
  'Счётчик = 0;',
  'Поле = Модуль.Поле;',
  'Сообщить("тело загружено");',
].join('\n');

function makeScripts(): { dir: string; script: string; cleanup(): void } {
  const temp = makeTempDir({
    'lib/Модуль.os': 'Перем Поле Экспорт;\nПоле = 4;',
    'Модуль.os': LOADED_SCRIPT,
  });
  return { dir: temp.dir, script: join(temp.dir, 'Модуль.os'), cleanup: temp.cleanup };
}

describe('ЗагрузитьСценарий (Node)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('исполняет тело, отдаёт экспортные методы и переменные, знает свой путь', () => {
    const { script, cleanup } = makeScripts();
    try {
      const logs = exec(
        [
          `С = ЗагрузитьСценарий("${script}");`,
          'Сообщить(С.Счётчик);',
          'Сообщить(С.Прибавить());',
          'Сообщить(С.Счётчик);',
          'Сообщить(С.Поле);',
          'Сообщить(С.Источник);',
        ].join('\n'),
      );
      expect(logs).toEqual(['тело загружено', '0', '1', '1', '4', script]);
    } finally {
      cleanup();
    }
  });

  it('ТекущийСценарий внутри метода указывает на загруженный файл', () => {
    const { script, cleanup } = makeScripts();
    try {
      const logs = exec(
        [`С = ЗагрузитьСценарий("${script}");`, 'Сообщить(С.МойПуть());'].join('\n'),
      );
      expect(logs).toEqual(['тело загружено', script]);
    } finally {
      cleanup();
    }
  });

  it('не отдаёт наружу неэкспортные члены', () => {
    const { script, cleanup } = makeScripts();
    try {
      const loaded = `С = ЗагрузитьСценарий("${script}");`;
      expect(() => exec(`${loaded}\nС.Скрытая();`)).toThrow("Метод 'Скрытая' не найден у типа Сценарий");
      expect(() => exec(`${loaded}\nСообщить(С.НетТакого);`)).toThrow(
        "Свойство 'НетТакого' не найдено у типа Сценарий",
      );
    } finally {
      cleanup();
    }
  });

  it('даёт независимые экземпляры при повторной загрузке', () => {
    const { script, cleanup } = makeScripts();
    try {
      const logs = exec(
        [
          `А = ЗагрузитьСценарий("${script}");`,
          `Б = ЗагрузитьСценарий("${script}");`,
          'Сообщить(А.Прибавить());',
          'Сообщить(Б.Счётчик);',
        ].join('\n'),
      );
      expect(logs).toEqual(['тело загружено', 'тело загружено', '1', '0']);
    } finally {
      cleanup();
    }
  });

  it('отклоняет неподдерживаемый второй параметр', () => {
    expect(() => exec('ЗагрузитьСценарий("x.os", Новый Структура);')).toThrow(
      'Второй параметр ЗагрузитьСценарий (Структура) не поддерживается',
    );
  });

  it('сообщает об отсутствующем файле', () => {
    const { dir, cleanup } = makeScripts();
    try {
      expect(() => exec(`ЗагрузитьСценарий("${join(dir, 'Нет.os')}");`)).toThrow(/ENOENT/);
    } finally {
      cleanup();
    }
  });
});
