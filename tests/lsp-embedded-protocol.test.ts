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
import type {
  CompletionItem,
  Hover,
  Location,
  PublishDiagnosticsParams,
  Position,
} from 'vscode-languageserver';
import { registerHandlers } from '../src/lsp/server';
import type { RegisterOptions } from '../src/lsp/server';
import { SEMANTIC_TOKEN_TYPES } from '../src/lsp/semantic-tokens';

interface Pair {
  client: ReturnType<typeof createMessageConnection>;
  dispose(): void;
}

/** Поднимает сервер и клиент LSP в одном процессе поверх PassThrough-стримов. */
function createPair(options: RegisterOptions = {}): Pair {
  const toServer = new PassThrough();
  const toClient = new PassThrough();
  const server = createConnection(ProposedFeatures.all, toServer, toClient);
  registerHandlers(server, options);
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
  capabilities: Record<string, unknown> & {
    semanticTokensProvider?: { full?: boolean | object };
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

function nextDiagnostics(client: Pair['client']): Promise<PublishDiagnosticsParams> {
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
  languageId = 'html',
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

function positionOf(html: string, needle: string, occurrence = 0): Position {
  let index = -1;
  let from = 0;
  for (let i = 0; i <= occurrence; i += 1) {
    index = html.indexOf(needle, from);
    if (index < 0) throw new Error(`не найдено: ${needle}`);
    from = index + needle.length;
  }
  const before = html.slice(0, index);
  const lines = before.split('\n');
  return { line: lines.length - 1, character: (lines[lines.length - 1] ?? '').length };
}

interface DecodedToken {
  line: number;
  startChar: number;
  length: number;
  type: string;
  text: string;
}

function decodeTokens(data: number[], html: string): DecodedToken[] {
  expect(data.length % 5).toBe(0);
  const lines = html.split('\n');
  const decoded: DecodedToken[] = [];
  let line = 0;
  let startChar = 0;
  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaStart = data[i + 1];
    const length = data[i + 2];
    const typeIndex = data[i + 3];
    const modifiers = data[i + 4];
    if (
      deltaLine === undefined ||
      deltaStart === undefined ||
      length === undefined ||
      typeIndex === undefined ||
      modifiers === undefined
    ) {
      throw new Error('неполный semantic token');
    }
    line += deltaLine;
    startChar = deltaLine === 0 ? startChar + deltaStart : deltaStart;
    const type = SEMANTIC_TOKEN_TYPES[typeIndex];
    if (type === undefined) throw new Error(`неизвестный тип токена: ${typeIndex}`);
    decoded.push({
      line,
      startChar,
      length,
      type,
      text: (lines[line] ?? '').slice(startChar, startChar + length),
    });
  }
  return decoded;
}

async function semanticTokens(client: Pair['client'], uri: string): Promise<number[]> {
  const result = (await client.sendRequest('textDocument/semanticTokens/full', {
    textDocument: { uri },
  })) as { data: number[] };
  return result.data;
}

function page(block: string): string {
  return ['<!doctype html>', '<html>', '<body>', block, '</body>', '</html>'].join('\n');
}

describe('LSP-протокол: HTML с блоками <script type="text/osjs">', () => {
  let pair: Pair | undefined;
  afterEach(() => {
    pair?.dispose();
    pair = undefined;
  });

  it('initialize не заявляет новых возможностей и не меняет набор 014', async () => {
    pair = createPair();
    const init = await initialize(pair.client);
    const caps = init.capabilities;
    expect(caps.positionEncoding).toBe('utf-16');
    expect(caps.completionProvider).toBeTruthy();
    expect(caps.hoverProvider).toBe(true);
    expect(caps.documentSymbolProvider).toBe(true);
    expect(caps.definitionProvider).toBe(true);
    expect(caps.semanticTokensProvider?.full).toBeTruthy();
    expect(caps.diagnosticProvider).toBeUndefined();
    // HTML не заявляется: никаких formatter/rename/codeAction/foldingRange.
    for (const unsupported of [
      'documentFormattingProvider',
      'documentRangeFormattingProvider',
      'renameProvider',
      'codeActionProvider',
      'foldingRangeProvider',
      'executeCommandProvider',
    ]) {
      expect(caps[unsupported]).toBeUndefined();
    }
  });

  it('публикует mapped-диагностики блоков с версией документа', async () => {
    pair = createPair();
    await initialize(pair.client);
    const uri = 'file:///app/page.html';
    const html = page('<script type="text/osjs">\nПроцедура Тест()\n  А = 1 +;\nКонецПроцедуры\n</script>');
    const received = nextDiagnostics(pair.client);
    openDoc(pair.client, uri, html);
    const params = await received;

    expect(params.uri).toBe(uri);
    expect(params.version).toBe(1);
    const error = params.diagnostics.find((diagnostic) => diagnostic.code === 'OSJS2001');
    expect(error).toBeDefined();
    expect(error?.source).toBe('osjs');
    expect(error?.range.start.line).toBe(5); // строка `А = 1 +;` в HTML
  });

  it('обновляет диагностики после didChange (версия и очистка)', async () => {
    pair = createPair();
    await initialize(pair.client);
    const uri = 'file:///app/fix.html';
    const first = nextDiagnostics(pair.client);
    openDoc(pair.client, uri, page('<script type="text/osjs">\nА = 1 +;\n</script>'));
    const before = await first;
    expect(before.diagnostics.length).toBeGreaterThan(0);

    const second = nextDiagnostics(pair.client);
    changeDoc(pair.client, uri, page('<script type="text/osjs">\nА = 1 + 2;\n</script>'), 2);
    const after = await second;
    expect(after.version).toBe(2);
    expect(after.diagnostics).toEqual([]);
  });

  it('HTML без блоков — пустой набор; чужой languageId — без публикаций', async () => {
    pair = createPair();
    await initialize(pair.client);
    const seen: PublishDiagnosticsParams[] = [];
    pair.client.onNotification('textDocument/publishDiagnostics', (params: PublishDiagnosticsParams) => {
      seen.push(params);
    });

    openDoc(pair.client, 'file:///app/plain.html', '<html><body><p>разметка</p></body></html>');
    openDoc(pair.client, 'file:///app/main.os', 'А = 1 +;', 'bsl');
    await new Promise((resolve) => setTimeout(resolve, 300));

    const plain = seen.filter((params) => params.uri.endsWith('plain.html'));
    expect(plain.length).toBeGreaterThanOrEqual(1);
    expect(plain[plain.length - 1]?.diagnostics).toEqual([]);
    expect(seen.filter((params) => params.uri.endsWith('main.os'))).toEqual([]);
  });

  it('completion: внутри блока как в .osjs, снаружи — пусто', async () => {
    pair = createPair();
    await initialize(pair.client);
    const uri = 'file:///app/complete.html';
    const html = page('<script type="text/osjs">\n  Сооб\n</script>');
    const opened = nextDiagnostics(pair.client);
    openDoc(pair.client, uri, html);
    await opened;

    const completionAt = positionOf(html, 'Сооб', 0);
    const inside = (await pair.client.sendRequest('textDocument/completion', {
      textDocument: { uri },
      position: { line: completionAt.line, character: completionAt.character + 'Сооб'.length },
    })) as CompletionItem[];
    const labels = inside.map((item) => item.label);
    expect(labels).toContain('Сообщить');
    expect(labels).toContain('Message');

    // Позиция в HTML-разметке вне блоков.
    const outside = (await pair.client.sendRequest('textDocument/completion', {
      textDocument: { uri },
      position: { line: 0, character: 3 },
    })) as CompletionItem[];
    expect(outside).toEqual([]);
  });

  it('hover: сигнатура внутри блока с mapped range; снаружи — null', async () => {
    pair = createPair();
    await initialize(pair.client);
    const uri = 'file:///app/hover.html';
    const html = page('<script type="text/osjs">\nСообщить("ок");\n</script>');
    const opened = nextDiagnostics(pair.client);
    openDoc(pair.client, uri, html);
    await opened;

    const hoverAt = positionOf(html, 'Сообщить', 0);
    const hover = (await pair.client.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position: { line: hoverAt.line, character: hoverAt.character + 2 },
    })) as Hover | null;
    expect(hover).not.toBeNull();
    const value = typeof hover?.contents === 'object' && 'value' in hover.contents ? hover.contents.value : '';
    expect(value).toContain('Сообщить');
    expect(hover?.range?.start.line).toBe(hoverAt.line);
    expect(hover?.range?.start.character).toBe(hoverAt.character);

    const outside = await pair.client.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position: { line: 1, character: 1 },
    });
    expect(outside).toBeNull();
  });

  it('definition: локальный символ — mapped range в том же HTML', async () => {
    pair = createPair();
    await initialize(pair.client);
    const uri = 'file:///app/definition.html';
    const html = page(
      [
        '<script type="text/osjs">',
        'Процедура Тест()',
        '  Значение = 1;',
        '  Сообщить(Значение);',
        'КонецПроцедуры',
        '</script>',
      ].join('\n'),
    );
    const opened = nextDiagnostics(pair.client);
    openDoc(pair.client, uri, html);
    await opened;

    const declared = positionOf(html, 'Значение', 0);
    const usage = positionOf(html, 'Значение', 1);
    const location = (await pair.client.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position: usage,
    })) as Location | Location[] | null;
    const found = Array.isArray(location) ? location[0] : location;
    expect(found?.uri).toBe(uri);
    expect(found?.range.start.line).toBe(declared.line);
    expect(found?.range.start.character).toBe(declared.character);
  });

  it('definition: #Использовать разрешается от URL HTML, range 0:0 без переноса', async () => {
    const resolved = 'file:///app/lib/Модуль.osjs';
    pair = createPair({ resolveImport: () => resolved });
    await initialize(pair.client);
    const uri = 'file:///app/import.html';
    const html = page('<script type="text/osjs">\n#Использовать "lib/Модуль.osjs"\n</script>');
    const opened = nextDiagnostics(pair.client);
    openDoc(pair.client, uri, html);
    await opened;

    const insidePath = positionOf(html, 'lib/Модуль.osjs');
    const location = (await pair.client.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position: { line: insidePath.line, character: insidePath.character + 2 },
    })) as Location | null;
    expect(location?.uri).toBe(resolved);
    expect(location?.range).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    });
  });

  it('definition: символы другого блока не находятся (изоляция)', async () => {
    pair = createPair();
    await initialize(pair.client);
    const uri = 'file:///app/isolation.html';
    const html = [
      '<script type="text/osjs">',
      'Секрет = 1;',
      '</script>',
      '<script type="text/osjs">',
      'Сообщить(Секрет);',
      '</script>',
    ].join('\n');
    const opened = nextDiagnostics(pair.client);
    openDoc(pair.client, uri, html);
    await opened;

    const location = await pair.client.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position: positionOf(html, 'Секрет', 1),
    });
    expect(location).toBeNull();
  });

  it('semantic tokens: только внутри блоков, инлайн и после правок не съезжают', async () => {
    pair = createPair();
    await initialize(pair.client);
    const uri = 'file:///app/tokens.html';
    const html = page(
      [
        '<script type="text/osjs">',
        'Процедура Тест()',
        '  Значение = 42;',
        'КонецПроцедуры',
        '</script>',
      ].join('\n'),
    );
    const opened = nextDiagnostics(pair.client);
    openDoc(pair.client, uri, html);
    await opened;

    const decoded = decodeTokens(await semanticTokens(pair.client, uri), html);
    expect(decoded.length).toBeGreaterThan(0);
    expect(decoded.some((token) => token.text === 'doctype')).toBe(false);
    const keyword = decoded.find((token) => token.text === 'Процедура');
    expect(keyword?.line).toBe(4);

    const inserted = '<!-- шапка -->\n<p>текст</p>\n' + html;
    const second = nextDiagnostics(pair.client);
    changeDoc(pair.client, uri, inserted, 2);
    await second;
    const afterInsert = decodeTokens(await semanticTokens(pair.client, uri), inserted);
    expect(afterInsert.find((token) => token.text === 'Процедура')?.line).toBe(6);
    expect(
      afterInsert
        .filter((token) => token.text !== 'текст')
        .map((token) => ({ ...token, line: token.line - 2 })),
    ).toEqual(decoded);
  });

  it('semantic tokens: инлайн-блок в одной строке с HTML', async () => {
    pair = createPair();
    await initialize(pair.client);
    const uri = 'file:///app/inline.html';
    const html = '<p>до</p><script type="text/osjs">А = 1;</script><p>после</p>';
    const opened = nextDiagnostics(pair.client);
    openDoc(pair.client, uri, html);
    await opened;

    const decoded = decodeTokens(await semanticTokens(pair.client, uri), html);
    expect(decoded.length).toBeGreaterThan(0);
    expect(decoded.every((token) => token.line === 0)).toBe(true);
    const variable = decoded.find((token) => token.text === 'А');
    expect(variable?.startChar).toBe(html.indexOf('А = 1;'));
  });

  it('documentSymbol для HTML — пустой список; для .osjs — как раньше', async () => {
    pair = createPair();
    await initialize(pair.client);
    const htmlUri = 'file:///app/symbols.html';
    const html = page('<script type="text/osjs">\nПроцедура Тест()\nКонецПроцедуры\n</script>');
    const htmlOpened = nextDiagnostics(pair.client);
    openDoc(pair.client, htmlUri, html);
    await htmlOpened;
    const htmlSymbols = await pair.client.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri: htmlUri },
    });
    expect(htmlSymbols).toEqual([]);

    const osjsUri = 'file:///app/symbols.osjs';
    const osjsOpened = nextDiagnostics(pair.client);
    openDoc(pair.client, osjsUri, 'Процедура Тест()\nКонецПроцедуры\n', 'osjs');
    await osjsOpened;
    const osjsSymbols = (await pair.client.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri: osjsUri },
    })) as Array<{ name: string }>;
    expect(osjsSymbols.some((symbol) => symbol.name === 'Тест')).toBe(true);
  });

  it('HTML без блоков: подсказки/токены/definition/outline пусты', async () => {
    pair = createPair();
    await initialize(pair.client);
    const uri = 'file:///app/empty.html';
    const html = page('<p>без блоков</p>');
    const opened = nextDiagnostics(pair.client);
    openDoc(pair.client, uri, html);
    await opened;

    const position = { line: 4, character: 5 };
    const completion = await pair.client.sendRequest('textDocument/completion', {
      textDocument: { uri },
      position,
    });
    expect(completion).toEqual([]);
    expect(
      await pair.client.sendRequest('textDocument/hover', { textDocument: { uri }, position }),
    ).toBeNull();
    expect(
      await pair.client.sendRequest('textDocument/definition', { textDocument: { uri }, position }),
    ).toBeNull();
    expect(await semanticTokens(pair.client, uri)).toEqual([]);
    expect(
      await pair.client.sendRequest('textDocument/documentSymbol', { textDocument: { uri } }),
    ).toEqual([]);
  });
});
