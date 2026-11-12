# Research: тонкий клиент VS Code

## D1. Транспорт и запуск сервера

**Решение**: `vscode-languageclient` + stdio; сервер — `server/server.mjs` внутри `.vsix`,
запуск через `process.execPath` с `ELECTRON_RUN_AS_NODE=1` (Node-рантайм VS Code).
Fallback: если запуск не удался — сообщение в Output с подсказкой; в разработке допустим
`node` из PATH.

**Почему**: не требует установленного пользователем Node.js и второго рантайма; сервер уже
stdio; это стандартный приём для расширений, поставляющих LSP-сервер.

**Альтернативы**: IPC (`TransportKind.ipc`) — потребует менять entry сервера; требовать
системный `node` — лишняя установка.

## D2. Бандлинг расширения

**Решение**: `esbuild` → один CJS `out/extension.js`, `external: ['vscode']`, target node20;
runtime-зависимости (languageclient) внутри бандла, `node_modules` в `.vsix` нет.

**Почему**: `.vsix` самодостаточен, размер контролируем, pnpm-симлинки не упаковываются.

**Альтернативы**: tsc + node_modules в пакете (pnpm/монорепо — хрупко); Vite (можно, но для
одного CJS-файла esbuild проще; Vite уже есть, но настройка lib/CJS + external не проще).

## D3. Манифест и грамматика

**Решение**: `contributes.languages` (`osjs`, `['.osjs']`), `contributes.grammars`
(`source.osjs` → `./syntaxes/osjs.tmLanguage.json`), `language-configuration`, команды,
`configuration` с `embeddedInHtml` (default `true`) и `trace`. Грамматика/конфигурация
копируются из `editors/osjs/` в staging при сборке — единый источник, без дублей.

**Почему**: `.os` не заявляется; пути в манифесте — относительно корня расширения (staging
минимальный и ровный).

## D4. Lifecycle и настройки

**Решение**: активация `onLanguage:osjs`/`onLanguage:html`/команды; один `LanguageClient`;
при изменении `onescriptjs.embeddedInHtml` — stop/start клиента (без перезапуска VS Code);
OutputChannel + trace; команды restart/showOutput; `deactivate` останавливает клиент.

## D5. Упаковка `.vsix`

**Решение**: staging `dist/vscode/extension/` (package.json, out/extension.js,
server/server.mjs, syntaxes/osjs.tmLanguage.json, language-configuration.json, README,
NOTICE) → `@vscode/vsce package --no-dependencies --out dist/vscode/<name>-<version>.vsix`.
Версия — из `extensions/vscode/package.json`; publisher/repository/README заданы, чтобы
vsce не спрашивал интерактивно.

## D6. Тестирование

**Решение**: Vitest-тест манифеста/путей/настроек (`tests/vscode-extension.test.ts`) и
проверка содержимого `.vsix` в verification-скрипте (unzip/проверка списка). Полная
интеграция с `@vscode/test-electron` не вводится в v1 (лишняя dev-зависимость, нужен GUI);
ручная приёмка в VS Code фиксируется в status/quickstart.

## D7. Зависимости и версии

- `vscode-languageclient` — последняя стабильная, совместимая с VS Code >= 1.90; ставится
  как devDependency и бандлится.
- `@types/vscode` — версия под `engines.vscode` (не выше).
- `esbuild` — бандлер; postinstall разрешён в `pnpm-workspace.yaml`.
- `@vscode/vsce` — упаковщик `.vsix`.
Все — dev; runtime-зависимостей у расширения нет.

## D8. Версия VS Code

`engines.vscode: ^1.90.0`; локально проверено на 1.146.0. Более новые API не используются.

## D9. Границы слоя B

- Не реализуем грамматическую инъекцию/embedded language mode (слой C).
- Не публикуем в Marketplace; `.vsix` локально.
- `.os`/`.html` не заявляем; HTML — только дополнительный documentSelector по настройке.

## D10. Риски и проверки при реализации

- Спайк запуска сервера из Extension Host (ELECTRON_RUN_AS_NODE) — лог запуска.
- vsce в монорепо: вызывать из staging с `--no-dependencies`; проверять содержимое.
- Настройка HTML по умолчанию `true` — подтвердить отсутствие конфликта с HTML-расширением
  (диагностики в разных каналах, `source: 'osjs'`).
