/**
 * OneScriptJS — движок языка 1С/BSL, переписанный на TypeScript.
 *
 * Этот файл — точка входа библиотеки (Node.js / бандлеры).
 * Полноценная реализация лексера, парсера и рантайма добавляется
 * по задачам из плана разработки (см. AGENTS.md и docs/architecture.md).
 */

export const ONESCRIPT_VERSION = '0.1.0';

/** Возвращает версию движка. */
export function version(): string {
  return ONESCRIPT_VERSION;
}
