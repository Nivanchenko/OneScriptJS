# Research: отладчик BSL (DAP) — решения и факты

**Feature**: `specs/021-debugger` | **Date**: 2026-11-24

Источники: черновик [spec.md](./spec.md) и [context.md](./context.md); фактический код
движка после спеки 020 (`HEAD e53417f`); эталон C# OneScript
(`reference/OneScript/src/VSCode.DebugAdapter/`, `OneScript.DebugProtocol/`,
`OneScript.DebugServices/`, `ScriptEngine/Machine/MachineStopManager.cs`); пакеты
`@vscode/debugadapter@1.68.0`, `@vscode/debugprotocol@1.68.0`, `ws@8.23.0`.

Открытые вопросы Q1–Q10 из spec.md закрыты ниже (R1–R10) рекомендованными вариантами;
решения можно пересмотреть до начала соответствующей волны.

## Решения

### R1. Приоритет: Node launch → browser attach (Q1)

- **Решение**: сначала вертикальный срез Node `launch` (спайк + VS Code), затем browser
  `attach` — основная ценность, но дороже (транспорт, маппинг, гейтинг).
- **Почему**: Node-путь проверяет контроллер/шаги/стек/переменные без браузерного
  транспорта и даёт дешёвый регресс-страж; browser-путь переиспользует тот же контроллер.
- **Альтернатива**: сразу attach — отклонено: транспорт и маппинг маскируют ошибки ядра.

### R2. Браузер: только attach, без авто-запуска Chrome (Q2)

- **Решение**: `attach` по `url`; адаптер поднимает WS-сервер на 127.0.0.1, страница
  подключается page-agent'ом. Автозапуск/навигация через CDP — вне объёма.
- **Почему**: CDP привязывает к Chromium и не решает BSL-брейкпоинты; dev-сервер уже есть.

### R3. Inline HTML-блоки — P2, после внешних `.osjs` (Q3)

- **Решение**: US3 отдельной волной после US2; маппинг переиспользует `findBlocks`
  (`src/lsp/html-blocks.ts`, только type-import LSP-типов — браузерный бандл не тянет
  `vscode-languageserver`).
- **Почему**: маппинг HTML↔блок — самая большая площадь багов; внешний `.osjs` проще.

### R4. Зависимости разрешены (Q4)

- **Решение**: `@vscode/debugadapter@1.68.0` + `@vscode/debugprotocol@1.68.0` (DAP over
  stdio, in-memory тесты через публичный `DebugSession.start(in, out)`), `ws@8.23.0` +
  `@types/ws` (транспорт до браузера). Всё — root devDependencies; в `.vsix` бандлится
  esbuild'ом (как `vscode-languageclient` в `out/extension.js`).
- **Почему не свой DAP-слой**: у эталона ~1280 строк чистой инфраструктуры
  (`Protocol.cs` 270, `DebugSession.cs` 502, `Transport/*` ~450, `Handles.cs` 57) без
  доменной ценности; свой слой оправдан только для не-Node транспорта — не наш случай.
- **Почему не SSE**: `ws` даёт один двунаправленный сокет, нативный клиент в браузере,
  нет preflight/correlation id. SSE+POST — документированный fallback.

### R5. BSL-видимый API отладчика — вне MVP (Q5)

- **Решение**: нет `Отладчик.Остановиться`/`ТочкаОстанова`; `docs/reference.md` и каталог
  API не меняются, `pnpm check:docs` остаётся зелёным без правок.
- **Почему**: не просили; сначала инструмент, потом язык.

### R6. Пауза останавливает все логические потоки (Q6)

- **Решение**: глобальный `paused`; остальные потоки встают на ближайшем хуке; `pause` —
  флаг, применяется на следующем операторе; `continue` снимает все гейты.
- **Почему**: предсказуемо; задания показываются как потоки (P3).

### R7. Условия/logpoints и exceptions — P2 (Q7, Q8)

- **Решение**: `condition`/`logMessage` и фильтры `uncaught`/`all` реализуются после MVP
  (US4); в MVP capabilities `false`, фильтр `uncaught` — по умолчанию.
- **Семантика exceptions**: `uncaught` — только при `tryDepth === 0`; `all` — на каждом;
  повторный стоп на том же объекте ошибки подавляется (`WeakSet`).
- **Семантика шагов** (из `MachineStopManager.cs:68-142`): брейкпоинт, встреченный по пути
  шага, выигрывает и сбрасывает режим шага; дедуп повторной остановки на том же
  (sourceId, line, depth).

