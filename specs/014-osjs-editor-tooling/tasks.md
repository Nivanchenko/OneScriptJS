---
description: "Task list for feature 014 — editor tooling for .osjs (grammar + LSP server)"
---

# Tasks: Редакторные инструменты `.osjs` — грамматика и LSP-сервер

**Input**: Design documents from `/specs/014-osjs-editor-tooling/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: ОБЯЗАТЕЛЬНЫ — конституция, принцип III (Test-First, NON-NEGOTIABLE): каждая
фаза начинается с падающих тестов Vitest, только затем минимальная реализация.

**Organization**: задачи сгруппированы по user story; каждая история независимо
реализуема и проверяема. Порядок: Setup → Foundational (для US2–US4) → US1 (MVP) → US2 →
US3 → US4 → Polish.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можно выполнять параллельно (другой файл, нет зависимостей от незавершённых задач)
- **[Story]**: US1–US4 для фаз историй; в Setup/Foundational/Polish метки нет
- В описании — точные пути файлов относительно корня репозитория

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: зависимости, сборка, конфигурация TypeScript; ничего не меняет в поведении
движка и браузерной сборке.

- [X] T001 Добавить devDependencies точных версий в `package.json` и `pnpm-lock.yaml`:
  `vscode-languageserver@11.0.0`, `vscode-languageserver-textdocument@1.0.16`,
  `vscode-jsonrpc@10.0.0` (для тестов), `vscode-textmate@^9.3.2`,
  `vscode-oniguruma@^2.0.1`; выполнить `pnpm install`
- [X] T002 Добавить скрипты в `package.json`: `build:lsp`
  (`vite build --config vite.lsp.config.ts`), `build:catalog`
  (`node scripts/build-api-catalog.mjs`), `lsp` (`node dist/lsp/server.mjs`); включить
  `build:lsp` в агрегатный `build` **после** browser/node/cli (browser чистит `dist/`)
- [X] T003 [P] Создать `vite.lsp.config.ts`: entry `src/node/lsp-server.ts`, `formats: ['es']`,
  `fileName: () => 'server.mjs'`, `outDir: 'dist/lsp'`, `emptyOutDir: true`,
  `target: 'node20'`, `sourcemap: true`, `resolve.conditions: ['node']`,
  `external: [/^node:/, ...builtinModules]`
- [X] T004 [P] Обновить `tsconfig.json` (добавить `vite.lsp.config.ts` в `include`) и
  `tsconfig.build.json` (добавить `src/lsp` в `exclude` — типы инструментов не входят в
  публикуемый `dist/node`)

---

## Phase 2: Foundational (Blocking Prerequisites для US2–US4)

**Purpose**: толерантный конвейер анализа и единые словари языка. US1 (грамматика) от этой
фазы **не зависит** и может идти параллельно; US2–US4 — блокированы.

**⚠️ CRITICAL**: без этой фазы диагностика «все ошибки файла», semantic tokens и outline
невозможны.

- [X] T005 [P] Написать падающие тесты толерантного лексера в `tests/lsp-lexer.test.ts`:
  диапазоны токенов (`endLine`/`endColumn`, UTF-16, многострочные строки), trivia-режим
  (`Comment`-токены), устойчивость к незакрытой строке/дате и неожиданному символу
- [X] T006 Расширить `src/lexer/token.ts` (конец токена, тип `Comment`) и
  `src/lexer/lexer.ts` (`tokenize(source, options?)` с `includeTrivia` и толерантным
  списком ошибок; поведение по умолчанию — без изменений)
- [X] T007 Вынести словари языка в `src/parser/keywords.ts` (`KW_*`, `END_OF_BLOCK`,
  `DIR_*`) и перевести на них `src/parser/parser.ts` и `src/parser/preprocessor.ts`;
  рефакторинг без изменения поведения — `pnpm test` движка остаётся зелёным
- [X] T008 [P] Написать падающие тесты `parseTolerant` в `tests/lsp-parser.test.ts`:
  несколько независимых ошибок, частичный AST, восстановление на границах операторов и
  блоков, корректное восстановление состояния (`methodKind`, `loopDepth`, `exceptDepth`,
  `inAsync`); `parse()` по-прежнему бросает на первой ошибке
- [X] T009 Реализовать `parseTolerant(tokens)` в `src/parser/parser.ts`
  (сбор ошибок с диапазонами, panic-mode восстановление, `try/finally` для состояния);
  `parse()` не меняется
- [X] T010 [P] Написать падающие тесты толерантного препроцессора в
  `tests/lsp-preprocessor.test.ts`: `#Использовать` после кода, незакрытая/пустая строка
  пути → ошибки с позициями, импорты не теряются
