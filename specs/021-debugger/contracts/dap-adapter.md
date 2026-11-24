# Contract: DAP-адаптер и расширение VS Code

**Feature**: `specs/021-debugger` | **Тип**: внешний контракт (Debug Adapter Protocol)

Адаптер — Node-процесс, общается с VS Code по DAP over stdio
(`Content-Length: <N>\r\n\r\n<json>`). Используется `@vscode/debugadapter` 1.68
(+ `@vscode/debugprotocol` 1.68 для типов).

## Тип отладчика и конфигурации

`extensions/vscode/package.json` → `contributes.debuggers`:

```json
{
  "type": "osjs",
  "label": "OneScriptJS (BSL)",
  "languages": ["osjs", "html"],
  "configurationAttributes": {
    "launch": { "required": ["program"], "properties": { /* program, cwd, stopOnEntry */ } },
    "attach": { "required": ["url"], "properties": { /* url, webRoot, port, stopOnEntry */ } }
  },
  "initialConfigurations": [
    { "type": "osjs", "request": "launch", "name": "OneScriptJS: запуск файла",
      "program": "${file}", "cwd": "${workspaceFolder}" },
    { "type": "osjs", "request": "attach", "name": "OneScriptJS: браузер",
      "url": "http://localhost:5173/examples/hello.html", "webRoot": "${workspaceFolder}" }
  ],
  "configurationSnippets": [ /* то же + подсказки */ ]
}
```

`DebugAdapterDescriptorFactory` создаёт
`vscode.DebugAdapterExecutable(process.execPath, [context.asAbsolutePath('out/debug-adapter.js')],
{ env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })` — тот же приём, что у LSP
(`extensions/vscode/src/extension.ts:50-60`).

## Подмножество DAP (MVP)

Запросы: `initialize`, `launch`, `attach`, `setBreakpoints`, `setExceptionBreakpoints`,
`configurationDone`, `threads`, `stackTrace`, `scopes`, `variables`, `evaluate`,
`continue`, `next`, `stepIn`, `stepOut`, `pause`, `disconnect`.

События: `initialized`, `stopped`, `continued`, `output`, `threaded` (опц.),
`terminated`, `exited`.

Capabilities в `initialize`:

| Capability | Значение | Почему |
|---|---|---|
| `supportsConfigurationDoneRequest` | `true` | брейкпоинты ставятся до старта |
| `supportsEvaluateForHovers` | `true` | evaluate в остановленном кадре |
| `supportsConditionalBreakpoints` | `true` (P2) | `condition` |
| `supportsLogPoints` | `true` (P2) | `logMessage` |
| `supportsTerminateRequest` | `false` | вне MVP |
| `supportsSetVariable` | `false` | вне MVP |
| `supportsFunctionBreakpoints` | `false` | вне MVP |
| `supportsRestartRequest` | `false` | вне MVP |
| `exceptionBreakpointFilters` | `uncaught` (default), `all` | фильтры исключений |

## Поведение

- `launch`: адаптер читает `program`, верифицирует брейкпоинты по исходнику, после
  `configurationDone` запускает движок **в процессе адаптера** (`run()`), `console.*`
  перехватывается в `output` (stdout не должен попадать в DAP-канал).
- `attach`: адаптер поднимает WebSocket-сервер на `port` (по умолчанию 9229), ждёт
  `hello` от page agent; `configurationDone` → `run` странице.
- `setBreakpoints`: заменяет набор для источника; ответ — `verified` по карте
  исполняемых строк (адаптер разбирает исходник AST/лексером движка).
- `stackTrace`: кадры изнутри наружу, `frameId` 0 — текущий; глубокая рекурсия не ломает.
- `scopes`: «Локальные» (frame.scope), «Модуль» (moduleScope); «ЭтотОбъект» — если
  перечисление появится (в MVP свойства недоступны).
- `variables`: ленивые дети через `variablesReference`; защита от циклов.
- `evaluate`: в остановленном кадре; ошибка — DAP `success:false` с текстом, сессия жива.
- `pause`: ставится на ближайшем хуке; при отладчике исполнение уступает хосту по кванту.
- `disconnect`: снять гейты, остановить WS-сервер, `terminated`; страница не висит.

## Ошибки и деградация

- Ошибка исполнения скрипта в `launch` — `output` + `exited(1)` + `terminated`;
  адаптер не падает.
- `attach`: нет подключения за таймаут — DAP error с понятным текстом («откройте
  страницу с onescript-debug.js»).
- Несколько вкладок: принимается первая сессия, вторая — DAP error (как в эталоне).
