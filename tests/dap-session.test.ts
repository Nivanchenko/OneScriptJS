import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OsjsDebugSession } from '../src/node/debug/session';
import { DapClient, type DapMessage } from './helpers/dap';

/**
 * Интеграция DAP-сессии с движком в одном процессе: `PassThrough`-пара вместо
 * stdio. Контракт — specs/021-debugger/contracts/dap-adapter.md.
 */

const NESTED = resolve('tests/fixtures/debug/nested.osjs');
const LOOP = resolve('tests/fixtures/debug/loop.osjs');
const JOBS = resolve('tests/fixtures/debug/jobs.osjs');

const INITIALIZE_ARGS = {
  clientID: 'vitest',
  adapterID: 'osjs',
  linesStartAt1: true,
  columnsStartAt1: true,
  pathFormat: 'path',
};

interface Harness {
  client: DapClient;
  dispose(): void;
}

interface StoppedBody {
  reason: string;
  threadId: number;
  /** `StoppedEvent` кладёт текст в `text`; `description` — для совместимости. */
  text?: string;
  description?: string;
}

interface StackFrameBody {
  id: number;
  name: string;
  line: number;
  source?: { path?: string; name?: string };
}

interface StackTraceBody {
  stackFrames: StackFrameBody[];
  totalFrames: number;
}

interface ScopesBody {
  scopes: Array<{ name: string; variablesReference: number }>;
}

interface VariablesBody {
  variables: Array<{
    name: string;
    value: string;
    variablesReference: number;
    namedVariables?: number;
    indexedVariables?: number;
  }>;
}

interface EvaluateBody {
  result: string;
  type?: string;
  variablesReference: number;
}

interface BreakpointsBody {
  breakpoints: Array<{ verified: boolean; line?: number }>;
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function connect(): Harness {
  const client = new DapClient();
  client.start(new OsjsDebugSession());
  return { client, dispose: () => client.dispose() };
}

function expectSuccess(response: DapMessage): DapMessage {
  expect(response.success, response.message).toBe(true);
  return response;
}

function messageBody<T>(message: DapMessage): T {
  return message.body as unknown as T;
}

async function initialize(client: DapClient): Promise<DapMessage> {
  return expectSuccess(await client.sendRequest('initialize', INITIALIZE_ARGS));
}

async function launch(
  client: DapClient,
  program: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  expectSuccess(await client.sendRequest('launch', { program, cwd: process.cwd(), ...extra }));
  await client.waitForEvent('initialized');
}

async function start(client: DapClient, program: string, extra: Record<string, unknown> = {}): Promise<void> {
  await initialize(client);
  await launch(client, program, extra);
}

async function setBreakpoints(
  client: DapClient,
  path: string,
  lines: number[],
): Promise<Array<{ verified: boolean; line?: number }>> {
  return setBreakpointSpecs(
    client,
    path,
    lines.map((line) => ({ line })),
  );
}

async function setBreakpointSpecs(
  client: DapClient,
  path: string,
  breakpoints: Array<{ line: number; condition?: string; logMessage?: string }>,
): Promise<Array<{ verified: boolean; line?: number }>> {
  const response = expectSuccess(
    await client.sendRequest('setBreakpoints', {
      source: { path },
      breakpoints,
    }),
  );
  return messageBody<BreakpointsBody>(response).breakpoints;
}

async function setExceptionBreakpoints(client: DapClient, filters: string[]): Promise<void> {
  expectSuccess(await client.sendRequest('setExceptionBreakpoints', { filters }));
}

async function configurationDone(client: DapClient): Promise<void> {
  expectSuccess(await client.sendRequest('configurationDone'));
}

async function stoppedBody(client: DapClient): Promise<StoppedBody> {
  return messageBody<StoppedBody>(await client.waitForEvent('stopped'));
}

async function topFrame(client: DapClient, threadId = 1): Promise<StackFrameBody> {
  const response = expectSuccess(await client.sendRequest('stackTrace', { threadId }));
  return messageBody<StackTraceBody>(response).stackFrames[0]!;
}

function makeProgram(name: string, source: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'osjs-dap-'));
  tempDirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, source);
  return path;
}

