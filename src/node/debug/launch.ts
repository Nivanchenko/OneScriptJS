import { formatErrorReport } from '../../runtime/error-snapshot';
import type { DebugController } from '../../runtime/debug/controller';
import { run } from '../../runtime/runner';
import { createNodeGlobalContext } from '../context';
import { collectModuleSources, resolveNodePath } from '../module-source';

/** Вывод запуска в DAP: stdout/stderr процесса занят протоколом. */
export type LaunchOutput = (category: 'stdout' | 'stderr', text: string) => void;

/**
 * Исполняет сценарий в процессе адаптера (research R8): движок синхронный, отдельный
 * процесс не нужен, а `process.exit` скрипта остаётся известным риском. Ошибка скрипта
 * не выходит наружу — она становится кодом 1 и текстом в output.
 */
export async function runLaunch(
  program: string,
  source: string,
  controller: DebugController | undefined,
  output: LaunchOutput,
): Promise<number> {
  try {
    const modules = collectModuleSources(program, source);
    const ctx = createNodeGlobalContext();
    if (controller !== undefined) ctx.debug = controller;
    await run(source, ctx, {
      path: program,
      basePath: program,
      modules,
      resolve: resolveNodePath,
    });
    return 0;
  } catch (error) {
    output('stderr', formatErrorReport(error));
    return 1;
  }
}
