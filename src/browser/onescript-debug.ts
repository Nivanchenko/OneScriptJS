import { createPageAgent } from './debug/agent';
import type { PageAgent } from './debug/agent';

/**
 * ENTRY браузерного отладочного клиента (`dist/onescript-debug.js`).
 *
 * Регистрирует `globalThis.__OSJS_DEBUG__` до старта движка; движок при старте
 * находит мост, ждёт `configurationDone` и исполняет блоки с контроллером.
 * Порт берётся из dev-инъекции (`window.__OSJS_DEBUG_PORT__`) или `?osjs-debug=PORT`.
 */

const DEFAULT_PORT = 9229;

function readPort(): number {
  const configured = globalThis.__OSJS_DEBUG_PORT__;
  const fromGlobal =
    typeof configured === 'number' ? configured : Number.parseInt(String(configured ?? ''), 10);
  if (Number.isInteger(fromGlobal) && fromGlobal > 0) return fromGlobal;
  const search = globalThis.location?.search ?? '';
  const fromQuery = new URLSearchParams(search).get('osjs-debug');
  const parsed = fromQuery === null ? Number.NaN : Number.parseInt(fromQuery, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

function readToken(): string | undefined {
  const search = globalThis.location?.search ?? '';
  const token = new URLSearchParams(search).get('osjs-debug-token');
  return token === null || token === '' ? undefined : token;
}

let agent: PageAgent | undefined;

globalThis.__OSJS_DEBUG__ = {
  attach(info) {
    agent?.dispose();
    const token = readToken();
    const current = createPageAgent({
      pageUrl: info.pageUrl,
      baseURI: info.baseURI,
      blocks: info.blocks,
      port: readPort(),
      ...(token === undefined ? {} : { token }),
    });
    agent = current;
    // Закрытие страницы снимает гейты: висящих промисов быть не должно.
    const dispose = (): void => {
      current.dispose();
      if (agent === current) agent = undefined;
    };
    const host = globalThis as {
      addEventListener?: (type: string, listener: () => void, options?: { once?: boolean }) => void;
    };
    host.addEventListener?.('pagehide', dispose, { once: true });
    return current.attach();
  },
};
