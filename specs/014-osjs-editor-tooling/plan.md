# Implementation Plan: Редакторные инструменты `.osjs` — грамматика и LSP-сервер

**Branch**: `feat/linter` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-osjs-editor-tooling/spec.md`

## Summary

Реализовать редакторо-независимый слой инструментов для `.osjs`:

1. **Описание языка** — TextMate-грамматика (scope `source.osjs`), конфигурация языка
   (скобки, комментарии, фолдинг, кириллический word pattern) и метаданные привязки
   `*.osjs` → `osjs`; `.os` не заявляется.
2. **LSP-сервер по stdio** — диагностика (синтаксические ошибки + консервативные
   семантические проверки), автодополнение, hover, `semanticTokens`, `documentSymbol`,
   `definition`; один документ, полная синхронизация, позиции UTF-16, сообщения на русском.

Технический подход: переиспользовать существующие `src/lexer` и `src/parser`, добавив им
**толерантный режим** (несколько ошибок, диапазоны токенов) и не меняя поведение движка;
данные для подсказок и семантических проверок — из `docs/reference.md` через
генератор каталога с drift-тестом; сервер — тонкая оболочка `src/lsp` + `src/node`, ядро и
браузерная сборка не меняются. Тонкий клиент VS Code — вне объёма (FR-018).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`),
Node.js >= 20, ES2022; сборка — Vite 6, тесты — Vitest 3, пакетный менеджер — pnpm.

**Primary Dependencies** (точные версии, проверены на Node 24 / Vite 6.4.5 / tsc 5.9;
все — **devDependencies**, потому что бандлятся в `dist/lsp/server.mjs`; рантайм-зависимостей
у пакета нет):
- `vscode-languageserver@11.0.0` — официальный SDK LSP (транспорт, жизненный цикл,
  диспетчеризация, типы, документ-синхронизация); CJS-only, бандлится в ESM.
- `vscode-languageserver-textdocument@1.0.16` — UTF-16/CRLF/BOM-корректные
  `positionAt`/`offsetAt` для DocumentStore.
- `vscode-jsonrpc@10.0.0` — клиентская сторона in-process/smoke-тестов (явно, из-за strict
  pnpm: транзитивные пакеты не хойстятся).
- `vscode-textmate@^9.3.2` + `vscode-oniguruma@^2.0.1` — scope-тесты грамматики (WASM;
  импорт только default — CJS-пакет без `exports`, named-import падает в Node ESM).
- уже установленные: TypeScript, Vite, Vitest, `@types/node`, `happy-dom`.
- Альтернатива — собственный JSON-RPC/framing: отклонена, см. [research.md](./research.md) D1/D2.

**Storage**: нет. Состояние документов — в памяти процесса сервера; каталог API —
сгенерированный и закоммиченный TS-модуль `src/lsp/generated/api-catalog.ts`
(источник — `docs/reference.md`, drift ловится тестом).

**Testing**: Vitest. Уровни: юнит-тесты толерантного лексера/парсера/препроцессора и
провайдеров; drift-тест каталога API; scope-тесты грамматики; интеграционный тест LSP по
in-process JSON-RPC-стримам (`PassThrough`); один smoke-тест с реальным дочерним процессом
сервера; существующие тесты движка остаются зелёными.

**Target Platform**: Node.js >= 20 (процесс сервера и сборка); сами артефакты (грамматика,
конфигурация, метаданные) — для произвольного LSP/TextMate-совместимого редактора.
Браузерная сборка `dist/onescript.js` не затрагивается.

**Project Type**: single project — библиотека движка + новый слой инструментов в том же
репозитории.

**Performance Goals**: полная диагностика файла ~1000 строк ≤ 1 с; публикация обновлений
после правки ≤ 1 с; старт сервера и первый ответ на `initialize` — доли секунды; набор
текста не блокируется дольше бюджета.

**Constraints**: офлайн, без телеметрии и рантайм-скачиваний; ядро (`src/lexer`,
`src/parser`, `src/ast`, `src/runtime`, `src/stdlib`) не импортирует `node:*`/LSP;
поведение `parse()`/движка не меняется (толерантность — отдельный режим); позиции —
UTF-16 (как требует LSP); диагностические сообщения — на русском; без конфигурации
правил; без второго анализатора.

