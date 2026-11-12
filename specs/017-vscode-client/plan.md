# Implementation Plan: Тонкий клиент VS Code (`.osjs` и встроенные блоки HTML)

**Branch**: `feat/editor_tools` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-vscode-client/spec.md`

## Summary

Собрать тонкое расширение VS Code: регистрирует язык `osjs` только для `*.osjs`, поставляет
грамматику/`language-configuration` из `editors/osjs/`, запускает готовый LSP-сервер
(`dist/lsp/server.mjs`) на Node-рантайме VS Code по stdio, по настройке подключает его к
HTML-документам (embedded-режим 015/слой A), даёт команды перезапуска/лога. Собрать
самодостаточный `.vsix` одной командой `pnpm build:vscode` (сервер+грамматика+клиент внутри,
без node_modules), проверить пакет автоматически и вручную в чистом VS Code. Слой C
(грамматическая инъекция/embedded language mode) — вне объёма.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node 24 (для сборки), рантайм — VS Code
Extension Host (Node внутри Electron). VS Code установлен: 1.146.0 (arm64); для манифеста
`engines.vscode` — `^1.90.0` (проверено на 1.146).

**Primary Dependencies**:
- runtime (бандлится в extension.js): `vscode-languageclient` (LSP-клиент), API `vscode`
  (внешний модуль).
- dev: `@types/vscode`, `esbuild` (бандл расширения в один CJS-файл),
  `@vscode/vsce` (упаковка `.vsix`). Все — devDependencies корня, обоснованы:
  официальный клиент/упаковщик и минимальный бандлер; собственных провайдеров не пишем.
- сервер: существующий `dist/lsp/server.mjs` (сборка `pnpm build:lsp`).

**Storage**: нет; настройки VS Code хранит сам.

**Testing**: Vitest: `tests/vscode-extension.test.ts` — манифест (contributes/commands/
settings/engine, нет `.os`), пути артефактов, сборщик копирует сервер/грамматику; сборка
`.vsix` и проверка содержимого — в verification-скрипте/вручную. Полноценный
`@vscode/test-electron` в v1 не используется (обоснование: тонкий клиент, ручная приёмка
в чистом VS Code + автоматическая валидация пакета).

**Target Platform**: VS Code >= 1.90 (локально проверено на 1.146), macOS/Linux/Windows;
локальная установка `.vsix`; Marketplace вне объёма.

**Project Type**: single repo, новое подпроект-расширение `extensions/vscode/`.

**Performance Goals**: активация ленивая (по языку/настройке); сервер получает только
открытые документы; отсутствие фоновой индексации; запуск сервера не блокирует UI.

**Constraints**: `.os` не заявлять; `.html` не заявлять (только дополнительный
documentSelector клиента и настройка); никаких сетевых запросов/телеметрии; `.vsix`
самодостаточен, Node.js пользователю не нужен; настройка `embeddedInHtml` по умолчанию
`true`; `@vscode/test-electron` не вводим; новых runtime-зависимостей вне бандла нет.

**Scale/Scope**: один-два файла расширения (`extension.ts`), манифест, скрипт сборки
`.vsix`, тест манифеста, README/спека; ~5–8 файлов.

## Constitution Check

| Принцип | Проверка | Статус |
|---|---|---|
| I. Язык/`.osjs`/эталон | Ничего в языке/формате/эталоне не меняется | PASS |
| II. Браузер — основная среда | Расширение — тонкий клиент редактора; браузерный бандл/движок не меняются; приёмка «в браузере» неприменима, фиксируется в status | PASS с фиксацией |
| III. Test-First | Тест манифеста/путей — до реализации; ручная приёмка отдельно | PASS |
| IV. Слои и минимальный код | Новый подпроект `extensions/vscode` вне `src/`; ядро не трогаем; вместо собственных провайдеров — официальный LSP-клиент | PASS |
| V. Доказанное «готово» | `pnpm typecheck && pnpm test && pnpm build` + `pnpm build:vscode`; состав `.vsix` проверяется; ручная приёмка в VS Code фиксируется | PASS |

Нарушений нет. Новые зависимости — dev (типы VS Code, esbuild, vsce), обоснованы; runtime
бандлится.

## Project Structure

```text
extensions/vscode/
├── package.json               # манифест: language osjs, grammars, configuration, commands,
│                              #   settings (embeddedInHtml, trace), main, engines
├── src/extension.ts           # activate/deactivate: LSP-клиент, настройки, команды, логи
├── README.md                  # установка .vsix, настройки, ограничения
└── .vscodeignore              # (если нужно) для сборки из staging

scripts/build-vscode-extension.mjs  # build:lsp → esbuild extension → staging →
                                    #   vsce package → dist/vscode/<name>-<version>.vsix
