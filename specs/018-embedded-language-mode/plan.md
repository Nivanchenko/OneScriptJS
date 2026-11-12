# Implementation Plan: Embedded language mode VS Code (инъекция `<script type="text/osjs">`)

**Branch**: `feat/editor_tools` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-embedded-language-mode/spec.md`

## Summary

Добавить в расширение VS Code TextMate-инъекцию для содержимого
`<script type="text/osjs">`: регион размечается как `meta.embedded.block.osjs` и
включает существующую грамматику `source.osjs`; `embeddedLanguages`-мэппинг на язык
`osjs` включает нашу `language-configuration` (комментарии `//`, скобки, word pattern,
фолдинг `#Область`/`#Если`). Вне региона — HTML без изменений; `.osjs` не меняется;
semantic tokens LSP накладываются поверх. Сначала **спайк** (критический риск:
переопределение HTML-грамматики VS Code), затем грамматика/манифест/сборка/тесты.

## Technical Context

**Language/Version**: TS 5.9 strict; сборка расширения — esbuild; тесты — Vitest +
`vscode-textmate` 9.3.2 / `vscode-oniguruma` 2.0.1 (уже установлены). VS Code 1.146.0.

**Primary Dependencies**: без новых. Вендоренная HTML-грамматика VS Code (MIT) — только
тестовая фикстура (из локальной установки VS Code / тега 1.146.0) + NOTICE.

**Storage**: нет.

**Testing**: `tests/vscode-embedded-grammar.test.ts` — Registry с HTML-грамматикой +
инъекцией + `source.osjs`: scopes для `text/osjs`-блока = BSL, для `text/javascript` —
нет, комментарии/регистр/инлайн/несколько блоков; обновление
`tests/vscode-extension.test.ts` (новая grammar-контрибуция). Ручная приёмка в VS Code.

**Target Platform**: VS Code >= 1.91 (проверено на 1.146); только VS Code-семейство.
Другие редакторы не затрагиваются.

**Project Type**: monorepo, подпроект `extensions/vscode/` + артефакт `editors/osjs/`.

**Performance Goals**: статическая грамматика — без влияния на скорость; инъекция не
должна заметно замедлять токенизацию HTML (проверка на разумном файле).

**Constraints**: `.os` не заявляется; `.html` не переопределяется; новые runtime-зависимости
нет; тестовая HTML-грамматика фиксированной версии с NOTICE; fallback при неудаче спайка —
остановиться и согласовать альтернативу (не подменять HTML-грамматику).

**Scale/Scope**: 1 инъекционная грамматика (~100–200 строк), 1 контрибуция манифеста,
копирование в `.vsix`, 1 тест-файл + фикстуры, правки сборщика/доков.

## Constitution Check

| Принцип | Проверка | Статус |
|---|---|---|
| I. Язык/`.osjs`/эталон | Правила `source.osjs` переиспользуются, язык не меняется | PASS |
| II. Браузер — основная среда | Изменяется только VS Code-обёртка; браузер/сервер не трогаем; приёмка «в браузере» неприменима (status) | PASS с фиксацией |
| III. Test-First | Спайк → грамматический тест (red) → грамматика/манифест; TDD | PASS |
| IV. Слои и минимальный код | Никаких новых зависимостей; одна инъекционная грамматика, включающая существующую; никаких копий правил | PASS |
| V. Доказанное «готово» | `pnpm typecheck && pnpm test && pnpm build && pnpm build:vscode`; scope-тест; ручная приёмка в VS Code фиксируется | PASS |

Нарушений/Complexity Tracking нет.

## Project Structure

```text
editors/osjs/
└── osjs-embedded.tmLanguage.json   # NEW: injection grammar (injectTo text.html.basic,
                                    #   begin/end script[type=text/osjs], contentName
                                    #   meta.embedded.block.osjs, include source.osjs)

extensions/vscode/package.json      # MOD: contributes.grammars += injection entry
                                    #   (injectTo, injectionSelector, embeddedLanguages)
scripts/build-vscode-extension.mjs  # MOD: копировать инъекционную грамматику в staging
tests/vscode-embedded-grammar.test.ts # NEW: scope-тесты на вендоренной HTML-грамматике
tests/vscode-extension.test.ts      # MOD: проверка новой grammar-контрибуции
tests/fixtures/vscode/
├── html.tmLanguage.json            # вендоренная HTML-грамматика VS Code 1.146.0 (MIT)
├── NOTICE.md                       # источник/лицензия/версия
└── embedded.html                   # фикстура: text/osjs + text/javascript + комментарий
```