**Scale/Scope**: один документ на запрос; 4 области (диагностика, completion, hover,
semantic tokens + навигация); каталог — функции/типы/перечисления/объекты из справочника
(десятки разделов, сотни строк таблиц); поддерживаемые LSP-методы — 6.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Проверка | Статус |
|---|---|---|
| I. Язык, формат `.osjs` и эталон | Грамматика и подсказки описывают только `.osjs`; семантика движка не меняется; `.os` не заявляется ни грамматикой, ни сервером; расширения диалекта (`Асинх`/`Ждать`) уже в языке, инструменты их лишь отражают | PASS |
| II. Один движок — две среды (браузер — основная) | Инструменты — Node-оболочка уровня `src/node` (как CLI), не часть браузерного продукта. Ядро не получает Node/LSP-зависимостей; `dist/onescript.js` не меняется; ограничение «приёмка в браузере неприменима» фиксируется в `docs/status.md` (конституция V) | PASS, с фиксацией ограничения |
| III. Test-First | Каждая фаза начинается с падающих Vitest-тестов: толерантный лексер/парсер, drift каталога, диагностика, completion/hover, semantic tokens, протокол LSP, scope грамматики. Слияние с красным `typecheck`/тестами запрещено | PASS |
| IV. Слои и минимальный код | Новый слой `src/lsp` зависит только от `src/lexer`, `src/parser`, `src/ast` (+ сгенерированный каталог); `src/node/lsp-server.ts` — точка входа. Направление `lexer → parser/ast → … → wrappers` сохранено. Новые зависимости ограничены LSP SDK и тест-харнессом грамматики, обоснованы в Complexity Tracking; `tree-sitter` и второй парсер не вводятся | PASS |
| V. Доказанное «готово» | Проверка: `pnpm typecheck && pnpm test`, `pnpm build`, smoke-запуск сервера и интеграционный LSP-тест; вывод показывается. Браузерная приёмка неприменима (инструмент не исполняет BSL); причина и ограничение — в `docs/status.md` | PASS |

Нарушений, требующих обоснования в Complexity Tracking, нет, кроме новых зависимостей
(см. ниже).

**Post-Design re-check (после Phase 1)**: PASS — новые артефакты (грамматика, каталог,
сервер) не меняют семантику движка и браузерную сборку; зависимости ограничены
devDependencies, которые бандлятся в сервер (рантайм-зависимостей у пакета нет), и
обоснованы; `src/lsp` не получает Node/LSP-импортов (страж `lsp-boundaries.test.ts`);
все уточнения research.md сведены в контракты.

## Project Structure

### Documentation (this feature)

