import { readFileSync } from 'node:fs';
import path from 'node:path';
import { tokenize } from '../lexer/lexer';
import { preprocessScript } from '../parser/preprocessor';

/** Снимает BOM, чтобы он не попал в разбор. */
export function stripBom(source: string): string {
  return source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
}

/** Разрешение пути импорта как в Node: абсолютный — от корня ФС, иначе от каталога файла. */
export function resolveNodePath(importPath: string, importerPath: string): string {
  return path.isAbsolute(importPath)
    ? path.normalize(importPath)
    : path.resolve(path.dirname(importerPath), importPath);
}

/**
 * Синхронно собирает дерево импортов входного файла в карту «канонический путь → исходник».
 * Нужна до `run()`, чтобы движок оставался синхронным.
 */
export function collectModuleSources(entryPath: string, entrySource: string): Map<string, string> {
  const sources = new Map<string, string>();

  const visit = (canonical: string, source: string): void => {
    if (sources.has(canonical)) return;
    sources.set(canonical, stripBom(source));

    const { imports } = preprocessScript(tokenize(source));
    for (const directive of imports) {
      const resolved = resolveNodePath(directive.path, canonical);
      if (sources.has(resolved)) continue;

      let text: string;
      try {
        text = readFileSync(resolved, 'utf8');
      } catch {
        throw new Error(
          `Файл не найден: '${resolved}' (директива #Использовать, строка ${directive.line})`,
        );
      }
      visit(resolved, text);
    }
  };

  visit(path.resolve(entryPath), entrySource);
  return sources;
}
