# Implementation Plan: HTTP-клиент BSL (HTTPСоединение, HTTPЗапрос, HTTPОтвет)

**Branch**: `feat/http_query` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-http-client/spec.md`

## Summary

Перенести в движок стандартную библиотеку HTTP-клиента OneScript: объекты
`HTTPСоединение`/`HTTPConnection`, `HTTPЗапрос`/`HTTPRequest`, `HTTPОтвет`/`HTTPResponse`
с семантикой `reference/OneScript/src/OneScript.StandardLibrary/Http/`. Сценарий-цель —
BSL-скрипт внутри `<one-script>` получает данные с бэкенда: `Получить` → `HTTPОтвет` →
`ПолучитьТелоКакСтроку`.

Ключевое техническое решение — **синхронный транспорт, подменяемый платформой**:

- ядро (`src/stdlib/http.ts`) строит URL, заголовки, тело, разбирает ответ и не знает,
  как выполняется запрос;
- браузер (`src/browser/http-transport.ts`) выполняет запрос через синхронный
  `XMLHttpRequest` с binary-safe трюком `charset=x-user-defined`;
- Node (`src/node/http-transport.ts`, вспомогательная среда) запускает дочерний процесс
  `node -e` с `fetch` и `spawnSync` (в Node нет синхронного HTTP; тот же приём использует
  `happy-dom` в `SyncFetch`).

Движок остаётся синхронным (в нём нет `Асинх`/`Ждать`) — это сохраняет семантику эталона
и не трогает ВМ.

## Technical Context

**Language/Version**: TypeScript 5.9, strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`), ES2022

**Primary Dependencies**: новых нет; браузер — `XMLHttpRequest`, Node — `node:child_process` и `fetch` в дочернем процессе

**Storage**: N/A (тело запроса/ответа в памяти)

**Testing**: Vitest; `happy-dom` — браузерный транспорт через `fetch.interceptor.beforeSyncRequest`; локальный эхо-сервер в отдельном процессе — интеграция Node-транспорта

**Target Platform**: браузер — основная среда; Node.js >= 20 — вспомогательная (CLI, тесты)

**Project Type**: runtime-библиотека / интерпретатор языка (single project)

**Performance Goals**: без деградации существующего набора (51 файл / 370 тестов); один HTTP-вызов — O(размер тела), без промежуточных копий сверх необходимых

**Constraints**: ядро (`src/lexer`, `src/parser`, `src/ast`, `src/runtime`, `src/stdlib`) не импортирует `node:*` и не обращается к DOM; `dist/onescript.js` — единый IIFE-бандл; `pnpm typecheck` и `pnpm test` зелёные

**Scale/Scope**: 1 новый модуль ядра (~300 строк), 2 транспорта (~60 и ~70 строк), правки 4 файлов контекста/хелперов, 2 тестовых файла

**Baseline (измерено перед планированием)**: `pnpm typecheck` ✓; `pnpm test` ✓ — **51 файл, 370 тестов**; `docs/status.md` устарел (там 43/300) — обновляется по завершении.

## Constitution Check

*GATE: пройден до Phase 0; перепроверен после Phase 1.*

| Принцип | Гейт | Статус | Обоснование |
|---|---|---|---|
| I. Совместимость с OneScript | Русские и английские имена; сверка с эталоном | ✅ | Имена/сигнатуры из `HttpConnectionContext`, `HttpRequestContext`, `HttpResponseContext`; расхождения зафиксированы в [research.md](research.md) и тестах |
| II. Один движок — две среды | Ядро без Node/DOM; браузерная приёмка | ✅ | Ядро — только транспортный интерфейс; XHR и child-process живут в `src/browser/` и `src/node/`; браузерный сценарий проверяется happy-dom-тестом |
| III. Test-First | Падающий тест до реализации | ✅ | Сначала `tests/http.test.ts` (красный) на фейковом транспорте и `tests/http-browser.test.ts`; затем реализация |
| IV. Слои и минимальный код | Направление зависимостей, отсутствие «на потом» | ✅ | `runtime → stdlib → platform`; новых зависимостей нет; исключения (прокси, SSL, файлы, потоки) названы, а не спрятаны |
| V. Доказанное «готово» | `typecheck && test`, браузерная проверка | ✅ | Команды и ожидаемый результат — в [quickstart.md](quickstart.md) |

**Отклонения (обоснованы ниже)**: синхронный XHR блокирует страницу; Node-транспорт —
дочерний процесс на запрос. Оба — следствие синхронной модели языка и среды, а не
архитектурный выбор.

### Post-Design Re-check (Phase 1)

Контракты не вводят Node/DOM-зависимостей в ядро; транспортный интерфейс остаётся
чистым типом. Гейты не изменились, отклонений по-прежнему два.

## Project Structure

### Documentation (this feature)

```text
specs/010-http-client/
├── plan.md              # этот файл
├── research.md          # Phase 0: решения и альтернативы
├── data-model.md        # Phase 1: сущности и инварианты
├── quickstart.md        # Phase 1: сценарии проверки
├── contracts/
│   └── http-client-contract.md   # Phase 1: BSL-поверхность и транспорт
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── stdlib/
│   ├── http.ts                 # новый: BslHttpConnection/Request/Response + registerHttpFunctions
│   ├── binary.ts               # + экспорт encodeText/decodeText/toBase64 для HTTP
│   └── global-context.ts       # + createGlobalContext(httpTransport?)
├── browser/
│   ├── http-transport.ts       # новый: синхронный XMLHttpRequest
│   └── context.ts              # + передать браузерный транспорт
├── node/
│   ├── http-transport.ts       # новый: spawnSync node -e fetch
│   └── context.ts              # + передать Node-транспорт
└── index.ts                    # + экспорт типа HttpTransport

tests/
├── http.test.ts                # новый: BSL-поверхность на фейковом транспорте
└── http-browser.test.ts        # новый: браузерный транспорт в happy-dom
```

**Structure Decision**: single project, слои уже зафиксированы конституцией. Ядро
получает транспорт параметром — так `src/stdlib` остаётся Node/DOM-совместимым, а
`src/browser` и `src/node` содержат только платформенные реализации.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Синхронный XHR в браузере (блокирует UI, deprecated в основных потоках) | Язык и эталон синхронны; `Асинх`/`Ждать` в ВМ нет | Асинхронный HTTP потребовал бы переписать ВМ на async/await — отдельный проект, несовместимый с эталонной семантикой вызова |
| Node-транспорт через `spawnSync` (дочерний процесс на запрос) | В Node нет синхронного HTTP; CLI/тесты должны работать без переписывания движка | `http.request` асинхронен; блокировать event loop до ответа без worker/Atomics нельзя. Приём проверен `happy-dom` (`SyncFetch`) |
| Тело ответа целиком в памяти | В браузере нельзя писать временные файлы, как делает эталон для >5 МБ | Файловый режим нереализуем в браузере; для «получить данные с бэка» достаточно нескольких МБ (помечено в коде `shortcut:`) |
| Спец-заголовки (`Content-Type`, `Date`, `Range`, `Expect`) передаются как обычные | XHR/fetch сами управляют служебными заголовками; `.NET`-специфичная возня не нужна | Повторять `SetRequestHeaders` из эталона — мёртвый код для браузера; поведение покрывается обычной передачей `Заголовки` |