### R8. Движок исполняется в процессе адаптера (Q9)

- **Решение**: Node launch — in-process (`run()` в адаптере); child-процесс — если
  понадобится изоляция `process.exit`.
- **Риск**: `process.exit` в скрипте убивает адаптер — документируется; `http-transport`
  использует `spawnSync`, что блокирует event loop адаптера на время HTTP-запроса
  (известное ограничение MVP).

### R9. Виртуальные источники динамики — только в стеке (Q10)

- **Решение**: `Выполнить`/`Вычислить` показываются кадрами стека; отдельные DAP
  документы/`sourceRequest` — позже. Коллизия `sourceId` (`<Выполнить>` на все фрагменты)
  решается суррогатными id в контроллере; `frame.module` движка не меняется (тесты 020).

### R10. Структура кода: ядро браузерное, адаптер Node

```
src/runtime/debug/controller.ts   — контроллер (брейкпоинты/шаги/пауза/потоки/гейт) — browser-safe
src/runtime/debug/values.ts       — визуализатор BSL-значений — browser-safe
src/debug/page-protocol.ts        — типы протокола страница↔адаптер — browser-safe
src/debug/html-mapping.ts         — маппинг HTML-строк ↔ блок (на findBlocks) — browser-safe
src/node/debug-adapter.ts         — ENTRY: DebugSession.run(OsjsDebugSession)
src/node/debug/session.ts         — OsjsDebugSession extends LoggingDebugSession (DAP ↔ controller)
src/node/debug/launch.ts          — Node launch: run() + перехват console → output
src/node/debug/attach.ts          — attach: WS-сервер, hello/configured, трансляция
src/node/debug/ws-server.ts       — `ws` на 127.0.0.1, Origin/token, одна сессия
src/node/debug/url-map.ts         — URL ↔ файл (webRoot, file://, виртуальные)
src/browser/debug/agent.ts        — page agent: WS-клиент, контроллер, консоль, манифест
src/browser/onescript-debug.ts    — ENTRY: IIFE `dist/onescript-debug.js`
extensions/vscode/src/debug.ts    — DebugAdapterDescriptorFactory + регистрация
```

Правила: `src/index.ts` не реэкспортирует debug-код (иначе `build:browser` потянет
`node:net`); entry отделён от логики (тесты импортируют `session.ts`, а не entry —
`DebugSession.run()` захватывает `process.stdin`); CJS-бандл не использует
`import.meta.url` (esbuild превращает в пустой объект).

## Факты движка (проверено чтением)

### F1. Единственная воронка операторов — `exec`

`src/runtime/interpreter.ts:613-624`: `exec` — генератор; уже содержит slicer-уступку
(`:614`), обновление `frame.line = stmt.pos.line` (`:617`) и `catch` → `annotateAtCurrent`
(`:621-624`). Хук отладчика ставится здесь; при выключенном отладчике — одна проверка
`this.env.debug`, ни одного нового `yield` (синхронный быстрый путь сохраняется,
`async.ts:80-124`).

### F2. Кадры и области видимости

`ActiveFrame` (`interpreter.ts:70-76`) = `{method, module, line, lines}` — нет `Scope`/`Ctx`.
Сайты `pushFrame`: модуль `:342`, методы `:387/488/568`, `Вычислить` `:1101`,
`Выполнить` `:1157`. `startFrames` (`:189-195`) копирует кадры через `{...frame}` при
переходе между интерпретаторами модулей — новые поля (`scope`/`ctx`/`interp`) перенесутся
сами. `driveInvocation` (`:201-222`) в паузе восстанавливает `this.frames = saved` —
снимок кадров надо делать в момент остановки, а не читать `this.frames` позже.

`Scope` (`src/runtime/scope.ts:20-61`) хранит `Map<lowercase, Ref>`; нужен
`ownEntries()` с исходным написанием имён (Map<string,{name,ref}>), контракт
`get/set/declare/bindRef/findBinding` не меняется. `ScriptModuleObject`
(`script-object.ts:7`) не перечисляет свойства — scope «Модуль» (moduleScope) в MVP,
«ЭтотОбъект» — если появится перечисление.

### F3. Async, задания, гейт

`drive` (`async.ts:80-124`) синхронен до первого `yield`; любой `yield` из хука делает
исполнение асинхронным — допустимо только при включённом отладчике. `TimeSlicer`/`yieldToHost`
(`:135-181`, квант 10 мс) включается в debug-режиме, иначе `pause` в плотном цикле не
обработается event loop. `forkForJob` (`interpreter.ts:260-280`) — отдельный `Ctx`, свой
slicer; точка регистрации потока. Все BSL-входы (`executeInModule` `:405`,
`callExportedMethod` `:442`, `Выполнить`) идут через `exec` — гейт новых входов получается
бесплатно.

