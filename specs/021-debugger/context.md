# Контекст для спеки «Отладчик BSL (DAP)» — техническая карта

**Спека**: [spec.md](./spec.md) | **Статус**: черновик | **Дата**: 2026-11-24

Этот документ — собранный контекст для старта работы в отдельном диалоге: факты о движке
(после спеки 020), точки интеграции, варианты архитектуры, prior art, оценка и риски.
Ничего здесь не является окончательным решением — это вход для `/speckit-clarify`/`plan`.

## 1. Задача и решение владельца

Владелец: «сделать дебаггер для языка; наверно DAP-адаптер, в VS Code-плагин добавить
DAP-клиент, и как-то общаться с локальным браузером». Уточнение: DAP-клиент в VS Code уже
встроен — расширению нужен только адаптер + контрибуция `debuggers`. Транспорт до браузера —
page-agent + WebSocket; CDP не обязателен.

Предварительная оценка (обсуждение до спеки): реально; объём ~2–3 тыс. строк, сопоставимо с
LSP-слоем; MVP ~9–14 человеко-дней, полный ~18–29.

## 2. Что уже есть в движке (после 020)

### 2.1 Интерпретатор — tree-walking на генераторах

- `src/runtime/interpreter.ts:125` — `class Interpreter`; `exec`/`eval` — генераторы,
  драйвер `drive()` исполняет синхронно до первого `yield`.
- `src/runtime/interpreter.ts:592` — `exec(stmt, scope, ctx)`: **единственная воронка
  операторов**; здесь уже обновляется `frame.line = stmt.pos.line` и снимается снимок
  ошибки в `catch` (020). Это же — идеальная точка хука отладчика.
- `src/runtime/async.ts:80` — `drive(generator, options)`: синхронный быстрый путь; на
  `yield` Promise ждёт и продолжает. `DriveOptions.beforeStep/afterStep` (`async.ts:66`)
  уже используются заданиями.
- `src/runtime/async.ts:135/160` — `TimeSlicer`/`yieldToHost`: кооперативные уступки
  (Node `setImmediate`, браузер `MessageChannel`), квант ~10 мс. Тот же механизм подойдёт
  для отзывчивого `pause`.
- **Пауза = `yield` Promise-гейта**, который резолвит контроллер: стек генератора
  сохраняется нативно, страница не блокируется, Worker/SharedArrayBuffer не нужны.

### 2.2 Кадры и источники (инфраструктура 020 — переиспользуется)

- `src/runtime/interpreter.ts:137` — `frames: ActiveFrame[]`; `ActiveFrame` =
  `{method, module, line, lines}` (`interpreter.ts:60`).
- `pushFrame`/`popFrame` — `interpreter.ts:163/166`; вызовы в `runGen` (~324),
  `callMethod` (~1008), `invokeMethodGen` (~370), `invokeAsyncGen` (~471),
  `invokeMethodWithOutputsGen` (~547), `execDynamic` (~1129), `evalDynamicExpression` (~1076).
- `snapshotFrames()` — `interpreter.ts:154`: кадры изнутри наружу (готово для DAP
  `stackTrace`).
- `driveInvocation` — `interpreter.ts:187`: стек принадлежит invocation-у, конкурентные
  async-вызовы не склеиваются.
- `startFrames`/`callerFrames`/`callObject` — `interpreter.ts:175/83/226`: переход между
  интерпретаторами модулей/классов сохраняет цепочку кадров.
- `sourceId`/`sourceText` у `Interpreter` (`interpreter.ts:132/134`);
  `RunOptions.sourceId?` (`src/runtime/runner.ts:11/35`); id задают `runner.run`,
  `ModuleLoader` (`src/runtime/modules.ts`), `ЗагрузитьСценарийИзСтроки`
  (`src/stdlib/script.ts`), браузерный вход (`src/browser/onescript.ts:78`).
- `forkForJob` — `interpreter.ts:246`: фоновое задание — отдельный `Interpreter` (свой
  стек, общие методы/переменные модуля).
