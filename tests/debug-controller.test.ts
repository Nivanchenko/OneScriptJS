import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../src/runtime/runner';
import type { MaybePromise } from '../src/runtime/async';
import { isThenable } from '../src/runtime/async';
import { createGlobalContext } from '../src/stdlib/global-context';
import type { GlobalContext } from '../src/runtime/context';
import { defaultResolve } from '../src/runtime/modules';
import { DebugController } from '../src/runtime/debug/controller';
import type {
  DebugSink,
  FrameInfo,
  StopReason,
  ThreadInfo,
} from '../src/runtime/debug/controller';

/**
 * Ядро отладчика: брейкпоинты, шаги, пауза, гейт и реестр потоков.
 * Контракт — specs/021-debugger/contracts/engine-debug-api.md.
 */

const SOURCE_ID = 'test.osjs';

interface StopEvent {
  threadId: number;
  reason: StopReason;
  frames: FrameInfo[];
  description?: string;
}

/** Фейковый sink: копит события и умеет ждать следующую остановку. */
class FakeSink implements DebugSink {
  readonly stops: StopEvent[] = [];
  readonly outputs: string[] = [];
  readonly continuedEvents: { threadId: number; allThreads: boolean }[] = [];
  readonly threadEvents: ThreadInfo[][] = [];
  terminatedCalled = false;
  private consumed = 0;
  private readonly waiters: ((event: StopEvent) => void)[] = [];

  stopped(threadId: number, reason: StopReason, frames: FrameInfo[], description?: string): void {
    const event: StopEvent = { threadId, reason, frames, description };
    this.stops.push(event);
    for (const waiter of this.waiters.splice(0)) waiter(event);
  }

  continued(threadId: number, allThreads: boolean): void {
    this.continuedEvents.push({ threadId, allThreads });
  }

  output(_category: 'stdout' | 'stderr' | 'console', text: string): void {
    this.outputs.push(text);
  }

  threads(threads: ThreadInfo[]): void {
    this.threadEvents.push(threads);
  }

  terminated(): void {
    this.terminatedCalled = true;
  }

  /** Следующая остановка (уже случившаяся или будущая); таймаут — чтобы тест не висел. */
  nextStop(timeoutMs = 3000): Promise<StopEvent> {
    const pending = this.stops[this.consumed];
    if (pending !== undefined) {
      this.consumed++;
      return Promise.resolve(pending);
    }
    return new Promise<StopEvent>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Ожидался останов отладчика')),
        timeoutMs,
      );
      this.waiters.push((event) => {
        clearTimeout(timer);
        this.consumed++;
        resolve(event);
      });
    });
  }
}

interface Harness {
  sink: FakeSink;
  controller: DebugController;
  ctx: GlobalContext;
  execute(source: string): MaybePromise<void>;
}

function setup(options?: { stopOnEntry?: boolean }): Harness {
  const sink = new FakeSink();
  const controller = new DebugController(sink, options);
  const ctx = createGlobalContext();
  ctx.debug = controller;
  return {
    sink,
    controller,
    ctx,
    execute: (source) => run(source, ctx, { sourceId: SOURCE_ID }),
  };
}

/** Ждёт выполнения условия: пауза второго потока приходит отдельным макротаском. */
async function waitUntil(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Условие не выполнилось за отведённое время');
    await new Promise<void>((done) => setTimeout(done, 5));
  }
}

const NESTED = [
  'Процедура Внутренняя()', // 1
  '  А = 1;', // 2
  '  Б = 2;', // 3
  'КонецПроцедуры', // 4
  'Процедура Внешняя()', // 5
  '  Внутренняя();', // 6
  '  В = 3;', // 7
  'КонецПроцедуры', // 8
  'Внешняя();', // 9
  'Г = 4;', // 10
].join('\n');

