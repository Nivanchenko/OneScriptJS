import { tokenize } from '../lexer/lexer';
import { preprocessScript } from '../parser/preprocessor';

/** Разрешение пути импорта как URL относительно документа (или от корня сервера). */
export function resolveUrlPath(importPath: string, importerUrl: string): string {
  return new URL(importPath, importerUrl).href;
}

function stripBom(source: string): string {
  return source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
}

/**
 * Асинхронно скачивает дерево импортов до `run()`: движок остаётся синхронным,
 * а браузер грузит файлы по URL, как `<script>`/изображения.
 */
export async function preloadModuleSources(
  entrySource: string,
  entryUrl: string,
): Promise<Map<string, string>> {
  const sources = new Map<string, string>();

  const visit = async (url: string, source: string): Promise<void> => {
    if (sources.has(url)) return;
    sources.set(url, stripBom(source));

    const { imports } = preprocessScript(tokenize(source));
    for (const directive of imports) {
      const resolved = resolveUrlPath(directive.path, url);
      if (sources.has(resolved)) continue;

      let text: string;
      try {
        const response = await fetch(resolved);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        text = await response.text();
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Не удалось загрузить '${resolved}': ${reason} (директива #Использовать, строка ${directive.line})`,
        );
      }
      await visit(resolved, text);
    }
  };

  await visit(entryUrl, entrySource);
  return sources;
}