- [X] T011 Реализовать толерантный режим `preprocessScript` в `src/parser/preprocessor.ts`
  (опциональный сбор ошибок; поведение движка по умолчанию — исключение, как раньше)
- [X] T012 [P] Добавить тест-страж `tests/lsp-boundaries.test.ts`: `src/lsp` не импортирует
  `node:*`, `src/index.ts` и `src/browser/*` не импортируют `src/lsp`; браузерная сборка
  не тянет LSP-код
- [X] T013 Проверить регресс движка (скрипты в `package.json`):
  `pnpm typecheck && pnpm test` зелёные, поведение `parse()`/`tokenize()` по умолчанию не
  изменилось; зафиксировать вывод

**Checkpoint**: конвейер анализа готов — US2–US4 можно реализовывать; US1 не блокирован.

---

## Phase 3: User Story 1 — `.osjs` опознаётся и подсвечивается (Priority: P1) 🎯 MVP

**Goal**: редакторо-независимые артефакты языка: вендоренная MIT-грамматика `source.osjs`,
конфигурация языка, метаданные `*.osjs → osjs`; `.os` не заявляется.

**Independent Test**: `pnpm vitest run tests/grammar.test.ts` — scope на фикстуре ≥20
конструкций, `scopeName === 'source.osjs'`, `fileTypes === ['osjs']`, нет `.os`/`bsl`,
конфигурация содержит обязательные поля, нет висячих includes.

### Tests for User Story 1 ⚠️ (сначала падающие)

- [X] T014 [P] [US1] Создать харнесс `tests/helpers/textmate.ts`: default-import
  `vscode-textmate`/`vscode-oniguruma`, WASM через
  `createRequire(...).resolve('vscode-oniguruma/release/onig.wasm')`, `loadGrammar` по
  `editors/osjs/osjs.tmLanguage.json` (BOM снимать до `parseRawGrammar`)
- [X] T015 [P] [US1] Создать фикстуру `tests/fixtures/osjs/grammar.osjs`: ключевые слова
  RU/EN, операторы, константы, числа, строки (в т.ч. многострочные с `|`), даты,
  комментарии, директивы `#Если/#Область/#Использовать`, аннотации `&Имя`, `Асинх`/`Ждать`
- [X] T016 [US1] Написать падающий `tests/grammar.test.ts`: таблица `{line, column, scope}`
  по фикстуре, инварианты из `contracts/language-artifacts.md` (включая отсутствие
  `.bsl`-scope и висячих includes), `languages.json` без `os`/`bsl`,
  `new RegExp(wordPattern).test('Сообщить')`, анти-drift наборов из
  `src/parser/keywords.ts` → keyword-scope

### Implementation for User Story 1

- [X] T017 [US1] Вендорить `editors/osjs/osjs.tmLanguage.json`: копия
  `1c-syntax/vsc-language-1c-bsl`, `syntaxes/1c.tmLanguage.json`, коммит
  `c93f87c76d8a536a494039e9dc78a684b14b4e4c`, BOM снять
- [X] T018 [US1] Адаптировать метаданные грамматики: `scopeName: source.osjs`,
  `name/displayName: osjs`, `fileTypes: ["osjs"]` (убрать `bsl` и `os`), удалить `uuid`,
  переименовать все суффиксы `.bsl` → `.osjs` (~40 scope)
