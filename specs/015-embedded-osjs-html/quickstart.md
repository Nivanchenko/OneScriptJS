# Quickstart: встроенный `.osjs` в HTML (слой A — серверный embedded-режим)

Слой A даёт редакторную поддержку кода внутри `<script type="text/osjs">` в открытом HTML
**через LSP-клиент**, без VS Code-расширения и грамматической инъекции. Клиент только
подключает наш сервер к `languageId: html`; `.html` при этом остаётся у HTML-инструментов.

## 1. Проверка автоматически

```bash
cd /Users/nikita.ivanchenko/Documents/repos/github/OneScriptJS
pnpm typecheck
pnpm test                 # включает lsp-html-blocks / lsp-embedded / lsp-embedded-protocol
pnpm build:lsp            # dist/lsp/server.mjs
```

Ожидаемо: тесты зелёные; в выводе присутствуют новые embedded-suite'ы.

## 2. Подключение в Neovim (ручная проверка)

Ваш конфиг для `.osjs` — `~/.config/nvim/lua/osjs.lua`. Для проверки HTML **временно**
добавьте html-файлтип к тому же или отдельному клиенту:

```lua
-- вариант 1: тот же клиент, но для html (удобно для проверки)
vim.lsp.config('osjs', { filetypes = { 'osjs', 'html' } })

-- вариант 2: отдельный клиент, чтобы не менять поведение для .osjs
vim.lsp.config('osjs-html', {
  cmd = { <тот же node+server>, },
  filetypes = { 'html' },
  root_markers = { '.git' },
  on_attach = function(client, bufnr)
    if vim.fn.has('nvim-0.12') == 1 then
      vim.lsp.semantic_tokens.enable(true)
    elseif client:supports_method('textDocument/semanticTokens/full') then
      vim.lsp.semantic_tokens.start(bufnr, client.id)
    end
  end,
})
vim.lsp.enable('osjs-html')
```

Открыть `tests/fixtures/lsp/embedded/`-фикстуры (или свою страницу):

- внутри `<script type="text/osjs">` — диагностики/подсказки/hover/токены;
- вне блоков — тишина (HTML-диагностики остаются у HTML-инструментов);
- `:checkhealth vim.lsp` / `:lua =vim.lsp.get_clients({ bufnr = 0 })` — клиент attached;
- диагностика `OSJS4001` (Error) — при обрыве блока `</script>` внутри BSL-строки;
  `OSJS4002` (Warning) — при `<script`/`<!--` в тексте блока.

Типовой прогон:

```bash
npx --yes @vscode/... 2>/dev/null || true   # не требуется: сервер — dist/lsp/server.mjs
nvim tests/fixtures/lsp/embedded/broken.html
```

## 3. Ожидаемое поведение (соответствие spec 015, слой A)

| Сценарий | Ожидание |
|---|---|
| HTML с двумя блоками и ошибками | все ошибки с диапазонами в координатах HTML, версия документа |
| Исправление ошибки | набор диагностик обновляется ≤ 1 с |
| HTML без `<script type="text/osjs">` | пусто, никаких наших диагностик |
| `.osjs`-файл | работает как в 014 (без изменений) |
| completion/hover/definition внутри блока | работают как в 014, диапазоны mapped; снаружи — пусто |
| semantic tokens | подсвечиваются только блоки; после правок не съезжают |
| обрыв `</script>` | `OSJS4001` Error с объяснением; runtime в браузере — ошибка разбора |
| `<script`/`<!--` в строке | `OSJS4002` Warning |
| документ с чужим `languageId` | no-op |

## 4. Ограничения слоя A

- Нет грамматической инъекции/VS Code-клиента: подсветка — только semantic tokens
  (слой C/спека 017).
- `documentSymbol` для HTML не реализуется: outline остаётся HTML-инструментам.
- `src` и динамически добавленные блоки — вне v1 (по 016).
- Эвристика `OSJS4001` основана на признаках обрыва (незакрытая строка/parse-error у конца
  блока), возможны редкие пропуски/ложные — сообщение объясняет.
- Два LSP-сервера на HTML: наши диагностики имеют `source: 'osjs'`, HTML-диагностики не
  трогаются; completion вне блоков пуст.
- Импорты в definition резолвятся от URL HTML-файла; в рантайме база — `document.baseURI`
  (для локальной страницы совпадает).
