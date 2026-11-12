import * as vscode from 'vscode';
import {
  LanguageClient,
  RevealOutputChannelOn,
  State,
  Trace,
  type LanguageClientOptions,
  type ServerOptions,
} from 'vscode-languageclient/node';

const CONFIG_SECTION = 'onescriptjs';
const OUTPUT_CHANNEL = 'OneScriptJS';
const SERVER_ENTRY = 'server/server.mjs';

let client: LanguageClient | undefined;
let outputChannel: vscode.LogOutputChannel | undefined;
let errorShown = false;

function log(message: string): void {
  outputChannel?.appendLine(message);
}

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

/** `osjs` — всегда; `html` — только при включённом embedded-режиме; `.os` — никогда. */
function documentSelector(): Array<{ scheme: string; language: string }> {
  const selector: Array<{ scheme: string; language: string }> = [
    { scheme: 'file', language: 'osjs' },
    { scheme: 'untitled', language: 'osjs' },
  ];
  if (config().get<boolean>('embeddedInHtml', true)) {
    selector.push({ scheme: 'file', language: 'html' }, { scheme: 'untitled', language: 'html' });
  }
  return selector;
}

function traceFromConfig(): Trace {
  switch (config().get<string>('trace', 'off')) {
    case 'messages':
      return Trace.Messages;
    case 'verbose':
      return Trace.Verbose;
    default:
      return Trace.Off;
  }
}

function serverOptions(context: vscode.ExtensionContext): ServerOptions {
  const serverPath = context.asAbsolutePath(SERVER_ENTRY);
  // process.execPath — Node-рантайм VS Code (Electron): отдельный Node.js не нужен.
  const executable = {
    command: process.execPath,
    args: [serverPath],
    options: { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
  };
  log(`[server] запуск: ${executable.command} ${executable.args.join(' ')}`);
  return { run: executable, debug: executable };
}

function languageClientOptions(): LanguageClientOptions {
  return {
    documentSelector: documentSelector(),
    synchronize: { configurationSection: CONFIG_SECTION },
    outputChannel,
    traceOutputChannel: outputChannel,
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    connectionOptions: { maxRestartCount: 1 },
  };
}

function stateLabel(state: State): string {
  switch (state) {
    case State.Starting:
      return 'starting';
    case State.Running:
      return 'running';
    case State.Stopped:
      return 'stopped';
    default:
      return String(state);
  }
}

async function startClient(context: vscode.ExtensionContext): Promise<void> {
  if (client) return;
  const next = new LanguageClient(
    'onescriptjs',
    'OneScriptJS',
    serverOptions(context),
    languageClientOptions(),
  );
  next.onDidChangeState((event) => log(`[client] состояние: ${stateLabel(event.newState)}`));
  client = next;
  try {
    await next.start();
    await next.setTrace(traceFromConfig());
    errorShown = false;
    log('[client] сервер запущен');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`[client] ошибка запуска сервера: ${message}`);
    if (client === next) client = undefined;
    try {
      await next.stop();
    } catch {
      // клиент мог не успеть запуститься — останавливать нечего
    }
    if (!errorShown) {
      errorShown = true;
      void vscode.window.showErrorMessage(
        `OneScriptJS: не удалось запустить LSP-сервер (${message}). Подробности — в Output «OneScriptJS»; проверьте установку расширения или выполните «OneScriptJS: Restart Language Server».`,
      );
    }
  }
}

async function stopClient(): Promise<void> {
  const current = client;
  client = undefined;
  if (!current) return;
  try {
    await current.stop();
    log('[client] сервер остановлен');
  } catch (error) {
    log(
      `[client] ошибка остановки сервера: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function restartClient(context: vscode.ExtensionContext, reason: string): Promise<void> {
  log(`[client] перезапуск: ${reason}`);
  errorShown = false;
  await stopClient();
  await startClient(context);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL, { log: true });
  outputChannel = channel;
  context.subscriptions.push(channel);

  context.subscriptions.push(
    vscode.commands.registerCommand('onescriptjs.restartServer', async () => {
      await restartClient(context, 'команда «OneScriptJS: Restart Language Server»');
    }),
    vscode.commands.registerCommand('onescriptjs.showOutput', () => {
      channel.show(true);
    }),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      const embedded = event.affectsConfiguration(`${CONFIG_SECTION}.embeddedInHtml`);
      const traceChanged = event.affectsConfiguration(`${CONFIG_SECTION}.trace`);
      if (!embedded && !traceChanged) return;
      await restartClient(
        context,
        embedded
          ? 'изменена настройка onescriptjs.embeddedInHtml'
          : 'изменена настройка onescriptjs.trace',
      );
    }),
  );

  await startClient(context);
}

export async function deactivate(): Promise<void> {
  await stopClient();
}