- [X] T019 [US1] Добавить в грамматику диалект (`Асинх|Async` →
  `storage.modifier.async.osjs`, `Ждать|Await` → `keyword.operator.word.await.osjs`, до
  `meta.var-single-variable`, с границами слова) и отсутствующие ключевые слова
  (`Перейти/Goto`, `Выполнить/Execute`, `ДобавитьОбработчик/AddHandler`,
  `УдалитьОбработчик/RemoveHandler`)
- [X] T020 [US1] Вычистить грамматику: убрать `include: "#query"` и вложенный
  comment-паттерн в строках (SDBL), неподдерживаемые директивы
  (`#Вставка/#Удаление/#native/#stack`) и платформенные спец-аннотации; удалить
  `support.*` (29 паттернов платформы 1C), оставить `Новый|New`
- [X] T021 [P] [US1] Создать `editors/osjs/language-configuration.json`: `comments.lineComment`,
  `brackets`, `autoClosingPairs` (кавычки с `notIn`), `surroundingPairs`, одна пара
  `folding.markers` (`#Область|#Region|#Если|#If` ↔ `#КонецОбласти|#EndRegion|#КонецЕсли|#EndIf`),
  `wordPattern` с явными диапазонами кириллицы/греческого (без `\p{L}`)
- [X] T022 [P] [US1] Создать `editors/osjs/languages.json`: `schemaVersion`, `id: osjs`,
  `aliases`, `extensions: ['.osjs']`, `scopeName: source.osjs`, пути к грамматике и
  конфигурации (без `.os`)
- [X] T023 [P] [US1] Создать `editors/osjs/NOTICE.md`: копирайт © 2015 xDrivenDevelopment,
  текст MIT, URL/коммит upstream, список правок T018–T020, правило ручной синхронизации
- [X] T024 [US1] Довести `tests/grammar.test.ts` до зелёного: зафиксировать фактические
  scope-имена из адаптированной грамматики (не выдуманные), поправить таблицу в
  `contracts/language-artifacts.md`, если формулировки расходятся с фактом

**Checkpoint**: US1 полностью работает независимо (TextMate/LSP-совместимые редакторы,
потребители артефактов); `.os` не заявлен.

---

## Phase 4: User Story 2 — LSP-сервер: диагностика (Priority: P2)

**Goal**: каталог API из `docs/reference.md`, LSP-сервер по stdio с полной синхронизацией,
толерантная диагностика (синтаксис + консервативная семантика), push-модель.

**Independent Test**: `pnpm vitest run tests/lsp-catalog.test.ts tests/lsp-diagnostics.test.ts
tests/lsp-protocol.test.ts` — 3 ошибки видны одновременно с верными диапазонами/версией,
исправление очищает набор; drift каталога; чужой languageId не диагностируется.

### Tests for User Story 2 ⚠️ (сначала падающие)

- [X] T025 [P] [US2] Написать падающий `tests/lsp-catalog.test.ts`: drift-тест
  (генерация в память vs `src/lsp/generated/api-catalog.ts`), кросс-сверка имён с `src/`,
  инварианты арности (`required ≤ max`, variadic последний), `constructible` из
  `registerType`
- [X] T026 [P] [US2] Написать падающий `tests/lsp-diagnostics.test.ts`: OSJS1001/1002/
  2001 (позиции/диапазоны, несколько ошибок, очистка), OSJS3001/3002/3003 (срабатывание и
  подавления), отсутствие стилевых правил, лимит 200, дедуп, перф 1000 строк ≤ 1 с,
  стресс-файл 100+ ошибок
- [X] T027 [P] [US2] Написать падающий `tests/lsp-protocol.test.ts` (in-process
  `createMessageConnection` + `registerHandlers`): lifecycle, didOpen/didChange/
  publishDiagnostics с `version`, чужой languageId, запрос до `initialize`

### Implementation for User Story 2

- [X] T028 [US2] Реализовать `scripts/build-api-catalog.mjs` (парсинг таблиц
  `docs/reference.md` по правилам `contracts/api-catalog.md`; детерминированный вывод в
  `src/lsp/generated/api-catalog.ts`); сгенерировать и закоммитить каталог
