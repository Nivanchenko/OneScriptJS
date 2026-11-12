---
description: "Task list for feature 015 — embedded .osjs in HTML (layer A: server mode)"
---

# Tasks: Встроенный `.osjs` в HTML — слой A (серверный embedded-режим)

**Input**: `/specs/015-embedded-osjs-html/` (spec с Clarifications, plan)

**Prerequisites**: 014 (реализована), 016 (реализована)
**Tests**: обязательны (конституция III, TDD).

**Organization**: слой A — по user story 015; слои B/C — deferred (после клиента VS Code).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: параллельно, разные файлы
- **[Story]**: US1–US4 (из spec 015); слой A покрывает части US1–US4 без грамматики/клиента

## Phase 1: Setup

- [X] T001 Baseline: `pnpm typecheck && pnpm test` зелёные до изменений; зафиксировать вывод

## Phase 2: Foundational (сканер и маппинг — блокируют все истории)

- [X] T002 [P] `tests/lsp-html-blocks.test.ts` (red): блоки в порядке документа, атрибуты,
  `type` case-insensitive, несколько блоков, инлайн-блок, HTML-комментарии игнорируются,
  незакрытый блок до EOF, пустой блок, чужая разметка без блоков
- [X] T003 `src/lsp/html-blocks.ts`: `findBlocks(html): HtmlBlock[]` (offset+Position
  диапазоны, `id`, `type`); без зависимостей от HTML-парсера
- [X] T004 [P] `tests/fixtures/lsp/embedded/` — HTML-фикстуры: просто два блока; инлайн;
  CRLF; BOM; кириллица/эмодзи; несколько блоков с комментариями; `</script>` внутри строки
- [X] T005 [P] `tests/lsp-embedded.test.ts` (red): round-trip позиций (block↔html) для
  CRLF/BOM/кириллицы/эмодзи/инлайн-блока; диапазоны не выходят за блок
- [X] T006 `src/lsp/embedded.ts`: `analyzeHtml(text)`, `toDocumentRange`,
  `toBlockPosition` через `TextDocument.offsetAt/positionAt`; кэш по версии; агрегация
  диагностик по блокам (014-коды с переносом)

**Checkpoint**: сканер и маппинг готовы.

## Phase 3: US2 — диагностика в блоках (P2, часть слоя A)

- [X] T007 [P] [US2] `tests/lsp-embedded.test.ts` (расширить, red): `OSJS4001` Error при
  незакрытой строке/parse-error в конце блока (обрыв `</script>`) с объяснением; `OSJS4002`
  Warning для `<script`/`<!--`; диапазоны внутри блока; лимит 200 на html-документ; дедуп
- [X] T008 [US2] Реализовать правила 4001/4002 и лимиты в `src/lsp/embedded.ts`
- [X] T009 [US2] `tests/lsp-embedded-protocol.test.ts` (red): `languageId: html` → публикация
  mapped-диагностик с версией; обновление после didChange; пусто для HTML без блоков и для
  чужих languageId

## Phase 4: US1 — semantic tokens в блоках (P1, часть слоя A)

- [X] T010 [US1] `src/lsp/semantic-tokens.ts`: экспорт декодированного списка токенов
  (без изменения поведения `semanticTokens()` для `.osjs`)
- [X] T011 [P] [US1] `tests/lsp-embedded.test.ts` / protocol: токены только внутри блоков,
  перенос в HTML-координаты, отсутствие пересечений, инлайн-блоки
- [X] T012 [US1] `src/lsp/embedded.ts`: `embeddedSemanticTokens(analysis): number[]`
  (по блокам, дельта-кодирование) + wiring в `server.ts`

## Phase 5: US3 — completion/hover/definition (P3, часть слоя A)

- [X] T013 [P] [US3] protocol-тесты: completion внутри блока (`Сооб`→`Сообщить`) и пусто
  снаружи; hover с mapped `range`; definition локального символа (перенос range) и импорта
  (`#Использовать` от URL html, с инжектированным резолвером)
- [X] T014 [US3] `src/lsp/embedded.ts` + `server.ts`: позиция→блок→локальный вызов
  провайдеров 014; обратный перенос CompletionItem/Hover/Location; изоляция блоков
- [X] T015 [US3] `src/lsp/document.ts`: `DocumentStore` хранит html (version/text/embedded),
  инвалидация на didChange; `.osjs`-путь не меняется

## Phase 6: US4 — сосуществование и границы (P4, часть слоя A)

- [X] T016 [P] [US4] protocol-тесты: вне блоков — пустые ответы; `documentSymbol` для html
  — `[]`; сервер не требует новых capabilities; документ без блоков — no-op; HTML-текст
  вне блоков не диагностируется; два блока изолированы (символы не протекают)
- [X] T017 [US4] Проверить отсутствие регрессий 014: `.osjs`-protocol-тесты и полный
  `pnpm test`

## Phase 7: Polish (слой A)

- [X] T018 `specs/015-embedded-osjs-html/quickstart.md`: подключение html в Neovim
  (`filetypes` + documentSelector), ожидаемые диагностика/подсказки/токены в блоках,
  проверочные команды; предупреждение про два сервера/форматтеры
- [X] T019 `docs/status.md`: 015 → «слой A реализован; B/C после клиента VS Code»;
  известные ограничения (эвристика 4001, без outline, динамика/src)
- [X] T020 Полная проверка: `pnpm typecheck && pnpm test && pnpm build`; ручная проверка
  в Neovim на HTML-фикстуре; зафиксировать вывод
- [X] T021 Коммит и push слоя A

## Deferred (после слоя A)

- [ ] D-1 Спека 017: тонкий клиент VS Code (манифест, documentSelector html, `.vsix`,
  embedded language mode)
- [ ] D-2 Грамматическая инъекция `<script type="text/osjs">` (override `source.js`) +
  `embeddedLanguages` + тесты грамматики
- [ ] D-3 Outline BSL внутри HTML (`documentSymbol`) — вне v1 по решению
- [ ] D-4 `html.customData` для HTML-инструментов (если понадобится)

## Dependencies & Execution Order

T001 → T002/T003 (сканирование) → T004/T005/T006 (маппинг) → US2 (T007-T009) →
US1 (T010-T012) → US3 (T013-T015) → US4/регрессии (T016-T017) → Polish (T018-T021).

- US2/US1/US3 зависят от Foundational (T003, T006)
- US1 (токены) и US2 (диагностика) — независимы после Foundational, можно параллельно
- Deferred — после слоя A и/или после клиента

## Parallel Opportunities

- T002, T004, T005 — разные файлы; T007 и T010 — тесты разных правил
- US1/US2 тесты можно писать параллельно; реализация — по файлам `embedded.ts`,
  `semantic-tokens.ts`, `server.ts` (последовательно)

## Implementation Strategy

**MVP слоя A**: T001–T009 — HTML-документ с блоками получает mapped-диагностику
(включая 4001/4002) и публикует её в LSP-клиент. Затем токены, затем подсказки/definition,
затем границы/регрессии и проверка в Neovim.
