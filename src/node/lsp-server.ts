import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { registerHandlers } from '../lsp/server';

/** `#Использовать` путь → file-URI; резолв от каталога документа, без чтения файла. */
function resolveImport(importPath: string, documentUri: string): string | null {
  if (!documentUri.startsWith('file:')) return null;
  try {
    const base = dirname(fileURLToPath(documentUri));
    return pathToFileURL(resolve(base, importPath)).href;
  } catch {
    return null;
  }
}

// Точка входа LSP-сервера: stdio-транспорт, сборка — dist/lsp/server.mjs.
const connection = createConnection(ProposedFeatures.all, process.stdin, process.stdout);
registerHandlers(connection, { resolveImport });
connection.listen();
