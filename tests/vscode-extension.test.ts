import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Setting {
  type?: string;
  default?: unknown;
  enum?: unknown[];
  description?: string;
}

interface ManifestGrammar {
  language?: string;
  scopeName?: string;
  path?: string;
  injectTo?: string[];
  injectionSelector?: string;
  embeddedLanguages?: Record<string, string>;
}

interface ManifestDebugger {
  type?: string;
  label?: string;
  languages?: string[];
  configurationAttributes?: Record<
    string,
    { required?: string[]; properties?: Record<string, unknown> }
  >;
  initialConfigurations?: Array<Record<string, unknown>>;
  configurationSnippets?: Array<{ label?: string; body?: Record<string, unknown> }>;
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
    grammars?: ManifestGrammar[];
    commands?: Array<{ command?: string; title?: string }>;
    breakpoints?: Array<{ language?: string }>;
    debuggers?: ManifestDebugger[];
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
const grammars = manifest.contributes?.grammars ?? [];
const grammar = grammars[0];
const injectionGrammar = grammars.find(
  (item) => item.scopeName === 'osjs.embedded.injection',
);
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

  it('регистрирует инъекционную грамматику для text.html.basic', () => {
    expect(injectionGrammar).toMatchObject({
      scopeName: 'osjs.embedded.injection',
      path: './syntaxes/osjs-embedded.tmLanguage.json',
      injectTo: ['text.html.basic'],
      injectionSelector: 'L:text.html.basic - (comment.block, meta.embedded)',
      embeddedLanguages: { 'meta.embedded.block.osjs': 'osjs' },
    });
    // Инъекция не заявляет язык и не подменяет .html.
    expect(injectionGrammar).not.toHaveProperty('language');
    expect(grammars.map((item) => item.scopeName)).toEqual([
      'source.osjs',
      'osjs.embedded.injection',
    ]);
  });

