import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from '../src/runtime/runner';
import { createGlobalContext } from '../src/stdlib/global-context';
import { Interpreter } from '../src/runtime/interpreter';
import { tokenize } from '../src/lexer/lexer';
import { parse } from '../src/parser/parser';
import { BslArray } from '../src/stdlib/collections/array';
import type { BslObject } from '../src/runtime/object';
import type { Value } from '../src/runtime/values';

/** Исполнить BSL-скрипт и вернуть перехваченный вывод `console.log`. */
function exec(source: string): unknown[] {
  const logs: unknown[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(...args);
  });
  try {
    run(source, createGlobalContext());
  } finally {
    spy.mockRestore();
  }
  return logs;
}

/** Обработчик-заглушка: складывает аргументы каждого вызова в `calls`. */
function recorder(calls: Value[][]): BslObject {
  return {
    typeName: 'Тест',
    callMethod: (_name: string, args: Value[]): Value => {
      calls.push(args);
      return undefined;
    },
    hasMethod: () => true,
    getIndex: () => {
      throw new Error('нет индексации');
    },
    setIndex: () => {
      throw new Error('нет индексации');
    },
    getProp: () => {
      throw new Error('нет свойств');
    },
    setProp: () => {
      throw new Error('нет свойств');
    },
  };
}

const SOURCE = 'Процедура Сгенерировать(Имя, Параметры) Экспорт\n' +
  '  ВызватьСобытие(Имя, Параметры);\n' +
  'КонецПроцедуры\n';

describe('ВызватьСобытие', () => {
  it('передаёт элементы Массива позиционными аргументами', () => {
    const env = createGlobalContext();
    const interpreter = new Interpreter(env);
    interpreter.run(parse(tokenize(SOURCE)));
    const calls: Value[][] = [];
    const params = new BslArray([]);
    params.callMethod('Добавить', ['П1']);
    params.callMethod('Добавить', ['П2']);
    env.events.add(interpreter.getThisObject(), 'МоеСобытие', recorder(calls), 'Обработчик', false);

    interpreter.invokeMethod('Сгенерировать', ['МоеСобытие', params]);

    expect(calls).toEqual([['П1', 'П2']]);
  });

  it('без параметров вызывает обработчик без аргументов', () => {
    const env = createGlobalContext();
    const interpreter = new Interpreter(env);
    interpreter.run(parse(tokenize(
      'Процедура Сгенерировать(Имя) Экспорт\n' +
        '  ВызватьСобытие(Имя);\n' +
        'КонецПроцедуры\n',
    )));
    const calls: Value[][] = [];
    env.events.add(interpreter.getThisObject(), 'МоеСобытие', recorder(calls), 'Обработчик', false);

    interpreter.invokeMethod('Сгенерировать', ['МоеСобытие']);

    expect(calls).toEqual([[]]);
  });

  it('внутри загруженного сценария объявляет событие на объекте этого сценария', () => {
    const env = createGlobalContext();
    const script = env.call('ЗагрузитьСценарийИзСтроки', [SOURCE]) as BslObject & {
      callMethod: (name: string, args: Value[]) => Value;
    };
    const calls: Value[][] = [];
    const params = new BslArray([]);
    params.callMethod('Добавить', ['П1']);
    env.events.add(script, 'МоеСобытие', recorder(calls), 'Обработчик', false);

    script.callMethod('Сгенерировать', ['МоеСобытие', params]);

    expect(calls).toEqual([['П1']]);
  });
});

describe('ЭтотОбъект', () => {
  afterEach(() => vi.restoreAllMocks());

  it('возвращает объект-модуль, у которого вызывается метод', () => {
    expect(
      exec(
        'Перем Вызовов;\n' +
          'Процедура Привет() Экспорт\n' +
          '  Вызовов = Вызовов + 1;\n' +
          '  Сообщить("привет");\n' +
          'КонецПроцедуры\n' +
          'Вызовов = 0;\n' +
          'ЭтотОбъект.Привет();\n' +
          'Сообщить(Вызовов);\n',
      ),
    ).toEqual(['привет', '1']);
  });
});

const DECLARER = 'Процедура Сгенерировать(Имя, Параметры) Экспорт\n' +
  '  ВызватьСобытие(Имя, Параметры);\n' +
  'КонецПроцедуры\n';

/** Основной модуль: счётчик + обработчик; событие объявляет загруженный сценарий. */
function us1Script(subscribe: boolean): string {
  return 'Перем Счетчик, Принятые;\n' +
    'Процедура Обработчик(П1, П2) Экспорт\n' +
    '  Счетчик = Счетчик + 1;\n' +
    '  Принятые = Новый Массив;\n' +
    '  Принятые.Добавить(П1);\n' +
    '  Принятые.Добавить(П2);\n' +
    'КонецПроцедуры\n' +
    'Источник = ЗагрузитьСценарийИзСтроки("' + DECLARER.replace(/\n/g, '\n|') + '");\n' +
    'Счетчик = 0;\n' +
    (subscribe ? 'ДобавитьОбработчик Источник.МоеСобытие, ЭтотОбъект.Обработчик;\n' : '') +
    'Параметры = Новый Массив;\n' +
    'Параметры.Добавить("П1");\n' +
    'Параметры.Добавить("П2");\n' +
    'Источник.Сгенерировать("МоеСобытие", Параметры);\n' +
    'Сообщить(Счетчик);\n' +
    'Сообщить(Принятые[0]);\n' +
    'Сообщить(Принятые[1]);\n';
}

describe('US1: подписка и вызов обработчика', () => {
  afterEach(() => vi.restoreAllMocks());

  it('вызывает подписанный обработчик один раз с параметрами в порядке события', () => {
    expect(exec(us1Script(true))).toEqual(['1', 'П1', 'П2']);
  });

  it('событие без подписчиков — тишина, без ошибки', () => {
    expect(
      exec(
        'Источник = ЗагрузитьСценарийИзСтроки("' + DECLARER.replace(/\n/g, '\n|') + '");\n' +
          'Параметры = Новый Массив;\n' +
          'Источник.Сгенерировать("МоеСобытие", Параметры);\n' +
          'Сообщить("ok");\n',
      ),
    ).toEqual(['ok']);
  });

  it('доставляет синхронно: обработчик отработал к возврату из Сгенерировать', () => {
    const logs = exec(us1Script(true));
    expect(logs[0]).toBe('1');
  });

  it('исключение в обработчике доходит до кода, объявившего событие', () => {
    const script = 'Процедура Плохой() Экспорт\n' +
      '  ВызватьИсключение "boom";\n' +
      'КонецПроцедуры\n' +
      'Источник = ЗагрузитьСценарийИзСтроки("' + DECLARER.replace(/\n/g, '\n|') + '");\n' +
      'ДобавитьОбработчик Источник.МоеСобытие, ЭтотОбъект.Плохой;\n' +
      'Параметры = Новый Массив;\n' +
      'Источник.Сгенерировать("МоеСобытие", Параметры);\n';

    expect(() => exec(script)).toThrow(/boom/);
  });
});