describe('DebugController: брейкпоинты и шаги', () => {
  it('брейкпоинт останавливает на строке и отдаёт кадры изнутри наружу', async () => {
    const { sink, controller, execute } = setup();
    controller.setBreakpoints(SOURCE_ID, [{ line: 2 }]);

    const returned = execute(NESTED);
    expect(isThenable(returned)).toBe(true);

    const stop = await sink.nextStop();
    expect(stop.reason).toBe('breakpoint');
    expect(stop.threadId).toBe(1);
    expect(stop.frames.map((frame) => [frame.method, frame.line])).toEqual([
      ['Внутренняя', 2],
      ['Внешняя', 6],
      ['<модуль>', 9],
    ]);
    // Текущий кадр — id 0 (data-model §1).
    expect(stop.frames[0]!.id).toBe(0);

    controller.resume('continue');
    await returned;
  });

  it('next останавливается на следующей строке той же глубины', async () => {
    const { sink, controller, execute } = setup();
    controller.setBreakpoints(SOURCE_ID, [{ line: 2 }]);

    const returned = execute(NESTED);
    await sink.nextStop();

    controller.resume('next');
    const stop = await sink.nextStop();
    expect(stop.reason).toBe('step');
    expect(stop.frames.length).toBe(3);
    expect(stop.frames[0]).toMatchObject({ method: 'Внутренняя', line: 3 });

    controller.resume('continue');
    await returned;
  });

  it('stepIn входит в вызываемый метод', async () => {
    const { sink, controller, execute } = setup();
    controller.setBreakpoints(SOURCE_ID, [{ line: 9 }]);

    const returned = execute(NESTED);
    const first = await sink.nextStop();
    expect(first.frames[0]!.line).toBe(9);

    controller.resume('stepIn');
    const second = await sink.nextStop();
    expect(second.reason).toBe('step');
    expect(second.frames.map((frame) => frame.method)).toEqual(['Внешняя', '<модуль>']);
    expect(second.frames[0]!.line).toBe(6);

    controller.resume('stepIn');
    const third = await sink.nextStop();
    expect(third.frames.map((frame) => frame.method)).toEqual([
      'Внутренняя',
      'Внешняя',
      '<модуль>',
    ]);
    expect(third.frames[0]!.line).toBe(2);

    controller.resume('continue');
    await returned;
  });

  it('stepOut возвращается на глубину меньше исходной', async () => {
    const { sink, controller, execute } = setup();
    controller.setBreakpoints(SOURCE_ID, [{ line: 2 }]);

    const returned = execute(NESTED);
    const first = await sink.nextStop();
    expect(first.frames.length).toBe(3);

    controller.resume('stepOut');
    const stop = await sink.nextStop();
    expect(stop.reason).toBe('step');
    expect(stop.frames.length).toBe(2);
    expect(stop.frames[0]).toMatchObject({ method: 'Внешняя', line: 7 });

    controller.resume('continue');
    await returned;
  });

  it('continue идёт до следующего брейкпоинта', async () => {
    const { sink, controller, execute } = setup();
    controller.setBreakpoints(SOURCE_ID, [{ line: 2 }, { line: 7 }]);

    const returned = execute(NESTED);
    const first = await sink.nextStop();
    expect(first.frames[0]!.line).toBe(2);

    controller.resume('continue');
    const second = await sink.nextStop();
    expect(second.reason).toBe('breakpoint');
    expect(second.frames[0]!.line).toBe(7);

    controller.resume('continue');
    await returned;
  });

  it('next не останавливается повторно на той же (модуль, строка, глубина)', async () => {
    const { sink, controller, execute } = setup();
    // Оператор If и присваивание в его ветке — на одной строке и одной глубине.
    const source = ['Если Истина Тогда А = 1; КонецЕсли;', 'Б = 2;'].join('\n');
    controller.setBreakpoints(SOURCE_ID, [{ line: 1 }]);

    const returned = execute(source);
    const first = await sink.nextStop();
    expect(first.frames[0]!.line).toBe(1);

    controller.resume('next');
    const stop = await sink.nextStop();
    expect(stop.frames[0]!.line).toBe(2);

    controller.resume('continue');
    await returned;
  });
});

