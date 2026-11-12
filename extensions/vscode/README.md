# OneScriptJS для VS Code

Тонкий клиент VS Code для OneScriptJS (`.osjs`): регистрирует язык и грамматику,
запускает встроенный LSP-сервер и по настройке обслуживает блоки
`<script type="text/osjs">` в HTML. Собственных провайдеров, форматирования и отладки
в расширении нет — всё делает сервер.

## Установка из `.vsix`

```bash
pnpm build:vscode
code --install-extension dist/vscode/onescriptjs-0.1.0.vsix --force
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