  it('файл инъекционной грамматики совпадает с манифестом', () => {
    const grammarPath = new URL('../editors/osjs/osjs-embedded.tmLanguage.json', import.meta.url);
    expect(existsSync(grammarPath)).toBe(true);
    const injected = JSON.parse(readFileSync(grammarPath, 'utf8')) as {
      scopeName?: string;
      injectionSelector?: string;
      patterns?: Array<{ contentName?: string }>;
    };
    expect(injected.scopeName).toBe(injectionGrammar?.scopeName);
    expect(injected.injectionSelector).toBe(injectionGrammar?.injectionSelector);
    expect(injected.patterns?.[0]?.contentName).toBe('meta.embedded.block.osjs');
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

  it('сборщик копирует сервер, грамматики и language-configuration', () => {
    expect(script).not.toBe('');
    expect(script).toContain('dist/lsp/server.mjs');
    expect(script).toContain('editors/osjs/osjs.tmLanguage.json');
    expect(script).toContain('editors/osjs/osjs-embedded.tmLanguage.json');
    expect(script).toContain('editors/osjs/language-configuration.json');
    expect(script).toContain('server/server.mjs');
    expect(script).toContain('syntaxes/osjs.tmLanguage.json');
    expect(script).toContain('syntaxes/osjs-embedded.tmLanguage.json');
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

const debuggers = manifest.contributes?.debuggers ?? [];
const debuggerManifest = debuggers.find((item) => item.type === 'osjs');
const launchConfig = debuggerManifest?.configurationAttributes?.launch;
const attachConfig = debuggerManifest?.configurationAttributes?.attach;
const debugSource = existsSync(new URL('../extensions/vscode/src/debug.ts', import.meta.url))
  ? readFileSync(new URL('../extensions/vscode/src/debug.ts', import.meta.url), 'utf8')
  : '';
const debugAdapterBuild = existsSync(
  new URL('../scripts/build-debug-adapter.mjs', import.meta.url),
)
  ? readFileSync(new URL('../scripts/build-debug-adapter.mjs', import.meta.url), 'utf8')
  : '';
const launchJsonPath = new URL('../.vscode/launch.json', import.meta.url);
const launchJson = existsSync(launchJsonPath)
  ? (JSON.parse(readFileSync(launchJsonPath, 'utf8')) as {
      configurations?: Array<Record<string, unknown>>;
    })
  : undefined;

describe('отладчик BSL (DAP)', () => {
  it('объявляет debugger типа osjs с языками osjs/html', () => {
    expect(debuggerManifest).toBeDefined();
    expect(debuggerManifest).toMatchObject({
      type: 'osjs',
      label: 'OneScriptJS (BSL)',
      languages: ['osjs', 'html'],
    });
  });

  it('описывает конфигурации launch и attach по контракту', () => {
    expect(launchConfig?.required).toEqual(['program']);
    expect(Object.keys(launchConfig?.properties ?? {}).sort()).toEqual([
      'cwd',
      'program',
      'stopOnEntry',
    ]);
    expect(attachConfig?.required).toEqual(['url']);
    expect(Object.keys(attachConfig?.properties ?? {}).sort()).toEqual([
      'port',
      'stopOnEntry',
      'url',
      'webRoot',
    ]);
  });

  it('даёт initialConfigurations и snippets для launch/attach', () => {
    const initial = debuggerManifest?.initialConfigurations ?? [];
    expect(initial).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'osjs', request: 'launch', program: '${file}' }),
        expect.objectContaining({
          type: 'osjs',
          request: 'attach',
          url: 'http://localhost:5173/examples/hello.html',
          webRoot: '${workspaceFolder}',
        }),
      ]),
    );
    const snippets = (debuggerManifest?.configurationSnippets ?? []).map(
      (snippet) => snippet.body?.request,
    );
    expect(snippets).toEqual(expect.arrayContaining(['launch', 'attach']));
  });

  it('регистрирует брейкпоинты для языка osjs', () => {
    expect(manifest.contributes?.breakpoints).toEqual([{ language: 'osjs' }]);
  });

  it('активируется по отладочным событиям', () => {
    expect(manifest.activationEvents).toEqual(
      expect.arrayContaining(['onDebugResolve:osjs', 'onDebugInitialConfigurations']),
    );
  });

  it('фабрика запускает out/debug-adapter.js на Node-рантайме VS Code', () => {
    expect(debugSource).toContain('DebugAdapterExecutable');
    expect(debugSource).toContain('out/debug-adapter.js');
    expect(debugSource).toContain('process.execPath');
    expect(debugSource).toContain('ELECTRON_RUN_AS_NODE');
    expect(debugSource).toContain("registerDebugAdapterDescriptorFactory('osjs'");
    const extensionSource = readFileSync(
      new URL('../extensions/vscode/src/extension.ts', import.meta.url),
      'utf8',
    );
    expect(extensionSource).toContain('registerDebug(context)');
  });

  it('сборщик расширения бандлит адаптер в out/debug-adapter.js', () => {
    expect(readFileSync(new URL('../scripts/build-vscode-extension.mjs', import.meta.url), 'utf8')).toContain(
      'src/node/debug-adapter.ts',
    );
    expect(readFileSync(new URL('../scripts/build-vscode-extension.mjs', import.meta.url), 'utf8')).toContain(
      'out/debug-adapter.js',
    );
    expect(readFileSync(new URL('../scripts/build-vscode-extension.mjs', import.meta.url), 'utf8')).toContain(
      'bufferutil',
    );
  });

  it('build:debug-adapter собирает dist/debug/adapter.cjs', () => {
    expect(root.scripts?.['build:debug-adapter']).toBe('node scripts/build-debug-adapter.mjs');
    expect(debugAdapterBuild).toContain('dist/debug/adapter.cjs');
    expect(debugAdapterBuild).toContain("format: 'cjs'");
    expect(debugAdapterBuild).toContain('bufferutil');
    expect(debugAdapterBuild).toContain('utf-8-validate');
  });

  it('.vscode/launch.json содержит конфигурации osjs launch и attach', () => {
    const configurations = launchJson?.configurations ?? [];
    expect(configurations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'osjs', request: 'launch', program: '${file}' }),
        expect.objectContaining({
          type: 'osjs',
          request: 'attach',
          url: 'http://localhost:5173/examples/hello.html',
          webRoot: '${workspaceFolder}',
        }),
      ]),
    );
  });
});
