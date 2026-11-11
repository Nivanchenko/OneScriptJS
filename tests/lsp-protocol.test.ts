import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createConnection,
  ProposedFeatures,
} from 'vscode-languageserver/node';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node';
import type { PublishDiagnosticsParams } from 'vscode-languageserver';
import { registerHandlers } from '../src/lsp/server';

interface Pair {
  client: ReturnType<typeof createMessageConnection>;
  dispose(): void;
}

/** Поднимает сервер и клиент LSP в одном процессе поверх PassThrough-стримов. */
function createPair(): Pair {
  const toServer = new PassThrough();
  const toClient = new PassThrough();
  const server = createConnection(ProposedFeatures.all, toServer, toClient);
  registerHandlers(server);
  server.listen();

  const client = createMessageConnection(
    new StreamMessageReader(toClient),
    new StreamMessageWriter(toServer),
  );
  client.listen();
  return {
    client,
    dispose: () => {
      client.dispose();
      server.dispose();
    },
  };
}

interface InitResult {
  capabilities: {
    positionEncoding?: string;
    textDocumentSync?: number | { change?: number };
    completionProvider?: unknown;
    hoverProvider?: unknown;
    documentSymbolProvider?: unknown;
    definitionProvider?: unknown;
    semanticTokensProvider?: { full?: boolean | object };
    diagnosticProvider?: unknown;
  };
}

async function initialize(client: Pair['client']): Promise<InitResult> {
  const result = await client.sendRequest('initialize', {
    processId: process.pid,
    rootUri: null,
    capabilities: {},
  });
  client.sendNotification('initialized', {});
  return result as InitResult;
}

/** Ждёт следующую публикацию диагностик (с таймаутом). */
function nextDiagnostics(
  client: Pair['client'],
): Promise<PublishDiagnosticsParams> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('нет publishDiagnostics')), 3000);
    client.onNotification('textDocument/publishDiagnostics', (params: PublishDiagnosticsParams) => {
      clearTimeout(timer);
      resolve(params);
    });
  });
}

function openDoc(
  client: Pair['client'],
  uri: string,
  text: string,
  languageId = 'osjs',
  version = 1,
): void {
  client.sendNotification('textDocument/didOpen', {
    textDocument: { uri, languageId, version, text },
  });
}

function changeDoc(client: Pair['client'], uri: string, text: string, version: number): void {
  client.sendNotification('textDocument/didChange', {
    textDocument: { uri, version },
    contentChanges: [{ text }],
  });
}

const BROKEN = 'Процедура Тест()\n  А = 1 +;\n  Б = 2 3;\n  В = ;\nКонецПроцедуры\n';

describe('LSP-протокол (in-process)', () => {
  let pair: Pair | undefined;
  afterEach(() => {
    pair?.dispose();
    pair = undefined;
  });

  it('initialize объявляет только реализованные возможности', async () => {
    pair = createPair();
    const init = await initialize(pair.client);
    const caps = init.capabilities;
    expect(caps.positionEncoding).toBe('utf-16');
    const sync = caps.textDocumentSync;
    const change = typeof sync === 'number' ? sync : sync?.change;
    expect(change).toBe(1); // Full
    expect(caps.completionProvider).toBeTruthy();
    expect(caps.hoverProvider).toBe(true);
    expect(caps.documentSymbolProvider).toBe(true);
    expect(caps.definitionProvider).toBe(true);
    expect(caps.semanticTokensProvider?.full).toBeTruthy();
    expect(caps.diagnosticProvider).toBeUndefined(); // push, не pull
  });

  it('публикует все ошибки файла с версией и диапазонами', async () => {
    pair = createPair();
    await initialize(pair.client);
    const uri = 'file:///app/broken.osjs';
    const received = nextDiagnostics(pair.client);
    openDoc(pair.client, uri, BROKEN);
    const params = await received;

    expect(params.uri).toBe(uri);
    expect(params.version).toBe(1);
    expect(params.diagnostics.length).toBeGreaterThanOrEqual(3);
    expect(params.diagnostics.every((d) => d.source === 'osjs')).toBe(true);
    expect(params.diagnostics.every((d) => d.range.start.line >= 0)).toBe(true);
  });

  it('очищает набор диагностик после исправления', async () => {
    pair = createPair();
    await initialize(pair.client);
    const uri = 'file:///app/fix.osjs';
    const first = nextDiagnostics(pair.client);
    openDoc(pair.client, uri, BROKEN);
    await first;

    const fixed = 'Процедура Тест()\n  А = 1 + 2;\n  Б = 3;\n  В = 4;\nКонецПроцедуры\n';
    const second = nextDiagnostics(pair.client);
    changeDoc(pair.client, uri, fixed, 2);
    const params = await second;
    expect(params.version).toBe(2);
    expect(params.diagnostics).toEqual([]);
  });

  it('не диагностирует документы с чужим languageId', async () => {
    pair = createPair();
    await initialize(pair.client);
    const seen: PublishDiagnosticsParams[] = [];
    pair.client.onNotification('textDocument/publishDiagnostics', (params: PublishDiagnosticsParams) => {
      seen.push(params);
    });
    openDoc(pair.client, 'file:///app/main.os', BROKEN, 'bsl');
    openDoc(pair.client, 'file:///app/ok.osjs', 'Сообщить("ок");\n');
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(seen.filter((p) => p.uri.endsWith('main.os'))).toEqual([]);
    const ours = seen.filter((p) => p.uri.endsWith('ok.osjs'));
    expect(ours.length).toBeGreaterThanOrEqual(1);
    expect(ours[ours.length - 1]?.diagnostics).toEqual([]);
  });
});