describe('DAP: initialize и launch', () => {
  it('объявляет capabilities контракта и фильтры исключений', async () => {
    const harness = connect();
    try {
      const response = await initialize(harness.client);
      expect(response.body).toMatchObject({
        supportsConfigurationDoneRequest: true,
        supportsEvaluateForHovers: true,
        supportsConditionalBreakpoints: true,
        supportsLogPoints: true,
        supportsTerminateRequest: false,
        supportsSetVariable: false,
        supportsFunctionBreakpoints: false,
        supportsRestartRequest: false,
      });
      const filters = (response.body?.exceptionBreakpointFilters ?? []) as Array<{
        filter: string;
        label: string;
        default?: boolean;
      }>;
      expect(filters.map((filter) => filter.filter)).toEqual(['uncaught', 'all']);
      expect(filters[0]).toMatchObject({ default: true });
      expect(filters[0]!.label).toContain('исключен');
    } finally {
      harness.dispose();
    }
  });

  it('отклоняет launch без program и с несуществующим файлом', async () => {
    const harness = connect();
    try {
      await initialize(harness.client);
      const missing = await harness.client.sendRequest('launch', { program: '' });
      expect(missing.success).toBe(false);
      const absent = await harness.client.sendRequest('launch', {
        program: join(tmpdir(), 'osjs-does-not-exist.osjs'),
      });
      expect(absent.success).toBe(false);
    } finally {
      harness.dispose();
    }
  });

  it('stopOnEntry останавливает на первом исполняемом операторе', async () => {
    const harness = connect();
    try {
      await start(harness.client, NESTED, { stopOnEntry: true });
      await configurationDone(harness.client);
      const stopped = await stoppedBody(harness.client);
      expect(stopped).toMatchObject({ reason: 'entry', threadId: 1 });
      // Первый исполняемый оператор модуля — вызов Внешняя(), а не тело метода.
      expect((await topFrame(harness.client)).line).toBe(12);
      expectSuccess(await harness.client.sendRequest('disconnect', {}));
    } finally {
      harness.dispose();
    }
  });
});

