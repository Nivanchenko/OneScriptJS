import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

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

/**
 * Мок-бэкенд для `examples/http.html`: GET /api/demo и POST /api/echo.
 * Работает и в `pnpm dev`, и в `pnpm demo` (vite preview); на сборку не влияет.
 * Пример можно перенаправить на реальный сервер.
 */
function demoHttpApi(): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const url = (req.url ?? '').split('?')[0];
    if (url === '/api/demo' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify(
          {
            message: 'Привет с бэкенда!',
            method: req.method,
            time: new Date().toISOString(),
            items: [
              { id: 1, name: 'Первый' },
              { id: 2, name: 'Второй' },
            ],
          },
          null,
          2,
        ),
      );
      return;
    }
    if (url === '/api/echo' && req.method === 'POST') {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => {
        body += chunk;
      });
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(
          JSON.stringify(
            { method: req.method, contentType: req.headers['content-type'] ?? '', body },
            null,
            2,
          ),
        );
      });
      return;
    }
    next();
  };

  return {
    name: 'demo-http-api',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

// Браузерная сборка: единый скрипт onescript.js, подключаемый как
// <script src="/onescript.js"></script> и регистрирующий <one-script>.
export default defineConfig({
  plugins: [serveBuiltBundle(), demoHttpApi()],
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
