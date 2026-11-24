import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// Отладочный клиент страницы: отдельный IIFE `dist/onescript-debug.js`.
// Production `dist/onescript.js` его не содержит (FR-011); dev-плагин
// vite.config.ts подключает файл только при OSJS_DEBUG=1.
export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/browser/onescript-debug.ts', import.meta.url)),
      name: 'OneScriptDebug',
      formats: ['iife'],
      fileName: () => 'onescript-debug.js',
    },
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
  },
});
