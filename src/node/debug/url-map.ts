import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Параметры сессионного маппинга: `webRoot` — корень рабочей области. */
export interface UrlMapOptions {
  webRoot: string;
  /** База страницы (document.baseURI) — нужна только для обратного маппинга. */
  baseURI?: string;
}

/**
 * URL источника движка ↔ файл рабочей области для браузерного attach.
 *
 * Прямой маппинг (`toFilePath`) ищет файл под `webRoot` по origin+pathname URL без
 * query/hash; на GitHub Pages и в dev-сервере путь несёт префикс проекта
 * (`/OneScriptJS/`), поэтому дополнительно пробуются усечения первых 1–3 сегментов —
 * но только если файл реально существует. Не найден — источник виртуальный
 * (`undefined`), брейкпоинт в нём верифицировать нельзя.
 *
 * Обратный (`toSourceId`) строит URL от `baseURI` через `path.relative`, не кодируя
 * сегменты вручную: кодировку делает `URL`.
 *
 * Результаты кэшируются на сессию: маппинг не меняется, а `existsSync` — дорогой.
 */
export class UrlMap {
  private readonly webRoot: string;
  private baseURI?: string;
  private readonly pathCache = new Map<string, string | undefined>();
  private readonly idCache = new Map<string, string | undefined>();

  constructor(options: UrlMapOptions) {
    this.webRoot = resolve(options.webRoot);
    this.baseURI = options.baseURI;
  }

  /** `baseURI` приходит в `hello` уже после старта сессии. */
  setBaseURI(baseURI: string): void {
    if (this.baseURI === baseURI) return;
    this.baseURI = baseURI;
    this.idCache.clear();
  }

  /** URL источника движка → абсолютный путь файла; `undefined` — виртуальный источник. */
  toFilePath(url: string): string | undefined {
    if (this.pathCache.has(url)) return this.pathCache.get(url);
    const result = this.computeFilePath(url);
    this.pathCache.set(url, result);
    return result;
  }

  /** Файл рабочей области → URL источника движка; `undefined` — вне `webRoot`/без базы. */
  toSourceId(file: string): string | undefined {
    const absolute = resolve(file);
    if (this.idCache.has(absolute)) return this.idCache.get(absolute);
    const result = this.computeSourceId(absolute);
    this.idCache.set(absolute, result);
    return result;
  }

  private computeFilePath(url: string): string | undefined {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return undefined;
    }
    const pathname = decodePath(parsed.pathname);
    // file:// уже адресует файл: origin и dev-base к нему неприменимы.
    if (parsed.protocol === 'file:') {
      return pathname === '' ? undefined : resolve(pathname);
    }
    const segments = pathname.split('/').filter((segment) => segment !== '');
    // `..` в декодированном сегменте мог бы вывести за webRoot — такие URL не маппим.
    if (segments.length === 0 || segments.some((segment) => segment === '..' || segment === '.')) {
      return undefined;
    }
    const candidates = [join(this.webRoot, ...segments)];
    for (let drop = 1; drop <= 3 && drop < segments.length; drop++) {
      candidates.push(join(this.webRoot, ...segments.slice(drop)));
    }
    for (const candidate of candidates) {
      if (existsSync(candidate)) return resolve(candidate);
    }
    return undefined;
  }

  private computeSourceId(absolute: string): string | undefined {
    if (this.baseURI === undefined) return undefined;
    const relativePath = relative(this.webRoot, absolute);
    if (
      relativePath === '' ||
      relativePath === '..' ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      return undefined;
    }
    try {
      // path.relative на Windows даёт `\`; URL требует `/`.
      return new URL(relativePath.split(sep).join('/'), this.baseURI).href;
    } catch {
      return undefined;
    }
  }
}

function decodePath(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}