- `executeInModule` — `interpreter.ts:388`: вход для DOM-обработчиков/REPL/`data-os-*`.
- Снимок ошибки: `src/runtime/error-snapshot.ts` (`FrameSnapshot:11`, `ErrorSnapshot:21`,
  `captureError:79`, `annotateError:97`, `formatErrorReport:131`); BSL-API —
  `src/runtime/error-info.ts` (`BslCallStackFrame:12`, `BslErrorInfo:59`,
  `BslCallStackFrames:139`). Отладчику пригодятся те же кадры/источники.

### 2.3 Что нужно добавить в движок

- **Контроллер отладки** на `RuntimeEnvironment` (`src/runtime/context.ts`) — общий для всех
  интерпретаторов одного запуска: включённость, брейкпоинты, пауза/шаги, реестр потоков и
  источников.
- **Хук в `exec`**: синхронная проверка (брейкпоинт/шаг/pause) и, при остановке,
  `yield` гейта. В выключенном режиме — никаких изменений (проверка `if (this.debug)`).
- **Области видимости кадра**: `ActiveFrame` сейчас не хранит `Scope`; `Scope`
  (`src/runtime/scope.ts:20`) не умеет перечислять переменные. Нужно: хранить `Scope` в
  кадре + `ownEntries()`/`ownNames()` в `Scope` (~10–20 строк) для `scopes/variables`.
- **Debug-API интерпретатора**: `evaluateInFrame(frame, expression)`, `setVariable` (опц.),
  снимок состояния кадра (locals/module vars/`ЭтотОбъект`).
- **Пауза/шаги** через `yield` Promise; периодические уступки хосту при включённом
  отладчике (по кванту, как `TimeSlicer`), чтобы `pause` срабатывал в долгом цикле.
- **Вывод**: перехват `console.log/error/warn` (через `Сообщить`/stdlib) → DAP `output`.

## 3. Архитектура DAP-адаптера

### 3.1 Расширение VS Code

- `contributes.debuggers`: тип `osjs`, `languages: ["osjs","html"]`,
  `configurationAttributes` (`launch`/`attach`), `initialConfigurations`,
  `configurationSnippets`.
- `DebugAdapterDescriptorFactory` → `vscode.DebugAdapterExecutable(process.execPath,
  ["out/debug-adapter.js"], { env: { ELECTRON_RUN_AS_NODE: "1" } })` — тот же приём, что
  для LSP (`extensions/vscode/src/extension.ts:50`).
- Адаптер общается с VS Code по DAP over stdio (`Content-Length: …\r\n\r\n{json}`).
- Сборка: второй entry в `scripts/build-vscode-extension.mjs` (esbuild, CJS, `vscode`
  external); в staging — `out/debug-adapter.js` и, при необходимости, движок
  (`dist/node/index.js`) или отдельный бандл адаптера.

Пример `launch.json`:

```json
{ "type": "osjs", "request": "launch", "name": "OneScript: launch",
  "program": "${file}", "cwd": "${workspaceFolder}", "stopOnEntry": false }
{ "type": "osjs", "request": "attach", "name": "OneScript: browser",
  "url": "http://localhost:5173/examples/hello.html", "webRoot": "${workspaceFolder}" }
```

### 3.2 Реализация DAP

- Вариант A (рекомендуется): `@vscode/debugadapter` + `@vscode/debugprotocol` (новые
  devDependencies, бандлятся в адаптер) — `DebugSession`, типы, хендлы.
- Вариант B: свой слой DAP — в эталоне это `Protocol.cs` (~270 строк) + `DebugSession.cs`
  (~500) + `OscriptDebugSession.cs` (~524); возможно, но дороже.
- Подмножество MVP: `initialize`, `launch`/`attach`, `setBreakpoints`,
  `setExceptionBreakpoints`, `configurationDone`, `threads`, `stackTrace`, `scopes`,
  `variables`, `evaluate`, `continue`, `next`, `stepIn`, `stepOut`, `pause`, `disconnect`;
  события `initialized`, `stopped`, `continued`, `output`, `terminated`, `exited`.
