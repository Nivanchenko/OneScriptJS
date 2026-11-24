import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DapStreamReader, type DapMessage } from './helpers/dap';

const DIST = 'dist/debug/adapter.cjs';

describe.skipIf(!existsSync(DIST))('smoke: собранный DAP-адаптер (stdio)', () => {
  it('initialize отвечает по DAP, stdout содержит только DAP-фреймы', async () => {
    const child = spawn(process.execPath, [DIST], { stdio: ['pipe', 'pipe', 'ignore'] });
    const raw: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => raw.push(chunk));
    const reader = new DapStreamReader(child.stdout);
    try {
      const response = reader.waitFor(
        (message: DapMessage) => message.type === 'response' && message.command === 'initialize',
        10000,
        'ответ initialize',
      );
      const request = JSON.stringify({
        seq: 1,
        type: 'request',
        command: 'initialize',
        arguments: {
          clientID: 'smoke',
          adapterID: 'osjs',
          linesStartAt1: true,
          columnsStartAt1: true,
          pathFormat: 'path',
        },
      });
      child.stdin.write(
        `Content-Length: ${Buffer.byteLength(request, 'utf8')}\r\n\r\n${request}`,
      );

      const init = await response;
      expect(init.success).toBe(true);
      expect(init.body).toMatchObject({ supportsConfigurationDoneRequest: true });
      // stdout — канал протокола: до первого заголовка не должно быть ни байта.
      expect(Buffer.concat(raw).toString('utf8').startsWith('Content-Length: ')).toBe(true);
    } finally {
      reader.dispose();
      if (child.exitCode === null) {
        child.kill();
        await new Promise<void>((resolve) => child.once('exit', () => resolve()));
      }
    }
  }, 20000);
});
