import { readFileSync } from 'node:fs';
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

const registry = new textmate.Registry({
  onigLib: Promise.resolve({
    createOnigScanner: (sources: string[]) => new oniguruma.OnigScanner(sources),
    createOnigString: (s: string) => new oniguruma.OnigString(s),
  }),
  loadGrammar: async (scopeName: string) => {
    if (scopeName !== 'source.osjs') return null;
    // BOM снимаем до parseRawGrammar: JSON.parse на нём падает.
    const raw = readFileSync(resolve(repoRoot, 'editors/osjs/osjs.tmLanguage.json'), 'utf8').replace(
      /^\uFEFF/,
      '',
    );
    return textmate.parseRawGrammar(raw, 'osjs.tmLanguage.json');
  },
});

const loaded = await registry.loadGrammar('source.osjs');
if (!loaded) throw new Error('не удалось загрузить грамматику source.osjs');
export const grammar: IGrammar = loaded;

export interface TokenLine {
  /** Токены строки; `scopes` — от корневого к самому специфичному. */
  tokens: IToken[];
  ruleStack: StateStack;
}

/** Токенизирует строки с переносом состояния (многострочные строки/блоки). */
export function tokenizeLines(lines: readonly string[]): TokenLine[] {
  const result: TokenLine[] = [];
  let stack: StateStack | null = null;
  for (const line of lines) {
    const tokenized = grammar.tokenizeLine(line, stack);
    result.push({ tokens: tokenized.tokens, ruleStack: tokenized.ruleStack });
    stack = tokenized.ruleStack;
  }
  return result;
}

/** Самый специфичный scope в позиции `column` (0-based, как в токенах). */
export function scopeAt(line: TokenLine, column: number): string | undefined {
  const token = line.tokens.find((t) => t.startIndex <= column && column < t.endIndex);
  return token?.scopes.at(-1);
}