- Капабилити: `supportsConfigurationDoneRequest`, `supportsEvaluateForHovers`,
  `supportsConditionalBreakpoints`, `supportsLogPoints`, `supportsFunctionBreakpoints: false`,
  `supportsSetVariable: false` (MVP).

### 3.3 Модель процесса для Node

- Вариант A (MVP): движок исполняется **в процессе адаптера** (`run()` из
  `dist/node/index.js`), пауза — корутина, event loop свободен; `console` перехватывается
  в `output`. Минус: `process.exit`/жёсткий цикл в скрипте убивает адаптер.
- Вариант B: child-процесс CLI + внутренний JSON-протокол (как TCP debug server в
  эталоне: `OneScript.DebugServices/TcpDebugServer.cs`) — изоляция, но +протокол.
- Рекомендация: A для MVP; B — если понадобится изоляция.

## 4. Транспорт до браузера

### 4.1 Рекомендуемый вариант (attach-first, WebSocket)

1. Адаптер поднимает WS-сервер на локальном порту (из `launch.json`, по умолчанию 9229;
   зависимость `ws` или SSE-fallback на `node:http`).
2. Page-agent — отдельный скрипт `dist/onescript-debug.js` (IIFE), **не входит** в
   production `dist/onescript.js`. Инжектится:
   - Vite dev-плагин `transformIndexHtml` (рядом с `serveBuiltBundle`, `vite.config.ts:19`);
   - либо вручную `<script src="onescript-debug.js"></script>` до `onescript.js`;
   - либо `?osjs-debug=PORT` (движок читает параметр — тогда мини-клиент в бандле; не
     рекомендуется для production).
3. Агент регистрирует `globalThis.__OSJS_DEBUG_ATTACH__`; движок при старте, если хук есть,
   создаёт контроллер и **ждёт `configurationDone`** перед исполнением блоков.
4. Агент отправляет адаптеру источники (sourceId + текст) и текущие брейкпоинты; адаптер
   маппит их в DAP-источники и отдаёт VS Code.
5. На остановке агент отправляет `stopped` (поток, кадры, снимки переменных), ждёт
   команды; на `continue` резолвит гейт.
6. Пока скрипт стоит, страница жива; новые BSL-входы (`data-os-*`, BSL-события) гейтятся
   контроллером, чтобы не «уехать» вперёд.

### 4.2 Альтернативы

- **SSE + POST** (`node:http`, без `ws`): page-agent шлёт команды POST-ом, слушает SSE;
  чуть больше кода на корреляцию, зато без зависимости.
- **CDP (Chromium-only)**: адаптер сам запускает Chrome с `--remote-debugging-port`, через
  CDP инжектит агент и использует `Runtime.addBinding` как канал. Даёт авто-запуск/навигацию,
  но привязывает к Chromium и не решает BSL-брейкпоинты сам по себе. Позже — как «launch
  browser» режим.
- **Не нужно**: Worker/SharedArrayBuffer/Atomics — пауза уже реализуема генераторами.
- HTTPS-страница + `ws://localhost`: mixed content (ниша; dev-сервер http; при необходимости
  wss/сертификат или CDP).

## 5. Маппинг исходников

| Контекст | sourceId движка (020) | DAP Source |
|---|---|---|
| Node launch, главный файл | `RunOptions.path` (как передали) | file path |
| Node, импорт/класс | разрешённый путь | file path |
| Node, stdin | `<stdin>` | виртуальный/`untitled` |
| Браузер, внешний `.osjs` | абсолютный URL | файл рабочей области через `webRoot`/`url` |
| Браузер, inline-блок | `<URL страницы>#<id>` / `#blockN` | HTML-файл + блок + смещение строк |
| `Выполнить`/`Вычислить` | `<Выполнить>`/`<Вычислить>` | виртуальный источник (позже) |

- HTML-блоки: `src/lsp/html-blocks.ts:89` — `findBlocks(html)` даёт `contentStartOffset`,
  `start/end` (LSP 0-based). Маппинг: HTML-строка → (блок, локальная строка) и обратно;
  адаптер парсит HTML-файл при `setBreakpoints`.
