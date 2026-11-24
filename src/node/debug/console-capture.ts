import { format } from 'node:util';

/** Категории DAP-вывода, которые порождает console. */
export type ConsoleCategory = 'stdout' | 'stderr';

/**
 * Подменяет `console.*` на время запуска движка: stdout адаптера — канал DAP,
 * поэтому вывод BSL обязан уходить в output-события. Оригиналы сохраняются,
 * чтобы после запуска вернуть их логгеру адаптера.
 */
export function captureConsole(
  write: (category: ConsoleCategory, text: string) => void,
): () => void {
  const originals = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  const emit =
    (category: ConsoleCategory) =>
    (...args: unknown[]): void => {
      write(category, `${format(...args)}\n`);
    };
  console.log = emit('stdout');
  console.info = emit('stdout');
  console.warn = emit('stderr');
  console.error = emit('stderr');
  return () => {
    console.log = originals.log;
    console.info = originals.info;
    console.warn = originals.warn;
    console.error = originals.error;
  };
}
