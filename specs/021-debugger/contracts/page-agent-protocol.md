# Contract: протокол page-agent ↔ DAP-адаптер

**Feature**: `specs/021-debugger` | **Тип**: внутренний транспорт (WebSocket, JSON)

Это **не** DAP: DAP остаётся между VS Code и адаптером. Здесь — собственный минимальный
протокол между страницей (page-agent) и адаптером. Соединение инициирует страница
(браузерный клиент нативный), адаптер слушает `127.0.0.1:<port>`.

## Рукопожатие

1. Агент читает порт (`window.__OSJS_DEBUG_PORT__` из dev-инъекции или `?osjs-debug=PORT`),
   подключается с retry/backoff, шлёт `hello`.
2. Адаптер проверяет Origin/token, принимает одну сессию (вторая — `rejected` + close
   1013), строит маппинг источников, отвечает `helloAck`; VS Code получает DAP
   `initialized`.
3. VS Code `setBreakpoints` → адаптер маппит пути/строки → `breakpoints`.
4. VS Code `configurationDone` → `configured` → агент резолвит гейт → движок стартует.
5. Остановка: контроллер отдаёт `yield`-гейт → агент шлёт `stopped`.
6. `resume`/`pause`/`evaluate` — адаптер → агент; `evaluate` — запрос-ответ по `seq`.
7. `disconnect`/`beforeunload` → `terminated`; контроллер снимает все гейты.

## Сообщения

### page → adapter

| `type` | Поля | Назначение |
|---|---|---|
| `hello` | `v: 1, token?, pageUrl, baseURI, title?, blocks: BlockInfo[]` | манифест источников; шлётся один раз |
| `source` | `id, text, kind` | уточнение/обновление текста источника при старте блока |
| `stopped` | `threadId, reason, frames: FrameInfo[], allThreadsStopped?: true, description?` | остановка |
| `continued` | `threadId, allThreadsContinued?: true` | продолжение |
| `output` | `category: 'stdout'\|'stderr'\|'console', text` | вывод |
| `threads` | `threads: ThreadInfo[]` | список потоков |
| `evaluateResult` | `seq, ok, result?: VariableInfo, error?: string` | ответ на `evaluate` |
| `scopesResult` | `seq, ok, scopes?: ScopeInfo[], error?: string` | ответ на `scopes` (DAP scopes в attach) |
| `variablesResult` | `seq, ok, variables?: VariableInfo[], error?: string` | ответ на `variables` (DAP variables в attach) |
| `terminated` | `reason?` | исполнение завершено/страница закрыта |
| `error` | `message` | протокольная/внутренняя ошибка (не ломает сессию) |

`BlockInfo` = `{ index: number, id?: string, src?: string, text: string }` — блоки в
DOM-порядке (1-based `index`, как в `sourceId` `${baseURI}#${id||block${index}}`).
`FrameInfo` = `{ id: number, method: string, sourceId: string, line: number }`.
`ThreadInfo` = `{ id: number, name: string }`.
`VariableInfo` = `{ name, value, type, variablesReference, namedVariables?, indexedVariables? }`.
`ScopeInfo` = `{ name, variablesReference, expensive? }`.

### adapter → page

| `type` | Поля | Назначение |
|---|---|---|
| `helloAck` | `sessionId, capabilities?, stopOnEntry?` | сессия принята; `stopOnEntry` — из attach-конфигурации (контроллер страницы создаётся до `configured`) |
| `rejected` | `reason` | вторая вкладка/чужой Origin |
| `breakpoints` | `sourceId, replace: boolean, items: {line, condition?, logMessage?}[]` | набор брейкпоинтов источника |
| `setExceptionBreakpoints` | `filters: ('uncaught'\|'all')[]` | фильтры исключений |
| `configured` | — | `configurationDone` получен, можно исполнять |
| `resume` | `threadId, mode: 'continue'\|'next'\|'stepIn'\|'stepOut'` | продолжить/шаг |
| `pause` | `threadId?` | запросить паузу |
| `evaluate` | `seq, frameIndex, expression` | вычислить в кадре |
| `scopes` | `seq, frameIndex` | области остановленного кадра (DAP scopes) |
| `variables` | `seq, variablesReference` | переменные области/значения (DAP variables) |
| `disconnect` | — | завершить сессию, снять гейты |

## Инварианты

- Один сокет, порядок сообщений сохраняется; `seq` — у запрос-ответных `evaluate`/`scopes`/`variables`.
- Брейкпоинты можно слать в любой момент; замена набора — по `sourceId` (как DAP
  `setBreakpoints`).
- `configured` приходит ровно один раз до старта; без него движок не исполняет блоки.
- Если адаптер недоступен/таймаут — агент возвращает `null` из `attach()`: страница
  исполняется штатно (деградация без падения), ретраи продолжаются для позднего attach.
- `disconnect`/закрытие страницы: все гейты резолвятся, висящих промисов нет.
