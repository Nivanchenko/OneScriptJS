# OneScriptJS для VS Code

Тонкий клиент VS Code для OneScriptJS (`.osjs`): регистрирует язык и грамматику,
запускает встроенный LSP-сервер, по настройке обслуживает блоки
`<script type="text/osjs">` в HTML и подключает DAP-отладчик типа `osjs`. Собственных
провайдеров языка и форматирования нет — всё делает сервер; отладчик — тонкая фабрика
поверх `out/debug-adapter.js`.

## Установка из `.vsix`

```bash
pnpm build:vscode
code --install-extension dist/vscode/onescriptjs-*.vsix --force
# затем Reload Window
```

Marketplace не используется: пакет самодостаточен (сервер, грамматика и
конфигурация внутри), сеть не нужна, отдельный Node.js не требуется.

## Что работает

- Подсветка `.osjs` (TextMate-грамматика BSL), скобки/автозакрытие, folding областей.
- Диагностика в Problems, автодополнение (`Сообщить`/`Message`), hover, Outline,
  переход к определению, semantic tokens — через LSP-сервер.
- HTML-страницы с `<script type="text/osjs">`: внутри блока — embedded language mode
  (полная BSL-подсветка, `Ctrl+/` → `//`, фолдинг `#Область`/`#Если`, скобки/кавычки,
  кириллический word pattern) и LSP-функции (диагностика/подсказки/hover/`gd`).
  Вне блоков расширение молчит, язык документа остаётся `html`.

## Отладчик (DAP)

В расширение входит DAP-адаптер (`out/debug-adapter.js`) и тип отладчика `osjs`.
Отладка работает, если пакет собран командой `pnpm build:vscode` (адаптер кладётся в
`.vsix`); отдельный Node.js не нужен — адаптер запускается на Node-рантайме VS Code.

**Node launch.** `.vscode/launch.json` проверяемого проекта:

```json
{
  "version": "0.2.0",
  "configurations": [
    { "type": "osjs", "request": "launch", "name": "OneScriptJS: launch",
      "program": "${file}", "cwd": "${workspaceFolder}", "stopOnEntry": false }
  ]
}
```

F5 на открытом `.osjs`: брейкпоинты по строкам, `F10`/`F11`/`Shift+F11`, BSL-стек
(`Метод (файл:строка)`), локальные и модульные переменные, Debug Console для
`Сообщить()`/`console.log`, watch/hover через `evaluate`.

**Браузер attach.** Сначала соберите страницу и клиент, затем поднимите dev-сервер:

```bash
pnpm build:browser && pnpm build:debug-client
OSJS_DEBUG=1 pnpm dev        # http://localhost:5173/examples/hello.html
```

```json
{ "type": "osjs", "request": "attach", "name": "OneScriptJS: browser",
  "url": "http://localhost:5173/examples/hello.html",
  "webRoot": "${workspaceFolder}" }
```

Запустите `attach`, затем откройте/перезагрузите страницу: page-agent подключается к
адаптеру (порт `9229`, `OSJS_DEBUG_PORT` переопределяет) и ждёт `configurationDone`,
поэтому блоки не исполняются до готовности сессии. Брейкпоинты работают во внешних
`.osjs` и в inline-блоках `<script type="text/osjs">` (остановка на строке HTML).
Подробности и приёмка — [`specs/021-debugger/quickstart.md`](../../specs/021-debugger/quickstart.md).

Ограничения отладчика: движок исполняется в процессе адаптера (`process.exit` в скрипте
обрывает сессию); `spawnSync` HTTP-транспорта блокирует event loop; HTTPS-страница с
`ws://127.0.0.1` — mixed content; одна сессия на вкладку; Playwright-e2e нет; нет
`setVariable`, restart и step-back.

## Настройки

| Настройка | По умолчанию | Значение |
|---|---|---|
| `onescriptjs.embeddedInHtml` | `true` | Обслуживать HTML-документы с блоками `text/osjs`. |
| `onescriptjs.trace` | `off` | Трассировка LSP-клиента: `off`, `messages`, `verbose`. |

Изменение настройки перезапускает LSP-клиент (VS Code перезапускать не нужно).

## Команды

- `OneScriptJS: Restart Language Server` — остановить и снова запустить сервер.
- `OneScriptJS: Show Output` — открыть канал `OneScriptJS` в Output.

## Ограничения

- `.os` (ванильный C#-OneScript) расширение не заявляет и не обслуживает; с чужим
  расширением для `.os` конфликта нет.
- `.html` не помечается языком `osjs`: сервер подключается к HTML только как
  дополнительный документ-селектор.
- Embedded language mode — только для VS Code-семейства (TextMate-инъекция); в других
  редакторах подсветка блоков — semantic tokens сервера. Многострочный `type`-атрибут
  в открывающем теге не поддерживается (TextMate построчный); фолдинг `#Область` по
  маркерам зависит от версии VS Code и проверяется вручную.
- Телеметрии и сетевых запросов нет. Публикация в Marketplace вне объёма.
- Если сервер не стартовал: уведомление, канал `OneScriptJS` в Output и команда
  перезапуска; помогает и переустановка `.vsix`.

## Удаление

```bash
code --uninstall-extension onescriptjs.onescriptjs
```

Авторство грамматики и лицензия — в `NOTICE.md` (производная от
[1c-syntax/vsc-language-1c-bsl](https://github.com/1c-syntax/vsc-language-1c-bsl)).
