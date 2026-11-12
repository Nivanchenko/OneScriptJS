# Quickstart: тонкий клиент VS Code (слой B)

## 1. Сборка `.vsix`

```bash
cd /Users/nikita.ivanchenko/Documents/repos/github/OneScriptJS
# Требуется Node.js >= 22 для упаковщика @vscode/vsce (рантайму нужен только VS Code)
pnpm install                # при первом запуске/после новых dev-зависимостей
pnpm build:vscode           # соберёт сервер, extension.js и .vsix
ls -la dist/vscode/*.vsix
```

Ожидаемо: `dist/vscode/onescriptjs-<version>.vsix`; внутри (проверка `unzip -l`):
`extension/out/extension.js`, `extension/server/server.mjs`,
`extension/syntaxes/osjs.tmLanguage.json`, `extension/language-configuration.json`,
`extension/package.json`, `extension/README.md`; без `node_modules/`.

## 2. Установка в VS Code

```bash
code --install-extension dist/vscode/onescriptjs-<version>.vsix --force
# перезапустить окно VS Code (или Reload Window)
```

Проверка `.osjs`:

1. Открыть `examples/editor.osjs` — язык показан как OneScriptJS/osjs, есть подсветка.
2. Diagnostics: открыть файл с ошибкой (например, скопировать `tests/fixtures/lsp/broken.osjs`)
   — ошибка с верной позицией в Problems.
3. Completion: набрать `Сооб` → в подсказках `Сообщить`/`Message`.
4. Hover: навести на `Сообщить(` — сигнатура/описание.
5. Outline: методы и `#Область`; `Перейти к определению` из вызова локального метода.
6. Semantic tokens: ключевые слова/строки/комментарии подсвечиваются сервером.

HTML-режим (по умолчанию включён):

7. Открыть `tests/fixtures/lsp/embedded/manual-check.html`: внутри блока — диагностика,
   completion, hover, `gd`; вне блока — ничего; язык документа остаётся HTML.
8. `Настройки → OneScriptJS: Embedded In Html` выключить — HTML перестаёт обслуживаться
   нашим сервером (без перезапуска VS Code).
9. `Ctrl+Shift+P` → `OneScriptJS: Show Output` — канал `OneScriptJS` в Output;
   `OneScriptJS: Restart Language Server` — перезапуск.

## 3. Автоматические проверки

```bash
pnpm typecheck
pnpm test                  # включая tests/vscode-extension.test.ts
pnpm typecheck:vscode      # если добавлен отдельный скрипт
pnpm build                 # сборка движка/сервера не сломана
pnpm build:vscode          # пакет собирается
```

## 4. Ожидания и ограничения

- `.os` не заявляется; `.html` не заявляется, а лишь дополнительно обслуживается по
  настройке (embedded-режим 015/слой A).
- Грамматической инъекции/embedded language mode нет (слой C): в HTML подсветка блоков —
  semantic tokens сервера, без TextMate-инъекции.
- Marketplace/автообновление/телеметрия — вне объёма; установка локальная.
- Сервер внутри `.vsix`, отдельный Node.js не нужен.
- Если сервер не стартовал: Output `OneScriptJS`, команда перезапуска, проверка
  `code --list-extensions | grep onescriptjs`.

## 5. Удаление

```bash
code --uninstall-extension <publisher>.onescriptjs
# перезапустить окно
```