describe('DebugController: условия брейкпоинтов (P2-задел)', () => {
  it('ложное условие не останавливает', () => {
    const { sink, controller, execute } = setup();
    controller.setBreakpoints(SOURCE_ID, [{ line: 2, condition: 'Ложь' }]);

    const returned = execute(NESTED);

    expect(returned).toBeUndefined();
    expect(sink.stops).toEqual([]);
  });

  it('истинное условие останавливает на строке', async () => {
    const { sink, controller, execute } = setup();
    controller.setBreakpoints(SOURCE_ID, [{ line: 2, condition: 'Истина' }]);

    const returned = execute(NESTED);
    const stop = await sink.nextStop();
    expect(stop.reason).toBe('breakpoint');
    expect(stop.frames[0]!.line).toBe(2);

    controller.resume('continue');
    await returned;
  });

  it('ошибка условия не останавливает и уходит в output', () => {
    const { sink, controller, execute } = setup();
    controller.setBreakpoints(SOURCE_ID, [{ line: 2, condition: 'НетТакогоИмени' }]);

    const returned = execute(NESTED);

    expect(returned).toBeUndefined();
    expect(sink.stops).toEqual([]);
    expect(sink.outputs.some((text) => text.includes('Ошибка условия'))).toBe(true);
  });

  it('logpoint не останавливает исполнение', () => {
    const { sink, controller, execute } = setup();
    controller.setBreakpoints(SOURCE_ID, [{ line: 2, logMessage: 'точка' }]);

    const returned = execute(NESTED);

    expect(returned).toBeUndefined();
    expect(sink.stops).toEqual([]);
  });

  it('ошибка условия 1/0 не останавливает и не создаёт стоп-исключение', () => {
    const { sink, controller, execute, ctx } = setup();
    const reached: string[] = [];
    ctx.register('Отметить', () => {
      reached.push('конец');
      return undefined;
    });
    const source = ['А = 1;', 'Отметить();'].join('\n');
    controller.setBreakpoints(SOURCE_ID, [{ line: 1, condition: '1/0' }]);

    const returned = execute(source);

    expect(returned).toBeUndefined();
    expect(sink.stops).toEqual([]);
    expect(sink.outputs.some((text) => text.includes('Ошибка условия брейкпоинта'))).toBe(true);
    expect(reached).toEqual(['конец']);
  });

  it('ошибка внутри метода условия не создаёт стоп-исключение', () => {
    const { sink, controller, execute, ctx } = setup();
    const reached: string[] = [];
    ctx.register('Отметить', () => {
      reached.push('конец');
      return undefined;
    });
    const source = [
      'Процедура Сломать()', // 1
      '  А = 1 / 0;', // 2
      'КонецПроцедуры', // 3
      'Б = 1;', // 4
      'Отметить();', // 5
    ].join('\n');
    controller.setBreakpoints(SOURCE_ID, [{ line: 4, condition: 'Сломать()' }]);

    const returned = execute(source);

    expect(returned).toBeUndefined();
    expect(sink.stops).toEqual([]);
    expect(sink.outputs.some((text) => text.includes('Ошибка условия брейкпоинта'))).toBe(true);
    expect(reached).toEqual(['конец']);
  });
});

