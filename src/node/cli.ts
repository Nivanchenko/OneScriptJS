import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { run, version } from '../index';
import { createNodeGlobalContext } from './context';
import { collectModuleSources, resolveNodePath } from './module-source';

async function main(): Promise<void> {
  const arg = process.argv[2];

  if (arg === '--help' || arg === '-h') {
    console.log('oscript — OneScript (BSL/1С) на TypeScript');
    console.log('Использование: oscript <файл.os>   или   echo "..." | oscript');
    console.log('  --help, -h      показать справку');
    console.log('  --version, -v   показать версию');
    return;
  }
  if (arg === '--version' || arg === '-v') {
    console.log(version());
    return;
  }
  if (!arg && process.stdin.isTTY) {
    console.error('Использование: oscript <файл.os>   или   echo "..." | oscript');
    process.exitCode = 2;
    return;
  }

  if (arg) {
    const entryPath = resolve(arg);
    const source = readFileSync(entryPath, 'utf8');
    const modules = collectModuleSources(entryPath, source);
    run(source, createNodeGlobalContext(), {
      path: arg,
      basePath: entryPath,
      modules,
      resolve: resolveNodePath,
    });
    return;
  }

  const source = await readStdin();
  run(source, createNodeGlobalContext());
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
