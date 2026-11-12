# NOTICE — вендоренная HTML-грамматика VS Code (тестовая фикстура)

## Что это

`html.tmLanguage.json` — копия грамматики `text.html.basic` из установленного
VS Code, используемая **только в тестах** (`tests/vscode-embedded-grammar.test.ts`)
как реальная база для проверки TextMate-инъекции `<script type="text/osjs">`.
В `.vsix` и рантайм расширения файл не попадает (в VS Code используется
встроенная грамматика).

## Источник и версия

- **Приложение**: Visual Studio Code **1.146.0** (дистрибутив macOS,
  `/Applications/Visual Studio Code.app`).
- **Расширение**: `html` версии `10.0.0` (встроенное, `publisher: vscode`).
- **Файл-источник**:
  `/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/html/syntaxes/html.tmLanguage.json`
- **Размер / SHA-256**:
  `60401` байт / `a042290a8410d18c90577111b755caa272b296a432a3b66cf6c6770abb74af7a`
- **Upstream-репозиторий**: <https://github.com/microsoft/vscode>
  (встроенное расширение `extensions/html`).
- **Первоисточник грамматики**: конвертирована из
  <https://github.com/textmate/html.tmbundle> (коммит
  `0c3d5ee54de3a993f747f54186b73a4d2d3c44a2` указан в поле `version` самого файла).

## Лицензия

VS Code и его встроенные расширения распространяются по лицензии MIT.
Copyright (c) Microsoft Corporation. Оригинальная грамматика HTML — MIT,
Copyright (c) TextMate project contributors.

```text
The MIT License (MIT)
=====================

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the “Software”), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
```