describe('DebugController: пауза, останов и жизненный цикл', () => {
  it('pause останавливает исполнение внутри цикла', async () => {
    const { sink, controller, execute } = setup();
    const loop = [
      'Сч = 0;',
      'Пока Сч < 100 Цикл',
      '  Сч = Сч + 1;',
      '  Приостановить(0);',
      'КонецЦикла;',
    ].join('\n');

    const returned = execute(loop);
    expect(isThenable(returned)).toBe(true);
    controller.requestPause();

    const stop = await sink.nextStop();
    expect(stop.reason).toBe('pause');
    // Остановка случилась на операторе внутри цикла, а не до него.
    expect(stop.frames[0]!.line).toBeGreaterThanOrEqual(2);

    controller.resume('continue');
    await returned;
  });

  it('pause срабатывает в плотном цикле (slicer уступает хост)', async () => {
    const { sink, controller, execute } = setup();
    // Цикл длится заметно дольше кванта slicer (~10 мс), поэтому `run` вернёт Promise.
    const loop = [
      'Сч = 0;',
      'Пока Сч < 200000 Цикл',
      '  Сч = Сч + 1;',
      'КонецЦикла;',
    ].join('\n');

    const returned = execute(loop);
    expect(isThenable(returned)).toBe(true);
    controller.requestPause();

    const stop = await sink.nextStop();
    expect(stop.reason).toBe('pause');
    expect(stop.frames[0]!.line).toBeGreaterThanOrEqual(2);

    controller.stop();
    await returned;
  });

  it('stop снимает гейт: промис run не висит', async () => {
    const { sink, controller, execute } = setup();
    controller.setBreakpoints(SOURCE_ID, [{ line: 2 }]);

    const returned = execute(NESTED);
    await sink.nextStop();

    controller.stop();
    expect(controller.enabled).toBe(false);
    expect(sink.terminatedCalled).toBe(true);
    // Если гейт не снят, await зависнет до таймаута Vitest.
    await returned;

    controller.resume('continue');
    expect(sink.stops.length).toBe(1);
  });

  it('stopOnEntry останавливает на первом операторе с reason entry', async () => {
    const { sink, controller, execute } = setup({ stopOnEntry: true });
    const returned = execute('А = 1;\nБ = 2;');

    const stop = await sink.nextStop();
    expect(stop.reason).toBe('entry');
    expect(stop.frames.map((frame) => [frame.method, frame.line])).toEqual([['<модуль>', 1]]);

    controller.resume('continue');
    await returned;
  });

  it('брейкпоинт на неисполняемой строке не срабатывает и не ломает sync-путь', () => {
    const { sink, controller, execute } = setup();
    // `Перем` верхнего уровня не исполняется как оператор.
    controller.setBreakpoints(SOURCE_ID, [{ line: 1 }]);

    const returned = execute('Перем А;\nА = 1;');

    expect(returned).toBeUndefined();
    expect(sink.stops).toEqual([]);
    expect(controller.threads().length).toBe(1);
  });

  it('новый BSL-вход на паузе гейтится и не выводит до resume', async () => {
    const sink = new FakeSink();
    const controller = new DebugController(sink);
    const ctx = createGlobalContext();
    ctx.debug = controller;
    controller.setBreakpoints(SOURCE_ID, [{ line: 2 }]);

    const returned = run(NESTED, ctx, { sourceId: SOURCE_ID });
    expect(isThenable(returned)).toBe(true);
    expect((await sink.nextStop()).reason).toBe('breakpoint');

    const reached: string[] = [];
    ctx.register('Отметить', () => {
      reached.push('handler');
      return undefined;
    });
    // DOM-обработчик того же блока идёт через executeInModule на том же интерпретаторе.
    const interp = (ctx as GlobalContext).currentInterpreter;
    expect(interp).toBeDefined();
    const handler = interp!.executeInModule('Отметить();');
    expect(isThenable(handler)).toBe(true);
    // Второй stopped не нужен: поток уже на паузе, его просто держат гейтом.
    expect(sink.stops.length).toBe(1);
    expect(reached).toEqual([]);

    controller.resume('continue');
    await handler;
    await returned;
    expect(reached).toEqual(['handler']);
  });

  it('поток фонового задания виден в threads() и stackTrace()', async () => {
    const { sink, controller, execute } = setup();
    const source = [
      'Процедура ВЗадании() Экспорт', // 1
      '  А = 1;', // 2
      'КонецПроцедуры', // 3
      'Задание = ФоновыеЗадания.Выполнить(ЭтотОбъект, "ВЗадании");', // 4
      'Задание.ОжидатьЗавершения();', // 5
    ].join('\n');
    controller.setBreakpoints(SOURCE_ID, [{ line: 2 }]);

    const returned = execute(source);
    expect(isThenable(returned)).toBe(true);

    const stop = await sink.nextStop();
    expect(stop.threadId).toBeGreaterThanOrEqual(2);

    const threads = controller.threads();
    expect(threads.map((thread) => thread.id)).toEqual([1, 2]);
    expect(threads[0]!.name).toContain('Главный');
    expect(threads[1]!.name).toContain('Фоновое задание');
    expect(controller.stackTrace(stop.threadId).map((frame) => frame.method)).toEqual([
      'ВЗадании',
    ]);

    controller.resume('continue');
    await returned;
  });
});