describe('DAP: launch-сценарий', () => {
  it('останавливается на брейкпоинте и отдаёт потоки, кадры, области и переменные', async () => {
    const harness = connect();
    try {
      await start(harness.client, NESTED);
      expect(await setBreakpoints(harness.client, NESTED, [4])).toEqual([
        expect.objectContaining({ verified: true, line: 4 }),
      ]);
      await configurationDone(harness.client);

      const stopped = await stoppedBody(harness.client);
      expect(stopped).toMatchObject({ reason: 'breakpoint', threadId: 1 });

      const threads = expectSuccess(await harness.client.sendRequest('threads'));
      expect(messageBody<{ threads: Array<{ id: number; name: string }> }>(threads).threads).toEqual([
        expect.objectContaining({ id: 1 }),
      ]);

      const stackResponse = expectSuccess(
        await harness.client.sendRequest('stackTrace', { threadId: 1 }),
      );
      const stack = messageBody<StackTraceBody>(stackResponse);
      expect(stack.totalFrames).toBe(3);
      expect(stack.stackFrames.map((frame) => [frame.name, frame.line])).toEqual([
        ['Внутренняя', 4],
        ['Внешняя', 8],
        ['<модуль>', 12],
      ]);
      expect(stack.stackFrames[0]!.source?.path).toBe(NESTED);

      const frameId = stack.stackFrames[0]!.id;
      const scopesResponse = expectSuccess(
        await harness.client.sendRequest('scopes', { frameId }),
      );
      const scopes = messageBody<ScopesBody>(scopesResponse).scopes;
      expect(scopes.map((scope) => scope.name)).toEqual(['Локальные', 'Модуль']);
      expect(scopes[0]!.variablesReference).toBeGreaterThan(0);

      const variablesResponse = expectSuccess(
        await harness.client.sendRequest('variables', {
          variablesReference: scopes[0]!.variablesReference,
        }),
      );
      expect(messageBody<VariablesBody>(variablesResponse).variables).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'А', value: '1' })]),
      );

      const evaluated = expectSuccess(
        await harness.client.sendRequest('evaluate', {
          expression: 'А + 1',
          frameId,
          context: 'watch',
        }),
      );
      expect(messageBody<EvaluateBody>(evaluated).result).toBe('2');

      const hover = expectSuccess(
        await harness.client.sendRequest('evaluate', {
          expression: 'НетТакогоИмени',
          frameId,
          context: 'hover',
        }),
      );
      expect(messageBody<EvaluateBody>(hover).result).toBe('err: НетТакогоИмени');

      const failed = await harness.client.sendRequest('evaluate', {
        expression: 'НетТакогоИмени',
        frameId,
        context: 'repl',
      });
      expect(failed.success).toBe(false);

      expectSuccess(await harness.client.sendRequest('next', { threadId: 1 }));
      const stepped = await stoppedBody(harness.client);
      expect(stepped.reason).toBe('step');
      expect((await topFrame(harness.client)).line).toBe(9);

      expectSuccess(await harness.client.sendRequest('continue', { threadId: 1 }));
      const exited = await harness.client.waitForEvent('exited');
      expect(messageBody<{ exitCode: number }>(exited).exitCode).toBe(0);
      await harness.client.waitForEvent('terminated');
    } finally {
      harness.dispose();
    }
  });

  it('stepIn входит во вложенные методы, stepOut возвращается наружу', async () => {
    const harness = connect();
    try {
      await start(harness.client, NESTED);
      expect(await setBreakpoints(harness.client, NESTED, [12])).toEqual([
        expect.objectContaining({ verified: true, line: 12 }),
      ]);
      await configurationDone(harness.client);
      expect((await stoppedBody(harness.client)).reason).toBe('breakpoint');

      expectSuccess(await harness.client.sendRequest('stepIn', { threadId: 1 }));
      await stoppedBody(harness.client);
      expect(await topFrame(harness.client)).toMatchObject({ name: 'Внешняя', line: 8 });

      expectSuccess(await harness.client.sendRequest('stepIn', { threadId: 1 }));
      await stoppedBody(harness.client);
      expect(await topFrame(harness.client)).toMatchObject({ name: 'Внутренняя', line: 3 });

      expectSuccess(await harness.client.sendRequest('stepOut', { threadId: 1 }));
      await stoppedBody(harness.client);
      expect(await topFrame(harness.client)).toMatchObject({ name: 'Внешняя', line: 9 });

      expectSuccess(await harness.client.sendRequest('continue', { threadId: 1 }));
      await harness.client.waitForEvent('terminated');
    } finally {
      harness.dispose();
    }
  });

  it('continue печатает Сообщить в output и завершается с exited(0)', async () => {
    const harness = connect();
    try {
      await start(harness.client, LOOP);
      expect(await setBreakpoints(harness.client, LOOP, [6])).toEqual([
        expect.objectContaining({ verified: true, line: 6 }),
      ]);
      await configurationDone(harness.client);
      await stoppedBody(harness.client);

      const counter = expectSuccess(
        await harness.client.sendRequest('evaluate', { expression: 'Счётчик', context: 'watch' }),
      );
      expect(messageBody<EvaluateBody>(counter).result).toBe('10');

      expectSuccess(await harness.client.sendRequest('continue', { threadId: 1 }));
      await harness.client.waitForEvent('continued');
      const output = await harness.client.waitForEvent('output');
      expect(messageBody<{ category: string; output: string }>(output)).toMatchObject({
        category: 'stdout',
        output: '10\n',
      });
      const exited = await harness.client.waitForEvent('exited');
      expect(messageBody<{ exitCode: number }>(exited).exitCode).toBe(0);
      await harness.client.waitForEvent('terminated');
    } finally {
      harness.dispose();
    }
  });

  it('ошибка скрипта уходит в output(stderr) и exited(1), адаптер жив', async () => {
    const program = makeProgram('boom.osjs', 'ВызватьИсключение "бум";\n');
    const harness = connect();
    try {
      await start(harness.client, program);
      // Клиент отключил остановки на исключениях: ошибка доходит до runLaunch.
      await setExceptionBreakpoints(harness.client, []);
      await configurationDone(harness.client);

      const output = await harness.client.waitForEvent('output');
      expect(messageBody<{ category: string; output: string }>(output)).toMatchObject({
        category: 'stderr',
      });
      expect(messageBody<{ output: string }>(output).output).toContain('бум');
      const exited = await harness.client.waitForEvent('exited');
      expect(messageBody<{ exitCode: number }>(exited).exitCode).toBe(1);
      await harness.client.waitForEvent('terminated');

      const threads = await harness.client.sendRequest('threads');
      expect(threads.success).toBe(true);
    } finally {
      harness.dispose();
    }
  });
});

