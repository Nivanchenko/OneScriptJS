import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Бандлы, которые dev-сервер отдаёт из `dist/` по относительной ссылке страницы. */
const BUNDLES = [
  {
    fileName: 'onescript.js',
    hint: 'pnpm build:browser',
  },
  {
    fileName: 'onescript-debug.js',
    hint: 'pnpm build:debug-client',
  },
] as const;

function bundlePath(fileName: string): string {
  return fileURLToPath(new URL(`./dist/${fileName}`, import.meta.url));
}

/**
 * Dev-сервер: примеры подключают движок относительной ссылкой
 * `<script src="onescript.js">` — так они работают и в `pnpm dev`, и на GitHub
 * Pages под префиксом `/OneScriptJS/`. Браузер разрешает её относительно
 * страницы, поэтому для `/examples/hello.html` запрос придёт на
 * `/examples/onescript.js`. Собранные бандлы лежат в `dist/`; отдаём их по любому
 * пути, оканчивающемуся на имя файла, чтобы `pnpm dev` работал без копирования.
 * Требуется предварительная сборка (при изменении — пересобрать и обновить страницу).
 */
function serveBuiltBundle(): Plugin {
  return {
    name: 'serve-onescript-bundle',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? '';
        const bundle = BUNDLES.find((candidate) => url.endsWith(`/${candidate.fileName}`));
        if (bundle === undefined) return next();
        const path = bundlePath(bundle.fileName);
        if (!existsSync(path) || !statSync(path).isFile()) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(`dist/${bundle.fileName} не найден. Выполните: ${bundle.hint}`);
          return;
        }
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(readFileSync(path));
      });
    },
  };
}

/**
 * Dev-инъекция отладочного клиента: при `OSJS_DEBUG=1` страница получает порт
 * адаптера и `onescript-debug.js` до старта движка (`body-prepend`), иначе —
 * ничего. Не собранный клиент не инжектится: страница работает штатно.
 */
function injectDebugClient(): Plugin {
  return {
    name: 'osjs-debug-injection',
    apply: 'serve',
    transformIndexHtml(html) {
      if (!process.env.OSJS_DEBUG) return html;
      const bundle = bundlePath('onescript-debug.js');
      if (!existsSync(bundle)) return html;
      const configured = Number.parseInt(process.env.OSJS_DEBUG_PORT ?? '', 10);
      const port = Number.isInteger(configured) && configured > 0 ? configured : 9229;
      return {
        html,
        tags: [
          {
            tag: 'script',
            children: `window.__OSJS_DEBUG_PORT__=${port};`,
            injectTo: 'body-prepend',
          },
          {
            tag: 'script',
            attrs: { src: 'onescript-debug.js' },
            injectTo: 'body-prepend',
          },
        ],
      };
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
// <script src="onescript.js"></script> и регистрирующий <one-script>.
export default defineConfig({
  plugins: [serveBuiltBundle(), injectDebugClient(), demoHttpApi()],
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
