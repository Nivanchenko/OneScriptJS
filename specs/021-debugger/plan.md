# Implementation Plan: Отладчик BSL (DAP)

**Branch**: `feature/021-debugger` | **Date**: 2026-11-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/021-debugger/spec.md` (черновик из соседней
сессии, Q1–Q10 закрыты в [research.md](./research.md)); контекст — [context.md](./context.md).

## Summary

DAP-совместимый отладчик BSL: Node `launch` (адаптер исполняет движок в своём процессе) и
браузерный `attach` (page-agent ↔ адаптер по WebSocket). Пауза — `yield` Promise-гейта в
генераторном интерпретаторе: стек сохраняется нативно, страница не блокируется.
Брейкпоинты/шаги/стек/переменные/evaluate работают через снимок кадров на остановке;
выключенный отладчик не меняет синхронный быстрый путь (одна проверка `env.debug` на
оператор). Браузерный production-бандл не тянет отладочный клиент (отдельный
`dist/onescript-debug.js`, инъекция dev-плагином). Условные брейкпоинты/logpoints,
исключения, задания-потоки — P2/P3 после MVP. BSL-видимый API не появляется.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node.js >= 20 (dev — v24.22.0), браузерный
IIFE-бандл

**Primary Dependencies** (новые, root devDependencies; бандлятся в `.vsix`):
`@vscode/debugadapter@1.68.0`, `@vscode/debugprotocol@1.68.0`, `ws@8.23.0`,
`@types/ws@8.18.2`. Обоснование — research R4. Уже установлены в ветке.

**Storage**: N/A — всё в памяти; исходники уже доступны загрузчику/адаптеру.

**Testing**: Vitest (`tests/**/*.test.ts`): unit контроллера/движка, integration DAP через
`DebugSession.start(PassThrough, PassThrough)`, browser page-agent на happy-dom + фейковый
сокет, чистые тесты маппинга, smoke собранного адаптера (`describe.skipIf`), расширение —
`tests/vscode-extension.test.ts`. Playwright нет (спека 007 — Draft) — e2e вне 021.

**Target Platform**: браузер — основная среда (attach); Node — CLI/адаптер/тесты.

**Project Type**: движок языка (библиотека) + CLI + браузерный бандл + VS Code-расширение.

**Performance Goals**: выключенный отладчик — ноль новых `yield`, одна проверка на
оператор; включённый — кооперативные уступки хосту (квант ~10 мс) для отзывчивого `pause`;
снимок кадров только на остановке; переменные — лениво через `variablesReference`.

**Constraints**: ядро (`src/lexer|parser|ast|runtime|stdlib`) без `node:*`/DOM; отладочный
транспорт — `src/node`/`extensions/vscode`; `src/index.ts` не реэкспортирует debug-код;
`dist/onescript.js` не содержит агента (FR-011); stdout адаптера — только DAP; TDD;
`pnpm typecheck && pnpm test` и `pnpm build`/`check:docs`/`typecheck:vscode` — гейты.

**Scale/Scope**: ~2–3 тыс. строк: контроллер+визуализатор ~500–700, движок ~100–200,
DAP-адаптер ~500–700, page-agent+транспорт ~300–400, маппинг ~200, расширение/сборка
~150, тесты ~600–800. MVP (US1–US2) — основной объём; US3–US5 — волны после.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Язык, формат `.osjs` и эталон** — PASS: семантика шагов/остановок/переменных
  сверяется с эталоном (`MachineStopManager.cs`, `OscriptDebugSession.cs`), расхождения
  (генераторная пауза вместо блокировки потока, no-TCP) фиксируются в research.md и
  тестами; новых BSL-имён нет — RU/EN-алиасы не требуются.
- **II. Один движок — две среды** — PASS: контроллер в `src/runtime/debug` без
  `node:*`/DOM; транспорт/адаптер — `src/node`; page-agent — `src/browser`; production
  бандл без отладочного клиента; браузерная сборка проверяется `pnpm build:browser`.
- **III. Test-First** — PASS: каждая задача начинается с падающего теста (Vitest);
  tasks.md фиксирует тесты до реализации.
- **IV. Слои и минимальный код** — PASS: направление зависимостей сохраняется
  (`runtime → debug` нет: контроллер лежит в runtime и подключается через
  `RuntimeEnvironment`; `src/debug` — общие браузерные типы); новых абстракций «на
  потом» нет; зависимости обоснованы (R4).
- **V. Доказанное «готово»** — PASS: `pnpm typecheck && pnpm test`, `pnpm build`,
  `pnpm check:docs`, `pnpm typecheck:vscode`, `pnpm build:vscode`, ручная приёмка по
  [quickstart.md](./quickstart.md).

Нарушений, требующих Complexity Tracking, нет.

## Project Structure

### Documentation (this feature)

```text
specs/021-debugger/
├── spec.md              # спека (черновик из соседней сессии)
├── context.md           # техническая карта (черновик)
├── plan.md              # этот файл
├── research.md          # Phase 0: решения R1–R10, факты F1–F12, риски
├── data-model.md        # Phase 1: сущности runtime/adapter/page-agent/маппинга
├── quickstart.md        # Phase 1: как проверить руками
├── contracts/
│   ├── engine-debug-api.md      # внутренний API контроллера/хука/evaluate
│   ├── dap-adapter.md           # DAP-подмножество, capabilities, contributes.debuggers
│   └── page-agent-protocol.md   # протокол страница↔адаптер
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (волны W1–W6)
```

### Source Code (repository root)

```text
src/runtime/debug/
├── controller.ts        # контроллер: брейкпоинты, шаги, пауза, потоки, гейт, исключения
└── values.ts            # визуализатор BSL-значений + ленивые переменные

