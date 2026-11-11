# Quickstart: проверка редакторных инструментов `.osjs`

Руководство для ручной и автоматической проверки спеки 014. План и контракты:
[plan.md](./plan.md), [contracts/](./contracts/). Реализация появится по `tasks.md`.

## Предварительные требования

- Node.js >= 20, pnpm.
- В DSH-окружении — системный node из nvm (см. `AGENTS.md` §6):
  `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH"`.
- Установка зависимостей: `pnpm install` (LSP SDK и тест-харнесс грамматики —
  dev-зависимости, бандлятся в сервер).

## Сборка

```bash
pnpm build:catalog     # docs/reference.md → src/lsp/generated/api-catalog.ts (drift)
pnpm build:lsp         # → dist/lsp/server.mjs
pnpm typecheck
pnpm test              # grammar, catalog, diagnostics, completion/hover, tokens, protocol
pnpm build             # browser → node → cli → lsp (browser чистит dist/ — поэтому lsp последним)
```

Ожидаемо: команды завершаются кодом 0; в `dist/lsp/` лежит `server.mjs`; браузерный
`dist/onescript.js` собирается как раньше и не содержит LSP-кода.

## Автоматическая проверка (без редактора)

```bash
# Толерантный лексер/парсер: несколько ошибок, диапазоны, движок не сломан
pnpm vitest run tests/lsp-lexer-parser.test.ts

# Грамматика: scope на фикстуре (≥20 конструкций), '.os' не заявлен
pnpm vitest run tests/grammar.test.ts

# Каталог: drift и кросс-сверка с src/
pnpm vitest run tests/lsp-catalog.test.ts

# Границы слоя: src/lsp без node:* и не тянется в браузерную сборку
pnpm vitest run tests/lsp-boundaries.test.ts

# Диагностика, completion/hover, semantic tokens, symbols/definition
pnpm vitest run tests/lsp-diagnostics.test.ts tests/lsp-completion-hover.test.ts \
  tests/lsp-semantic-tokens.test.ts tests/lsp-symbols-definition.test.ts

# Протокол LSP: in-process JSON-RPC; smoke собранного сервера — если dist/lsp существует
pnpm vitest run tests/lsp-protocol.test.ts tests/lsp-server-smoke.test.ts
```

## Smoke-запуск сервера

```bash
node dist/lsp/server.mjs
```

Ожидаемо: процесс ждёт JSON-RPC на stdin (визуально «тихо»), не падает без запроса; при
`Ctrl+C` завершается. Логи — только в stderr. Флаг `--stdio` не нужен (стримы передаются
явно).

## Подключение к редактору (вручную)

Клиент VS Code в эту версию не входит (FR-018). Проверка — в любом LSP-клиенте.

**Neovim** (встроенный LSP):

```lua
vim.lsp.start({
  name = 'osjs',
  cmd = { 'node', '/абсолютный/путь/OneScriptJS/dist/lsp/server.mjs' },
  root_dir = vim.fn.getcwd(),
})
```

**Zed / другие LSP-клиенты**: та же команда, запуск по stdio; язык файла — `osjs`
(привязка `*.osjs` — по `editors/osjs/languages.json`). Грамматику в не-VS Code редакторы
подключают их собственными средствами (адаптеры, формат TextMate).

Что проверить в редакторе (сценарии приёмки):

1. Открыть `tests/fixtures/lsp/broken.osjs` — в Problems/диагностике видны несколько
   ошибок одновременно с верными строками; исправить одну — она исчезает ≤ 1 с.
2. Открыть файл с ошибкой в строке 5 — подчёркивание на строке 5 (не на 1).
3. Набрать `Сооб` — в completion есть `Сообщить` и `Message`; навести на `Сообщить(` —
   hover с сигнатурой и описанием.
4. Открыть `tests/fixtures/lsp/structure.osjs` — Outline показывает методы и `#Область`;
   «Перейти к определению» из вызова ведёт на объявление.
5. Semantic tokens: ключевые слова, строки, числа, комментарии, директивы, аннотации
   подсвечиваются сервером (только стандартные LSP token types); после вставки строки
   подсветка не съезжает.
6. Открыть `.os` — наш сервер его не обслуживает (клиент не должен ассоциировать его с
   `osjs`; проверяется также тестом метаданных).
7. Фолдинг: `#Область`/`#Если` складываются по маркерам конфигурации; тела методов — по
   отступам средствами редактора.

## Проверка «чужой формат не заявлен»

```bash
node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('editors/osjs/languages.json','utf8'));\
const exts=m.languages.flatMap(l=>l.extensions);const g=JSON.parse(fs.readFileSync('editors/osjs/osjs.tmLanguage.json','utf8'));\
if(exts.includes('.os')||g.fileTypes.includes('os')||g.fileTypes.includes('bsl')) process.exit(1);\
console.log('OK:', exts, g.scopeName, g.fileTypes)"
```

Ожидаемо: `OK: [ '.osjs' ] source.osjs [ 'osjs' ]`.

## Проверка офлайн/приватности

- Сервер не делает сетевых запросов: запустить с отключённой сетью (или в песочнице) —
  работает.
- В коде сервера нет HTTP-клиентов, телеметрии, скачивания бинарников (проверяется
  `tests/lsp-boundaries.test.ts` и ревью).

## Соответствие критериям успеха

| SC | Как проверить |
|---|---|
| SC-001 | `tests/grammar.test.ts` — ≥20 конструкций, ожидаемые scope, `fileTypes ['osjs']` |
| SC-002 | тест метаданных (нет `.os`/`bsl`) + тест «чужой languageId не диагностируется» |
| SC-003 | `tests/lsp-protocol.test.ts`: 3 ошибки, диапазоны, очистка ≤ 1 с |
| SC-004 | `tests/lsp-diagnostics.test.ts`: OSJS3001/3002 срабатывают, стилевых нет |
| SC-005 | `tests/lsp-diagnostics.test.ts`: 1000 строк ≤ 1 с (замер в тесте) |
| SC-006 | `tests/lsp-completion-hover.test.ts` |
| SC-007 | `tests/lsp-semantic-tokens.test.ts`, `tests/lsp-symbols-definition.test.ts` |
| SC-008 | `tests/lsp-diagnostics.test.ts`: 100+ ошибок, стресс-цикл правок |
| SC-009 | офлайн-запуск; `tests/lsp-boundaries.test.ts` — нет сетевых/Node-импортов в ядре инструментов |
| SC-010 | `pnpm typecheck && pnpm test && pnpm build` |
| SC-011 | README, пример `.osjs`, `docs/architecture.md`, `docs/status.md` |
