import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// CLI: автономный Node-скрипт dist/cli.mjs (ESM). Системные модули — external.
export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/node/cli.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'cli.mjs',
    },
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      external: [/^node:/],
    },
  },
});
