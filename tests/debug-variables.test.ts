import { describe, expect, it } from 'vitest';
import { run } from '../src/runtime/runner';
import type { MaybePromise } from '../src/runtime/async';
import { isThenable } from '../src/runtime/async';
import { createGlobalContext } from '../src/stdlib/global-context';
import { DebugController } from '../src/runtime/debug/controller';
import type {
  DebugSink,
  FrameInfo,
  StopReason,
  ThreadInfo,
  VariableInfo,
} from '../src/runtime/debug/controller';

/**
 * Переменные/evaluate отладчика: области видимости, ленивые дети BSL-коллекций,
 * защита от циклов и вычисление выражения в остановленном кадре.
 */

const SOURCE_ID = 'vars.osjs';

interface StopEvent {
  threadId: number;
  reason: StopReason;
  frames: FrameInfo[];
}

class FakeSink implements DebugSink {
  readonly stops: StopEvent[] = [];
  private consumed = 0;
  private readonly waiters: ((event: StopEvent) => void)[] = [];

  stopped(threadId: number, reason: StopReason, frames: FrameInfo[]): void {
    const event: StopEvent = { threadId, reason, frames };
    this.stops.push(event);
    for (const waiter of this.waiters.splice(0)) waiter(event);
  }

  continued(): void {}

  output(): void {}

  threads(_threads: ThreadInfo[]): void {}

  terminated(): void {}

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
  execute(source: string): MaybePromise<void>;
}

function setup(): Harness {
  const sink = new FakeSink();
  const controller = new DebugController(sink);
  const ctx = createGlobalContext();
  ctx.debug = controller;
  return {
    sink,
    controller,
    execute: (source) => run(source, ctx, { sourceId: SOURCE_ID }),
  };
}

const LOCALS = [
  'Перем Модульная;', // 1
  'Процедура Проверить()', // 2
  '  Локальная = "текст";', // 3
  '  Число = 42;', // 4
  '  Массив = Новый Массив;', // 5
  '  Массив.Добавить(1);', // 6
  '  Массив.Добавить(2);', // 7
  '  Структура = Новый Структура("Ключ", "Значение");', // 8
  '  Соответствие = Новый Соответствие;', // 9
  '  Соответствие.Вставить("к", 5);', // 10
  '  Стоп = 1;', // 11
  'КонецПроцедуры', // 12
  'Модульная = 10;', // 13
  'Проверить();', // 14
].join('\n');

/** Синхронный результат evaluate: асинхронность здесь не ожидается. */
function evaluateSync(
  controller: DebugController,
  frameId: number,
  expression: string,
): VariableInfo {
  const result = controller.evaluate(frameId, expression);
  if (isThenable(result)) throw new Error('evaluate неожиданно вернул Promise');
  return result;
}

function findVariable(variables: VariableInfo[], name: string): VariableInfo {
  const found = variables.find((variable) => variable.name === name);
  if (found === undefined) {
    throw new Error(`Переменная '${name}' не найдена: ${variables.map((v) => v.name).join(', ')}`);
  }
  return found;
}