- [X] T029 [US2] Реализовать `src/lsp/api-catalog.ts`: типы, поиск по имени (RU/EN,
  регистронезависимо), арность (`required`/`max`/variadic), выборки для completion/hover
- [X] T030 [US2] Реализовать `src/lsp/document.ts`: `DocumentStore` (uri, languageId,
  version, text), фильтр `osjs`, кэш `Analysis` по версии, инвалидация на didChange
- [X] T031 [US2] Реализовать `src/lsp/analysis.ts`: конвейер tolerant lexer →
  preprocess → `parseTolerant`, сбор `imports`, таблиц символов (методы/Перем/locals),
  `knownGlobals` (каталог + имена импортов), объединение диагностик
- [X] T032 [US2] Реализовать `src/lsp/diagnostics.ts`: OSJS1001/1002/2001 (Error),
  OSJS3001/3002/3003 (Warning) с условиями и подавлениями из
  `contracts/diagnostics.md`; только при отсутствии ошибок разбора для семантики;
  дедуп/сортировка/лимит 200
- [X] T033 [US2] Реализовать `src/lsp/server.ts`: `registerHandlers(connection)` —
  capabilities (`positionEncoding: utf-16`, Full sync, completion trigger `.`, hover,
  semanticTokens.full, documentSymbol, definition; **без** `diagnosticProvider`), обработчики
  didOpen/didChange/didClose с синхронной публикацией диагностик
- [X] T034 [US2] Создать `src/node/lsp-server.ts` (5 строк):
  `createConnection(ProposedFeatures.all, process.stdin, process.stdout)` →
  `registerHandlers(connection)`
- [X] T035 [US2] Создать `tests/lsp-server-smoke.test.ts`: `spawn(process.execPath,
  ['dist/lsp/server.mjs'])`, initialize → completion → shutdown/exit, `skipIf(!existsSync(dist))`;
  прогнать `pnpm build:lsp` и smoke
- [X] T036 [US2] Довести US2 до зелёного: `pnpm vitest run tests/lsp-catalog.test.ts
  tests/lsp-diagnostics.test.ts tests/lsp-protocol.test.ts tests/lsp-server-smoke.test.ts`
  (после `pnpm build:lsp`); зафиксировать вывод

**Checkpoint**: сервер стабильно диагностирует `.osjs`; US2 работает независимо от US3–US4.

---

## Phase 5: User Story 3 — Подсказки: completion и hover (Priority: P3)

**Goal**: автодополнение (ключевые слова RU/EN, stdlib, локальные символы, члены объекта)
и hover с сигнатурой/описанием из каталога.

**Independent Test**: `pnpm vitest run tests/lsp-completion-hover.test.ts` — после `Сооб`
есть `Сообщить`/`Message`; после `Массив.` — методы `Массив`; hover на `Сообщить(`
совпадает с `docs/reference.md`; в строке/комментарии подсказок нет.

### Tests for User Story 3 ⚠️

- [X] T037 [P] [US3] Написать падающий `tests/lsp-completion-hover.test.ts`: префиксная
  фильтрация, RU/EN, stdlib-функции/типы/перечисления/глобалы, локальные символы, члены
  при однозначном типе, запрет в строках/комментариях, hover-контент и range

### Implementation for User Story 3

- [X] T038 [US3] Добавить в `src/lsp/analysis.ts` минимальный вывод типов для `Член.`
  (по `data-model.md` §6: `Новый Тип`, однократное присваивание, прямой вызов stdlib с
  единственным типом возврата; иначе `unknown`)
- [X] T039 [P] [US3] Реализовать `src/lsp/completion.ts`: `CompletionItem[]` из каталога и
  символов, `detail` = сигнатура, `documentation` markdown, `sortText`; лимит 500
- [X] T040 [P] [US3] Реализовать `src/lsp/hover.ts`: markdown-сигнатура/описание для
  stdlib и локальных символов, пояснение для `Асинх`/`Ждать`, `range?`; учитывать
  `hover.contentFormat`
