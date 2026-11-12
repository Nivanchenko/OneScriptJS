import { TextDocumentSyncKind } from 'vscode-languageserver';
import type { Connection, InitializeResult } from 'vscode-languageserver';
import { analyze } from './analysis';
import { completionItems } from './completion';
import { DocumentStore } from './document';
import { hoverAt } from './hover';
import { SEMANTIC_TOKEN_TYPES, semanticTokens } from './semantic-tokens';
import { definitionAt, documentSymbols } from './symbols';

export interface RegisterOptions {
  /** Резолв `#Использовать` путь → file-URI; инжектируется из `src/node` (слой LSP файлы не читает). */
  resolveImport?: (importPath: string, documentUri: string) => string | null;
}

/**
 * Регистрирует возможности и обработчики LSP на соединении.
 * Без side effects — переиспользуется in-process тестами (см. contracts/lsp-server.md).
 */
export function registerHandlers(connection: Connection, options: RegisterOptions = {}): void {
  const documents = new DocumentStore();

  const publish = (uri: string): void => {
    const document = documents.get(uri);
    if (document === undefined) return;
    document.analysis ??= analyze(document.text);
    connection.sendDiagnostics({
      uri,
      version: document.version,
      diagnostics: document.analysis.diagnostics,
    });
  };

  connection.onInitialize((): InitializeResult => ({
    serverInfo: { name: 'osjs-lsp', version: '0.1.0' },
    capabilities: {
      positionEncoding: 'utf-16',
      textDocumentSync: { openClose: true, change: TextDocumentSyncKind.Full },
      completionProvider: { triggerCharacters: ['.'], resolveProvider: false },
      hoverProvider: true,
      documentSymbolProvider: true,
      definitionProvider: true,
      semanticTokensProvider: {
        legend: { tokenTypes: [...SEMANTIC_TOKEN_TYPES], tokenModifiers: [] },
        full: true,
        range: false,
      },
    },
  }));

  connection.onInitialized(() => {
    // ничего не индексируем: сервер работает с открытыми документами
  });

  connection.onDidOpenTextDocument((params) => {
    const { uri, languageId, version, text } = params.textDocument;
    const document = documents.open(uri, languageId, version, text);
    if (document !== undefined) publish(document.uri);
  });

  connection.onDidChangeTextDocument((params) => {
    const text = params.contentChanges[0]?.text ?? '';
    const document = documents.change(params.textDocument.uri, params.textDocument.version, text);
    if (document !== undefined) publish(document.uri);
  });

  connection.onDidCloseTextDocument((params) => {
    const { uri } = params.textDocument;
    documents.close(uri);
    connection.sendDiagnostics({ uri, diagnostics: [] });
  });

  const analysisOf = (uri: string) => {
    const document = documents.get(uri);
    if (document === undefined) return undefined;
    document.analysis ??= analyze(document.text);
    return document.analysis;
  };

  connection.onCompletion((params) => {
    const analysis = analysisOf(params.textDocument.uri);
    return analysis === undefined ? [] : completionItems(analysis, params.position);
  });

  connection.onHover((params) => {
    const analysis = analysisOf(params.textDocument.uri);
    return analysis === undefined ? null : hoverAt(analysis, params.position);
  });

  connection.onDocumentSymbol((params) => {
    const analysis = analysisOf(params.textDocument.uri);
    return analysis === undefined ? [] : documentSymbols(analysis);
  });

  connection.onDefinition((params) => {
    const analysis = analysisOf(params.textDocument.uri);
    if (analysis === undefined) return null;
    return definitionAt(analysis, params.textDocument.uri, params.position, options.resolveImport);
  });

  connection.onRequest('textDocument/semanticTokens/full', (params) => {
    const analysis = analysisOf(params.textDocument.uri);
    return { data: analysis === undefined ? [] : semanticTokens(analysis) };
  });
}