```text
specs/014-osjs-editor-tooling/
├── plan.md              # этот файл
├── research.md          # Phase 0: решения и альтернативы
├── data-model.md        # Phase 1: сущности и правила анализа
├── quickstart.md        # Phase 1: сценарии проверки
├── contracts/           # Phase 1: контракты LSP, артефактов языка, каталога, диагностик
├── checklists/
│   └── requirements.md  # (готов) quality-чек-лист спеки
├── spec.md              # (готов) спецификация
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/parser/keywords.ts            # словари языка (KW_*/DIR_*/END_OF_BLOCK) — единый источник для парсера и инструментов
src/lsp/                          # новый слой: провайдеры и анализ (без node:* и LSP-транспорта)
├── server.ts                     # registerHandlers(connection): capabilities + 6 хендлеров (переиспользуется тестом)
├── analysis.ts                   # конвейер: токены → препроцессинг → AST + диагностики + символы
├── document.ts                   # DocumentStore: uri, version, text, кэш анализа
├── diagnostics.ts                # синтаксические + семантические правила, лимиты, дедуп
├── completion.ts                 # completion items: словоформы, stdlib, локальные символы, члены
├── hover.ts                      # hover: сигнатуры/описания из каталога и локальных символов
├── semantic-tokens.ts            # легенда и токены (в т.ч. разбиение многострочных строк)
├── symbols.ts                    # documentSymbol + definition (локальные, #Использовать)
├── api-catalog.ts                # типы и загрузка сгенерированного каталога, поиск/фильтры
└── generated/
    └── api-catalog.ts            # сгенерирован из docs/reference.md; коммитится, drift-тест

src/node/lsp-server.ts            # точка входа (5 строк): createConnection(ProposedFeatures.all, stdin, stdout) → registerHandlers
src/node/cli.ts                   # не меняется
vite.lsp.config.ts                # dist/lsp/server.mjs: resolve.conditions ['node'], node:* + builtins external
scripts/
├── build-api-catalog.mjs         # docs/reference.md → src/lsp/generated/api-catalog.ts
└── check-api-docs.mjs            # не меняется (или переиспользует общий парсер, см. research)

editors/osjs/                     # редакторо-независимые артефакты (закоммичены)
├── osjs.tmLanguage.json          # TextMate: scope source.osjs
├── language-configuration.json   # скобки, комментарии, фолдинг, wordPattern
├── languages.json                # метаданные: languageId osjs, *.osjs, пути к артефактам
└── NOTICE                        # авторство/лицензия MIT-грамматики 1c-syntax

tests/
├── lsp-lexer-parser.test.ts      # толерантные лексер/парсер/препроцессор (фаза A)
├── lsp-catalog.test.ts           # drift-тест каталога API + арность
├── lsp-diagnostics.test.ts       # правила и консервативность
├── lsp-completion-hover.test.ts
├── lsp-semantic-tokens.test.ts
├── lsp-symbols-definition.test.ts
├── lsp-protocol.test.ts          # in-process JSON-RPC (server + client createMessageConnection)
├── lsp-server-smoke.test.ts      # spawn собранного dist/lsp/server.mjs; skipIf dist нет
├── lsp-boundaries.test.ts        # src/lsp без node:* и не импортируется из index/browser
├── grammar.test.ts               # scope-тесты TextMate-грамматики
├── helpers/textmate.ts           # default-import vscode-textmate/oniguruma + onig.wasm
├── fixtures/lsp/                 # .osjs-фикстуры диагностик/подсказок
└── fixtures/osjs/grammar.osjs    # одна фикстура на все конструкции FR-002
```

**Structure Decision**: single project. Новый слой `src/lsp` — потребитель языковых слоёв
(`lexer`/`parser`/`ast`), не часть ядра; точка входа с Node-транспортом — в `src/node`
(как CLI). Артефакты описания языка — в `editors/osjs/`, чтобы будущий клиент VS Code и
другие редакторы ссылались на них, а не копировали. Браузерная точка входа, `src/index.ts`
и существующие конфиги Vite не меняются; добавляется отдельный `vite.lsp.config.ts` с
`resolve.conditions: ['node']` и external-списком builtins. `tsconfig.build.json`
исключает `src/lsp` (типы инструментов не входят в публикуемый `dist/node`), `tsconfig.json`
включает новый конфиг. Отдельный тест-страж `lsp-boundaries.test.ts` проверяет, что
`src/lsp` не импортирует `node:*` и не импортируется из `src/index.ts`/`src/browser`.

## Implementation Strategy

Порядок — по приоритетам спеки (US1 → US4). Каждая фаза даёт самостоятельную ценность и
закрывается тестами; задачи детализируются в `tasks.md` (`/speckit-tasks`).

### Фаза A — Фундамент анализа (TDD, без пользовательской поверхности)

- Лексер: диапазоны токенов (`endLine`/`endColumn`, UTF-16) и толерантный режим
  (незакрытая строка/дата, неожиданный символ → ошибка + продолжение); опция эмиссии
  `Comment`-токенов для semantic tokens (по умолчанию поведение прежнее).
- Парсер: `parse()` сохраняет прежнее поведение (бросает на первой ошибке); новый
  `parseTolerant()` собирает несколько ошибок с диапазонами и отдаёт частичный AST,
  восстанавливаясь на границах операторов/блоков; состояние парсера восстанавливается
  через `try/finally`.
- Препроцессор: толерантный режим для ошибок директив (`#Использовать` не в начале,
  незакрытая строка), ошибки в диагностику, импорты всё равно извлекаются.
