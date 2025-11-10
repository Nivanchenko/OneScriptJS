
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main.js',
      name: 'JOSParser',
      fileName: 'main',
      formats: ['es'] // только ES-модуль для браузера
    },
    outDir: 'public',
    sourcemap: true,
    rollupOptions: {
      external: [], // ничего не внешнее
    }
  },
  publicDir: './wasm' // откуда брать WASM
});