## Implementation Strategy

### C0 — Спайк (критический риск, до кода)

- Взять `html.tmLanguage.json` из локальной установки VS Code 1.146.0 (или тега 1.146.0).
- Собрать прототип инъекционной грамматики и прогнать `vscode-textmate` Registry с
  `getInjections`: проверить варианты `injectionSelector` (`L:text.html.basic`,
  `L:source.js`), begin/end-паттерны (атрибуты/кавычки/регистр), `contentName`.
- Решение: работает ли переопределение `source.js`-региона; зафиксировать рабочий вариант.
- Если инъекция не переопределяет HTML-грамматику — **остановиться и сообщить** с
  вариантами (не менять HTML-грамматику/не заявлять `.html`).

### C1 — Грамматика и манифест

- `editors/osjs/osjs-embedded.tmLanguage.json`: `scopeName`, `injectionSelector`,
  `patterns: [{begin: <script type=text/osjs…>, end: </script>, contentName:
  "meta.embedded.block.osjs", patterns: [{include: "source.osjs"}]}]`.
- `extensions/vscode/package.json`: grammar-контрибуция с `injectTo`, `injectionSelector`,
  `embeddedLanguages: { "meta.embedded.block.osjs": "osjs" }`; базовые правила `.osjs` без
  изменений.
- `scripts/build-vscode-extension.mjs`: копировать грамматику в staging `syntaxes/`.

### C2 — Тесты

- `tests/vscode-embedded-grammar.test.ts`: scope-тесты (text/osjs → BSL; text/javascript →
  не BSL; inline/регистр/несколько/комментарий; unclosed).
- `tests/vscode-extension.test.ts`: манифест — инъекционная grammar-контрибуция,
  `embeddedLanguages`, сохранение `.osjs`; сборщик копирует новую грамматику.
- Прогнать `pnpm test`, `pnpm typecheck`, `pnpm build:vscode`; проверить состав `.vsix`
  (новая грамматика внутри).

### C3 — Документация и приёмка

- README (корневой + расширения): поведение внутри HTML-блока в VS Code, ограничения
  (только VS Code-семейство), отключённый сервер.
- `docs/status.md`, `docs/architecture.md`, spec 018 Status; спеки 015/017 — пометка,
  что слой C выполнен; quickstart 018 с ручной проверкой.
- Ручная приёмка в VS Code (подсветка/`Ctrl+/`/фолдинг/Emmet/word pattern; `.osjs` и HTML
  без регрессий) — фиксируется.

## Complexity Tracking

| Решение | Почему | Альтернатива отклонена |
|---|---|---|
| Вендоренная HTML-грамматика в тестах | Автотест инъекции без VS Code; фиксированная версия | Загружать в тесте из сети/из установленного VS Code — невоспроизводимо |
| Инъекция, а не своя HTML-грамматика | «Гость в HTML»; не переопределяем `.html` | Своя грамматика/язык `osjs-html` — конфликт с HTML-инструментами |

## Risks & Mitigations

- **Инъекция не переопределяет `source.js`** (главный риск): спайк до реализации;
  fallback-обсуждение (не подменять HTML-грамматику и не заявлять `.html`).
- **Версии HTML-грамматики**: тест на вендоренной 1.146.0; в VS Code — встроенная;
  расхождения ловятся ручной приёмкой.
- **embeddedLanguages UI**: у VS Code разные версии поддержки; конфигурация языка/скоуп
  фиксируются тестом манифеста + ручной проверкой.
- **Semantic tokens поверх**: возможная «двойная» раскраска — проверка вручную; при
  необходимости — `tokenTypes`/порядок.
- **Обрыв `</script>`**: инъекция завершается по HTML-правилам; диагностика — 015.