- Строка ошибки/останова = строка начала оператора (`stmt.pos.line`, 1-based); многострочный
  оператор привязывается к первой строке (осознанно, как в 020).
- Брейкпоинт на строке без оператора — привязать к ближайшему следующему оператору или
  вернуть `verified: false` (решение в плане).

## 6. Семантика паузы/шагов

- Режимы контроллера: `run`, `pauseRequested`, `stepIn`, `stepOver`, `stepOut`.
- Хук на каждом операторе: сравнить `sourceId`+`line` с брейкпоинтами (и условием), затем
  правила шага: `stepIn` — следующий оператор в любом кадре; `stepOver` — та же или меньшая
  глубина и другая строка; `stepOut` — глубина меньше текущей; `pause` — на следующем хуке.
- Остановка: снимок кадров/переменных, `stopped(reason, threadId)`, ожидание `continue`.
- Потоки: главный интерпретатор + `forkForJob`-задания; `pause` останавливает все
  (предсказуемее), `threads` показывает их; у задания свой стек.
- Async: стек принадлежит invocation-у (`driveInvocation`), `Ждать`/`Приостановить` —
  обычные точки `yield`; шаг через `Ждать` должен работать (проверить отдельно).
- Включённый отладчик делает исполнение асинхронным (появляются `yield`) — это допустимо
  только на время сессии; при выключенном — синхронный быстрый путь без изменений.

## 7. Переменные и evaluate

- `Scope` (`src/runtime/scope.ts:20`) — только `get/set/declare/bindRef/findBinding`; нужен
  обход собственных переменных (`ownEntries()`), иначе `variables` не собрать.
- Кадр должен хранить `Scope` и ссылку на `Ctx` (module vars) — расширить `ActiveFrame`
  и `pushFrame`.
- Визуализатор BSL-значений: примитивы (`Число/Строка/Булево/Дата/Null/Неопределено`),
  `Массив` (элементы), `Структура`/`Соответствие` (ключи + значения), `ТаблицаЗначений`/
  `ДеревоЗначений` — позже; защита от циклов, ленивые дети через `variablesReference`.
- `evaluate`: выражение BSL в области остановленного кадра. Реализация: публичный
  debug-метод интерпретатора — разобрать выражение (как `compileDynamic`/`evalDynamicExpression`),
  проверить имена (`checkDynamicExpression`) и выполнить в `scope` кадра; может быть
  асинхронным — адаптер дожидается. Ошибка evaluate — DAP error, сессия жива.
- `setVariable` — вне MVP.

## 8. Брейкпоинты и исключения

- Реестр: `Map<sourceId, Map<line, Breakpoint>>`; `setBreakpoints` приходит для файла —
  заменить набор; `verified` по факту привязки к оператору.
- Условия (`condition`) и logpoints (`logMessage`) — P2: вычислять в области кадра при
  попадании; ошибка условия — не останавливаться (или стоп с reason `breakpoint` + output).
- Исключения: использовать снимок 020. Точка — `exec`-catch/`annotateAtCurrent`
  (`interpreter.ts:596`) и/или `execTryExcept`; фильтр `uncaught` требует учёта глубины
  `Попытка` (счётчик в контроллере), `all` — стоп на каждом.
- `exceptionBreakpointFilters` в `initialize`; `setExceptionBreakpoints` от VS Code.

## 9. Prior art: отладчик C#-OneScript (reference)

Каталоги (только чтение, не коммитятся):

- `reference/OneScript/src/VSCode.DebugAdapter/` — DAP-адаптер: `Protocol.cs` (DAP-сообщения),
  `DebugSession.cs` (база), `OscriptDebugSession.cs` (маппинг DAP ↔ движок),
  `DebugeeProcess.cs`/`ConsoleProcess.cs`/`ServerProcess.cs` (запуск движка),
  `PathHandlingStrategy.cs`, `WorkspaceMapper.cs` (маппинг путей), `Handles.cs`.
- `reference/OneScript/src/OneScript.DebugProtocol/` — `IDebuggerService.cs` (команды
  отладки: breakpoints/stack/variables/evaluate/steps), `Breakpoint.cs`, `StackFrame.cs`,
  `Variable.cs`, `ThreadStopReason.cs`, `ExceptionBreakpointFilter.cs`, `IDebugEventListener.cs`.
