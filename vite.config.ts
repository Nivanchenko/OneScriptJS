import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

const BUNDLE = fileURLToPath(new URL('./dist/onescript.js', import.meta.url));

/**
 * Dev-сервер: примеры подключают `<script src="/onescript.js">`, а собранный бандл
 * лежит в `dist/`. Отдаём его по требуемому пути, чтобы `pnpm dev` работал без
 * копирования файлов. Требуется предварительный `pnpm build:browser`
 * (при изменении движка — пересобрать и обновить страницу).
 */
function serveBuiltBundle(): Plugin {
  return {
    name: 'serve-onescript-bundle',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url !== '/onescript.js') return next();
        if (!existsSync(BUNDLE) || !statSync(BUNDLE).isFile()) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('dist/onescript.js не найден. Выполните: pnpm build:browser');
          return;
        }
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(readFileSync(BUNDLE));
      });
    },
  };
}

// Браузерная сборка: единый скрипт onescript.js, подключаемый как
// <script src="/onescript.js"></script> и регистрирующий <one-script>.
export default defineConfig({
  plugins: [serveBuiltBundle()],
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
