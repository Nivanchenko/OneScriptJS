import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/lsp/analysis';
import { analyzeHtml, embeddedDiagnostics } from '../src/lsp/embedded';

const fixture = (relative: string): string =>
  readFileSync(join(process.cwd(), 'tests/fixtures', relative), 'utf8');

describe('ручные фикстуры редакторных кейсов', () => {
  it('manual-editor-cases.osjs разбирается без диагностик', () => {
    const analysis = analyze(fixture('manual-editor-cases.osjs'));
    expect(analysis.diagnostics).toEqual([]);
  });

  it('editor-cases.html не даёт диагностик вне/внутри валидных блоков', () => {
    const analysis = analyzeHtml(fixture('lsp/embedded/editor-cases.html'));
    expect(embeddedDiagnostics(analysis)).toEqual([]);
  });
});