describe('DebugController: глубина Попытка наследуется кадрами (W4-задел)', () => {
  const BROKEN = ['Процедура Сломать()', '  А = 1 / 0;', 'КонецПроцедуры'];

  /** Глубина `Попытка` в кадре `Сломать` на операторе с ошибкой. */
  async function failureFrame(tail: string[]): Promise<{ depths: number[]; shared: boolean[] }> {
    const { controller, execute } = setup();
    // Тест наблюдает глубину guard, а не стопы: иначе uncaught-ошибка встанет на паузу.
    controller.setExceptionFilters([]);
    const depths: number[] = [];
    const shared: boolean[] = [];
    // Хук контроллера — единственная точка, где виден кадр до броска ошибки.
    const original = controller.onStatement.bind(controller);
    controller.onStatement = (interp, frame, line) => {
      if (frame.method === 'Сломать') {
        depths.push(frame.guard.tryDepth);
        // Кадр метода и кадр модуля — один invocation, значит один guard.
        shared.push(frame.guard === interp.activeFrames[0]?.guard);
      }
      return original(interp, frame, line);
    };
    try {
      await execute([...BROKEN, ...tail].join('\n'));
    } catch {
      // Без внешней Попытки ошибка всплывает — для теста это ожидаемо.
    }
    return { depths, shared };
  }

  it('кадр вложенного метода видит Попытку вызывающего', async () => {
    const { depths, shared } = await failureFrame([
      'Попытка',
      '  Сломать();',
      'Исключение',
      'КонецПопытки;',
    ]);

    expect(depths).toEqual([1]);
    expect(shared).toEqual([true]);
  });

  it('без внешней Попытки глубина в кадре ошибки нулевая', async () => {
    const { depths } = await failureFrame(['Сломать();']);

    expect(depths).toEqual([0]);
  });
});

describe('DebugController: logpoints (W4)', () => {
  it('печатает интерполированное сообщение и не останавливает', () => {
    const { sink, controller, execute } = setup();
    controller.setBreakpoints(SOURCE_ID, [{ line: 3, logMessage: 'А={А}, Б={Б}' }]);

    const returned = execute(NESTED);

    expect(returned).toBeUndefined();
    expect(sink.stops).toEqual([]);
    expect(sink.outputs).toEqual(['А=1, Б=Неопределено']);
  });

  it('ложное условие logpoint подавляет печать', () => {
    const { sink, controller, execute } = setup();
    controller.setBreakpoints(SOURCE_ID, [
      { line: 3, condition: 'Ложь', logMessage: 'печатать нельзя' },
    ]);

    const returned = execute(NESTED);

    expect(returned).toBeUndefined();
    expect(sink.stops).toEqual([]);
    expect(sink.outputs).toEqual([]);
  });

  it('ошибка интерполяции уходит в output и не ломает исполнение', () => {
    const { sink, controller, execute } = setup();
    controller.setBreakpoints(SOURCE_ID, [{ line: 3, logMessage: 'значение: {НетТакого}' }]);

    const returned = execute(NESTED);

    expect(returned).toBeUndefined();
    expect(sink.stops).toEqual([]);
    expect(sink.outputs.some((text) => text.includes('Ошибка logpoint'))).toBe(true);
    expect(sink.outputs.some((text) => text === 'значение: ')).toBe(true);
  });

  it('ошибка внутри метода интерполяции не создаёт стоп-исключение', () => {
    const { sink, controller, execute, ctx } = setup();
    const reached: string[] = [];
    ctx.register('Отметить', () => {
      reached.push('конец');
      return undefined;
    });
    const source = [
      'Процедура Сломать()', // 1
      '  А = 1 / 0;', // 2
      'КонецПроцедуры', // 3
      'Б = 1;', // 4
      'Отметить();', // 5
    ].join('\n');
    controller.setBreakpoints(SOURCE_ID, [{ line: 4, logMessage: 'значение: {Сломать()}' }]);

    const returned = execute(source);

    expect(returned).toBeUndefined();
    expect(sink.stops).toEqual([]);
    expect(sink.outputs.some((text) => text.includes('Ошибка logpoint'))).toBe(true);
    expect(reached).toEqual(['конец']);
  });
});

