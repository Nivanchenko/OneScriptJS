import { TextDocumentSyncKind } from 'vscode-languageserver';
import type { Connection, InitializeResult, Location } from 'vscode-languageserver';
import { analyze } from './analysis';
import type { Analysis } from './analysis';
import { completionItems } from './completion';
import { DocumentStore, OSJS_LANGUAGE_ID } from './document';
import {
  analyzeHtml,
  blockAt,
  embeddedDiagnostics,
  embeddedSemanticTokens,
  toBlockPosition,
  toDocumentRange,
} from './embedded';
import type { EmbeddedAnalysis } from './embedded';
import { HTML_LANGUAGE_ID } from './html-blocks';
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
 * HTML не заявляется в capabilities: сервер обслуживает его только если клиент
 * прислал документ с `languageId: 'html'` (политика «гостя»).
 */
export function registerHandlers(connection: Connection, options: RegisterOptions = {}): void {
  const documents = new DocumentStore();

  const publish = (uri: string): void => {
    const document = documents.get(uri);
    if (document === undefined) return;
    if (document.languageId === HTML_LANGUAGE_ID) {
      document.embedded ??= analyzeHtml(document.text, { uri, version: document.version });
      connection.sendDiagnostics({
        uri,
        version: document.version,
        diagnostics: embeddedDiagnostics(document.embedded),
      });
      return;
    }
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

  const analysisOf = (uri: string): Analysis | undefined => {
    const document = documents.get(uri);
    if (document === undefined || document.languageId !== OSJS_LANGUAGE_ID) return undefined;
    document.analysis ??= analyze(document.text);
    return document.analysis;
  };

  const embeddedOf = (uri: string): EmbeddedAnalysis | undefined => {
    const document = documents.get(uri);
    if (document === undefined || document.languageId !== HTML_LANGUAGE_ID) return undefined;
    document.embedded ??= analyzeHtml(document.text, { uri, version: document.version });
    return document.embedded;
  };

  connection.onCompletion((params) => {
    const embedded = embeddedOf(params.textDocument.uri);
    if (embedded !== undefined) {
      const block = blockAt(embedded, params.position);
      if (block === undefined) return [];
      return completionItems(block.analysis, toBlockPosition(block, params.position));
    }
    const analysis = analysisOf(params.textDocument.uri);
    return analysis === undefined ? [] : completionItems(analysis, params.position);
  });

  connection.onHover((params) => {
    const embedded = embeddedOf(params.textDocument.uri);
    if (embedded !== undefined) {
      const block = blockAt(embedded, params.position);
      if (block === undefined) return null;
      const hover = hoverAt(block.analysis, toBlockPosition(block, params.position));
      if (hover === null || hover.range === undefined) return hover;
      return { ...hover, range: toDocumentRange(block, hover.range) };
    }
    const analysis = analysisOf(params.textDocument.uri);
    return analysis === undefined ? null : hoverAt(analysis, params.position);
  });

  connection.onDocumentSymbol((params) => {
    // Outline HTML остаётся у HTML-инструментов; BSL-символы в него не подмешиваем.
    if (embeddedOf(params.textDocument.uri) !== undefined) return [];
    const analysis = analysisOf(params.textDocument.uri);
    return analysis === undefined ? [] : documentSymbols(analysis);
  });

  connection.onDefinition((params) => {
    const embedded = embeddedOf(params.textDocument.uri);
    if (embedded !== undefined) {
      const block = blockAt(embedded, params.position);
      if (block === undefined) return null;
      const found = definitionAt(
        block.analysis,
        params.textDocument.uri,
        toBlockPosition(block, params.position),
        options.resolveImport,
      );
      if (found === null) return null;
      const locations = Array.isArray(found) ? found : [found];
      const mapped = locations.map(
        (location: Location): Location =>
          location.uri === params.textDocument.uri
            ? { uri: location.uri, range: toDocumentRange(block, location.range) }
            : location,
      );
      return Array.isArray(found) ? mapped : (mapped[0] ?? null);
    }
    const analysis = analysisOf(params.textDocument.uri);
    if (analysis === undefined) return null;
    return definitionAt(analysis, params.textDocument.uri, params.position, options.resolveImport);
  });

  connection.onRequest('textDocument/semanticTokens/full', (params) => {
    const embedded = embeddedOf(params.textDocument.uri);
    if (embedded !== undefined) return { data: embeddedSemanticTokens(embedded) };
    const analysis = analysisOf(params.textDocument.uri);
    return { data: analysis === undefined ? [] : semanticTokens(analysis) };
  });
}
