---
description: "Task list for feature 018 — embedded language mode (TextMate injection)"
---

# Tasks: Embedded language mode VS Code (инъекция `<script type="text/osjs">`)

**Input**: `/specs/018-embedded-language-mode/` (spec, plan, research, contracts, quickstart)
**Prerequisites**: 014 (грамматика `source.osjs`/`language-configuration`), 015 слой A, 017 (клиент VS Code).
**Tests**: обязательны (конституция III).

## Phase 1: Setup

- [ ] T001 Baseline: `pnpm typecheck && pnpm test` зелёные до изменений
- [X] T002 Вендорить HTML-грамматику VS Code 1.146.0 в `tests/fixtures/vscode/`
  (`html.tmLanguage.json` + `NOTICE.md`: источник/версия/MIT) — из локальной установки
  `/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/html/syntaxes/`

## Phase 2: Foundational — спайк (критический риск, блокирует всё)

- [X] T003 Спайк: прототип инъекционной грамматики + `vscode-textmate` Registry с
  HTML-грамматикой (`getInjections`); проверить варианты `injectionSelector`
  (`L:text.html.basic`, `L:source.js`), begin/end-паттерны (type/атрибуты/кавычки/
  регистр, inline, несколько, комментарий, незакрытый), `contentName`. Зафиксировать
  рабочий вариант. **Если инъекция не переопределяет `source.js` — остановиться и
  сообщить варианты (не подменять HTML-грамматику/не заявлять `.html`).**

**Checkpoint**: известен рабочий селектор/шаблон — дальше реализация.

## Phase 3: US1/US2 — грамматика, манифест, сборка

- [X] T004 [P] [US1] `tests/vscode-embedded-grammar.test.ts` (red): scopes `text/osjs` →
  BSL; `text/javascript`/`module`/без type → не BSL; inline/регистр/несколько/комментарий/
  незакрытый; HTML вне блоков не меняется
- [X] T005 [US1] `editors/osjs/osjs-embedded.tmLanguage.json` — инъекционная грамматика по
  контракту (include `source.osjs`, без копий правил)
- [X] T006 [US1] `extensions/vscode/package.json`: grammar-контрибуция `injectTo`,
  `injectionSelector`, `embeddedLanguages { "meta.embedded.block.osjs": "osjs" }`;
  базовые `.osjs`-правила не меняются
- [X] T007 [US2] `scripts/build-vscode-extension.mjs`: копировать инъекционную грамматику
  в staging `syntaxes/`
- [X] T008 [US2] `tests/vscode-extension.test.ts`: новая grammar-контрибуция + копирование
  грамматики сборщиком; `.osjs`/`.os`-инварианты сохраняются
- [X] T009 Довести до зелёного: `pnpm vitest run tests/vscode-embedded-grammar.test.ts
  tests/vscode-extension.test.ts`, `pnpm typecheck`, `pnpm typecheck:vscode`

## Phase 4: US3 — упаковка и проверка

- [X] T010 `pnpm build:vscode`; проверить `.vsix`: внутри `syntaxes/osjs-embedded.tmLanguage.json`
  и базовая грамматика/сервер/JS; без node_modules/исходников
- [X] T011 Полный прогон: `pnpm test`, `pnpm build`; состав `.vsix`; `grep` — `.os` не
  заявлен, `.html` не переопределён

## Phase 5: Polish (Lead)

- [X] T012 README (корневой + extension): поведение блока в VS Code, ограничения (только
  VS Code-семейство, semantic tokens fallback), отключённый сервер
- [X] T013 `docs/status.md`, `docs/architecture.md`, spec 018 Status; спеки 015/017 —
  пометка, что слой C выполнен
- [ ] T014 Ручная приёмка в VS Code (quickstart 018): подсветка/`Ctrl+/`/фолдинг/Emmet/
  word pattern; `.osjs` и HTML без регрессий; при отключённом сервере грамматика работает.
  Автоматическая часть (scopes/тесты/сборка) выполнена; UI-часть — за владельцем
- [ ] T015 Коммит и push

## Dependencies & Execution Order

T001 → T002 → T003 (спайк) → T004/T005/T006/T007 → T008/T009 → T010/T011 → T012–T015.
T005 и T006 — разные файлы, допустимо параллельно; T007 после T005; T010 после T006/T007.

## Deferred

- Не требуется; слой C завершает редакторную серию (014 → 015 → 016 → 017 → 018).
- Marketplace/подпись `.vsix`, другие редакторы — вне объёма.
