# Contract: расширение VS Code (слой B)

## Манифест (`extensions/vscode/package.json`)

Обязательные поля:

| Поле | Значение/правило |
|---|---|
| `name` | `onescriptjs` (внутреннее имя расширения) |
| `displayName` | «OneScriptJS» |
| `publisher` | задан (локальная установка не требует Marketplace) |
| `version` | версия расширения (`.vsix` получает её) |
| `engines.vscode` | `^1.90.0` (проверено на 1.146) |
| `main` | `./out/extension.js` |
| `activationEvents` | `onLanguage:osjs`, `onLanguage:html`, команды перезапуска/лога |
| `contributes.languages[0]` | `id: "osjs"`, `extensions: [".osjs"]`, `configuration: "./language-configuration.json"`; **никаких `.os`** |
| `contributes.grammars[0]` | `language: "osjs"`, `scopeName: "source.osjs"`, `path: "./syntaxes/osjs.tmLanguage.json"` |
| `contributes.commands` | `onescriptjs.restartServer`, `onescriptjs.showOutput` |
| `contributes.configuration` | `onescriptjs.embeddedInHtml` (boolean, default **true**), `onescriptjs.trace` (off/messages/verbose, default off) |
| `repository` / `LICENSE`-совместимое | заданы, чтобы `vsce` не спрашивал интерактивно |

## Содержимое `.vsix`

Обязательно внутри пакета:
- `out/extension.js` (бандл расширения, CJS, `vscode` external),
- `server/server.mjs` (собранный LSP-сервер 014/015),
- `syntaxes/osjs.tmLanguage.json`, `language-configuration.json` (из `editors/osjs/`),
- `package.json`, `README.md`, `NOTICE` (авторство грамматики).

Запрещено: `node_modules/`, `src/`, `dist/` исходники, тестовые фикстуры, `.map` (если не
нужен), любые секреты.

## Запуск сервера

- stdio-транспорт `vscode-languageclient`.
- `serverOptions`: `process.execPath` + `--`? нет: `process.execPath <server/server.mjs>`,
  env `ELECTRON_RUN_AS_NODE=1`; fallback — `node` из PATH с предупреждением в Output.
- `documentSelector`: `[{ scheme: 'file', language: 'osjs' }, { scheme: 'untitled', language: 'osjs' }]`
  плюс `{ scheme: 'file'|'untitled', language: 'html' }` только когда
  `onescriptjs.embeddedInHtml === true`.
- `.os` не включается никогда.

## Lifecycle/настройки

- Изменение `onescriptjs.embeddedInHtml` или `onescriptjs.trace` → перезапуск клиента
  (без перезапуска VS Code).
- `OneScriptJS: Restart Language Server` — stop/start; `OneScriptJS: Show Output` — открыть
  канал.
- Ошибка старта: одно уведомление с причиной, запись в Output; VS Code не падает; цикл
  авто-перезапусков ограничен (не более 1–2 попыток), дальше — только команда.
- `deactivate` — остановить клиент.

## Проверяемость

1. `tests/vscode-extension.test.ts`: манифест (поля выше), отсутствие `.os` в
   `contributes.languages[].extensions`, пути грамматики/конфигурации, дефолты настроек,
   команды, наличие сборщика и копирование им `server.mjs` + файлов `editors/osjs`.
2. `pnpm build:vscode`: `.vsix` создан, версия из манифеста; список файлов внутри
   проверяется (unzip) на сервер/грамматику/JS и отсутствие node_modules.
3. Ручная приёмка в чистом VS Code (владелец): установка `.vsix`, `.osjs`, HTML-фикстура,
   выключение настройки, перезапуск сервера, офлайн.