describe('DAP: исключения и logpoints (W4)', () => {
  it('uncaught останавливает на исключении, continue даёт exited(1)', async () => {
    const program = makeProgram('uncaught.osjs', 'ВызватьИсключение "сбой";\n');
    const harness = connect();
    try {
      await start(harness.client, program);
      await setExceptionBreakpoints(harness.client, ['uncaught']);
      await configurationDone(harness.client);

      const stopped = await stoppedBody(harness.client);
      expect(stopped.reason).toBe('exception');
      expect(stopped.description).toContain('сбой');

      expectSuccess(await harness.client.sendRequest('continue', { threadId: stopped.threadId }));
      const exited = await harness.client.waitForEvent('exited');
      expect(messageBody<{ exitCode: number }>(exited).exitCode).toBe(1);
      await harness.client.waitForEvent('terminated');
    } finally {
      harness.dispose();
    }
  });

  it('исключение внутри Попытки при uncaught не останавливает', async () => {
    const program = makeProgram(
      'caught.osjs',
      ['Попытка', '  ВызватьИсключение "сбой";', 'Исключение', 'КонецПопытки;'].join('\n'),
    );
    const harness = connect();
    try {
      await start(harness.client, program);
      await setExceptionBreakpoints(harness.client, ['uncaught']);
      await configurationDone(harness.client);

      const exited = await harness.client.waitForEvent('exited');
      expect(messageBody<{ exitCode: number }>(exited).exitCode).toBe(0);
      await harness.client.waitForEvent('terminated');
      await expect(harness.client.waitForEvent('stopped', 100)).rejects.toThrow();
    } finally {
      harness.dispose();
    }
  });

  it('logpoint печатает в output и не останавливает', async () => {
    const program = makeProgram('logpoint.osjs', ['А = 1;', 'Б = 2;'].join('\n'));
    const harness = connect();
    try {
      await start(harness.client, program);
      expect(await setBreakpointSpecs(harness.client, program, [{ line: 2, logMessage: 'А={А}' }]))
        .toEqual([expect.objectContaining({ verified: true, line: 2 })]);
      await configurationDone(harness.client);

      const output = await harness.client.waitForEvent('output');
      expect(messageBody<{ category: string; output: string }>(output)).toMatchObject({
        category: 'console',
      });
      expect(messageBody<{ output: string }>(output).output).toContain('А=1');
      const exited = await harness.client.waitForEvent('exited');
      expect(messageBody<{ exitCode: number }>(exited).exitCode).toBe(0);
      await harness.client.waitForEvent('terminated');
      await expect(harness.client.waitForEvent('stopped', 100)).rejects.toThrow();
    } finally {
      harness.dispose();
    }
  });
});

describe('DAP: пауза и disconnect', () => {
  it('pause останавливает долгий цикл, disconnect снимает гейты', async () => {
    const program = makeProgram(
      'long-loop.osjs',
      [
        'Сч = 0;',
        'Пока Сч < 200000 Цикл',
        '  Сч = Сч + 1;',
        'КонецЦикла;',
      ].join('\n'),
    );
    const harness = connect();
    try {
      await start(harness.client, program);
      await configurationDone(harness.client);
      expectSuccess(await harness.client.sendRequest('pause', { threadId: 1 }));

      const stopped = await stoppedBody(harness.client);
      expect(stopped.reason).toBe('pause');
      expect(stopped.threadId).toBe(1);
      const frame = await topFrame(harness.client);
      expect(frame.line).toBeGreaterThanOrEqual(2);

      expectSuccess(await harness.client.sendRequest('disconnect', {}));
      const exited = await harness.client.waitForEvent('exited');
      expect(messageBody<{ exitCode: number }>(exited).exitCode).toBe(0);
      await harness.client.waitForEvent('terminated');
    } finally {
      harness.dispose();
    }
  });
});

