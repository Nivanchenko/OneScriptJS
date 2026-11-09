import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// Браузерная сборка: единый скрипт osConnector.js, подключаемый как
// <script src="/osConnector.js"></script> и регистрирующий <one-script>.
export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/browser/osConnector.ts', import.meta.url)),
      name: 'OneScript',
      formats: ['iife'],
      fileName: () => 'osConnector.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
