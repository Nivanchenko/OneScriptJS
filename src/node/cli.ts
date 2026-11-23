import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { run, version } from '../index';
import { formatErrorReport } from '../runtime/error-snapshot';
import { createNodeGlobalContext } from './context';
import { collectModuleSources, resolveNodePath } from './module-source';

/** Ввод-вывод CLI; подменяется в тестах. */
export interface CliIo {
  out(text: string): void;
  err(text: string): void;
  /** Чтение stdin; отсутствует — CLI без файла печатает справку и код 2. */
  stdin?(): Promise<string>;
}

const USAGE = 'Использование: oscript <файл.osjs>   или   echo "..." | oscript';

/**
 * Запускает CLI и возвращает код возврата: 0 — успех, 1 — ошибка исполнения
 * (в stderr — `модуль:строка: описание` и BSL-стек), 2 — ошибка использования.
 */
export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const arg = argv[0];

  if (arg === '--help' || arg === '-h') {
    io.out('oscript — OneScript (BSL/1С) на TypeScript');
    io.out(USAGE);
    io.out('  --help, -h      показать справку');
    io.out('  --version, -v   показать версию');
    return 0;
  }
  if (arg === '--version' || arg === '-v') {
    io.out(version());
    return 0;
  }

  try {
    if (arg) {
      const entryPath = resolve(arg);
      const source = readFileSync(entryPath, 'utf8');
      const modules = collectModuleSources(entryPath, source);
      await run(source, createNodeGlobalContext(), {
        path: arg,
        basePath: entryPath,
        modules,
        resolve: resolveNodePath,
      });
      return 0;
    }

    if (!io.stdin) {
      io.err(USAGE);
      return 2;
    }
    const source = await io.stdin();
    await run(source, createNodeGlobalContext(), { sourceId: '<stdin>' });
    return 0;
  } catch (error) {
    // Ошибка с снимком печатается с позицией и стеком; без снимка — прежний текст.
    io.err(formatErrorReport(error));
    return 1;
  }
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

async function main(): Promise<void> {
  const io: CliIo = {
    out: (text) => console.log(text),
    err: (text) => console.error(text),
    ...(process.stdin.isTTY ? {} : { stdin: readStdin }),
  };
  process.exitCode = await runCli(process.argv.slice(2), io);
}

/** Запуск только при прямом исполнении `dist/cli.mjs`, а не при импорте в тестах. */
function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (invokedDirectly()) void main();
