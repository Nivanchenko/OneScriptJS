---
description: "Task list for feature 016 — canonical embedding form <script type=\"text/osjs\">"
---

# Tasks: Каноническая форма встраивания — `<script type="text/osjs">`

**Input**: Design documents from `/specs/016-osjs-script-tag/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md) (с Clarifications),
[research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/),
[quickstart.md](./quickstart.md)

**Tests**: ОБЯЗАТЕЛЬНЫ (конституция III, TDD): каждый поведенческий шаг начинается с
падающего теста Vitest/happy-dom.

**Organization**: истории US1–US4; миграция (US4) идёт параллельно с документацией.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: параллельно (разные файлы, нет зависимостей)
- **[Story]**: US1–US4 для фаз историй
- В описании — точные пути файлов

## Phase 1: Setup

- [X] T001 Зафиксировать baseline: `pnpm typecheck && pnpm test` зелёные до изменений
  (скрипты в `package.json`); сохранить хвост вывода как доказательство

## Phase 2: Foundational (общая тестовая инфраструктура)

- [X] T002 [P] Создать `tests/helpers/browser-script.ts`: хелперы `makeScriptBlock(source, id?)`,
  `renderPage(blocks, html?)`, `runEngine()` (`vi.resetModules()` + импорт `src/browser/onescript`),
  `flush()`; использовать во всех браузерных suites

**Checkpoint**: инфраструктура готова — истории можно вести параллельно (файлы не пересекаются).

---

## Phase 3: User Story 1 — страница исполняет BSL из script-блока (P1) 🎯 MVP

**Goal**: движок собирает `script[type="text/osjs"]` в порядке документа и исполняет их
последовательно после готовности DOM (или сразу при поздней загрузке).

**Independent Test**: `pnpm vitest run tests/browser-script-tag.test.ts` — блок исполняется,
порядок документный, `<one-script>` не исполняется, повторного запуска нет.

### Tests for US1 (сначала падающие)

- [X] T003 [P] [US1] `tests/browser-script-tag.test.ts` (red): исполнение, порядок двух
  блоков, `type` в другом регистре, блок не отображается, `<one-script>` не исполняется,
  защита от повторного запуска/повторного импорта
- [X] T004 [US1] Мигрировать на helper/script-блоки `tests/browser.test.ts`,
  `tests/browser-dom.test.ts`, `tests/browser-events.test.ts` (red → после T005 green)

### Implementation for US1

- [X] T005 [US1] Переписать `src/browser/onescript.ts`: `collectBlocks()` (фильтр
  `type` case-insensitive), `executeBlock()` (свежий контекст, импорты от `document.baseURI`,
  `catch → console.error`), `runAll()` (последовательный `await`), запуск по
  `readyState`/`DOMContentLoaded`; удалить `OneScriptElement`, `customElements.define`,
  `injectHiddenStyle`
- [X] T006 [US1] Мигрировать остальные браузерные suites (`browser-jobs`, `browser-async`,
  `browser-declarative`, `browser-demo`, `browser-modules`, `browser-loading` — по факту
  grep) на script-блоки; обновить `src/browser/dom-events.ts` (комментарий контекста блока)
- [X] T007 [US1] Довести US1 до зелёного: `pnpm vitest run tests/browser-script-tag.test.ts
  tests/browser.test.ts tests/browser-dom.test.ts tests/browser-events.test.ts`; `pnpm typecheck`

**Checkpoint**: US1 работает; старый элемент удалён.

---

## Phase 4: User Story 2 — raw-text авторство и опасные последовательности (P2)

**Goal**: `<`, `>`, `&`, `</div>` в коде не искажаются; `</script>` даёт ошибку разбора
(не тихий успех); HTML-комментарии не исполняются; гайдлайн зафиксирован.

- [X] T008 [P] [US2] `tests/browser-script-tag.test.ts` (расширить, red): `А<Б` без пробелов,
  `"Tom & Jerry"`, `"<div>&copy;</div>"`, пустой блок, блок в HTML-комментарии, `</script>`
  в строке → ошибка разбора в `console.error`, отсутствие молчаливого успеха
- [X] T009 [US2] Проверить/поправить ошибку обрыва: сообщение содержит подсказку про
  `</script>` (без парсинга HTML); убедиться, что raw-text не экранируется
- [X] T010 [US2] Зафиксировать гайдлайн в `README.md`/`quickstart.md` (реализует агент C;
  координация: текст правил — `contracts/runtime-embedding.md`)

**Checkpoint**: raw-text семантика и поведение при обрыве покрыты тестами.

---

## Phase 5: User Story 3 — контексты, изоляция, обработчики (P3)

**Goal**: `id` блока регистрирует контекст; первый без-id блок — default; дубликат `id` —
последний; блоки изолированы; ошибка одного не мешает другим.

- [X] T011 [P] [US3] `tests/browser-script-tag.test.ts` (расширить, red): `id` +
  `data-os-click`/`data-os-script`, default-контекст первого без-id блока, дубликат `id`,
  изоляция переменных, исключение в первом блоке не мешает второму
- [X] T012 [US3] При необходимости — минимальные правки
  `registerScriptContext`/`scheduleDeclarativeBinding` (без изменения семантики)
- [X] T013 [US3] Довести US3 до зелёного: целевые тесты + `pnpm typecheck`

---

## Phase 6: User Story 4 — миграция экосистемы (P4)

**Goal**: `<one-script>` нигде не используется и не заявляется; конституция/ТЗ/доки/примеры
переведены.

- [X] T014 [P] [US4] `examples/*.html` (~37 вхождений) и `examples/index.html`: заменить теги
  на `<script type="text/osjs">…</script>`; `.osjs`-модули не трогать
- [X] T015 [P] [US4] `README.md`: браузерный контракт, примеры кода, гайдлайн
  `</script>`/`<script`/`<!--` (нет экранирования `<`, `&`)
- [X] T016 [P] [US4] `AGENTS.md`: §1/контракт браузера — новая форма, ссылка на 016
- [X] T017 [P] [US4] `docs/architecture.md` (веб-обёртки), `docs/status.md` (описание
  браузерного входа; строку статуса 016 финализирует Lead)
- [X] T018 [US4] `.specify/memory/constitution.md`: принцип II (браузерный контракт),
  Sync Impact Report, версия MAJOR 3.0.0, Last Amended 2026-11-12
- [X] T019 [US4] `task.md`: пометка о пересмотре контракта (ТЗ историческое; канон — 016)
- [X] T020 [P] [US4] `specs/013-osjs-format/spec.md`, `specs/014-osjs-editor-tooling/spec.md`,
  `specs/015-embedded-osjs-html/spec.md`: упоминания формы — с пометкой о замене на 016
- [X] T021 [US4] `grep`-инварианты: нет `<one-script>` в коде/тестах/примерах/доках
  (кроме исторических пометок); нет `customElements`/`createElement('one-script')`

---

## Phase 7: Polish & Cross-Cutting

- [X] T022 Полная проверка: `pnpm typecheck && pnpm test && pnpm build`; браузерная приёмка
  `examples/hello.html` (dev/preview или happy-dom-тест); `grep`-инварианты; вывод зафиксировать
- [X] T023 `docs/status.md`: 016 → реализовано, заметки CSP/happy-dom (если подтвердятся);
  `specs/016-osjs-script-tag/spec.md` Status → Implemented; `tasks.md` — все `[X]`
- [X] T024 Коммит и push в `feat/linter` с сообщением о переходе на script-тег

---

## Dependencies & Execution Order

- **Setup**: T001
- **Foundational**: T002 — блокирует тесты US1–US3
- **US1**: T003/T004 (red) → T005 → T006 → T007; блокирует US2/US3 (тесты расширяют тот же файл)
- **US2**: T008 → T009; T010 — параллельно (документация, агент C)
- **US3**: T011 → T012/T013
- **US4**: T014–T020 — параллельно после US1 (разные файлы); T021 — после
- **Polish**: T022 → T023 → T024

### Parallel Opportunities

- T002, T003 — разные файлы
- US4: T014, T015, T016, T017, T020 — параллельно (разные файлы)
- US1 и US4 можно вести параллельно после T002/T005

## Implementation Strategy

### MVP First (US1)

T001 → T002 → T003–T007: страница исполняет BSL из script-блоков, старый элемент удалён.
Проверить `pnpm vitest run tests/browser-script-tag.test.ts tests/browser.test.ts`.

### Incremental Delivery

US1 (runtime) → US2 (raw-text) → US3 (контексты) → US4 (миграция/доки/конституция) → Polish
(полная проверка, статус, коммит).
