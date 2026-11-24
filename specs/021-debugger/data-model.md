# Data Model: Отладчик BSL (DAP)

**Feature**: `specs/021-debugger` | **Date**: 2026-11-24 | **Spec**: [spec.md](./spec.md)

Сущности разделены по слоям, чтобы ядро оставалось браузерным и не тянуло `node:*`/DOM:

- **runtime** (`src/runtime/debug/`) — контроллер отладки, брейкпоинты, потоки, кадры,
  переменные. Без платформенных зависимостей; подключается через `RuntimeEnvironment`.
- **adapter** (`src/node/debug/`) — DAP-сессия (Node, stdio) и транспорт до браузера.
- **page agent** (`src/browser/debug-agent.ts` + `src/debug/page-protocol.ts`) — мост
  между страницей и адаптером (WebSocket).
- **mapping** (`src/debug/` или `src/lsp/html-blocks.ts`) — маппинг URL↔файл и HTML-блоков.

## 1. Runtime: контроллер и состояние

### DebugController (внутренний объект на `RuntimeEnvironment`)

Общий на запуск (один скрипт/страница). Живёт в `src/runtime/debug/controller.ts`;
интерпретаторы получают его через `env.debug` (getter), поэтому форки заданий и
контексты блоков браузера подхватывают его без изменения `RunOptions`.

| Поле | Тип | Правила |
|---|---|---|
| `enabled` | `boolean` | `false` — движок не меняет поведение (ни одного нового `yield`) |
| `breakpoints` | `Map<string, DebugBreakpoint[]>` | ключ — `sourceId` движка; `setBreakpoints` заменяет набор источника |
| `exceptionFilters` | `Set<'uncaught' \| 'all'>` | `uncaught` — по умолчанию; `all` — стоп на каждом исключении |
| `pauseRequested` | `boolean` | выставляется `pause`, снимается на ближайшем хуке |
| `stepMode` | `'continue' \| 'next' \| 'stepIn' \| 'stepOut'` | применяется к остановленному потоку |
| `threads` | `Map<number, DebugThread>` | главный поток + фоновые задания |
| `sources` | `Map<string, DebugSource>` | реестр источников для DAP Source |
| `paused` | `boolean` | хотя бы один поток остановлен; входы в BSL гейтятся |
| `gates` | `Set<() => void>` | резолверы паузного гейта (continue/pause/disconnect) |

Методы (контракт — `contracts/engine-debug-api.md`):

- `setBreakpoints(sourceId, breakpoints)`, `setExceptionFilters(filters)`;
- `onStatement(invocation, frame, line): Promise<void> | undefined` — хук из `exec`;
  `undefined` — продолжать синхронно, `Promise` — пауза/шаг/уступка хосту;
- `requestPause()`, `resume(mode)`, `threads()`, `stop()` (снять гейты, отключить);
- `stackTrace(threadId)`, `scopes(frameId)`, `variables(ref)`, `evaluate(frameId, expr)`;
- `output(category, text)` — вывод в DAP `output` (через sink).

Состояния контроллера: `run` → (`pauseRequested`) → `paused` → `run` (continue) либо
`paused` → `paused` (шаг); `stop()` переводит в `disabled` и резолвит все гейты
(иначе страница/промисы висят).

### DebugBreakpoint

| Поле | Тип | Правила |
|---|---|---|
| `line` | `number` | 1-based, строка начала оператора движка |
| `condition` | `string?` | P2; вычисляется в области кадра при попадании; ошибка условия — не останавливаться + `output` |
| `logMessage` | `string?` | P2 logpoint: `{выражение}` подставляется; остановки нет |
| `verified` | `boolean?` | адаптер: `true`, если строка привязана к исполняемому оператору |

### DebugSource

| Поле | Тип | Правила |
|---|---|---|
| `id` | `string` | идентификатор источника движка (`sourceId` из 020) |
| `path` | `string?` | путь в рабочей области (Node) для DAP `Source.path` |
| `url` | `string?` | URL (браузер) |
| `text` | `string` | текст исходника — для верификации брейкпоинтов и `evaluate` |
| `kind` | `'file' \| 'inline-html' \| 'dynamic' \| 'stdin'` | как показывать в DAP |

### DebugThread

