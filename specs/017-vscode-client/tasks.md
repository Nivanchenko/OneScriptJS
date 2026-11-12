---
description: "Task list for feature 017 — thin VS Code client"
---

# Tasks: Тонкий клиент VS Code (`.osjs` и встроенные блоки HTML)

**Input**: `/specs/017-vscode-client/` (spec, plan, research, contracts, quickstart)
**Prerequisites**: 014, 015 слой A, 016 (все реализованы)
**Tests**: обязательны (конституция III): тест манифеста/путей до реализации; сборка `.vsix`
проверяется в verification.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Baseline: `pnpm typecheck && pnpm test` зелёные до изменений
- [X] T002 Добавить devDependencies для клиента и упаковки в корневой `package.json`
  (`@types/vscode`, `vscode-languageclient`, `esbuild`, `@vscode/vsce`) и `pnpm install`;
  версии — совместимые с `engines.vscode ^1.90.0`

## Phase 2: Foundational (манифест и грамматика — блокируют клиент)

- [X] T003 [P] `tests/vscode-extension.test.ts` (red): манифест — `name/publisher/version/
  engines/main`, `contributes.languages` (id osjs, `.osjs`, без `.os`), grammars
  (`source.osjs`), language-configuration, commands, settings (`embeddedInHtml` default true,
  `trace`), наличие сборщика и копируемых файлов
- [X] T004 `extensions/vscode/package.json` — манифест по контракту
  (`contracts/extension-package.md`), `extensions/vscode/README.md`
- [X] T005 [P] `extensions/vscode/tsconfig.json` + корневой скрипт `typecheck:vscode`
  (типы `vscode`, strict)

## Phase 3: US1/US2/US3 — клиент, настройки, lifecycle

- [X] T006 `extensions/vscode/src/extension.ts`: `LanguageClient` (stdio, сервер
  `server/server.mjs`, `process.execPath` + `ELECTRON_RUN_AS_NODE=1`, fallback `node`),
  documentSelector `osjs` всегда + `html` по настройке; активация по языку/командам;
  `deactivate`
- [X] T007 [US3] Настройки (`embeddedInHtml`, `trace`) и их применение (перезапуск клиента
  при изменении); OutputChannel; ошибка старта — уведомление+лог, без цикла падений
- [X] T008 [US3] Команды `restartServer`, `showOutput` (contributes + реализация)
- [X] T009 [US1/US2] Проверка кода: `.os` не выбирается, html только по настройке;
  `pnpm typecheck:vscode` чистый

## Phase 4: US4 — сборка `.vsix` и валидация

- [X] T010 `scripts/build-vscode-extension.mjs`: `pnpm build:lsp` → esbuild
  (`extensions/vscode/src/extension.ts` → `out/extension.js`, CJS, external `vscode`) →
  staging `dist/vscode/extension/` (+ `server/server.mjs`, `editors/osjs/osjs.tmLanguage.json`,
  `language-configuration.json`, README, NOTICE) → `vsce package --no-dependencies --out
  dist/vscode/<name>-<version>.vsix`
- [X] T011 Корневой `package.json`: скрипт `build:vscode`
- [X] T012 Проверка артефакта: `.vsix` создан, версия из манифеста, внутри есть
  сервер/грамматика/JS, нет `node_modules`/исходников; повторная сборка воспроизводима
- [X] T013 Довести `tests/vscode-extension.test.ts` до зелёного; `pnpm test`, `pnpm typecheck`

## Phase 5: Polish (Lead)

- [X] T014 README (корневой + расширения): установка `.vsix`, настройки, ограничения
  (HTML без грамматической инъекции; `.os` не заявляется; офлайн; Marketplace вне объёма)
- [X] T015 `docs/status.md` (017 → реализовано, известные ограничения),
  `docs/architecture.md` (слой расширения), spec 017 Status → Implemented
- [ ] T016 Финальная проверка: `pnpm typecheck && pnpm test && pnpm build && pnpm build:vscode`;
  содержимое `.vsix` — **автоматическая часть выполнена**; ручная приёмка владельцем
  (install → проверки quickstart) ещё не выполнена — после неё задача закрывается
- [X] T017 Коммит и push

## Deferred (слой C, отдельная работа)

- [ ] D-1 Инъекционная TextMate-грамматика `<script type="text/osjs">` (override `source.js`)
  + `embeddedLanguages` + тесты грамматики
- [ ] D-2 Embedded language mode (переключение провайдеров по региону) в расширении
- [ ] D-3 Marketplace-публикация/автообновление

## Dependencies & Execution Order

T001 → T002 → T003/T004/T005 → T006–T009 → T010–T013 → T014–T017.
T004 и T005 параллельны; T006 после T004; T010 после T006; T012 после T010.
Слой C — после B, отдельной работой.

## Parallel Opportunities

- T003 (тест) и T004/T005 (манифест/tsconfig) — разные файлы
- T007/T008 — настройки/команды в одном `extension.ts` — последовательно; T009 — проверка
- T010 (сборщик) и T011 (script) — разные файлы

## Implementation Strategy

**MVP**: T001–T013 — установленный `.vsix` даёт полноценный `.osjs` в VS Code, HTML-блоки
по настройке; затем документация/приёмка (T014–T017). Слой C — после.