describe('DebugController: фильтры исключений (W4)', () => {
  const UNCAUGHT = [
    'Процедура Сломать()', // 1
    '  А = 1 / 0;', // 2
    'КонецПроцедуры', // 3
    'Сломать();', // 4
  ].join('\n');

  const CAUGHT = [
    'Процедура Сломать()', // 1
    '  А = 1 / 0;', // 2
    'КонецПроцедуры', // 3
    'Попытка', // 4
    '  Сломать();', // 5
    'Исключение', // 6
    '  Текст = ОписаниеОшибки();', // 7
    'КонецПопытки;', // 8
  ].join('\n');

  const RETHROW = [
    'Попытка', // 1
    '  ВызватьИсключение "сбой";', // 2
    'Исключение', // 3
    '  ВызватьИсключение;', // 4
    'КонецПопытки;', // 5
  ].join('\n');

  it('необработанное исключение останавливает с reason exception и описанием', async () => {
    const { sink, controller, execute } = setup();

    const returned = execute(UNCAUGHT);
    expect(isThenable(returned)).toBe(true);

    const stop = await sink.nextStop();
    expect(stop.reason).toBe('exception');
    expect(stop.description).toBe('Деление на ноль');
    expect(stop.frames.map((frame) => [frame.method, frame.line])).toEqual([
      ['Сломать', 2],
      ['<модуль>', 4],
    ]);

    controller.resume('continue');
    await expect(returned).rejects.toThrow('Деление на ноль');
    // Ошибка всплывает через внешние кадры, но второй остановки быть не должно.
    expect(sink.stops.length).toBe(1);
  });

  it('исключение внутри Попытки не останавливает (uncaught)', () => {
    const { sink, controller, execute } = setup();

    const returned = execute(CAUGHT);

    expect(returned).toBeUndefined();
    expect(sink.stops).toEqual([]);
  });

  it('перевыброс останавливает ровно один раз', async () => {
    const { sink, controller, execute } = setup();

    const returned = execute(RETHROW);
    expect(isThenable(returned)).toBe(true);

    const stop = await sink.nextStop();
    expect(stop.reason).toBe('exception');
    expect(stop.description).toBe('сбой');
    expect(stop.frames[0]).toMatchObject({ method: '<модуль>', line: 4 });

    controller.resume('continue');
    await expect(returned).rejects.toThrow('сбой');
    expect(sink.stops.length).toBe(1);
  });

  it('фильтр all останавливает и внутри Попытки', async () => {
    const { sink, controller, execute } = setup();
    controller.setExceptionFilters(['all']);

    const returned = execute(CAUGHT);
    expect(isThenable(returned)).toBe(true);

    const stop = await sink.nextStop();
    expect(stop.reason).toBe('exception');
    expect(stop.description).toBe('Деление на ноль');
    expect(stop.frames[0]).toMatchObject({ method: 'Сломать', line: 2 });

    controller.resume('continue');
    await returned;
    expect(sink.stops.length).toBe(1);
  });

  it('ошибка evaluate не создаёт стоп-исключение', async () => {
    const { sink, controller, execute } = setup();
    // Объявления методов — до исполняемого кода, поэтому NESTED сдвинут на 3 строки.
    const source = ['Процедура Упс()', '  ВызватьИсключение "упс";', 'КонецПроцедуры', NESTED].join(
      '\n',
    );
    controller.setBreakpoints(SOURCE_ID, [{ line: 5 }]);

    const returned = execute(source);
    const stop = await sink.nextStop();
    expect(stop.reason).toBe('breakpoint');

    // Ошибка вычисления в паузе — ответ DAP, а не остановка отладчика.
    expect(() => controller.evaluate(0, 'Упс()')).toThrow('упс');
    expect(sink.stops.length).toBe(1);

    controller.resume('continue');
    await returned;
  });
});

describe('DebugController: поток через границу модулей (W2-задел)', () => {
  it('брейкпоинт в импортированном модуле остаётся в главном потоке', async () => {
    const sink = new FakeSink();
    const controller = new DebugController(sink);
    const ctx = createGlobalContext();
    ctx.debug = controller;
    const moduleId = '/app/Модуль.osjs';
    controller.setBreakpoints(moduleId, [{ line: 2 }]);

    const returned = run(['#Использовать "Модуль.osjs"', 'Модуль.Работа();'].join('\n'), ctx, {
      path: '/app/main.osjs',
      sourceId: '/app/main.osjs',
      basePath: '/app/main.osjs',
      modules: new Map([
        [moduleId, ['Процедура Работа() Экспорт', '  А = 1;', 'КонецПроцедуры'].join('\n')],
      ]),
      resolve: defaultResolve,
    });

    const stop = await sink.nextStop();
    try {
      expect(stop.threadId).toBe(1);
      expect(controller.threads().map((thread) => thread.id)).toEqual([1]);
      expect(controller.stackTrace(1).map((frame) => [frame.sourceId, frame.method])).toEqual([
        [moduleId, 'Работа'],
        ['/app/main.osjs', '<модуль>'],
      ]);
    } finally {
      controller.resume('continue');
    }
    await returned;
  });
});

