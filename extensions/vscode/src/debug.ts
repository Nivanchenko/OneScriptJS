import * as vscode from 'vscode';

const ADAPTER_ENTRY = 'out/debug-adapter.js';

/**
 * Окружение адаптера: `ELECTRON_RUN_AS_NODE` запускает бандл на Node-рантайме
 * VS Code (Electron), отдельный Node.js не нужен — как у LSP-сервера.
 */
function adapterEnv(): { [key: string]: string } {
  const env: { [key: string]: string } = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  env.ELECTRON_RUN_AS_NODE = '1';
  return env;
}

/** Регистрирует фабрику DAP-адаптера типа `osjs`; возвращает подписку для dispose. */
export function registerDebug(context: vscode.ExtensionContext): vscode.Disposable {
  const factory: vscode.DebugAdapterDescriptorFactory = {
    createDebugAdapterDescriptor: () =>
      new vscode.DebugAdapterExecutable(
        process.execPath,
        [context.asAbsolutePath(ADAPTER_ENTRY)],
        { env: adapterEnv() },
      ),
  };
  return vscode.debug.registerDebugAdapterDescriptorFactory('osjs', factory);
}