- Словари языка: вынести `KW_*`/`END_OF_BLOCK`/`DIR_*` в `src/parser/keywords.ts`;
  `parser.ts`/`preprocessor.ts` импортируют оттуда (рефакторинг без изменения поведения —
  инструменты и грамматический анти-drift используют тот же модуль).
- Регресс: существующие тесты движка не меняются и остаются зелёными.

### Фаза B — US1: артефакты описания языка

- Вендоринг: MIT-копия грамматики `1c-syntax/vsc-language-1c-bsl`
  (`syntaxes/1c.tmLanguage.json`, коммит `c93f87c…`) в `editors/osjs/` + `NOTICE.md`
  (копирайт © 2015 xDrivenDevelopment, текст MIT, коммит, список правок).
- Адаптация (полный список — `contracts/language-artifacts.md`): `scopeName: source.osjs`,
  `fileTypes: ["osjs"]` (убрать `bsl` и `os`!), все суффиксы `.bsl` → `.osjs`; диалект
  `Асинх|Async` → `storage.modifier.async.osjs`, `Ждать|Await` →
  `keyword.operator.word.await.osjs` (до `meta.var-single-variable`); добавить
  `Перейти/Выполнить/ДобавитьОбработчик/УдалитьОбработчик` (+ EN); убрать `#query`
  (SDBL), вложенный comment-паттерн строк, неподдерживаемые директивы и `support.*`
  платформы 1C (имена stdlib — зона semantic tokens).
- `language-configuration.json`: `//`, скобки/кавычки (`notIn`), одна пара `folding.markers`
  на `#Область|#Если`; `wordPattern` — явные диапазоны кириллицы/греческого (не `\p{L}`:
  в этом файле нет regex-флагов).
- `languages.json` (+ `scopeName`), пути к артефактам; `.os` не входит.
- Тесты: `tests/helpers/textmate.ts` (default-import `vscode-textmate`/`vscode-oniguruma`,
  WASM через `createRequire(...).resolve('vscode-oniguruma/release/onig.wasm')`),
  фикстура `tests/fixtures/osjs/grammar.osjs` и таблица `{line, column, scope}` (≥20
  конструкций); инварианты: `fileTypes === ['osjs']`, нет `.bsl` в scope, нет висячих
  includes, `languages.json` без `os`/`bsl`, `wordPattern` матчит `Сообщить`;
  анти-drift `KW_*`/`DIR_*` из `src/parser/keywords.ts` → keyword-scope.

### Фаза C — US2: каталог API + LSP-сервер + диагностика

- Подготовка: добавить devDependencies с точными версиями из Technical Context
  (`pnpm add -D ...`) и обновить `pnpm-lock.yaml`.
- Генератор каталога: парсинг таблиц `docs/reference.md` (функции, методы, свойства,
  значения перечислений, описания, параметры с `?`/`…`), сверка с именами из `src/`
  (переиспользование логики `check-api-docs.mjs`); генерация
  `src/lsp/generated/api-catalog.ts`; drift-тест. Добавить команду `pnpm build:catalog`
  и правило «меняешь API — перегенерируй каталог» в docs/AGENTS.
- LSP-сервер: `initialize`/`shutdown`/`exit`; полная синхронизация
  (`didOpen`/`didChange`/`didClose`); возможности — `positionEncoding: 'utf-16'`,
  `textDocumentSync.change = Full`, `completionProvider.triggerCharacters: ['.']`,
  `hoverProvider`, `semanticTokensProvider.full` (range/delta не объявляем),
  `documentSymbolProvider`, `definitionProvider`. `diagnosticProvider` **не** объявляется
  (только push). Регистрация — `registerHandlers(connection)` в `src/lsp/server.ts`, чтобы
  in-process тест использовал боевую регистрацию.
- Диагностика: синтаксис из толерантного конвейера; семантика консервативно — неизвестный
  глобальный вызов, неверная арность известной функции, неизвестный тип в `Новый` при
  отсутствии `#Использовать`; известные глобалы = stdlib + имена импортированных модулей.
  Severity: ошибки разбора — Error, семантические — Warning. Публикация синхронная в
  `didOpen`/`didChange` с `version` документа (`shortcut: sync publish, debounce если
  файлы > 10 000 строк`), при `didClose` — пустой набор. Лимит 200 диагностик, дедуп.
  Стилевых правил нет.
