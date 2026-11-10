// Прогон всех reference/OneScript/tests/*.os через xUnit-раннер.
// Использование: node scripts/run-reference-tests.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runTests, createGlobalContext } from '../dist/node/index.js';

const testsDir = join(process.cwd(), 'reference', 'OneScript', 'tests');
const files = readdirSync(testsDir).filter((f) => f.endsWith('.os')).sort();

// Сетевые/процессные/COM/бесконечно-циклящиеся/раннер — пропускаем.
const SKIP = new Set([
  'socket.os', 'http.os', 'process.os', 'tasks.os', 'addin.os', 'managed-com.os',
  'native-api.os', 'native-module.os', 'cgi-output.os', 'cli-eval.os', 'testrunner.os',
  'shebanged-test.os', 'tests-cmd-line.os', 'console.os', 'showversion.os',
]);

let passed = 0;
let failed = 0;
const failures = [];

for (const file of files) {
  if (SKIP.has(file)) continue;
  const source = readFileSync(join(testsDir, file), 'utf8');
  try {
    const results = runTests(source, createGlobalContext());
    const bad = results.filter((r) => !r.passed);
    if (bad.length === 0) {
      passed++;
    } else {
      failed++;
      failures.push(`${file}: ${bad.length} тест(ов) упало — ${bad[0].name}: ${bad[0].error}`);
    }
  } catch (e) {
    failed++;
    failures.push(`${file}: ОШИБКА — ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log(`\n=== ИТОГ: всего ${passed + failed}, прошло ${passed}, упало ${failed} ===\n`);
for (const f of failures) console.log('  ' + f);
