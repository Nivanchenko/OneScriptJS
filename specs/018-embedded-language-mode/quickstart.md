# Quickstart: embedded language mode в VS Code (слой C)

## 1. Сборка и установка

```bash
cd /Users/nikita.ivanchenko/Documents/repos/github/OneScriptJS
pnpm install
pnpm build:vscode            # Node >= 22 (упаковщик)
code --install-extension dist/vscode/onescriptjs-0.1.0.vsix --force
# Reload Window
```

## 2. Ручная проверка в VS Code

Открыть `tests/fixtures/lsp/embedded/manual-check.html`:

| Проверка | Ожидание |
|---|---|
| подсветка внутри блока | как в `.osjs`: ключевые слова, строки, `|`, числа, даты, комментарии, `#Область`/`#Если`/`#Использовать`, аннотации |
| `Ctrl+/` внутри блока | вставляет `//` |
| `#Область … #КонецОбласти` | регион складывается |
| двойной клик по кириллическому имени | выделяется слово целиком (наш word pattern) |
| набрать `<` в BSL-сравнении внутри блока | Emmet/автозакрытие тега не срабатывает |
| скобки/кавычки | авто-закрытие/парная подсветка по BSL-конфигурации |
| вне блока (`<div>`, `<h1>`) | обычное HTML-поведение, наши правила не применяются |
| `<script type="text/javascript">` в том же файле | JS-подсветка как раньше, без BSL |
| HTML без блоков (`tests/fixtures/lsp/embedded/no-blocks.html`) | без изменений |
| `.osjs` (`examples/editor.osjs`) | без регрессий (грамматика/сервер) |

Проверка независимости от сервера: `OneScriptJS: Restart Language Server` (или отключить
расширение) — подсветка/комментарии/фолдинг блока должны работать и без LSP (грамматика).

## 3. Автоматические проверки

```bash
pnpm typecheck
pnpm test                        # включает tests/vscode-embedded-grammar.test.ts
pnpm typecheck:vscode
pnpm build
pnpm build:vscode
unzip -l dist/vscode/onescriptjs-0.1.0.vsix   # есть syntaxes/osjs-embedded.tmLanguage.json
```

## 4. Ограничения слоя C

- Только VS Code-семейство (TextMate-инъекции); Neovim/Zed остаются на semantic tokens.
- Форматирование/rename/отладка не добавляются.
- `.html` не заявляется нашим языком; вне блоков поведение HTML не меняется.
- Версия встроенной HTML-грамматики VS Code может отличаться от тестовой фикстуры
  (1.146.0); расхождения — через ручную проверку/обновление фикстуры.
- Semantic tokens сервера накладываются поверх грамматики; при отключённом сервере
  остаётся грамматика.

## 5. Файлы для ручной проверки редакторных кейсов

> **Форматтера в проекте нет** (formatting вне объёма 014): эти файлы проверяют
> подсветку, комментарии, скобки, фолдинг, word pattern и embedded-поведение.

| Файл | Что проверить |
|---|---|
| `tests/fixtures/manual-editor-cases.osjs` | подсветка всех конструкций (ключевые слова/операторы/литералы/строки `\|`/даты/аннотации/`Асинх`/`Ждать`), `Ctrl+/` → `//`, фолдинг `#Область`, парные скобки/кавычки, двойной клик по кириллице, completion/hover/`gd`/Outline |
| `tests/fixtures/lsp/embedded/editor-cases.html` | то же внутри `<script type="text/osjs">`; фолдинг регионов; инлайн-блок; `TYPE` в другом регистре; атрибуты до/после `type` и `id`; `text/javascript` остаётся JS; HTML-комментарий с нашим тегом не активирует инъекцию; HTML/стили не меняются |
| `tests/fixtures/lsp/embedded/manual-check.html` | LSP внутри блоков: диагностика/`gd` локальный и импорт/hover/изоляция (слой A) |
| `tests/fixtures/lsp/embedded/script-in-string.html` | обрыв `</script>` → `OSJS1001` + `OSJS4001` Error |

Оба новых файла проверены автоматически (`tests/manual-fixtures.test.ts`): разбираются
без диагностик. Ожидаемое поведение — по таблицам выше; при отключённом LSP-сервере
подсветка/комментарии/фолдинг в HTML-блоке остаются (грамматика).
