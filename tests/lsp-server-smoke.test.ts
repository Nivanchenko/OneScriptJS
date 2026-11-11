import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
import { describe, expect, it } from 'vitest';

const DIST = 'dist/lsp/server.mjs';

describe.skipIf(!existsSync(DIST))('smoke: собранный LSP-сервер (stdio)', () => {
  it('initialize → completion → shutdown → exit', async () => {
    const child = spawn(process.execPath, [DIST], {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const connection = createMessageConnection(
      new StreamMessageReader(child.stdout),
      new StreamMessageWriter(child.stdin),
    );
    connection.listen();
    try {
      const init = (await connection.sendRequest('initialize', {
        processId: process.pid,
        rootUri: null,
        capabilities: {},
      })) as { capabilities: { positionEncoding?: string } };
      expect(init.capabilities.positionEncoding).toBe('utf-16');

      const completion = await connection.sendRequest('textDocument/completion', {
        textDocument: { uri: 'file:///app/smoke.osjs' },
        position: { line: 0, character: 0 },
      });
      expect(Array.isArray(completion)).toBe(true);

      await connection.sendRequest('shutdown');
      connection.sendNotification('exit');
      await new Promise<void>((resolve) => child.on('exit', () => resolve()));
      expect(child.exitCode).toBe(0);
    } finally {
      connection.dispose();
      if (child.exitCode === null) child.kill();
    }
  }, 20000);
});