describe('DebugController: области и переменные', () => {
  it('scopes отдают локальную и модульную области', async () => {
    const { sink, controller, execute } = setup();
    controller.setBreakpoints(SOURCE_ID, [{ line: 11 }]);

    const returned = execute(LOCALS);
    const stop = await sink.nextStop();
    const scopes = controller.scopes(stop.frames[0]!.id);

    expect(scopes.map((scope) => scope.name)).toEqual(['Локальные', 'Модуль']);
    for (const scope of scopes) expect(scope.variablesReference).toBeGreaterThan(0);

    const moduleVariables = controller.variables(scopes[1]!.variablesReference);
    expect(moduleVariables.map((variable) => [variable.name, variable.value])).toContainEqual([
      'Модульная',
      '10',
    ]);

    controller.resume('continue');
    await returned;
  });

  it('примитивы отдаются без variablesReference, коллекции — с ленивыми детьми', async () => {
    const { sink, controller, execute } = setup();
    controller.setBreakpoints(SOURCE_ID, [{ line: 11 }]);

    const returned = execute(LOCALS);
    const stop = await sink.nextStop();
    const localScope = controller.scopes(stop.frames[0]!.id)[0]!;
    const locals = controller.variables(localScope.variablesReference);

    const local = findVariable(locals, 'Локальная');
    expect(local).toMatchObject({ value: 'текст', type: 'Строка', variablesReference: 0 });
    const number = findVariable(locals, 'Число');
    expect(number).toMatchObject({ value: '42', type: 'Число', variablesReference: 0 });

    const array = findVariable(locals, 'Массив');
    expect(array.type).toBe('Массив');
    expect(array.variablesReference).toBeGreaterThan(0);
    expect(
      controller
        .variables(array.variablesReference)
        .map((variable) => [variable.name, variable.value]),
    ).toEqual([
      ['[0]', '1'],
      ['[1]', '2'],
    ]);

    const structure = findVariable(locals, 'Структура');
    expect(structure.type).toBe('Структура');
    expect(structure.variablesReference).toBeGreaterThan(0);
    expect(
      controller
        .variables(structure.variablesReference)
        .map((variable) => [variable.name, variable.value]),
    ).toEqual([['ключ', 'Значение']]);

    const map = findVariable(locals, 'Соответствие');
    expect(map.type).toBe('Соответствие');
    expect(map.variablesReference).toBeGreaterThan(0);
    expect(
      controller
        .variables(map.variablesReference)
        .map((variable) => [variable.name, variable.value]),
    ).toEqual([
      ['[0].Ключ', 'к'],
      ['[0].Значение', '5'],
    ]);

    controller.resume('continue');
    await returned;
  });

  it('ссылка на себя не раскручивается бесконечно (защита от циклов)', async () => {
    const { sink, controller, execute } = setup();
    const source = [
      'Массив = Новый Массив;', // 1
      'Массив.Добавить(Массив);', // 2
      'Стоп = 1;', // 3
    ].join('\n');
    controller.setBreakpoints(SOURCE_ID, [{ line: 3 }]);

    const returned = execute(source);
    const stop = await sink.nextStop();
    const localScope = controller.scopes(stop.frames[0]!.id)[0]!;
    const array = findVariable(
      controller.variables(localScope.variablesReference),
      'Массив',
    );
    expect(array.variablesReference).toBeGreaterThan(0);

    const children = controller.variables(array.variablesReference);
    expect(children.map((variable) => variable.name)).toEqual(['[0]']);
    // Ребёнок — тот же массив: его собственные дети уже не раскручиваются.
    const selfChild = children[0]!;
    expect(selfChild.variablesReference).toBe(0);

    controller.resume('continue');
    await returned;
  });
});

describe('DebugController: evaluate в остановленном кадре', () => {
  it('видит локальные и модульные переменные, ошибка не ломает сессию', async () => {
    const { sink, controller, execute } = setup();
    controller.setBreakpoints(SOURCE_ID, [{ line: 11 }]);

    const returned = execute(LOCALS);
    const stop = await sink.nextStop();
    const frameId = stop.frames[0]!.id;

    const local = evaluateSync(controller, frameId, 'Локальная + "!"');
    expect(local).toMatchObject({ name: 'Локальная + "!"', value: 'текст!', type: 'Строка' });
    expect(local.variablesReference).toBe(0);

    const moduleValue = evaluateSync(controller, frameId, 'Модульная');
    expect(moduleValue.value).toBe('10');

    expect(() => controller.evaluate(frameId, 'НетТакогоИмени')).toThrow();

    const again = evaluateSync(controller, frameId, 'Число + 1');
    expect(again).toMatchObject({ value: '43', type: 'Число' });

    // Сессия и исполнение живы: продолжаем до конца.
    controller.resume('continue');
    await returned;
  });
});