describe('DAP: верификация брейкпоинтов по AST', () => {
  it('неисполняемые строки съезжают на ближайший следующий оператор или не верифицируются', async () => {
    const harness = connect();
    try {
      await start(harness.client, NESTED);
      const breakpoints = await setBreakpoints(harness.client, NESTED, [1, 5, 7, 14]);
      expect(breakpoints.map((bp) => [bp.verified, bp.line])).toEqual([
        [true, 3],
        [true, 8],
        [true, 8],
        [false, undefined],
      ]);

      await configurationDone(harness.client);
      expect((await stoppedBody(harness.client)).reason).toBe('breakpoint');
      // Исполнение начинается с вызова Внешняя() (строка 8), затем заходит во Внутреннюю.
      expect((await topFrame(harness.client)).line).toBe(8);
      expectSuccess(await harness.client.sendRequest('continue', { threadId: 1 }));
      await stoppedBody(harness.client);
      expect((await topFrame(harness.client)).line).toBe(3);
      expectSuccess(await harness.client.sendRequest('disconnect', {}));
    } finally {
      harness.dispose();
    }
  });

  it('Перем верхнего уровня не исполняется, а присваивание — да', async () => {
    const program = makeProgram('vars.osjs', 'Перем А;\nА = 1;\n');
    const harness = connect();
    try {
      await start(harness.client, program);
      expect(await setBreakpoints(harness.client, program, [1])).toEqual([
        expect.objectContaining({ verified: true, line: 2 }),
      ]);
      await configurationDone(harness.client);
      await stoppedBody(harness.client);
      expect((await topFrame(harness.client)).line).toBe(2);
      expectSuccess(await harness.client.sendRequest('disconnect', {}));
    } finally {
      harness.dispose();
    }
  });

  it('Иначе не исполняется: брейкпоинт встаёт на оператор ветки', async () => {
    const program = makeProgram(
      'else.osjs',
      ['Если Ложь Тогда', '  А = 1;', 'Иначе', '  А = 2;', 'КонецЕсли;'].join('\n'),
    );
    const harness = connect();
    try {
      await start(harness.client, program);
      expect(await setBreakpoints(harness.client, program, [3])).toEqual([
        expect.objectContaining({ verified: true, line: 4 }),
      ]);
      await configurationDone(harness.client);
      await stoppedBody(harness.client);
      expect((await topFrame(harness.client)).line).toBe(4);
      expectSuccess(await harness.client.sendRequest('disconnect', {}));
    } finally {
      harness.dispose();
    }
  });
});

describe('DAP: потоки фоновых заданий (W5)', () => {
  it('до останова виден главный поток, остановка в задании — поток 2 со своим стеком', async () => {
    const harness = connect();
    const { client } = harness;
    try {
      await start(client, JOBS);

      const before = expectSuccess(await client.sendRequest('threads'));
      expect(
        messageBody<{ threads: Array<{ id: number; name: string }> }>(before).threads.map(
          (thread) => [thread.id, thread.name],
        ),
      ).toEqual([[1, 'Главный поток']]);

      expect(await setBreakpoints(client, JOBS, [3])).toEqual([
        expect.objectContaining({ verified: true, line: 3 }),
      ]);
      await configurationDone(client);

      const stopped = await stoppedBody(client);
      expect(stopped).toMatchObject({ reason: 'breakpoint', threadId: 2 });

      const threads = expectSuccess(await client.sendRequest('threads'));
      expect(
        messageBody<{ threads: Array<{ id: number; name: string }> }>(threads).threads.map(
          (thread) => [thread.id, thread.name],
        ),
      ).toEqual([
        [1, 'Главный поток'],
        [2, 'Фоновое задание 1'],
      ]);

      const stack = messageBody<StackTraceBody>(
        expectSuccess(await client.sendRequest('stackTrace', { threadId: 2 })),
      );
      expect(stack.totalFrames).toBe(1);
      expect(stack.stackFrames[0]).toMatchObject({ name: 'ВЗадании', line: 3 });
      expect(stack.stackFrames[0]!.source?.path).toBe(JOBS);

      expectSuccess(await client.sendRequest('continue', { threadId: 2 }));
      const exited = await client.waitForEvent('exited');
      expect(messageBody<{ exitCode: number }>(exited).exitCode).toBe(0);
      await client.waitForEvent('terminated');
    } finally {
      harness.dispose();
    }
  });
});