- [X] T041 [US3] Подключить completion/hover в `src/lsp/server.ts`
- [X] T042 [US3] Довести US3 до зелёного: `pnpm vitest run tests/lsp-completion-hover.test.ts`

**Checkpoint**: US3 работает поверх готового анализа; US2 не сломан.

---

## Phase 6: User Story 4 — Подсветка от сервера и навигация (Priority: P4)

**Goal**: `semanticTokens/full` (только стандартные типы), `documentSymbol` (методы и
`#Область`), `definition` (локальные символы и файл из `#Использовать`).

**Independent Test**: `pnpm vitest run tests/lsp-semantic-tokens.test.ts
tests/lsp-symbols-definition.test.ts` — типы/диапазоны токенов не съезжают после правок;
Outline показывает методы и регионы; definition ведёт на объявление/файл.

### Tests for User Story 4 ⚠️

- [X] T043 [P] [US4] Написать падающий `tests/lsp-semantic-tokens.test.ts`: легенда из
  стандартных типов, дельта-кодирование, многострочные строки разбиты по строкам, нет
  пересечений, диапазоны после вставки/удаления строк, фикстуры с кириллицей/эмодзи/
  CRLF/BOM
- [X] T044 [P] [US4] Написать падающий `tests/lsp-symbols-definition.test.ts`:
  `documentSymbol` (методы, `#Область`, `range` + `selectionRange`), `definition` для
  локального метода/переменной и для `#Использовать` (инжектированный резолвер; untitled →
  `null`)

### Implementation for User Story 4

- [X] T045 [US4] Реализовать `src/lsp/semantic-tokens.ts`: классификация токенов по AST
  (keyword/operator/number/string/comment/decorator/function/method/variable/parameter/
  property/enumMember), маппинг директива→keyword, дата→number, аннотация→decorator;
  дельта-кодирование 5 ints/token; лимит 10 000 строк
- [X] T046 [US4] Реализовать `src/lsp/symbols.ts`: Outline (методы; регионы
  `#Область`/`#КонецОбласти` из trivia-токенов) и `definition` (локальные символы;
  `#Использовать` → path + `range 0:0`)
- [X] T047 [US4] Подключить `semanticTokens`/`documentSymbol`/`definition` в
  `src/lsp/server.ts`; в `src/node/lsp-server.ts` инжектировать
  `resolveImport(importPath, documentUri)` (path→file-URI, без чтения файла)
- [X] T048 [US4] Довести US4 до зелёного: `pnpm vitest run
  tests/lsp-semantic-tokens.test.ts tests/lsp-symbols-definition.test.ts`; проверить
  кириллицу/эмодзи/CRLF/BOM

**Checkpoint**: все истории работают; сервер реализует 6 методов из
`contracts/lsp-server.md`.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: документация, соответствие конституции, полная проверка.

- [X] T049 [P] Обновить `docs/architecture.md`: новый слой «Инструменты `.osjs`»
  (грамматика, каталог API, LSP-сервер), направление зависимостей
- [X] T050 [P] Обновить `README.md` (запуск сервера, подключение грамматики, статус
  «клиент VS Code — позже») и добавить пример `examples/editor.osjs`
- [X] T051 [P] Обновить `AGENTS.md` (§4 структура, правило 9): `pnpm build:catalog`
  при изменении API/stdlib; упомянуть `editors/osjs/` и `pnpm build:lsp`
- [X] T052 [P] Обновить `docs/status.md`: строка 014 → реализовано, шаги проверки,
  запись «браузерная приёмка неприменима» (конституция V) и места, где смотреть
  доказательства
- [X] T053 Полная проверка по `quickstart.md`: `pnpm typecheck && pnpm test && pnpm build`
  (порядок browser → node → cli → lsp), smoke `node dist/lsp/server.mjs`, вывод
  зафиксировать (конституция V)
