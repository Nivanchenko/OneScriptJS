import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// Сборка для Node.js: ESM + CJS библиотека из src/index.ts.
// Объявления типов (.d.ts) генерирует `tsc -p tsconfig.build.json`.
export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    outDir: 'dist/node',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      external: [/^node:/],
    },
  },
});
