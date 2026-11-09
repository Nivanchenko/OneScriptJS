import { readFileSync } from 'node:fs';
import { run } from '../runtime/runner';
import { createGlobalContext } from '../stdlib/global-context';

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file && process.stdin.isTTY) {
    console.error('Использование: oscript <файл.os>   или   echo "..." | oscript');
    process.exitCode = 2;
    return;
  }
  const source = file ? readFileSync(file, 'utf8') : await readStdin();
  run(source, createGlobalContext());
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
