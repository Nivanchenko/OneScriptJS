# Contract: инъекционная грамматика и контрибуция VS Code

## Файл грамматики `editors/osjs/osjs-embedded.tmLanguage.json`

Обязательные свойства:

| Свойство | Правило |
|---|---|
| `scopeName` | уникальный, например `osjs.embedded.injection` |
| `injectionSelector` | селектор, попадающий в `text.html.basic` (конкретный вариант определяется спайком: `L:text.html.basic` / `L:source.js`) |
| `patterns` | одна или несколько begin/end-правил: begin — открывающий `<script …>` с `type="text/osjs"` (имя тега/type case-insensitive, атрибуты до/после type, одинарные/двойные/без кавычек); end — `</script>`; внутри `contentName: "meta.embedded.block.osjs"` и `patterns: [{ include: "source.osjs" }]` |
| `repository` | без копий правил BSL; только include `source.osjs` |

Не должно быть: копий лексем BSL, привязки к `.html` как к нашему языку, изменения
`source.osjs`.

## Контрибуция в `extensions/vscode/package.json`

`contributes.grammars` содержит **вторую** запись (первая — базовая `source.osjs`):

```json
{
  "scopeName": "osjs.embedded.injection",
  "path": "./syntaxes/osjs-embedded.tmLanguage.json",
  "injectTo": ["text.html.basic"],
  "injectionSelector": "<из спайка>",
  "embeddedLanguages": { "meta.embedded.block.osjs": "osjs" }
}
```

`contributes.languages[0]` не меняется (`osjs`, `.osjs`, без `.os`); базовая грамматика
`source.osjs` не меняется.

## Сборка и `.vsix`

- `scripts/build-vscode-extension.mjs` копирует `editors/osjs/osjs-embedded.tmLanguage.json`
  → `syntaxes/osjs-embedded.tmLanguage.json` в staging.
- В `.vsix` присутствуют: базовая грамматика, инъекционная грамматика,
  `language-configuration.json`, сервер, JS расширения; без node_modules/исходников.

## Тесты (контракт)

1. `tests/vscode-embedded-grammar.test.ts` (вендоренная HTML-грамматика 1.146.0):
   - содержимое `script[type="text/osjs"]` получает scopes из `source.osjs`
     (например, `keyword.control.osjs`, `string.quoted.double.osjs`, директивы);
   - `script[type="text/javascript"]`/`module`/без type — НЕ получают BSL-scopes;
   - inline-блок, `TYPE` в другом регистре, несколько блоков, блок в HTML-комментарии,
     незакрытый блок — ожидаемое поведение зафиксировано;
   - HTML-разметка вне блоков не меняет базовые HTML-scopes.
2. `tests/vscode-extension.test.ts`: grammar-контрибуция с `injectTo`,
   `injectionSelector`, `embeddedLanguages`; `.osjs`-часть без изменений; сборщик
   копирует новую грамматику.

## Ручная приёмка (VS Code)

1. `pnpm build:vscode` → установить `.vsix` → Reload.
2. `tests/fixtures/lsp/embedded/manual-check.html`: внутри блока — подсветка как `.osjs`,
   `Ctrl+/` → `//`, `#Область` складывается, двойной клик по кириллице, Emmet не вставляет
   теги; вне блока — обычный HTML.
3. `text/javascript`-блок и HTML без блоков — без изменений.
4. Отключить/остановить LSP-сервер: подсветка/`Ctrl+/`/фолдинг блока остаются.
5. `.osjs` — без регрессий.
