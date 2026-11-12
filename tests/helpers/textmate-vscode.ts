import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import textmate from 'vscode-textmate';
import oniguruma from 'vscode-oniguruma';
import type { IGrammar, IToken, StateStack } from 'vscode-textmate';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);

// CJS-пакеты без `exports`: только default-import; named-import падает в Node ESM.
await oniguruma.loadWASM(readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')));

/** Инъекционная грамматика, которую тестируем (может отсутствовать — fallback без инъекции). */
export const EMBEDDED_SCOPE = 'osjs.embedded.injection';
export const embeddedGrammarPath = resolve(repoRoot, 'editors/osjs/osjs-embedded.tmLanguage.json');

const grammarPaths: Record<string, string> = {
  'text.html.basic': resolve(repoRoot, 'tests/fixtures/vscode/html.tmLanguage.json'),
  'source.osjs': resolve(repoRoot, 'editors/osjs/osjs.tmLanguage.json'),
  [EMBEDDED_SCOPE]: embeddedGrammarPath,
};

function readGrammar(path: string) {
  // BOM снимаем до parseRawGrammar: JSON.parse на нём падает.
  const raw = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  return textmate.parseRawGrammar(raw, path);
}

const registry = new textmate.Registry({
  onigLib: Promise.resolve({
    createOnigScanner: (sources: string[]) => new oniguruma.OnigScanner(sources),
    createOnigString: (s: string) => new oniguruma.OnigString(s),
  }),
  getInjections: (scopeName: string) =>
    scopeName === 'text.html.basic' ? [EMBEDDED_SCOPE] : undefined,
  loadGrammar: async (scopeName: string) => {
    const path = grammarPaths[scopeName];
    // Нет инъекционной грамматики — грузим HTML как есть (штатный fallback VS Code).
    if (!path || !existsSync(path)) return null;
    return readGrammar(path);
  },
});

const loaded = await registry.loadGrammar('text.html.basic');
if (!loaded) throw new Error('не удалось загрузить грамматику text.html.basic');

export interface HtmlTokenLine {
  /** Токены строки; `scopes` — от корневого к самому специфичному. */
  tokens: IToken[];
  ruleStack: StateStack;
}

/** Токенизирует HTML-строки с переносом состояния (многострочные блоки/строки). */
export function tokenizeHtml(lines: readonly string[]): HtmlTokenLine[] {
  const result: HtmlTokenLine[] = [];
  let stack: StateStack | null = null;
  for (const line of lines) {
    const tokenized = loaded!.tokenizeLine(line, stack);
    result.push({ tokens: tokenized.tokens, ruleStack: tokenized.ruleStack });
    stack = tokenized.ruleStack;
  }
  return result;
}

/** Все scopes токена в позиции `column` (0-based, как в токенах). */
export function scopesAt(line: HtmlTokenLine, column: number): readonly string[] {
  return line.tokens.find((t) => t.startIndex <= column && column < t.endIndex)?.scopes ?? [];
}
