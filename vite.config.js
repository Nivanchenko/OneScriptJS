
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: './build/js/main.js',
      name: 'OneScriptJS',
      fileName: 'main',
      formats: ['es'] 
    },
    outDir: 'public',
    sourcemap: true,
    rollupOptions: {
      external: [], 
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules'],
    environment: 'node',
    globals: true,
    setupFiles: [],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  publicDir: './wasm' 
});