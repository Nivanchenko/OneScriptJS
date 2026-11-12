# Implementation Plan: Встроенный `.osjs` в HTML — слой A (серверный embedded-режим)

**Branch**: `feat/linter` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-embedded-osjs-html/spec.md` (Clarifications:
слой A первым, outline BSL вне v1, грамматическая инъекция — с клиентом VS Code).

## Summary

Реализовать **редакторо-независимый embedded-режим LSP-сервера**: HTML-документ с блоками
`<script type="text/osjs">` обслуживается теми же анализатором и провайдерами 014, но по
блокам с переносом диапазонов в координаты HTML. В объём слоя A входят: сканер блоков,
маппинг позиций, диагностика (коды 014 + `OSJS4001` Error для `</script>` и `OSJS4002`
Warning для `<script`/`<!--`), semantic tokens, completion, hover, definition,
маршрутизация в `DocumentStore`/`server.ts`, протокольные тесты. Клиент VS Code и
грамматическая инъекция (слои B/C) — после, отдельной работой; слой A проверяется через
LSP-конфиг в Neovim/Zed и in-process тестами.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node.js >= 20 (сервер), ES2022; сборка —
существующий `vite.lsp.config.ts`; тесты — Vitest (in-process JSON-RPC).

**Primary Dependencies**: без новых (014 уже использует `vscode-languageserver`,
`vscode-languageserver-textdocument`, `vscode-jsonrpc` для тестов).

**Storage**: нет; состояние HTML-документов и их блоков — в памяти процесса.

**Testing**: Vitest: unit — сканер/маппинг/правила; протокол — in-process
(`PassThrough`/`vscode-jsonrpc`), `languageId: html`; fixtures — HTML-страницы с блоками
(несколько, inline, комментарии, CRLF/BOM/эмодзи, `</script>`-обрыв); `pnpm test` целиком.

**Target Platform**: Node.js LSP-сервер (как 014); клиент — любой LSP-клиент с
documentSelector на html (в первую очередь Neovim/Zed). `.osjs`-функционал 014 не меняется.

**Project Type**: single project — расширение существующего слоя `src/lsp`.

**Performance Goals**: сканирование HTML O(n); анализ блоков в бюджете 014 (≤1 с на
типичную страницу); анализ по версии документа; лимит 200 диагностик на HTML-документ;
semantic tokens — лимит 014 (≤10 000 строк).

**Constraints**: не заявляем `.html` как наш язык (клиент подключает сервер явно);
вне блоков — пустые ответы; ядро и браузерный бандл не меняются; mapping в UTF-16,
диапазоны не выходят за блок; `documentSymbol` для HTML — не реализуем; `foldingRange`,
форматирование, rewrite — нет.

**Scale/Scope**: один HTML-документ, несколько блоков; статические блоки; определение
импортов — от URL HTML-документа; слой A — ~6 новых/изменённых файлов `src/lsp` + 4 теста +
фикстуры.

## Constitution Check

*GATE: до Phase 0; re-check после Phase 1.*

| Принцип | Проверка | Статус |
|---|---|---|
| I. Язык/`.osjs`/эталон | Анализ и язык не меняются; embedded — новый редакторный слой | PASS |
| II. Браузер — основная среда | Инструменты — Node-оболочка (как 014), браузерный бандл не меняется; приёмка «в браузере» неприменима (проверка тестами/редактором) | PASS, с фиксацией в status (как у 014) |
| III. Test-First | Сканер/маппинг/правила — тесты до реализации; протокол — до wiring; TDD-цикл по фазам | PASS |
| IV. Слои и минимальный код | `src/lsp` расширяется; провайдеры 014 переиспользуются, второй анализатор не вводится; новые зависимости не нужны | PASS |
| V. Доказанное «готово» | `pnpm typecheck && pnpm test && pnpm build`; протокольные тесты embedded; ручная проверка в Neovim (LSP-клиент) — фиксируется | PASS |

Нарушений/Complexity Tracking нет.

## Project Structure

```text
specs/015-embedded-osjs-html/
├── plan.md / tasks.md (этот набора)
├── spec.md (Draft, layer A in progress)
├── quickstart.md            # обновляется: как подключить html в Neovim + проверки
└── (research/data-model/contracts — при необходимости, слой A опирается на 014/016)

src/lsp/
├── html-blocks.ts           # NEW: сканер блоков (диапазоны, type case-insensitive, комментарии)
├── embedded.ts              # NEW: маппинг позиций, анализ блоков, diagnostics 4001/4002, агрегация
├── document.ts              # MOD: DocumentStore принимает html-документы (embedded-состояние)
├── server.ts                # MOD: маршрутизация html → embedded-провайдеры
├── semantic-tokens.ts       # MOD: экспорт декодированных токенов для переноса в HTML
└── analysis.ts              # без изменений (переиспользуется на блок)