describe('DebugController: логические потоки (W5)', () => {
  it('threads() показывает главный поток до первого останова', () => {
    const { controller } = setup();

    expect(controller.threads()).toEqual([
      { id: 1, name: 'Главный поток', state: 'running' },
    ]);
  });

  it('первый корневой интерпретатор — поток 1, фоновое задание — поток 2', async () => {
    const { sink, controller, execute } = setup();
    controller.setBreakpoints(SOURCE_ID, [{ line: 2 }]);

    const returned = execute(NESTED);
    const stop = await sink.nextStop();
    expect(stop.threadId).toBe(1);
    expect(controller.threads().map((thread) => thread.id)).toEqual([1]);

    controller.resume('continue');
    await returned;
  });

  it('pause останавливает все логические потоки, resume продолжает', async () => {
    const { sink, controller, execute } = setup();
    const source = [
      'Процедура ВЗадании() Экспорт', // 1
      '  Сч = 0;', // 2
      '  Пока Сч < 5 Цикл', // 3
      '    Сч = Сч + 1;', // 4
      '    Приостановить(1);', // 5
      '  КонецЦикла;', // 6
      'КонецПроцедуры', // 7
      'Задание = ФоновыеЗадания.Выполнить(ЭтотОбъект, "ВЗадании");', // 8
      'Сч = 0;', // 9
      'Пока Сч < 5 Цикл', // 10
      '  Сч = Сч + 1;', // 11
      '  Приостановить(1);', // 12
      'КонецЦикла;', // 13
    ].join('\n');

    const returned = execute(source);
    expect(isThenable(returned)).toBe(true);
    controller.requestPause();

    const stop = await sink.nextStop();
    expect(stop.reason).toBe('pause');

    // Второй поток встаёт на ближайшем операторе и гейтится без повторного stopped.
    await waitUntil(() => controller.threads().every((thread) => thread.state === 'paused'));
    const threads = controller.threads();
    expect(threads.map((thread) => thread.id)).toEqual([1, 2]);
    expect(threads.every((thread) => thread.state === 'paused')).toBe(true);

    controller.resume('continue');
    await returned;
    expect(controller.threads().every((thread) => thread.state === 'running')).toBe(true);
  });

  it('шаг через Ждать/Асинх: stepIn входит в async-метод, next идёт через await', async () => {
    const { sink, controller, execute } = setup();
    const source = readFileSync(resolve('tests/fixtures/debug/async.osjs'), 'utf8');
    controller.setBreakpoints(SOURCE_ID, [{ line: 7 }]);

    const returned = execute(source);
    const first = await sink.nextStop();
    expect(first.reason).toBe('breakpoint');
    expect(first.threadId).toBe(1);
    expect(first.frames.map((frame) => [frame.method, frame.line])).toEqual([['<модуль>', 7]]);

    controller.resume('stepIn');
    const entered = await sink.nextStop();
    expect(entered.reason).toBe('step');
    expect(entered.frames.map((frame) => [frame.method, frame.line])).toEqual([
      ['Подождать', 3],
      ['<модуль>', 7],
    ]);

    controller.resume('next');
    const afterAwait = await sink.nextStop();
    expect(afterAwait.frames.map((frame) => [frame.method, frame.line])).toEqual([
      ['Подождать', 4],
      ['<модуль>', 7],
    ]);

    controller.resume('next');
    const afterCall = await sink.nextStop();
    expect(afterCall.frames.map((frame) => [frame.method, frame.line])).toEqual([['<модуль>', 8]]);

    controller.resume('continue');
    await returned;
  });
});
