# Tasks: Отладчик BSL (DAP)

**Input**: Design documents from `specs/021-debugger/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: TDD обязателен (конституция III). В каждой задаче сначала падающий тест, потом
минимальная реализация. Гейт после каждой волны: `pnpm typecheck && pnpm test`.

**Branch**: `feature/021-debugger` (создана, база — `e53417f`; `feature/020-runtime-error-info`
запушена в origin).

## Format: `[ID] [P?] [Story] Description`

- **[P]** — можно параллелить с другими [P]-задачами (разные файлы, нет зависимостей)
- **[Story]** — US1..US5 из spec.md
- Волны W1–W6 — из plan.md; внутри волны задачи выполняются по порядку, если не [P].

---

## Phase 0: Setup (выполнено Lead)

- [x] T001 Ветка `feature/021-debugger` от `e53417f` (020 закоммичена, ветка запушена).
- [x] T002 Базовая линия: `pnpm typecheck` OK, `pnpm test` — 91 файл / 944 теста зелёные.
- [x] T003 Новые devDependencies установлены: `@vscode/debugadapter@1.68.0`,
  `@vscode/debugprotocol@1.68.0`, `ws@8.23.0`, `@types/ws@8.18.2` (root, бандлятся).
- [x] T004 Артефакты плана: spec/context (из 020), plan, research, data-model, contracts,
  quickstart, checklists — созданы Lead.

**Write scope W1**: `src/runtime/scope.ts`, `src/runtime/interpreter.ts`,
`src/runtime/context.ts`, `src/runtime/debug/**` (new), `tests/debug-*.test.ts` (new),
`tests/fixtures/debug/**` (new).

---

## Phase 1 (W1): Runtime core — блокирует все истории

- [x] T005 [P] [Foundational] Тесты контроллера — `tests/debug-controller.test.ts`:
  брейкпоинт останавливает на строке; `next` — та же глубина; `stepIn` — внутрь;
  `stepOut` — наружу; `continue` — до следующего брейкпоинта; `pause` срабатывает на
  следующем операторе; `stop()` снимает гейты; поток-задание (`forkForJob`) виден в
  `threads()`. **Результат**: тесты шагов/pause/`stop`/потоков зелёные, включая
  `pause` в плотном цикле (slicer уступает хосту).
- [x] T006 [Foundational] `Scope.ownEntries()` с исходным написанием имён
  (`src/runtime/scope.ts`), `ActiveFrame` + поля `scope`/`ctx`/`interp` во всех сайтах
  `pushFrame`, `RuntimeEnvironment.debug?` (`src/runtime/context.ts`), хук в `exec`
  (`src/runtime/interpreter.ts`): `const gate = debug.onStatement(...); if (gate) yield gate`.
  Отладчик выключен — ни одного нового `yield`, sync-путь не меняется.
  **Результат**: хук один (`exec`/`execDynamic`), `tests/async-runtime.test.ts` зелёный.
- [x] T007 [Foundational] `src/runtime/debug/controller.ts`: реестр брейкпоинтов, режимы
  `run/pauseRequested/step*`, гейт `Promise`, реестр потоков, снимок кадров, sink
  (`stopped/continued/output/terminated`), `guard.tryDepth` в `execTryExcept`,
  `WeakSet` для подавления повторного стопа на ошибке; `stop()` резолвит гейты.
  **Результат**: `tests/debug-controller.test.ts` и `tests/async-runtime.test.ts` зелёные.
- [x] T008 [P] [Foundational] Тесты переменных/evaluate — `tests/debug-variables.test.ts`:
  `scopes` (локальные/модуль), `variables` для примитивов, `Массив`/`Структура`/
  `Соответствие`, защита от циклов, `evaluate` в остановленном кадре, ошибка evaluate не
  ломает сессию, повторный evaluate. **Результат**: тесты зелёные.
- [x] T009 [Foundational] `src/runtime/debug/values.ts` (визуализатор + ленивые
  `variablesReference`) и `Interpreter.evaluateInFrame(scope, ctx, source)` на
  `compileDynamic`/`checkDynamicExpression`/`evalDynamicExpression`.
  **Результат**: `tests/debug-variables.test.ts` зелёный.
- [x] T010 [Foundational] Регресс-гейт волны: `pnpm typecheck && pnpm test`; проверить, что
  `run()` синхронного скрипта без отладчика по-прежнему не Promise; фикстуры
  `tests/fixtures/debug/{nested,loop,throw,async,jobs}.osjs`.
  **Результат**: гейт зелёный; фикстуры созданы.

**Checkpoint**: контроллер/шаги/переменные/evaluate работают на движке; можно строить адаптер.

**Write scope W2**: `src/node/debug-adapter.ts` (new), `src/node/debug/**` (new, кроме
`ws-server.ts`/`url-map.ts` — W3; attach живёт в `session.ts`), `extensions/vscode/src/debug.ts` (new),
`extensions/vscode/package.json`, `extensions/vscode/README.md`,
`scripts/build-vscode-extension.mjs`, `scripts/build-debug-adapter.mjs` (new),
`.vscode/launch.json` (new), `tests/dap-session.test.ts`, `tests/dap-stdio-smoke.test.ts`,
`tests/vscode-extension.test.ts`, `tests/fixtures/debug/*.osjs` (только чтение).

---

## Phase 2 (W2): DAP-адаптер, Node launch, расширение VS Code (US1, P1)

- [x] T011 [P] [US1] Тесты DAP in-memory — `tests/dap-session.test.ts`: `PassThrough`-пара
  + `new OsjsDebugSession().start(in, out)`; последовательность `initialize` →
  `initialized` → `setBreakpoints` → `configurationDone` → `stopped(breakpoint)` →
  `threads`/`stackTrace`/`scopes`/`variables`/`evaluate` → `next`/`stepIn`/`stepOut` →
  `continue` → `output` → `exited`/`terminated`; `pause` в долгом цикле; `disconnect` на
  паузе; брейкпоинт на неисполняемой строке → `verified:false`.
  **Результат**: сценарий зелёный.
- [x] T012 [US1] `src/node/debug/session.ts` (`OsjsDebugSession extends LoggingDebugSession`):
  capabilities (по `contracts/dap-adapter.md`), маппинг запросов на контроллер, `Handles`
  для кадров/переменных, ленивые `variablesReference`-провайдеры по пути, `evaluate`
  (ошибка hover — значение `err: <expr>`), нормализация `output` (`\n`).
  **Результат**: реализовано; браузерный `attach` живёт в этом же файле (отдельного
  `attach.ts` нет — см. T021).
- [x] T013 [US1] `src/node/debug/launch.ts` + `src/node/debug/console-capture.ts`: `run()`
  в процессе адаптера, `env.debug = controller`, перехват `console.*` → DAP `output`
  (stdout — только DAP-фреймы), `process.exit`/ошибка → `exited`/`terminated`, не падать.
  **Результат**: реализовано.
- [x] T014 [US1] Entry `src/node/debug-adapter.ts` (`DebugSession.run(OsjsDebugSession)`),
  `scripts/build-debug-adapter.mjs` (esbuild → `dist/debug/adapter.cjs`,
  `external: ['bufferutil','utf-8-validate']`), script `build:debug-adapter`;
  `tests/dap-stdio-smoke.test.ts` (`describe.skipIf` без артефакта).
  **Результат**: адаптер собирается, smoke зелёный; приёмка —
  `tests/fixtures/debug/run-dap-smoke.mjs`.
- [x] T015 [P] [US1] `extensions/vscode/package.json`: `contributes.debuggers` (тип `osjs`,
  launch/attach, snippets), `contributes.breakpoints`, activationEvents
  `onDebugResolve:osjs`/`onDebugInitialConfigurations`; `extensions/vscode/src/debug.ts`:
  `DebugAdapterDescriptorFactory` → `DebugAdapterExecutable(process.execPath,
  [asAbsolutePath('out/debug-adapter.js')], {ELECTRON_RUN_AS_NODE:'1'})`; регистрация в
  `activate()`; `tests/vscode-extension.test.ts` — утверждения по `debuggers`.
  **Результат**: реализовано, тесты расширения зелёные.
- [x] T016 [US1] `scripts/build-vscode-extension.mjs`: второй esbuild-entry
  `src/node/debug-adapter.ts` → `out/debug-adapter.js` (CJS, `external:
  ['vscode','bufferutil','utf-8-validate']`); `.vscode/launch.json` с launch/attach;
  `pnpm build:vscode` → `.vsix` содержит `out/debug-adapter.js`; `pnpm typecheck:vscode`.
  **Результат**: entry в `.vsix`, typecheck зелёный.

**Checkpoint**: Node launch из VS Code по quickstart.md §1–§2; in-memory DAP-тесты зелёные.

**Write scope W3**: `src/debug/page-protocol.ts` (new), `src/browser/debug/agent.ts` (new),
`src/browser/onescript-debug.ts` (new), `src/browser/onescript.ts`,
`src/node/debug/session.ts` (attach — отдельного `attach.ts` нет),
`src/node/debug/ws-server.ts` (new), `src/node/debug/url-map.ts` (new),
`vite.debug.config.ts` (new), `vite.config.ts`,
`package.json` (scripts build chain), `tests/browser-debug-agent.test.ts`,
`tests/dap-attach.test.ts`, `tests/debug-url-map.test.ts`, `tests/debug-ws-server.test.ts`,
`tests/fixtures/debug/page.html`, `tests/fixtures/debug/app.osjs`.

---

## Phase 3 (W3): Browser attach (US2, P1)

- [x] T017 [P] [US2] `src/debug/page-protocol.ts` — типы протокола
  (`contracts/page-agent-protocol.md`), browser-safe. **Результат**: реализовано.
- [x] T018 [P] [US2] `src/node/debug/url-map.ts` + `tests/debug-url-map.test.ts`:
  URL↔файл (webRoot, `file://`, усечение dev-base, виртуальные), `baseURI`, query/hash,
  percent-decoding, кэш на сессию. **Результат**: тесты зелёные.
- [x] T019 [US2] `src/browser/debug/agent.ts`: WS-клиент с retry, `hello`/манифест
  источников, контроллер (`src/runtime/debug/controller.ts`), перехват `console.*`,
  трансляция событий/команд, `attach()` → `DebugController | null`, dispose снимает гейты;
  `src/browser/onescript-debug.ts` — IIFE-entry. **Результат**: реализовано.
- [x] T020 [US2] `src/browser/onescript.ts`: гейт `globalThis.__OSJS_DEBUG__?.attach(...)`
  до `runAll` (type-only импорт — production-бандл без контроллера), `ctx.debug` на блок;
  `tests/browser-debug-agent.test.ts` (happy-dom + фейковый сокет): до `configured` ничего
  не исполнено; брейкпоинт → `stopped`; `resume` → вывод; DOM-клик на паузе гейтится;
  `dispose` на паузе → страница продолжает. **Результат**: тесты зелёные.
- [x] T021 [US2] Attach в `src/node/debug/session.ts` (`attachRequest`/`startAttach`/
  `completeAttach`) + `src/node/debug/ws-server.ts`: WS на `127.0.0.1` (порт из конфига,
  дефолт 9229, `EADDRINUSE` — понятная ошибка), Origin/token, одна сессия
  (`rejected`+close 1013), `hello`/`helloAck`/`configured`, трансляция в
  `OsjsDebugSession`; `tests/dap-attach.test.ts` с фейковым page-agent,
  `tests/debug-ws-server.test.ts`. **Результат**: отдельного `attach.ts` нет — attach
  живёт в `session.ts`; тесты зелёные.
- [x] T022 [US2] Dev-инъекция и сборка: `vite.config.ts` — отдача `/onescript-debug.js` +
  `transformIndexHtml` при `OSJS_DEBUG=1` (инъекция до `onescript.js`);
  `vite.debug.config.ts` (IIFE → `dist/onescript-debug.js`, `emptyOutDir:false`),
  scripts `build:debug-client` и включение в `build`; тест «`dist/onescript.js` не содержит
  агента». **Результат**: `tests/debug-bundle.test.ts` зелёный.

**Checkpoint**: attach из VS Code по quickstart.md §3; страница не висит, брейкпоинты
внешнего `.osjs` работают; production-бандл чист.

**Write scope W4**: `src/runtime/debug/controller.ts`, `src/node/debug/session.ts`,
`tests/debug-controller.test.ts` (дополнения), `tests/dap-session.test.ts` (дополнения),
`tests/fixtures/debug/*.osjs`.

---

## Phase 4 (W4): P2 — условия/logpoints и исключения (US4)

- [x] T023 [US4] Условия и logpoints: `condition` вычисляется в области кадра, ошибка
  условия — не останавливаться + `output`; `logMessage` с `{выражение}` печатает и не
  останавливает; capabilities `supportsConditionalBreakpoints`/`supportsLogPoints` = true;
  тесты (условие ложно/истинно/ошибка; logpoint). **Результат**: тесты зелёные.
- [x] T024 [US4] Исключения: `setExceptionBreakpoints` (`uncaught`/`all`), `guard.tryDepth`
  (`uncaught` — только при 0), `WeakSet` от повторных стопов, `stopped(reason:'exception')`
  + описание; тесты: `1/0` вне `Попытка` — стоп; внутри `Попытка` — нет; перевыброс — один
  стоп; `all` — стоп на каждом. **Результат**: тесты зелёные.

**Checkpoint**: US4 принят; существующие DAP-сценарии не сломаны.

**Write scope W5**: `src/debug/html-mapping.ts` (new),
`src/node/debug/session.ts` (маппинг HTML-строк в `setBreakpoints`, манифест/валидация),
`src/runtime/debug/controller.ts` (потоки/шаги через `Ждать`),
`tests/debug-html-map.test.ts`, `tests/dap-attach.test.ts` (HTML),
`tests/debug-controller.test.ts` (потоки), фикстуры.

---

## Phase 5 (W5): P2/P3 — inline HTML (US3) и async/задания-потоки (US5)

- [x] T025 [P] [US3] `src/debug/html-mapping.ts`: `findBlocks` + манифест → HTML-строка ↔
  (sourceId, blockLine), валидация текста блока, `verified:false` вне блока/диапазона;
  `tests/debug-html-map.test.ts` (включая `<template>`, `type="text/osjs "`, правку файла).
  **Результат**: тесты зелёные.
- [x] T026 [US3] Интеграция: `setBreakpoints` для HTML-файла маппит строки в
  `engineSourceId`+локальную строку, ответ `verified:true, line:<htmlLine>`; attach
  регистрирует HTML-источники по `hello`; тест на фикстуре `page.html` (inline + внешний).
  **Результат**: реализовано в `session.ts`.
- [x] T027 [US5] Потоки: `threads` для `forkForJob` (id ≥2, имя), `pause` стопорит все,
  `stopped(threadId)`, шаг через `Ждать`/`Асинх`; тесты в `debug-controller`/`dap-session`.
  **Результат**: тесты зелёные.

**Checkpoint**: US3/US5 приняты; P1/P2 не сломаны.

**Write scope W6**: `README.md`, `docs/architecture.md`, `docs/status.md`,
`extensions/vscode/README.md`, `.github/workflows/release.yml` (при необходимости),
`AGENTS.md` (если меняются команды/дерево), `specs/021-debugger/tasks.md` (чекбоксы).

---

## Phase 6 (W6): Документация и финальная верификация

- [x] T028 [P] Документация: README «Отладчик (DAP)» (launch/attach, dev-инъекция,
  ограничения); `docs/architecture.md` §12 «Отладчик»; `docs/status.md` (спека 021,
  счётчик тестов, известные ограничения: `process.exit`, `spawnSync`, mixed content);
  `extensions/vscode/README.md`; `release.yml` — артефакты `dist/onescript-debug.js` и
  `dist/debug/`.
- [x] T029 Финальная верификация: `pnpm typecheck && pnpm test && pnpm check:docs &&
  pnpm build && pnpm typecheck:vscode && pnpm build:vscode`; проверить `.vsix`; приёмка по
  quickstart.md (launch + attach вручную); чекбоксы tasks.md; вывод приложить.
  **Результат**: typecheck OK; **101 файл / 1047 тестов**; check:docs OK; build OK;
  typecheck:vscode OK; build:debug-adapter OK; `tests/dap-stdio-smoke` 1 passed;
  `node tests/fixtures/debug/run-dap-smoke.mjs` → PASS (initialize→launch→setBreakpoints→
  configurationDone→stopped→stackTrace→continue→exited(0)/terminated); `build:vscode` →
  `.vsix` 12 файлов, содержит `out/debug-adapter.js`; `dist/onescript.js` без отладочного
  кода; `dist/onescript-debug.js` 15.8 КБ. GUI-приёмка launch/attach в VS Code остаётся
  за владельцем (в окружении нет GUI). Коммит не делался — по правилу «только по явной
  просьбе».

**Checkpoint**: Definition of Done из plan.md выполнен.

---

## Dependencies

- W1 → W2, W3 (контроллер/движок).
- W2 → W3 (attach использует `OsjsDebugSession`), W4 (сессия), W5 (сессия).
- W3 → W5 (attach/HTML).
- W4, W5 — после W2/W3, между собой могут идти параллельно при непересекающихся файлах
  (W4: controller+session; W5: html-mapping+attach — session.ts общий, поэтому
  последовательно, если не разделить по функциям).
- W6 — последняя.

## Parallel execution example

```text
W1: T005..T010 (один агент, последовательно)
W2: T011..T016 (один агент; T011/T015 можно параллельно, если разные файлы)
W3: T017/T018 параллельно; T019..T022 последовательно
W4 и W5: последовательно (общий session.ts)
W6: T028 параллельно с финальным прогоном T029 после стабилизации кода
```
