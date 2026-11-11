import { describe, expect, it } from 'vitest';
import { EventProcessor } from '../src/runtime/events';
import type { BslObject } from '../src/runtime/object';
import type { Value } from '../src/runtime/values';

/** Объект-обработчик: каждый вызов метода пишется в журнал `log`. */
function target(log: string[], label: string): BslObject {
  return {
    typeName: 'Тест',
    callMethod(name: string): Value {
      log.push(`${label}.${name}`);
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

describe('EventProcessor', () => {
  it('вызывает обработчики в порядке подписки', () => {
    const events = new EventProcessor();
    const log: string[] = [];
    const source = target(log, 'источник');
    events.add(source, 'Событие', target(log, 'первый'), 'Обработчик', false);
    events.add(source, 'Событие', target(log, 'второй'), 'Обработчик', false);
    events.add(source, 'Событие', target(log, 'третий'), 'Обработчик', false);

    events.raise(source, 'Событие', []);

    expect(log).toEqual(['первый.Обработчик', 'второй.Обработчик', 'третий.Обработчик']);
  });

  it('игнорирует повторную подписку той же пары (объект по ссылке + имя без регистра)', () => {
    const events = new EventProcessor();
    const log: string[] = [];
    const source = target(log, 'источник');
    const handler = target(log, 'обработчик');
    events.add(source, 'Событие', handler, 'Обработчик', false);
    events.add(source, 'Событие', handler, 'обработчик', false);

    events.raise(source, 'Событие', []);

    expect(log).toEqual(['обработчик.Обработчик']);
  });

  it('не смешивает одинаковый метод у разных объектов-обработчиков', () => {
    const events = new EventProcessor();
    const log: string[] = [];
    const source = target(log, 'источник');
    events.add(source, 'Событие', target(log, 'первый'), 'Обработчик', false);
    events.add(source, 'Событие', target(log, 'второй'), 'Обработчик', false);

    events.raise(source, 'Событие', []);

    expect(log).toEqual(['первый.Обработчик', 'второй.Обработчик']);
  });

  it('событие без подписчиков — тихий no-op', () => {
    const events = new EventProcessor();
    const source = target([], 'источник');

    expect(() => events.raise(source, 'Никто', [])).not.toThrow();
  });

  it('имена событий без регистра', () => {
    const events = new EventProcessor();
    const log: string[] = [];
    const source = target(log, 'источник');
    events.add(source, 'Событие', target(log, 'обработчик'), 'Обработчик', false);

    events.raise(source, 'СОБЫТИЕ', []);

    expect(log).toEqual(['обработчик.Обработчик']);
  });

  it('разделяет подписки разных источников', () => {
    const events = new EventProcessor();
    const log: string[] = [];
    const first = target(log, 'первый');
    const second = target(log, 'второй');
    events.add(first, 'Событие', target(log, 'обработчик-1'), 'Обработчик', false);
    events.add(second, 'Событие', target(log, 'обработчик-2'), 'Обработчик', false);

    events.raise(first, 'Событие', []);

    expect(log).toEqual(['обработчик-1.Обработчик']);
  });

  it('исключение в обработчике прерывает цепочку и не перехватывается', () => {
    const events = new EventProcessor();
    const log: string[] = [];
    const source = target(log, 'источник');
    events.add(source, 'Событие', target(log, 'первый'), 'Обработчик', false);
    events.add(source, 'Событие', {
      ...target(log, 'второй'),
      callMethod: () => {
        throw new Error('boom');
      },
    }, 'Обработчик', false);
    events.add(source, 'Событие', target(log, 'третий'), 'Обработчик', false);

    expect(() => events.raise(source, 'Событие', [])).toThrow('boom');
    expect(log).toEqual(['первый.Обработчик']);
  });
});

describe('EventProcessor.remove', () => {
  it('снимает подписку: обработчик больше не вызывается', () => {
    const events = new EventProcessor();
    const log: string[] = [];
    const source = target(log, 'источник');
    const handler = target(log, 'обработчик');
    events.add(source, 'Событие', handler, 'Обработчик', false);
    events.remove(source, 'Событие', handler, 'Обработчик');

    events.raise(source, 'Событие', []);

    expect(log).toEqual([]);
  });

  it('отсутствующая подписка — no-op без ошибки', () => {
    const events = new EventProcessor();
    const source = target([], 'источник');
    const handler = target([], 'обработчик');

    expect(() => events.remove(source, 'Событие', handler, 'Обработчик')).not.toThrow();
  });

  it('не меняет порядок остальных обработчиков', () => {
    const events = new EventProcessor();
    const log: string[] = [];
    const source = target(log, 'источник');
    const first = target(log, 'первый');
    const second = target(log, 'второй');
    const third = target(log, 'третий');
    events.add(source, 'Событие', first, 'Обработчик', false);
    events.add(source, 'Событие', second, 'Обработчик', false);
    events.add(source, 'Событие', third, 'Обработчик', false);

    events.remove(source, 'Событие', second, 'Обработчик');
    events.raise(source, 'Событие', []);

    expect(log).toEqual(['первый.Обработчик', 'третий.Обработчик']);
  });

  it('снимает только подходящую пару (регистр имени не влияет)', () => {
    const events = new EventProcessor();
    const log: string[] = [];
    const source = target(log, 'источник');
    const first = target(log, 'первый');
    const second = target(log, 'второй');
    events.add(source, 'Событие', first, 'Обработчик', false);
    events.add(source, 'Событие', second, 'Обработчик', false);

    events.remove(source, 'событие', first, 'обработчик');
    events.raise(source, 'Событие', []);

    expect(log).toEqual(['второй.Обработчик']);
  });
});