- Сборка: `vite.lsp.config.ts` — entry `src/node/lsp-server.ts`, `dist/lsp/server.mjs`,
  `formats: ['es']`, `target: 'node20'`, `emptyOutDir: true`, `sourcemap: true`,
  **обязательно** `resolve.conditions: ['node']` (иначе subpath `vscode-languageserver/node`
  не резолвится) и `external: [/^node:/, ...builtinModules]` (иначе Vite молча подменяет
  builtins browser-заглушками). `package.json`: `build:lsp`, `build:catalog`, `lsp`; в
  агрегатном `build` — после browser (browser-сборка чистит `dist/`). `tsconfig.build.json`:
  `src/lsp` в `exclude` (типы инструментов не в публикуемом Node-пакете); `tsconfig.json`:
  `vite.lsp.config.ts` в `include`.
- Интеграционный тест: in-process `createConnection` (server) + `createMessageConnection`
  (client) через `PassThrough`; плюс smoke реального собранного процесса
  (`tests/lsp-server-smoke.test.ts`, `describe.skipIf(!existsSync(dist))`).

### Фаза D — US3: completion и hover

- Completion: ключевые слова/операторы RU/EN, stdlib (функции, типы, перечисления,
  глобалы), локальные символы (методы, параметры, переменные), члены объекта при
  однозначном типе (минимальный вывод: `Новый Тип`, последнее одиночное присваивание
  переменной), фильтрация по префиксу, запрет в строках/комментариях.
- Hover: сигнатура + описание из каталога, локальные символы, контекстные `Асинх`/`Ждать`.
- Данные — только из каталога и разбора; ручных списков нет (FR-012).

### Фаза E — US4: semantic tokens и навигация

- `semanticTokens/full`: только **стандартные** token types (клиенты рендерят лишь
  объявленные ими типы): keyword, operator, number, string, comment, decorator, function,
  method, variable, parameter, property, enumMember. Маппинг: директива → `keyword`,
  дата → `number`, аннотация → `decorator`, имя метода → `method`. Дельта-кодирование,
  разбиение многострочных строк по строкам, без пересечений, синхронизация с версией
  документа.
- `documentSymbol`: методы и `#Область` (`DocumentSymbol` с `range` + `selectionRange`;
  `#Область` → `Namespace`); при отсутствии иерархической поддержки у клиента —
  flatten в `SymbolInformation` (необязательно, ~10 строк).
- `definition`: локальные методы/переменные; файл из `#Использовать` — `Location` с
  `range 0:0`. Резолв путь→file-URI выполняется инжектированной функцией из `src/node`
  (контракт: сам слой `src/lsp` файлы не читает).
- Тесты: диапазоны после вставки/удаления строк, устойчивость при ошибках разбора,
  фикстуры с кириллицей/эмодзи/CRLF/BOM.

### Фаза F — Документация и приёмка

- `docs/architecture.md` — новый слой инструментов; `docs/status.md` — строка 014 и
  запись об ограничении «браузерная приёмка неприменима»; README — запуск сервера и
  подключение грамматики; пример `.osjs`; `AGENTS.md` — правило про каталог (если нужно).
- Финальная проверка: `pnpm typecheck && pnpm test && pnpm build` (порядок сборки:
  browser → node → cli → lsp), smoke `node dist/lsp/server.mjs`, ручная проверка в
  LSP-клиенте (Neovim/Zed) по `quickstart.md`.

## Complexity Tracking