| Поле | Тип | Правила |
|---|---|---|
| `id` | `number` | 1 — главный; ≥2 — фоновые задания |
| `name` | `string` | «Главный поток» / «Фоновое задание N» |
| `state` | `'running' \| 'paused' \| 'terminated'` | DAP `threads`/`stopped` |
| `frames` | `DebugFrameSnapshot[]` | снимок на момент остановки, изнутри наружу |

### DebugFrameSnapshot (снимок кадра на остановке)

| Поле | Тип | Правила |
|---|---|---|
| `id` | `number` | DAP `frameId`, 0 — текущий кадр |
| `method` | `string` | имя метода/маркер (`<модуль>`, `<Выполнить>`, …) |
| `module` | `string` | `sourceId` кадра |
| `line` | `number` | 1-based строка оператора |
| `scope` | `Scope` | область видимости кадра (для `variables`) |
| `ctx` | `Ctx` | модульные переменные и методы (для `variables`/`evaluate`) |
| `interpreter` | `Interpreter` | для `evaluate`/`ЭтотОбъект` |

Снимок копирует кадры и ссылки на `Scope`/`Ctx` в момент остановки: `ActiveFrame`
расширяется полями `scope`/`ctx`/`interp`, а `startFrames` копирует их между
интерпретаторами модулей (`{...frame}`), поэтому стек остаётся связным.

### DebugVariable (представление значения для DAP)

| Поле | Тип | Правила |
|---|---|---|
| `name` | `string` | имя переменной/элемента |
| `value` | `string` | `toStringValue`/представление BSL |
| `type` | `string` | `typeName` значения |
| `variablesReference` | `number` | `0` — примитив; `>0` — ленивые дети |
| `namedVariables` | `number?` | для коллекций с ключами |
| `indexedVariables` | `number?` | для массивов |

Визуализатор (`src/runtime/debug/values.ts`): примитивы, `Массив` (индексы),
`Структура` (`getProp`), `Соответствие` (ключи+значения); защита от циклов (множество
посещённых объектов), ленивые дети. `ТаблицаЗначений`/`ДеревоЗначений` — вне MVP.

### Инварианты

- Отладчик выключен (`env.debug === undefined`): `run()` синхронного скрипта по-прежнему
  не возвращает `Promise`; новых `yield`, кадров и проверок на оператор нет.
- Пауза = `yield` `Promise`-гейта в генераторе: стек сохраняется нативно, страница жива.
- `pause` требует периодической уступки хосту в отладочном режиме (TimeSlicer, как у
  заданий) — иначе сообщение `pause` не обработается event loop.
- Каждый останов — снимок; последующие DAP-запросы (`stackTrace`/`variables`/`evaluate`)
  работают по снимку и не возобновляют исполнение.
- `disconnect`/`stop` резолвит все гейты: зависших промисов и «замороженной» страницы
  быть не должно.

## 2. Adapter: DAP-сессия

### OsjsDebugSession (extends `LoggingDebugSession`)

Состояния: `created` → `initialized` (после `initialize`) → `configured` (после
`configurationDone`) → `running`/`paused` → `terminated`. В MVP одна сессия на адаптер
(как в эталоне: одна страница/один скрипт).

### LaunchConfig (Node)

| Поле | Тип | Правила |
|---|---|---|
| `program` | `string` | обязательный; `.osjs`; разрешается от `cwd` |
| `cwd` | `string?` | по умолчанию `${workspaceFolder}` |
| `args` | `string[]?` | аргументы CLI (MVP: пробрасываются в `ТекущийСценарий`/`ПараметрыЗапуска` — вне MVP, только хранить) |
| `stopOnEntry` | `boolean?` | остановка на первом операторе |
| `noDebug` | `boolean?` | без отладки (просто запуск) |

### AttachConfig (браузер)

| Поле | Тип | Правила |
|---|---|---|
| `url` | `string` | URL страницы с блоками/внешним `.osjs` |
| `webRoot` | `string?` | корень маппинга URL↔файл; по умолчанию `${workspaceFolder}` |
| `port` | `number?` | порт WS-сервера; по умолчанию 9229 (fallback: свободный порт) |
| `stopOnEntry` | `boolean?` | остановка на первом операторе |

