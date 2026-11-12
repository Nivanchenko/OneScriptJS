import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Setting {
  type?: string;
  default?: unknown;
  enum?: unknown[];
  description?: string;
}

interface Manifest {
  name?: string;
  displayName?: string;
  publisher?: string;
  version?: string;
  engines?: { vscode?: string };
  main?: string;
  activationEvents?: string[];
  repository?: unknown;
  contributes?: {
    languages?: Array<{ id?: string; extensions?: string[]; configuration?: string }>;
    grammars?: Array<{ language?: string; scopeName?: string; path?: string }>;
    commands?: Array<{ command?: string; title?: string }>;
    configuration?: { properties?: Record<string, Setting> };
  };
}

interface RootManifest {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const manifest = JSON.parse(
  readFileSync(new URL('../extensions/vscode/package.json', import.meta.url), 'utf8'),
) as Manifest;
const root = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as RootManifest;

const language = manifest.contributes?.languages?.[0];
const grammar = manifest.contributes?.grammars?.[0];
const commandIds = (manifest.contributes?.commands ?? []).map((command) => command.command);
const settings = manifest.contributes?.configuration?.properties ?? {};

describe('манифест расширения VS Code', () => {
  it('объявляет расширение с ленивой активацией по osjs/html и командам', () => {
    expect(manifest.name).toBe('onescriptjs');
    expect(manifest.publisher).toBe('onescriptjs');
    expect(manifest.displayName).toBe('OneScriptJS');
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.engines?.vscode).toBe('^1.91.0');
    expect(manifest.main).toBe('./out/extension.js');
    expect(manifest.repository).toBeDefined();
    expect(manifest.activationEvents).toEqual(
      expect.arrayContaining([
        'onLanguage:osjs',
        'onLanguage:html',
        'onCommand:onescriptjs.restartServer',
        'onCommand:onescriptjs.showOutput',
      ]),
    );
  });

  it('регистрирует язык osjs только для .osjs', () => {
    expect(language).toMatchObject({
      id: 'osjs',
      extensions: ['.osjs'],
      configuration: './language-configuration.json',
    });
    const extensions = (manifest.contributes?.languages ?? []).flatMap(
      (item) => item.extensions ?? [],
    );
    expect(extensions).not.toContain('.os');
    expect(extensions).not.toContain('os');
  });

  it('подключает грамматику source.osjs и language-configuration', () => {
    expect(grammar).toMatchObject({
      language: 'osjs',
      scopeName: 'source.osjs',
      path: './syntaxes/osjs.tmLanguage.json',
    });
  });

  it('объявляет команды перезапуска и показа Output', () => {
    expect(commandIds).toEqual(
      expect.arrayContaining(['onescriptjs.restartServer', 'onescriptjs.showOutput']),
    );
  });

  it('настраивает embeddedInHtml (default true) и trace', () => {
    expect(settings['onescriptjs.embeddedInHtml']).toMatchObject({
      type: 'boolean',
      default: true,
    });
    expect(settings['onescriptjs.trace']).toMatchObject({
      type: 'string',
      default: 'off',
    });
    expect(settings['onescriptjs.trace']?.enum).toEqual(['off', 'messages', 'verbose']);
  });
});

describe('сборка расширения', () => {
  const script = existsSync(new URL('../scripts/build-vscode-extension.mjs', import.meta.url))
    ? readFileSync(new URL('../scripts/build-vscode-extension.mjs', import.meta.url), 'utf8')
    : '';

  it('сборщик копирует сервер, грамматику и language-configuration', () => {
    expect(script).not.toBe('');
    expect(script).toContain('dist/lsp/server.mjs');
    expect(script).toContain('editors/osjs/osjs.tmLanguage.json');
    expect(script).toContain('editors/osjs/language-configuration.json');
    expect(script).toContain('server/server.mjs');
    expect(script).toContain('syntaxes/osjs.tmLanguage.json');
  });

  it('сборщик собирает LSP, бандлит extension.ts и упаковывает .vsix', () => {
    expect(script).toContain('build:lsp');
    expect(script).toContain('esbuild');
    expect(script).toContain('@vscode/vsce');
    expect(script).toContain('--no-dependencies');
  });

  it('корневые скрипты и devDependencies на месте', () => {
    expect(root.scripts?.['build:vscode']).toBe('node scripts/build-vscode-extension.mjs');
    expect(root.scripts?.['typecheck:vscode']).toContain('extensions/vscode/tsconfig.json');
    expect(root.devDependencies?.['@types/vscode']).toMatch(/^[~^]?1\.(90|91)\.\d+$/);
    expect(root.devDependencies?.['vscode-languageclient']).toBeDefined();
    expect(root.devDependencies?.esbuild).toBeDefined();
    expect(root.devDependencies?.['@vscode/vsce']).toBeDefined();
  });
});

describe('клиент LSP', () => {
  const source = existsSync(new URL('../extensions/vscode/src/extension.ts', import.meta.url))
    ? readFileSync(new URL('../extensions/vscode/src/extension.ts', import.meta.url), 'utf8')
    : '';

  it('запускает server/server.mjs на Node-рантайме VS Code', () => {
    expect(source).toContain("vscode-languageclient/node");
    expect(source).toContain('server/server.mjs');
    expect(source).toContain('process.execPath');
    expect(source).toContain('ELECTRON_RUN_AS_NODE');
  });

  it('подключает html только по настройке, osjs — всегда, .os — никогда', () => {
    expect(source).toContain('embeddedInHtml');
    expect(source).toContain("language: 'osjs'");
    expect(source).toContain("language: 'html'");
    expect(source).not.toContain("language: 'os'");
  });

  it('реализует команды, trace и остановку клиента', () => {
    expect(source).toContain('onescriptjs.restartServer');
    expect(source).toContain('onescriptjs.showOutput');
    expect(source).toContain('setTrace');
    expect(source).toContain('deactivate');
  });
});