| Нарушение/риск | Почему нужно | Простая альтернатива отклонена, потому что |
|---|---|---|
| Новые devDependencies: `vscode-languageserver@11.0.0` + `vscode-languageserver-textdocument@1.0.16` (+ `vscode-jsonrpc@10.0.0` для тестов); всё бандлится в сервер, рантайм-зависимостей у пакета нет | LSP — большой внешний протокол (framing, диспетчеризация, жизненный цикл, типы, синхронизация документа). Официальный SDK — «стандартная библиотека» платформы LSP | Собственный JSON-RPC/framing — это код, не относящийся к продукту; ошибки протокола дороги, тесты пришлось бы писать на сам протокол |
| Новые devDependencies: `vscode-textmate@9.3.2` + `vscode-oniguruma@2.0.1` | Единственный способ автоматически проверять scope TextMate-грамматики без запуска редактора (SC-001) | Ручная проверка в редакторе не автоматизируется; свой интерпретатор грамматики — неоправданный код |
| Толерантный режим в парсере (правка ядра) | Диагностика «все ошибки файла» и «не падать на недописанном коде» (FR-005) невозможны с парсером, бросающим на первой ошибке | Отдельный парсер для инструментов — второй анализатор, запрещён спекой (FR-015) |
| Сгенерированный и закоммиченный каталог API | Подсказки/hover/семантика не должны дублировать справочник вручную (FR-012); серверу нужны данные без чтения `docs/` в рантайме | Парсить `docs/reference.md` при старте сервера — лишняя файловая зависимость и хрупкость путей; ручной JSON — дублирование |

## Risks & Mitigations

- **Сборка Vite молча ломается**: без `resolve.conditions: ['node']` — жёсткая ошибка
  резолва `vscode-languageserver/node`; без `external` для builtins Vite подменяет
  `fs/path/url` browser-заглушками, сборка «зелёная», падение на редкой ветке SDK.
  Митигация: точный конфиг + smoke-тест, который поднимает **собранный** бандл и проверяет
  `initialize` → `publishDiagnostics`.
- **Зависимость US2–US4 от фазы A**: без позиций конца, `parseTolerant` и эмиссии
  комментариев невозможны «все ошибки», outline и подсветка комментариев. Фаза A
  фиксируется контрактом токенов/`parseTolerant` до провайдеров.
- **Только стандартные token types**: кастомные типы клиенты не рендерят; легенда —
  стандартная, маппинг директив/дат/аннотаций — выше.
- **Вендорная грамматика**: в upstream `fileTypes: ["bsl","os"]` — забыть убрать значит
  заявить `.os` (нарушение FR-001/SC-002). Митигация: тест-инвариант на `fileTypes` и
  `languages.json`; таблица scope'ов в контракте — по фактическим scope upstream (иначе
  тесты закрепят выдуманные имена).
- **`wordPattern` с `\p{L}`**: в `language-configuration.json` нет regex-флагов → кириллица
  молча не матчится. Митигация: явные диапазоны + тест `new RegExp(wordPattern).test('Сообщить')`.
- **WASM-харнесс**: `vscode-textmate`/`vscode-oniguruma` проверены в Node ESM, но не внутри
  именно Vitest — первый прогон suite обязателен; при проблеме — выделенный setup/путь к
  `onig.wasm` в `tests/helpers/textmate.ts`.
- **Расхождение с upstream при синхронизации**: ручные правки (7 пунктов) нужно повторно
  применять; список и коммит фиксируются в `NOTICE.md`.
- **Ложные срабатывания семантических проверок** (динамическая природа BSL): правила
  консервативные, severity Warning, подавления при `#Использовать`/`Выполнить`/
  `Вычислить`; список правил и условий подавления — в `contracts/diagnostics.md`;
  ошибки разбора остаются Error.
- **Грамматика — регэкспы**: неизбежные неточности (контекстные `Асинх`/`Ждать`,
  многострочные строки); точность обеспечивает сервер (semantic tokens/диагностика),
  грамматика — базовый уровень; границы зафиксированы в контракте артефактов.
- **Инференс типов для `Член.`**: минимальный и консервативный; при неоднозначности
  подсказка не предлагается (лучше пропустить, чем соврать).
- **Производительность на больших файлах**: полный репарс дешёв; для файлов на порядок
  больше 1000 строк — лимит диагностик и отложенная публикация; зависание недопустимо.
- **Совместимость клиентов**: объявлять только реально реализованные возможности;
  positionEncoding — UTF-16 (клиенту, предложившему только utf-8, всё равно отвечаем
  UTF-16 — `shortcut: таких клиентов нет, конверсия позже`); отсутствие поддержки
  semantic tokens/hierarchical symbols у клиента не ломает остальное.
