import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// Браузерная сборка: единый скрипт onescript.js, подключаемый как
// <script src="/onescript.js"></script> и регистрирующий <one-script>.
export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/browser/onescript.ts', import.meta.url)),
      name: 'OneScript',
      formats: ['iife'],
      fileName: () => 'onescript.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