tests/
├── lsp-html-blocks.test.ts       # NEW: сканер
├── lsp-embedded.test.ts          # NEW: маппинг + диагностики 4001/4002 + лимиты
├── lsp-embedded-protocol.test.ts # NEW: LSP с languageId html (диагностика/подсказки/токены/definition)
└── fixtures/lsp/embedded/*.html  # NEW: страницы с блоками (CRLF/BOM/эмодзи/инлайн/несколько)
```

**Structure Decision**: слой A живёт в `src/lsp` как расширение 014; `analysis()` и
провайдеры 014 переиспользуются на каждом блоке; сервер не заявляет html, а обслуживает
его только если клиент прислал документ (documentSelector).

## Implementation Strategy

### Фаза A1 — Сканер блоков (`src/lsp/html-blocks.ts`)

- `findBlocks(html): HtmlBlock[]`: `{ startOffset, contentStartOffset, contentEndOffset,
  start: Position, end: Position, id?, type }`.
- Находит `script[type="text/osjs"]` (type case-insensitive, атрибуты с кавычками,
  HTML-комментарии игнорируются, несколько блоков, незакрытый — до EOF).
- Тесты `tests/lsp-html-blocks.test.ts` + фикстуры.

### Фаза A2 — Маппинг и анализ (`src/lsp/embedded.ts`)

- `analyzeHtml(text): EmbeddedAnalysis` — для каждого блока: `analyze(blockText)` (014),
  кэш по версии; `toDocumentRange(block, localRange)` / `toBlockPosition(block, docPos)`
  через `TextDocument.offsetAt/positionAt` (UTF-16, инлайн-блоки, CRLF/BOM/эмодзи).
- Диагностики: коды 014 с переносом диапазонов + `OSJS4001` (Error: обрыв по `</script>`,
  по признаку незакрытой строки/parse-error в конце блока, с объяснением) + `OSJS4002`
  (Warning: `<script`/`<!--` в тексте блока). Лимит 200 на html-документ, дедуп, сортировка.
- Тесты `tests/lsp-embedded.test.ts` (round-trip, границы, лимиты, правила).

### Фаза A3 — Semantic tokens для HTML

- Экспортировать из 014 декодированные токены; для HTML-документа — по блокам, с переносом
  `line/startChar` в координаты HTML, сортировка без пересечений, дельта-кодирование.
- Тесты: токены только внутри блоков, диапазоны после правок, инлайн-блоки.

### Фаза A4 — Маршрутизация и провайдеры (`document.ts`, `server.ts`)

- `DocumentStore` хранит html-документы (версия, текст, `EmbeddedAnalysis`); `.osjs`-путь
  не меняется.
- `server.ts`: для `languageId: html` — диагностика по блокам, completion/hover/definition
  с маппингом позиций, semanticTokens; вне блоков — пусто/null; `documentSymbol` — `[]`;
  чужие languageId — no-op. Никаких новых capabilities (html не заявляем).
- Тесты `tests/lsp-embedded-protocol.test.ts`: публикация/очистка, подсказки внутри/снаружи,
  токены, definition локальный (с переносом) и импорт (резолвер от URL html), изоляция,
  no-blocks/no-op, версии.

### Фаза A5 — Документация и проверка

- `quickstart.md` 015: как подключить сервер к html в Neovim (filetype html в конфиге),
  что ожидать; README/справка — кратко (после клиента?).
- `docs/status.md`: 015 → слой A реализован, B/C — позже; известные ограничения
  (эвристика 4001, CSP не относится, динамика/src).
- Полная проверка: `pnpm typecheck && pnpm test && pnpm build`; ручная проверка в Neovim
  (открыть HTML-фикстуру, увидеть mapped-диагностики/подсветку/completion в блоке).

### Слои B/C (после A, не в этом объёме)

- **B**: тонкий клиент VS Code (отдельная спека 017): манифест, documentSelector html,
  упаковка `.vsix`, embedded language mode.
- **C**: инъекционная TextMate-грамматика для `<script type="text/osjs">` (override
  `source.js`) + `embeddedLanguages`; может входить в 017.

## Complexity Tracking

Нет нарушений. Новых зависимостей нет; конституция не меняется.

## Risks & Mitigations

- **Off-by-one/UTF-16 в маппинге** (эмодзи, CRLF, инлайн-блоки) — property-тесты
  round-trip на фикстурах.
- **Эвристика `OSJS4001`** (обрыв `</script>`): возможны ложные/пропуски — тесты фиксируют
  поведение; сообщение объясняет, это Error по решению владельца.
- **Два сервера на HTML** (HTML + наш): диагностики в разных каналах; вне блоков — тишина;
  completion trigger только внутри блока.
- **Производительность** больших страниц — кэш по версии, лимиты, O(n)-сканер.
- **Импорты в редакторе vs рантайме**: definition резолвит путь от HTML-URL; в рантайме
  база — `document.baseURI`; расхождение документировано.
