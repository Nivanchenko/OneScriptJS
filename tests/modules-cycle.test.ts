import { describe, expect, it } from 'vitest';
import { createGlobalContext } from '../src/stdlib/global-context';
import { ModuleLoader } from '../src/runtime/modules';
import { runWithModules } from './helpers/module-fixtures';

describe('кеш импорта и циклы', () => {
  it('загружает файл один раз, даже если путь написан по-разному', () => {
    const logs = runWithModules(
      [
        '#Использовать "lib/Модуль.os"',
        '#Использовать "./lib/Модуль.os"',
        '#Использовать "lib/../lib/Модуль.os"',
        'Сообщить("main");',
      ].join('\n'),
      { '/app/lib/Модуль.os': 'Сообщить("init");' },
    );
    expect(logs).toEqual(['init', 'main']);
  });

  it('разрывает цикл A↔B и исполняет тела по одному разу', () => {
    const logs = runWithModules(
      [
        '#Использовать "A.os"',
        'Сообщить(A.Имя);',
        'Сообщить(B.Имя);',
      ].join('\n'),
      {
        '/app/A.os': '#Использовать "B.os"\nПерем Имя Экспорт;\nИмя = "A";\nСообщить("тело A");',
        '/app/B.os': '#Использовать "A.os"\nПерем Имя Экспорт;\nИмя = "B";\nСообщить("тело B");',
      },
    );
    expect(logs).toEqual(['тело B', 'тело A', 'A', 'B']);
  });

  it('даёт ошибку при доступе к ещё не готовому модулю в цикле', () => {
    expect(() =>
      runWithModules('#Использовать "A.os"', {
        '/app/A.os': '#Использовать "B.os"\nПерем Имя Экспорт;\nИмя = "A";',
        '/app/B.os': '#Использовать "A.os"\nСообщить(A.Имя);',
      }),
    ).toThrow("Модуль 'A' ещё загружается (циклический импорт)");
  });

  it('не грузит директиву из неактивной ветки #Если', () => {
    const logs = runWithModules(
      '#Если Ложь Тогда\n#Использовать "lib/Нет.os"\n#КонецЕсли\nСообщить("ok");',
    );
    expect(logs).toEqual(['ok']);
  });

  it('изолирует кеш между двумя запусками', () => {
    const source = '#Использовать "lib/Модуль.os"\nСообщить(Модуль.Счётчик);';
    const entries = { '/app/lib/Модуль.os': 'Перем Счётчик Экспорт;\nСчётчик = 1;' };
    expect(runWithModules(source, entries)).toEqual(['1']);
    expect(runWithModules(source, entries)).toEqual(['1']);
  });

  it('удаляет запись кеша после ошибки тела и позволяет повторить импорт', () => {
    const ctx = createGlobalContext();
    const sources = new Map<string, string>([
      ['/app/Модуль.os', 'ВызватьИсключение "boom";'],
    ]);
    const loader = new ModuleLoader(ctx, sources);
    const directive = [{ path: 'Модуль.os', line: 1 }];

    expect(() => loader.importAll(directive, '/app/main.os')).toThrow('boom');

    sources.set('/app/Модуль.os', 'Перем Имя Экспорт;\nИмя = "ok";');
    loader.importAll(directive, '/app/main.os');
    const module = ctx.resolveGlobal?.('Модуль') as { getProp(name: string): unknown } | undefined;
    expect(module?.getProp('Имя')).toBe('ok');
  });

  it('запрещает имя, занятое встроенным типом', () => {
    expect(() =>
      runWithModules('#Использовать "lib/Массив.os"', {
        '/app/lib/Массив.os': 'Перем А;',
      }),
    ).toThrow("Имя 'Массив' уже занято");
  });

  it('не исполняет тело модуля повторно при импорте из другого модуля', () => {
    const logs = runWithModules(
      '#Использовать "A.os"\n#Использовать "B.os"\nСообщить("main");',
      {
        '/app/A.os': '#Использовать "C.os"\nСообщить("A");',
        '/app/B.os': '#Использовать "C.os"\nСообщить("B");',
        '/app/C.os': 'Сообщить("C");',
      },
    );
    expect(logs).toEqual(['C', 'A', 'B', 'main']);
  });
});
