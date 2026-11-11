import { builtinModules } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// LSP-сервер: автономный Node ESM-скрипт dist/lsp/server.mjs.
// resolve.conditions ['node'] обязателен для subpath 'vscode-languageserver/node';
// external builtins — иначе Vite молча подменяет их browser-заглушками и сборка
// «зелёная», а сервер падает на редкой ветке SDK.
export default defineConfig({
  resolve: {
    conditions: ['node'],
  },
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/node/lsp-server.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'server.mjs',
    },
    outDir: 'dist/lsp',
    emptyOutDir: true,
    target: 'node20',
    sourcemap: true,
    rollupOptions: {
      external: [/^node:/, ...builtinModules],
    },
  },
});