tests/vscode-extension.test.ts      # манифест/пути/настройки/команды; нет .os

dist/vscode/                        # staging + .vsix (gitignored)
```

**Structure Decision**: расширение — отдельный подпроект, не часть `src/`; сервер и
грамматика копируются в staging при сборке (никаких дубликатов исходников в репозитории).

## Implementation Strategy

### Фаза B1 — Манифест и язык (US1, US4)

- `extensions/vscode/package.json`: `name`, `displayName`, `publisher` (локальный),
  `version`, `engines.vscode`, `main`, `activationEvents` (`onLanguage:osjs`,
  `onLanguage:html`, команды), `contributes.languages` (`id: osjs`, extensions `['.osjs']`),
  `grammars` (scopeName `source.osjs`, path `./syntaxes/osjs.tmLanguage.json`),
  `language-configuration` (`./language-configuration.json`), `commands`,
  `configuration` (`onescriptjs.embeddedInHtml` default true, `onescriptjs.trace`).
- Тест манифеста: id/расширения (без `.os`), пути грамматики/конфигурации, команды,
  настройки, engine.

### Фаза B2 — Клиент и lifecycle (US1, US2, US3)

- `extensions/vscode/src/extension.ts`: создание `LanguageClient` с `serverOptions` —
  запуск `server/server.mjs` через `process.execPath` + env `ELECTRON_RUN_AS_NODE=1`
  (stdio), `documentSelector`: `osjs` всегда, `html` при включённой настройке.
- Команды: перезапуск клиента, показ Output; OutputChannel `OneScriptJS`; ошибки старта —
  одно уведомление + лог; изменение `embeddedInHtml` → перезапуск клиента; `deactivate` —
  корректная остановка.
- Активация ленивая; если нет `.osjs` и HTML-режим выключен — сервер не стартует.

### Фаза B3 — Сборка `.vsix` и валидация (US4)

- `scripts/build-vscode-extension.mjs`: `pnpm build:lsp` → esbuild `extension.ts` (bundle,
  CJS, external `vscode`) → staging в `dist/vscode/extension/` (+ копия `server.mjs`,
  `editors/osjs/osjs.tmLanguage.json`, `language-configuration.json`, README, NOTICE) →
  `vsce package --no-dependencies` → `dist/vscode/<name>-<version>.vsix`.
- Проверка: `.vsix` существует, содержит сервер/грамматику/JS, без node_modules/исходников;
  версия совпадает.
- Тест `tests/vscode-extension.test.ts`: манифест + сборщик копирует нужные файлы.

### Фаза B4 — Документация и приёмка

- README: установка `.vsix` (`code --install-extension`), настройки, ограничения (HTML —
  через embedded-режим, без грамматической инъекции; `.os` не заявляется), офлайн.
- `docs/status.md` (017 → реализовано, известные ограничения), `docs/architecture.md`
  (слой расширения), `specs/017.../quickstart.md`.
- Ручная приёмка: `pnpm build:vscode` → установка `.vsix` → `examples/editor.osjs` /
  HTML-фикстура 015 / чистый VS Code / офлайн; результат фиксируется.

### Слой C (не в этом объёме)

- Инъекционная TextMate-грамматика `<script type="text/osjs">` + `embeddedLanguages` →
  отдельная работа/спека (возможно, в `extensions/vscode`).

## Complexity Tracking

| Решение | Почему | Альтернатива отклонена |
|---|---|---|
| Новые devDependencies: `@types/vscode`, `esbuild`, `@vscode/vsce` | Официальные типы/упаковщик и минимальный бандл; сам `.vsix` без node_modules | Вендорить node_modules в `.vsix`/писать упаковщик — дороже и хрупче |
| Запуск сервера через `process.execPath` + `ELECTRON_RUN_AS_NODE` | Не требует Node.js у пользователя; сервер уже stdio | Требовать установленный Node / переписывать entry под IPC — лишняя зависимость/риск |

## Risks & Mitigations

- **Запуск сервера из Extension Host**: `process.execPath` — Electron; `ELECTRON_RUN_AS_NODE`
  проверен практикой VS Code-расширений, но в окружении без GUI-проверки — спайк при
  реализации (лог запуска, fallback на `node` из PATH с предупреждением).
- **Упаковка vsce**: publisher/repository/README обязательны; staging минимальный;
  проверка содержимого после сборки.
- **Грамматика/конфигурация**: копируются из `editors/osjs/`; ошибки путей ловит тест/сборка.
- **Два сервера на HTML**: documentSelector включается настройкой; вне блоков сервер
  молчит; HTML-инструменты не перехватываются.
- **Ручная приёмка**: в среде нет GUI VS Code; финальная проверка — владельцем через
  `code --install-extension`, автоматическая часть — манифест/пакет/тесты.