### F4. Ошибки и `Попытка`

`execTryExcept` (`interpreter.ts:801-822`), `RaiseStatement` (`:673-688`, сохраняет снимок
020). Для `uncaught` нужна глубина `Попытка`: мутабельный `guard.tryDepth` на кадре
(копируется `{...frame}` между модулями; у нового задания — свой). Сигналы
`Return/Break/Continue/Goto` — не `Error`, отладчик их не ловит.

### F5. Вывод

`Сообщить` → `src/stdlib/global-context.ts:98-117` → `console.info/warn/error/log`; ошибки
движка — `runtime/context.ts:126`, `runtime/promise.ts:94`, `browser/onescript.ts:99`,
`browser/dom-events.ts:67/70`, `dom.ts:231/234`. Node-адаптер: сохранить и подменить
`console.*` на время сессии → DAP `output` (stdout — канал DAP, писать туда нельзя!);
page-agent: перехват с сохранением вывода в devtools.

### F6. DAP-библиотека

`@vscode/debugadapter@1.68.0`: `DebugSession extends ProtocolServer`,
`ProtocolServer.start(inStream, outStream)` публичный → интеграционные тесты на
`PassThrough` без спавна; готовые `Handles` (START_HANDLE=1000), `Source/Scope/StackFrame/
Variable/Breakpoint`, события, конвертация строк/путей. `DebugSession.run()` читает stdin —
entry отдельно от логики.

### F7. Сборка/упаковка

`scripts/build-vscode-extension.mjs`: esbuild `extension.ts` → `out/extension.js` (CJS,
`vscode` external) → staging → `vsce package --no-dependencies`. Добавить второй entry
`src/node/debug-adapter.ts` → `out/debug-adapter.js` (`external: ['vscode','bufferutil',
'utf-8-validate']` — опциональные нативные require у `ws`); движок бандлится из `src/`
(в `src/runtime|stdlib|parser|lexer|ast` нет `node:*`), копировать `dist/node` не нужно.
`src/node/*` исключён из declaration-emit — типы debugadapter не утекут в `dist/node`.
Отдельный `build:debug-client` (vite IIFE) → `dist/onescript-debug.js`; dev-плагин
`serveBuiltBundle` обобщается на этот файл + `transformIndexHtml` при `OSJS_DEBUG=1`.
`.vscodeignore` не нужен — staging курируется вручную.

### F8. Расширение VS Code

`extensions/vscode/package.json`: нет `debuggers`/`breakpoints`; `main: ./out/extension.js`;
`activationEvents` — `onLanguage:*` + команды; `engines.vscode ^1.91.0`. Добавить
`contributes.debuggers` (тип `osjs`, launch/attach, snippets), `contributes.breakpoints`
(язык `osjs`), activationEvents `onDebugResolve:osjs`, `onDebugInitialConfigurations`;
фабрику — в `activate()` (`extension.ts:140-166`), приём `DebugAdapterExecutable` с
`ELECTRON_RUN_AS_NODE` — как у LSP (`:50-60`). `.vscode/launch.json` в репозитории нет —
добавить с конфигами `osjs` launch/attach (для приёмки; для отладки самого расширения —
второй конфиг `extensionHost`).

### F9. Браузерный вход

`src/browser/onescript.ts`: `start()` (`:114-123`) ждёт `DOMContentLoaded`; `runAll`
(`:106-111`) последовательно `executeBlock`; контекст на блок (`:82`), `sourceId` (`:87`):
URL внешнего `.osjs` или `${baseURI}#${id||blockN}`. Гейт до `configurationDone`:
`runAll` (до fetch/старта) + `executeInModule` (DOM-входы) + `exec` (остальное). Шов:
`globalThis.__OSJS_DEBUG__.attach({pageUrl, baseURI, blocks})` → `DebugController | null`;
`onescript.ts` только проверяет наличие моста (type-only импорт) — в production-бандл
контроллер не попадает (FR-011). Инъекция агента — dev-плагин Vite до `onescript.js`;
ручной вариант `<script src="onescript-debug.js">`; атрибут `?osjs-debug`/env `OSJS_DEBUG`.

### F10. Маппинг

