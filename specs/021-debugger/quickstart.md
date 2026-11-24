# Quickstart: проверка отладчика BSL (DAP)

**Feature**: `specs/021-debugger` | **Контракты**: [dap-adapter.md](./contracts/dap-adapter.md),
[page-agent-protocol.md](./contracts/page-agent-protocol.md)

## Предварительно

```bash
pnpm install
pnpm typecheck
pnpm test                 # базовая линия зелёная (91 файл / 944 теста)
pnpm build                # browser + node + cli + lsp
pnpm build:debug-client   # dist/onescript-debug.js (page agent)
```

## 1. Node launch без VS Code (DAP по stdio)

Собрать адаптер и прогнать фикстуру:

```bash
pnpm build:debug-adapter   # dist/debug/adapter.cjs
node tests/fixtures/debug/run-dap-smoke.mjs
```

Ожидаемо: в stdout только DAP-сообщения (`Content-Length: …`); последовательность
`initialize` → `initialized` → `setBreakpoints` → `configurationDone` →
`stopped(breakpoint)` → `stackTrace` (кадры BSL) → `variables` → `continue` →
`output` («Сообщить») → `exited`/`terminated`.

Автотест того же сценария (без VS Code): `pnpm vitest run tests/dap-session.test.ts`.

## 2. Node launch из VS Code

```bash
pnpm build:vscode
code --install-extension dist/vscode/onescriptjs-*.vsix
```

`launch.json` в проверяемом проекте:

```json
{
  "version": "0.2.0",
  "configurations": [
    { "type": "osjs", "request": "launch", "name": "OneScriptJS: launch",
      "program": "${file}", "cwd": "${workspaceFolder}", "stopOnEntry": false }
  ]
}
```

Открыть `tests/fixtures/debug/nested.osjs`, поставить брейкпоинт на строке вызова,
F5. Ожидаемо: остановка на строке, в «Стеке вызовов» — BSL-кадры (`Метод (файл:строка)`),
в «Переменных» — «Локальные» и «Модуль», Debug Console показывает `Сообщить()`.
F10/F11/Shift+F11/продолжить работают; hover/watch вычисляют BSL-выражение.

## 3. Браузер attach

```bash
pnpm build:browser && pnpm build:debug-client
OSJS_DEBUG=1 pnpm dev
```

Открыть `http://localhost:5173/examples/hello.html` (dev-плагин вставил
`onescript-debug.js`). `launch.json`:

```json
{
  "type": "osjs", "request": "attach", "name": "OneScriptJS: browser",
  "url": "http://localhost:5173/examples/hello.html", "webRoot": "${workspaceFolder}"
}
```

Запустить attach **до** перезагрузки страницы. Ожидаемо: страница не висит; брейкпоинты
во внешнем `.osjs` и в inline-блоке срабатывают; «Сообщить»/`console.log` идут в Debug
Console; DOM-события (`data-os-click`) во время паузы не выполняются, после continue —
выполняются. Брейкпоинт в HTML-строке внутри `<script type="text/osjs">` останавливает
на этой строке HTML.

## 4. Условные брейкпоинты, logpoints, исключения (P2)

- Условный брейкпоинт (`condition: "А > 2"`) останавливается только при истине.
- Logpoint (`logMessage: "А={А}"`) печатает в Debug Console и не останавливает.
- Фильтр «Необработанные исключения» останавливает на `1/0` вне `Попытка`;
  внутри `Попытка` — нет (пока ошибка не выйдет наружу).

## 5. Проверка отсутствия регрессий (FR-013)

```bash
pnpm typecheck && pnpm test
pnpm check:docs
pnpm typecheck:vscode
pnpm build:vscode
unzip -l dist/vscode/onescriptjs-*.vsix | grep debug-adapter   # entry есть в .vsix
```

Ожидаемо: все команды с кодом 0; `dist/onescript.js` не содержит отладочного клиента
(проверяется тестом `tests/browser-debug-agent.test.ts`); синхронный скрипт без
отладчика по-прежнему исполняется синхронно (`tests/async-runtime.test.ts` зелёный).

## Ручная проверка «страница не висит»

На паузе в долгом цикле страница должна обрабатывать события (клики, таймеры).
Если страница замирает — отладочный режим не включил кооперативные уступки хосту
(TimeSlicer), см. `plan.md`, риск R-3.