src/runtime/
├── scope.ts             # + ownEntries() (исходное написание имён)
├── interpreter.ts       # + поля кадра, хук в exec, evaluateInFrame, guard.tryDepth
└── context.ts           # RuntimeEnvironment.debug?

src/debug/
├── page-protocol.ts     # типы сообщений страница↔адаптер (browser-safe)
└── html-mapping.ts      # HTML-строка ↔ блок на findBlocks (browser-safe)

src/node/
├── debug-adapter.ts     # ENTRY: DebugSession.run(OsjsDebugSession)
└── debug/
    ├── session.ts       # OsjsDebugSession (DAP ↔ controller)
    ├── launch.ts        # Node launch: run() + console → output
    ├── attach.ts        # attach: WS-сервер, hello/configured, трансляция
    ├── ws-server.ts     # ws на 127.0.0.1, Origin/token, одна сессия
    ├── url-map.ts       # URL ↔ файл (webRoot, file://, виртуальные)
    └── console-capture.ts

src/browser/
├── debug/agent.ts       # page agent: WS-клиент, контроллер, консоль, манифест
└── onescript-debug.ts   # ENTRY: IIFE dist/onescript-debug.js
                         # onescript.ts: гейт attach() до runAll, env.debug на блок

extensions/vscode/src/debug.ts   # DebugAdapterDescriptorFactory
scripts/build-debug-adapter.mjs  # esbuild → dist/debug/adapter.cjs (smoke/тесты)
vite.debug.config.ts             # IIFE → dist/onescript-debug.js