HTML: `findBlocks` (`src/lsp/html-blocks.ts:89-131`) даёт 0-based `start`/`contentStartOffset`;
движок — 1-based `stmt.pos.line`. Формула: `htmlLine = block.start.line + blockLine`
(проверено на `examples/hello.html`: contentStart 0-based 10 → первая строка контента 11),
обратно `blockLine = htmlLine - block.start.line`; диапазон `1..lineCount`, иначе
`verified:false`. Валидировать `text.slice(contentStartOffset, contentEndOffset)` против
манифеста агента (DOM-порядок ≠ raw-scan: `<template>`, `<noscript>`, `<svg><script>`,
`type="text/osjs "`). URL↔файл: origin+pathname без query/hash, кандидаты
`webRoot+pathname`, усечение первых k сегментов (dev-base `/OneScriptJS/`), иначе
виртуальный источник; обратно — `URL` от `baseURI`, без ручного кодирования.

### F11. Prior art — что берём

- Набор DAP-запросов и capabilities: `OscriptDebugSession.cs:33-70, 187-208, 210-266,
  277-289, 344-362, 364-391, 393-427, 429-440, 442-483`.
- Handles-схема (`Handles.cs:12`, START_HANDLE=1000, сброс на остановку) и ленивые
  провайдеры переменных по пути (`LocalScopeProvider`, `ModuleScopeProvider`,
  `ChildVariablesProvider`, `EvaluatedExpressionProvider`) — переменные BSL-коллекций
  отдаются лениво.
- Контракт визуализатора (`Variable{Name,Presentation,TypeName,IsStructured}`, обрезка
  презентации, `try/catch` вокруг `ToString()`).
- Семантика шагов/брейкпоинтов/исключений (`MachineStopManager.cs:68-142`), трюк
  `evaluate` для hover: ошибка как значение `err: <expr>`, а не DAP-error.
- Маппинг путей (`WorkspaceMapper.cs:40-70`), набор опций launch/attach.
- **Не берём**: TCP-JSON протокол и `OneScript.DebugProtocol/DebugServices`,
  `MachineWaitToken`/`ThreadManager` (наша пауза — `yield`), процессную модель
  `DebugeeProcess.cs`, фейковые брейкпоинты WCF, `Pause → NotImplementedException`.

### F12. Тестовая инфраструктура

`vitest.config.ts` — node, `tests/**/*.test.ts`, без setup. Образцы: runtime inline-BSL
(`tests/runtime-errors.test.ts:12-40`), sync-fast-path (`tests/async-runtime.test.ts:61`),
CLI `runCli(argv, io)` (`tests/cli-errors.test.ts:14-32`), браузер
(`tests/helpers/browser-script.ts`), LSP in-process (`tests/lsp-embedded-protocol.test.ts:28-74`),
smoke собранного (`tests/lsp-server-smoke.test.ts:6-8`), манифест расширения
(`tests/vscode-extension.test.ts:42-56`), границы слоёв
(`tests/lsp-boundaries.test.ts:31-50`). Playwright нет (спека 007 — Draft) — e2e вне 021.
CI-джобы с `pnpm test`/`typecheck` нет; `release.yml` пакует артефакты — добавить
`dist/onescript-debug.js` и адаптер.

## Риски

| # | Риск | Смягчение |
|---|---|---|
| R-1 | `console.*`/`process.stdout` движка ломает DAP-stdio | подмена console на время сессии; тест «в stdout только DAP-фреймы» |
| R-2 | `pause` в плотном синхронном цикле не сработает | slicer включается только при debug; тест pause→stopped с таймаутом |
| R-3 | `disconnect` на паузе оставит висеть гейты/промисы | `stop()` резолвит все гейты; тест «страница жива после disconnect» |
| R-4 | Маппинг HTML↔блок (DOM-порядок, шаблоны, правки файла) | валидация манифеста, `verified:false`, чистые тесты маппинга |
| R-5 | `process.exit` в скрипте убивает адаптер | документировать; child-процесс — позже |
| R-6 | `spawnSync` в http-transport блокирует event loop адаптера | известное ограничение MVP, отметить в docs |
| R-7 | Синхронный быстрый путь деградирует | одна проверка `env.debug` на оператор; тест sync-пути |
| R-8 | Несколько invocation/потоков: стек/шаг «не тот поток» | `driveInvocation` изолирует; threadId в каждом утверждении |
| R-9 | Брейкпоинт на `Перем`/`иначе`/многострочном выражении не сработает | адаптер верифицирует по AST/карте исполняемых строк → `verified:false` |
| R-10 | `ws` с HTTPS-страницы (mixed content), несколько вкладок | dev-сервер http; одна сессия; документировать |