- `reference/OneScript/src/OneScript.DebugServices/` — `DefaultDebugger.cs`,
  `DefaultBreakpointManager.cs`, `TcpDebugServer.cs` (JSON-протокол по TCP),
  `ThreadManager.cs`, `MachineWaitToken.cs` (блокировка потока машины),
  `DefaultVariableVisualizer.cs`.
- `reference/OneScript/src/ScriptEngine/Machine/MachineStopManager.cs` — проверка
  брейкпоинтов/шагов/исключений на каждой инструкции; `MachineInstance.SetDebugMode`.
- `reference/OneScript/src/ScriptEngine/Machine/Debugger/DebuggerServiceImpl.cs` — сервис
  стека/переменных/evaluate.

Что переиспользовать: структуру DAP-сессии, стратегии маппинга путей, менеджер
брейкпоинтов, визуализатор переменных, семантику шагов/остановок, UX.
Что не переносить: TCP JSON-протокол, байткод-таблицу строк (у нас AST `pos`), C#-код.

Отличие нашего движка: tree-walking на генераторах (пауза проще, чем блокировка потока
стековой ВМ), но нет байткода/линейной таблицы — позиции берём из AST.

## 10. Оценка (прикидка, 1 разработчик, знающий код)

| Этап | Содержание | Дни |
|---|---|---|
| 0. Спайк | хук + контроллер + сырой DAP (Node): брейкпоинт, шаг, стек, locals, evaluate | 3–5 |
| 1. VS Code Node | `debuggers`-контрибуция, launch, сборка `.vsix` | 2–3 |
| 2. Browser attach | внешние `.osjs`, WS-транспорт, `webRoot`-маппинг | 4–6 |
| 3. Inline HTML | маппинг блоков через `findBlocks` | 2–3 |
| 4. Добивка | conditions/logpoints, exceptions, jobs/threads, визуализатор коллекций | 4–7 |
| 5. Тесты/доки/края | unit/integration/browser-тесты, README, финальная верификация | 3–5 |

Итого: MVP (0–2) ≈ **9–14** дней (~2–3 недели), полный (0–5) ≈ **18–29** дней (~4–6 недель).
Уверенность: хук/Node/DAP — высокая; browser-маппинг — средняя; async/задания — средняя-низкая.

Ориентир по объёму: ~2–3 тыс. строк (сопоставимо с LSP-слоем ~2,8 тыс.), из них:
контроллер ~400–600, движок ~100–200, DAP-адаптер ~500–800, page-agent ~250–400,
маппинг ~150–250, расширение ~100–200, тесты ~400–700.

## 11. Риски и смягчение

1. **Async/фоновые задания**: несколько invocation-ов/потоков; пауза «всех», стек
   per-invocation. Смягчение: `driveInvocation` уже есть; MVP — один поток + базовые задания.
2. **Маппинг источников** (URL↔файл, HTML-блоки, импорты, динамика) — 80% UX браузерной
   отладки. Смягчение: `webRoot`/`url` в конфиге, `findBlocks`, явные sourceId из 020.
3. **Paused page + DOM-события**: новые BSL-входы могут «уехать» вперёд. Смягчение: гейт
   в контроллере для всех входов (`executeInModule`/события).
4. **Evaluate в остановленном кадре**: реентерабельность, ошибки. Смягчение: отдельный
   генератор, DAP error, тесты.
5. **Синхронный быстрый путь**: отладочный режим не должен влиять на обычное исполнение.
   Смягчение: `if (this.debug)`; существующие async/sync тесты.
6. **Транспорт**: `ws://` с HTTPS-страницы (mixed content), несколько вкладок. Смягчение:
   dev-сервер http, одна сессия.
7. **Упаковка расширения**: адаптер/движок в `.vsix`, `ELECTRON_RUN_AS_NODE`. Смягчение:
   повторить паттерн LSP-сервера (`build-vscode-extension.mjs`).
