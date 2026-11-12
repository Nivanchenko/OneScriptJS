# Research: TextMate-инъекция для `<script type="text/osjs">`

## D1. Механика инъекции

**Решение (гипотеза, проверяется спайком)**: отдельная грамматика с `injectionSelector`
по `text.html.basic`, begin-паттерном на открывающий `<script … type="text/osjs"…>` и
end-паттерном `</script>`; `contentName: "meta.embedded.block.osjs"`, внутри —
`include: "source.osjs"`.

**Почему**: переиспользует существующую грамматику без копирования правил; TextMate
позволяет инъекциям переопределять регионы базовой грамматики.

**Альтернативы**: своя HTML-грамматика/язык `osjs-html` — переопределяет `.html`,
конфликт с HTML-инструментами (запрещено 015/017); `embeddedLanguages` без грамматики —
нечего маппить; semantic tokens — уже есть, но не даёт комментариев/фолдинга/скобок.

## D2. `embeddedLanguages`

**Решение**: в контрибуции инъекционной грамматики указать
`embeddedLanguages: { "meta.embedded.block.osjs": "osjs" }`; VS Code использует нашу
`language-configuration` для региона (комментарии `//`, скобки/кавычки, word pattern,
фолдинг `#Область`/`#Если`). Дополнительно — `tokenTypes` при необходимости
(семантическая раскраска стандартных скоупов).

**Почему**: штатный механизм VS Code для встроенных языков; не требует собственных провайдеров.

## D3. Тестовая HTML-грамматика

**Решение**: вендорить `html.tmLanguage.json` из установленного VS Code 1.146.0
(`/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/html/syntaxes/`)
в `tests/fixtures/vscode/` + `NOTICE.md` (MIT, источник/версия). В тесте — Registry с
`getInjections`, загружающий html + injection + source.osjs.

**Почему**: воспроизводимость и офлайн; фиксированная версия.

**Альтернативы**: скачивать в тесте — сеть/нестабильно; читать из установленного VS Code —
тест зависит от машины.

## D4. Харнесс тестов

**Решение**: `vscode-textmate` (уже установлен) + `vscode-oniguruma` WASM; Registry:
`loadGrammar(scope)` для `text.html.basic`, `osjs.embedded.injection`, `source.osjs`;
`getInjections(scope)`. Токенизировать фикстуру построчно, собирать scopes на позициях;
проверять: содержимое `text/osjs`-блока содержит `source.osjs`-scopes (`keyword.control.osjs`
и т.п.), `text/javascript` — нет; inline/регистр/несколько/комментарий/незакрытый блок.

**Риск**: vscode-textmate может расходиться с реальным VS Code в обработке инъекций;
окончательная проверка — ручная в VS Code.

## D5. Манифест и сборка

**Решение**: `contributes.grammars` += запись инъекции (`scopeName`, `path`, `injectTo:
["text.html.basic"]`, `injectionSelector`, `embeddedLanguages`); базовые грамматики
`.osjs` без изменений. `scripts/build-vscode-extension.mjs` копирует инъекционную
грамматику в staging `syntaxes/`. Тест манифеста обновляется.

## D6. Fallback, если инъекция не переопределяет `source.js`

Варианты для обсуждения (не реализовывать без согласования): (а) `injectionSelector:
L:source.js` и шаблон open/close внутри script; (б) `tokenTypes`/`embeddedLanguages` без
полной инъекции (только комментарии/скобки — но без скоупов подсветки); (в) оставить
только semantic tokens (слой A) и отказаться от C. Главное — **не** заявлять `.html`
своим языком и **не** подменять HTML-грамматику глобально.

## D7. Лицензии

Инъекционная грамматика — наша, но включает `source.osjs` (MIT-производная `1c-syntax`,
NOTICE уже есть в `editors/osjs/`). Вендоренная HTML-грамматика — MIT (Microsoft), отдельный
`tests/fixtures/vscode/NOTICE.md` с источником/версией.
