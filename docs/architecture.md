# Архитектура OneScriptJS: карта «C# → TypeScript»

Этот документ — ориентир для переноса движка OneScript (C#) на TypeScript.
Он описывает слои оригинала и то, куда они лягут в нашем репозитории.

Источник: `reference/OneScript/docs/developer_docs.md`.

## Общая картина

OneScript — открытая реализация языка, совместимого с 1С/BSL, поверх стековой
виртуальной машины. Конвейер исполнения:

```
исходный код (.osjs / <script type="text/osjs">)
  → лексер (LexicalAnalysis)
  → препроцессор (#Если / #Область / #Использовать)
  → загрузчик импортов (файлы из #Использовать → модуль/класс)
  → парсер (SyntaxAnalysis → AST)
  → компилятор (CompilerFrontend → байткод)
  → стековая ВМ (MachineInstance / StackMachineExecutor)
  → стандартная библиотека (глобальные контексты)
```

## Слои C# и их TypeScript-аналоги

### 1. OneScript.Language → `src/lexer`, `src/parser`, `src/ast`

Преобразует исходник в токены и AST. Максимально независимый слой.

- `LexicalAnalysis/*` — лексер: состояния `String`/`Number`/`Comment`/`PreprocessorDirective`.
- `SyntaxAnalysis/*` — парсер и AST (`ModuleNode`, `MethodNode`, `CallNode`,
  `*LoopNode`, `BinaryOperationNode`/`UnaryOperationNode` и др.),
  препроцессор (`PreprocessingLexer`, `PreprocessorHandlers`, обработчики директив).
- Диагностика: `CodeError`, `ErrorPositionInfo`, `SyntaxErrorException`.

### 2. OneScript.Core → `src/runtime` (типы и значения)

Объектный каркас значений BSL, контексты, отражение.

- `Values/*` — `BslValue` и производные (строки/числа/дата/`Null`/`Undefined`/`Type`),
  ссылки на значения, сравнения и преобразования.
- `Contexts/*` — атрибуты `ContextClass`/`ContextMethod`/`ContextProperty`,
  построители `Bsl*Info`, отражение классов.
- `Compilation/Binding/*` — таблицы символов и привязка имён.

### 3. ScriptEngine → `src/runtime` (ВМ)

Стековая виртуальная машина и компилятор для неё.

- `Compiler/*` — `CompilerFrontend`, `StackMachineCodeGenerator` (байткод).
- `Machine/*` — `MachineInstance`/`StackMachineExecutor` (командный цикл, стек,
  кадры, исключения, итераторы), `ExecutionContext`, `BuiltinFunctions`.
- `Hosting/*`, `ScriptingEngine.cs` — фасад движка, DI, загрузка сборок.

### 4. OneScript.StandardLibrary → `src/stdlib`

Стандартные прикладные классы BSL: массивы, строки, файлы, сеть, фоновые задания
(`src/stdlib/tasks/`) и т.д. Глобальные функции вроде `Сообщить`/`Message`
(вывод в `console.log`) и `Приостановить`/`Sleep` (кооперативная пауза).
Двуязычные псевдонимы: `РусИмя`/`EngName`.

### 5. oscript / ScriptEngine.HostedScript → `src/node` (CLI)

Консольный хост для запуска `.osjs`-скриптов и встраивание движка в приложения.
`.os` тоже принимается (общая грамматика BSL), но это чужой формат — см.
[`specs/013-osjs-format`](../specs/013-osjs-format/spec.md).

### 6. Веб-обёртки → `src/browser/onescript.ts`

Браузерное исполнение: сбор `<script type="text/osjs">` в порядке документа и запуск
каждого блока в своём контексте (спека 016). Блок с атрибутом `src` скачивает внешний
`.osjs` через `fetch` (URL относительно `document.baseURI`) и исполняет его; импорты
внутри файла разрешаются от URL файла (спека 019). Прежний кастомный элемент не
поддерживается: он не регистрируется, его содержимое не исполняется. Вывод
`Сообщить()` идёт через стандартную библиотеку в `console.log`.

### 7. Импорт файлов → `src/runtime/modules.ts`, `src/runtime/module-objects.ts`

Упрощённый аналог библиотек OneScript: `#Использовать "<файл>"` загружает модуль
(синглтон с экспортными членами) или класс (`ПриСозданииОбъекта`, создание через
`Новый`). Кеш импорта живёт на время `run()`; запись `loading` создаётся до
исполнения тела, поэтому циклы не зацикливаются. Платформенное чтение источников
изолировано: `src/node/module-source.ts` (fs/path) и `src/browser/module-source.ts`
(fetch/URL); ядро получает готовую карту исходников. Загрузчик сохраняется в
`GlobalContext`, поэтому `ЗагрузитьСценарийИзСтроки` использует тот же кеш и разрешение
путей; Node дополнительно умеет лениво читать файл через `loadSource`.

### 8. Async-рантайм и фоновые задания → `src/runtime/async.ts`, `src/stdlib/tasks/`

`exec`/`eval` интерпретатора — генераторы: на точке приостановки они отдают `Promise`,
а драйвер `drive()` до первого `yield` исполняет всё синхронно и возвращает обычное
значение. Поэтому скрипт без ожиданий остаётся синхронным, а `Приостановить` и ожидания
фоновых заданий делают исполнение асинхронным. `gen.throw` доставляет отказ в точку
`yield`, поэтому `Попытка/Исключение` и сигналы `Возврат`/`Прервать`/`Перейти` работают
без переписывания.

Фоновые задания — кооперативные логические потоки в одном JS-потоке: общий модульный
контекст (методы, переменные, `ЭтотОбъект`), у каждого задания свой `Ctx` (ошибка,
текущее задание) и срез квантов (`TimeSlicer` + `yieldToHost`), чтобы страница не
замирала. Реестр заданий повторяет порядок/вытеснение эталона; менеджер доступен как
глобальное `ФоновыеЗадания`, а `run()` после тела скрипта дожидается активных заданий
через `GlobalContext.flushAsync`.

### 9. Асинхронные методы → парсер + `src/runtime/promise.ts` + интерпретатор

`Асинх`/`Ждать` — контекстные ключевые слова: парсер распознаёт их только в позиции
модификатора метода и унарного оператора (вне async-контекста это обычные идентификаторы).
Вызов async-метода сразу создаёт `Обещание` и запускает тело через `drive()` до первой
приостановки; результат/ошибка кэшируются в `Обещании`, а `Ждать` приостанавливает текущий
генератор до settle. Ошибка до первой приостановки не бросается вызывающему, а попадает в
`Обещание`. Необработанные ошибки откладываются и уходят в хук окружения
(`console.error`/stderr). `GlobalContext` учитывает незавершённые `Обещания`, и общий
`flushAsync` ждёт и фоновые задания, и `Обещания`, поэтому script-блоки в браузере
и CLI не теряют отложенный вывод и ошибки; при отсутствии работы запуск остаётся
синхронным.

### 10. Редакторные инструменты `.osjs` → `src/lsp`, `editors/osjs/`

Редакторо-независимый слой для нашего формата: TextMate-грамматика и конфигурация языка
в `editors/osjs/` (плюс `languages.json` и `NOTICE.md`), каталог API и LSP-сервер.
`.os` эти артефакты не заявляют — он остаётся у чужого расширения (спека 013).

- `scripts/build-api-catalog.mjs` парсит таблицы [`docs/reference.md`](reference.md) и
  генерирует `src/lsp/generated/api-catalog.ts` (коммитится; drift-тест и сверка с `src/`).
  Команда — `pnpm build:catalog`.
- `src/lsp/analysis.ts` — конвейер толерантных лексера/препроцессора/парсера, таблицы
  символов и сбор диагностик; `diagnostics.ts`, `completion.ts`, `hover.ts`,
  `semantic-tokens.ts`, `symbols.ts`, `document.ts`, `server.ts` (`registerHandlers`).
- Embedded-режим (спека 015, слой A): `src/lsp/html-blocks.ts` находит
  `script[type="text/osjs"]` в HTML, `src/lsp/embedded.ts` анализирует блоки тем же
  анализатором и переносит диапазоны в координаты HTML; `.html` не заявляется — сервер
  обслуживает его только если клиент прислал документ.
- Клиент VS Code — `extensions/vscode/` (спека 017): манифест языка/грамматики, запуск
  `server.mjs` на Node-рантайме VS Code, HTML по настройке `embeddedInHtml`, сборка
  `.vsix` (`pnpm build:vscode`). Собственных провайдеров не содержит.
- Embedded language mode (спека 018): инъекционная грамматика
  `editors/osjs/osjs-embedded.tmLanguage.json` (`injectTo text.html.basic`) размечает
  содержимое `script[type="text/osjs"]` и включает `source.osjs`; `embeddedLanguages`
  включает BSL-`language-configuration` в регионе.
- `src/node/lsp-server.ts` — stdio-точка входа, сборка `dist/lsp/server.mjs`
  (`vite.lsp.config.ts`, `pnpm build:lsp`). `src/node` — единственное место с Node-API;
  `src/lsp` не импортирует `node:*` (страж `tests/lsp-boundaries.test.ts`).
- Толерантные entry points (`tokenizeTolerant`, `parseTolerant`,
  `preprocessScript(tokens, { errors })`) аддитивны: поведение `parse()`/`tokenize()` и
  семантика исполнения не меняются, браузерный бандл не затрагивается.

## Статус переноса

Язык и стандартная библиотека переносятся по спецификациям `specs/`; реализованы
`001`, `008`–`014` (см. сводку в `docs/status.md`).