### SourceMapping (адаптер)

| Поле | Тип | Правила |
|---|---|---|
| `engineSourceId` | `string` | id движка (`URL`, `URL#blockN`, путь) |
| `clientPath` | `string?` | путь файла для VS Code (после `webRoot`) |
| `clientUrl` | `string?` | URL источника |
| `lineOffset` | `number` | HTML: `engineLine = htmlLine - lineOffset` |
| `kind` | `'file' \| 'inline-html' \| 'dynamic'` | |

### PendingEvaluate

`Map<number, {resolve, reject}>` для `evaluate` в браузере (запрос-ответ по WS).

## 3. Page agent и протокол

### PageAgent (браузерный IIFE `dist/onescript-debug.js`)

- Регистрирует `globalThis.__OSJS_DEBUG__` **до** `onescript.js`; движок при старте
  находит мост, создаёт `DebugController` и ждёт `run` (после DAP `configurationDone`).
- Открывает `WebSocket` на `ws://127.0.0.1:<port>`, шлёт `hello` со списком источников,
  получает `init` с брейкпоинтами, затем `run`.
- Пересылает события контроллера в адаптер (`stopped`/`continued`/`output`/`threads`/
  `terminated`), команды адаптера — в контроллер (`resume`/`pause`/`evaluate`/
  `setBreakpoints`/`setExceptionBreakpoints`).
- Патчит `console.*` для `output`, не подавляя вывод в devtools страницы.
- `dist/onescript.js` (production) не содержит кода агента; инъекция — только dev-плагин
  Vite или ручной `<script src="onescript-debug.js">`.

### Протокол (JSON-сообщения, контракт — `contracts/page-agent-protocol.md`)

`SourceInfo` (page → adapter): `{ id, url?, kind, text, pageUrl?, blockIndex?, blockId?,
contentStartLine? }` — для inline-блока: `contentStartLine` — 1-based строка HTML, с
которой начинается содержимое блока (для маппинга брейкпоинтов).

`FrameInfo`: `{ id, method, sourceId, line }`.
`BreakpointSpec`: `{ line, condition?, logMessage? }`.
`VariableInfo`: см. `DebugVariable` без внутренних ссылок.

## 4. Маппинг источников и строк

### HTML-блоки (`findBlocks` из `src/lsp/html-blocks.ts`, type-only импорт LSP-типов)

- Адаптер по `url` из attach получает HTML (HTTP fetch), вызывает `findBlocks`,
  сопоставляет блоки с `SourceInfo` агента по `blockId`/порядку.
- Для блока: `contentStartLine` (1-based) — строка HTML, с которой начинается содержимое;
  `htmlLine = contentStartLine + blockLine - 1`, `blockLine = htmlLine - contentStartLine + 1`.
- Брейкпоинт в HTML-файле: DAP `Source.path` = файл под `webRoot`; строка HTML →
  блок → `engineSourceId` + `blockLine`. Брейкпоинт вне блока — `verified: false`.
- Брейкпоинт во внешнем `.osjs`: `URL` → путь через `webRoot`; `sourceId` = URL.
- Строка без оператора (`иначе`, `Перем` верхнего уровня, середина многострочного
  выражения) — привязка к ближайшему следующему исполняемому оператору (адаптер
  разбирает исходник и строит карту исполняемых строк) либо `verified: false`.

### Идентификаторы источников (совместимость с 020)

| Контекст | `sourceId` движка | DAP Source |
|---|---|---|
| Node, главный файл | абсолютный путь (`RunOptions.path`) | `path` |
| Node, импорт/класс | разрешённый путь | `path` |
| Node, stdin | `<stdin>` | виртуальный (`name: <stdin>`) |
| Браузер, внешний `.osjs` | абсолютный URL | `path` через `webRoot` |
| Браузер, inline-блок | `<URL страницы>#<id\|blockN>` | HTML-файл + `lineOffset` |
| `Выполнить`/`Вычислить` | `<Выполнить>`/`<Вычислить>` | виртуальный (в стеке; документ — позже) |

Коллизия `<Выполнить>`/`<Вычислить>` (один id на все фрагменты) — контроллер ведёт
суррогатные id для DAP Source; `frame.module` движка не меняется (тесты 020).