- [X] T054 Ручная проверка по `quickstart.md` в LSP-клиенте (Neovim/Zed) заменена
  протокольными/смоук-тестами: в окружении нет редактора; ограничение зафиксировано в
  `docs/status.md`. Сценарии покрыты `tests/lsp-protocol.test.ts`, `tests/lsp-server-smoke.test.ts`
  и unit-тестами провайдеров

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: без зависимостей; T002 зависит от T001; T003/T004 независимы
- **Foundational (Phase 2)**: после Setup; **блокирует US2–US4**, но **не US1**
  (грамматика не использует парсер); T006←T005, T009←T008, T011←T010, T007 до T009/T011;
  T013 — после T006/T009/T011
- **US1 (Phase 3)**: после Setup (T001, T004); независима от Foundational и других историй
- **US2 (Phase 4)**: после Setup и Foundational; T028/T029 (каталог) до T031–T036; T033 до
  T034; T035 после T034
- **US3 (Phase 5)**: после US2 (analysis/document/catalog/server); T038 до T039/T040;
  T041 после T039/T040
- **US4 (Phase 6)**: после US2 (analysis); независима от US3; T045/T046 после T038
  (вывод типов не нужен, но analysis общий); T047 после T045/T046
- **Polish (Phase 7)**: после всех реализованных историй; T053 после T049–T052

### User Story Dependencies

- **US1 (P1)**: независима — можно начинать сразу после Setup, параллельно с Phase 2
- **US2 (P2)**: требует Foundational; даёт фундамент для US3/US4
- **US3 (P3)**: требует US2; с US4 не связана
- **US4 (P4)**: требует US2 (analysis/document); с US3 не связана; T045/T046 — после
  анализа из US2, T047 — после T045/T046
### Within Each User Story

- Тесты пишутся и **падают** до реализации (конституция III)
- Модели/данные → сервисы → обработчики/интеграция
- История завершается зелёными тестами и checkpoint до перехода к следующей

---

## Parallel Opportunities

- Setup: T003 и T004 — параллельно после T001
- Foundational: тесты T005, T008, T010, T012 — параллельно (разные файлы); реализации —
  последовательно по своим файлам
- US1: T014, T015 — параллельно; T021, T022, T023 — параллельно (разные файлы)
- US2: тесты T025, T026, T027 — параллельно; T028/T029 и T030/T031/T032 последовательны
- US3: T039 и T040 — параллельно после T038
- US4: T045 и T046 — параллельно после T043/T044
- Polish: T049–T052 — параллельно (разные файлы)

### Parallel Example: US1

```bash
# Три независимых файла одновременно:
Task: "T021 [P] [US1] Создать editors/osjs/language-configuration.json"
Task: "T022 [P] [US1] Создать editors/osjs/languages.json"
Task: "T023 [P] [US1] Создать editors/osjs/NOTICE.md"
```

### Parallel Example: US2 tests

```bash
Task: "T025 [P] [US2] tests/lsp-catalog.test.ts"
Task: "T026 [P] [US2] tests/lsp-diagnostics.test.ts"
Task: "T027 [P] [US2] tests/lsp-protocol.test.ts"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1: Setup
2. Phase 3: US1 — грамматика и метаданные (не ждёт Foundational)
3. **STOP и проверить**: `pnpm vitest run tests/grammar.test.ts` — `.osjs` подсвечивается,
   `.os` не заявлен. Это самостоятельная ценность (TextMate-редакторы без сервера).

### Incremental Delivery

1. Setup + US1 → MVP (грамматика).
2. Foundational → US2 → линтер/LSP-сервер: диагностика.
3. US3 → подсказки (completion/hover).
4. US4 → semantic tokens + навигация.
5. Polish → документация и полная проверка.

### Notes

- Задачи можно выполнять последовательно или параллельно по истории; [P] — только
  независимые файлы.
- `reference/` не трогать; `src/index.ts`/`src/browser` не меняются; коммиты — только по
  явной просьбе пользователя.
- Финальная приёмка — `quickstart.md`; доказательства (вывод команд) — в ответе и в
  `docs/status.md`.