tests/
├── debug-controller.test.ts       # unit: брейкпоинты/шаги/pause/гейт/потоки
├── debug-variables.test.ts        # unit: scopes/variables/evaluate/визуализатор
├── dap-session.test.ts            # integration: DAP in-memory (launch)
├── dap-attach.test.ts             # integration: attach с фейковым page-agent
├── debug-html-map.test.ts         # unit: маппинг HTML↔блок
├── debug-url-map.test.ts          # unit: маппинг URL↔файл
├── browser-debug-agent.test.ts    # happy-dom: гейт configurationDone, DOM-входы
├── dap-stdio-smoke.test.ts        # smoke собранного dist/debug/adapter.cjs (skipIf)
└── fixtures/debug/                # nested/loop/throw/async/jobs.osjs, page.html, app.osjs
```

**Structure Decision**: ядро отладки — в `src/runtime/debug` (браузерное, подключается через
`RuntimeEnvironment`); общие браузерные типы/маппинг — `src/debug`; DAP-адаптер и транспорт —
`src/node/debug` (entry отдельно от логики); page-agent — `src/browser/debug`; расширение —
тонкая фабрика в `extensions/vscode/src/debug.ts`.

## Phase 0: Outline & Research

Выполнено: [research.md](./research.md) — решения R1–R10, факты движка F1–F12, prior art,
риски. Открытых NEEDS CLARIFICATION нет.

## Phase 1: Design & Contracts

Выполнено: [data-model.md](./data-model.md), [contracts/](./contracts/),
[quickstart.md](./quickstart.md). Constitution Check перепроверен — нарушений нет.

## Phase 2: Implementation strategy (волны)

Порядок продиктован зависимостями; волны с непересекающимися write-scope можно вести
параллельно отдельными субагентами, но каждая волна начинается с падающего теста (TDD).

### W1 — Runtime core (блокирует всё)

`Scope.ownEntries`, поля `ActiveFrame`, хук в `exec`, `DebugController` (брейкпоинты,
шаги, pause, гейт, потоки, снимок кадров, sink), `evaluateInFrame`, `guard.tryDepth`,
`values.ts` (визуализатор), тесты `debug-controller`/`debug-variables`, фикстуры.
Критерий: отладчик выключен — `pnpm test` зелёный, sync-путь не изменился; включён —
остановка/шаг/переменные/evaluate на BSL-фикстурах.

### W2 — DAP adapter + Node launch + расширение

`OsjsDebugSession`, `launch.ts`, `console-capture`, entry `src/node/debug-adapter.ts`,
`contributes.debuggers`/`breakpoints`/activationEvents, фабрика в `extensions/vscode`,
сборка: второй esbuild-entry `out/debug-adapter.js` (`external: ['vscode','bufferutil',
'utf-8-validate']`), `build:debug-adapter` → `dist/debug/adapter.cjs`, тесты
`dap-session`, `dap-stdio-smoke`, обновление `tests/vscode-extension.test.ts`,
`.vscode/launch.json`. Критерий: in-memory DAP-сценарий launch проходит; `.vsix`
собирается и содержит `out/debug-adapter.js`.

### W3 — Browser attach

`page-protocol.ts`, `agent.ts`, `onescript-debug.ts`, гейт в `onescript.ts`, `attach.ts`,
`ws-server.ts`, `url-map.ts`, dev-плагин Vite (`OSJS_DEBUG=1`, отдача
`onescript-debug.js`), `vite.debug.config.ts` + `build:debug-client`, тесты
`browser-debug-agent`, `dap-attach`, `debug-url-map`. Критерий: страница ждёт
`configurationDone`, брейкпоинт во внешнем `.osjs` останавливает, `output` не теряется,
DOM-входы гейтятся, production `dist/onescript.js` не содержит агента.

### W4 — P2: условия/logpoints, исключения (US4)

`condition`/`logMessage` в контроллере и DAP-сессии, `exceptionFilters`
(`uncaught`/`all`, `guard.tryDepth`, `WeakSet`), capabilities, тесты.
Критерий: условие ложно — нет остановки; logpoint печатает и не стоит; `uncaught` не
останавливает внутри `Попытка`.

### W5 — P2/P3: inline HTML (US3), async/jobs-потоки (US5)

HTML-маппинг `src/debug/html-mapping.ts` + интеграция в attach/session (`verified`,
`line`), `threads`/`pause` для заданий (`forkForJob`), шаг через `Ждать`; тесты
`debug-html-map`, `dap-attach` (HTML), `debug-controller` (потоки). Критерий: брейкпоинт
в HTML-строке внутри блока останавливает; `threads` показывает задание; `pause` стопорит
все потоки.

### W6 — Документация и финальная верификация

README (раздел «Отладчик»), `docs/architecture.md` §12, `docs/status.md`, `AGENTS.md` §3/§4
(если меняются команды/дерево), `extensions/vscode/README.md`, `release.yml` (артефакты
`dist/onescript-debug.js`, `dist/debug`), опционально `ci.yml`; полный прогон гейтов и
приёмка по quickstart.md. Критерий: все команды из DoD зелёные, вывод приложен.

## Complexity Tracking

Нарушений конституции нет.

## Definition of Done

- [x] W1–W3 (MVP) и W4–W5 (P2/P3) реализованы по tasks.md; каждая задача — с тестом.
- [x] `pnpm typecheck && pnpm test` — зелёные (включая регресс синхронного быстрого пути).
- [x] `pnpm check:docs` — зелёный без правок `docs/reference.md` (BSL-видимого API нет).
- [x] `pnpm build` (включая `build:debug-client`) и `pnpm typecheck:vscode` — зелёные.
- [x] `pnpm build:vscode` → `.vsix` содержит `out/debug-adapter.js`; автоматическая приёмка
  (`tests/fixtures/debug/run-dap-smoke.mjs`, in-memory DAP-тесты) пройдена; GUI-приёмка
  launch/attach в VS Code — за владельцем (в окружении нет GUI).
- [x] `dist/onescript.js` не содержит отладочного клиента (тест).
- [x] README/architecture/status обновлены; быстрый старт — quickstart.md.
- [x] Ветка `feature/021-debugger`; коммит — по явной просьбе владельца (не делался).