8. **Точность строк**: брейкпоинт на `иначе`/`Перем`/многострочном выражении. Смягчение:
   привязка к ближайшему оператору, `verified:false`.
9. **Объём DAP**: не пытаться сделать весь протокол; MVP-подмножество + capability-флаги.
10. **Node: `process.exit`** в скрипте убивает адаптер. Смягчение: MVP — in-process,
    позже child-процесс.

## 12. Тестовая стратегия

- **Unit** (без VS Code): контроллер отладки — брейкпоинты, шаги (next/in/out), пауза,
  гейт, потоки; интерпретатор — остановка/продолжение; маппинг HTML/URL.
- **Integration**: DAP over in-memory duplex/stdio — последовательность событий
  (`initialized`→`stopped`→`stackTrace`/`variables`→`continue`), launch Node-фикстуры.
- **Browser**: happy-dom + фейковый транспорт page-agent; проверка ожидания
  `configurationDone`, sourceId/блоков, гейтинга DOM-обработчиков.
- **E2E** (позже): Playwright (спека 007 пока не реализована) — реальный Chromium.
- **Ручная приёмка**: `.vscode/launch.json` в репозитории, `examples/` страницы.

## 13. Что НЕ делать

- Не компилировать BSL в JS ради source maps — это второй движок.
- Не тащить отладочный клиент в production `dist/onescript.js` — отдельный
  `dist/onescript-debug.js` или dev-инъекция.
- Не начинать с CDP/Chrome-специфики; WS-транспорт проще и браузер-агностичен.
- Не делать весь DAP сразу; capability-флаги + подмножество.
- Не блокировать поток через `Atomics.wait`/Worker — генераторного `yield` достаточно.

## 14. Чек-лист старта нового диалога

1. `git log --oneline -3` — убедиться, что 020 закоммичена (см. коммит «…(спека 020)»).
2. Ветка: `feature/021-debugger`; каталог спеки: `specs/021-debugger/` — **черновик уже
   создан** (spec.md + context.md). Продолжать с `/speckit-clarify`/`plan` по нему; если
   пересоздавать через `/speckit-specify`, указать `SPECIFY_FEATURE_DIRECTORY=specs/021-debugger`,
   иначе автонумерация возьмёт 022.
3. Прочитать: этот файл, [spec.md](./spec.md), `specs/020-runtime-error-info/spec.md`
   (+ `research.md`, `data-model.md`), `src/runtime/interpreter.ts` (кадры/хук/`exec`),
   `src/runtime/async.ts`, `src/runtime/scope.ts`, `src/runtime/runner.ts`,
   `src/runtime/modules.ts`, `src/browser/onescript.ts`, `src/node/cli.ts`,
   `extensions/vscode/src/extension.ts`, `scripts/build-vscode-extension.mjs`,
   `vite.config.ts`, `src/lsp/html-blocks.ts`, `docs/architecture.md`, каталоги
   `reference/OneScript/src/VSCode.DebugAdapter|OneScript.DebugProtocol|OneScript.DebugServices`.
4. Базовый прогон до изменений: `pnpm typecheck && pnpm test` (927 тестов), `pnpm build`.
5. Прогнать `/speckit-clarify` по Q1–Q4 из spec.md (влияют на архитектуру и объём), затем
   `/speckit-plan` и `/speckit-tasks`.
6. Не начинать реализацию до ответов на Q1–Q4.

## 15. Ссылки

- Спека-черновик: [spec.md](./spec.md)
- Спека 020 (инфраструктура кадров/источников): `specs/020-runtime-error-info/`
- Архитектура: `docs/architecture.md` (§8 async-рантайм, §9 async-методы, §10 инструменты)
- Статус: `docs/status.md`
- VS Code DAP: спецификация microsoft/debug-adapter-protocol; пакеты
  `@vscode/debugadapter`, `@vscode/debugprotocol`.
- Эталонный отладчик: `reference/OneScript/src/VSCode.DebugAdapter/`,
  `OneScript.DebugProtocol/`, `OneScript.DebugServices/`,
  `ScriptEngine/Machine/MachineStopManager.cs`.
