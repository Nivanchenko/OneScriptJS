import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * FR-011: production-бандл `dist/onescript.js` не тянет отладочный клиент.
 * Проверка осмысленна только на собранном артефакте (`pnpm build:browser`),
 * поэтому без `dist/` тест пропускается.
 */

const BROWSER_BUNDLE = 'dist/onescript.js';

describe.skipIf(!existsSync(BROWSER_BUNDLE))('production-бандл без отладочного клиента', () => {
  it('dist/onescript.js не содержит page-agent и контроллера', () => {
    const bundle = readFileSync(BROWSER_BUNDLE, 'utf8');
    expect(bundle).not.toContain('createPageAgent');
    expect(bundle).not.toContain('DebugController');
    // Строки протокола есть только у агента: страховка от минификации имён.
    expect(bundle).not.toContain('helloAck');
    expect(bundle).not.toContain('setExceptionBreakpoints');
  });
});
