# Implementation Plan: Асинхронные методы (`Асинх`/`Ждать`, `Обещание`)

**Branch**: `feature/async` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/012-async-await/spec.md`

## Summary

Добавить в язык `Асинх`-методы и оператор `Ждать` с объектом `Обещание`. Синтаксис и
диагностика портируются из парсера эталона (`DefaultBslParser`, `ParserTests`), семантика
исполнения — из 1C:Enterprise 8.3.18+ и уже реализованного фонового async-рантайма (спека 011).

Ключевые решения:

- `Асинх`/`Ждать` — **контекстные** ключевые слова: вне async-контекста и в позициях
  идентификаторов это обычные имена (`Перем Ждать;`, `Процедура Ждать()`, `Объект.Ждать`).
- Вызов async-метода немедленно возвращает непрозрачное `Обещание`; исполнение начинается
  сразу и идёт до первой приостановки, затем управление возвращается хосту.
- `Ждать` разворачивает `Обещание` (значение или исключение) и приостанавливает текущий
  логический поток; повторное ожидание кэшируется; не-`Обещание` возвращается как есть.
- **Расширение**: `Ждать` разрешён в теле модуля (иначе в нашем движке некому ожидать
  `Обещание`); в обычных синхронных методах — ошибка.
- **Расширение**: async-процедура тоже возвращает `Обещание` (ожидание → `Неопределено`).
- Ошибка async-метода хранится в `Обещании` и всплывает в `Ждать`; необработанные ошибки
  уходят в `console.error`/stderr, сценарий продолжается.
- Хост дожидается async-исполнения тела модуля и всех ещё не завершённых `Обещаний`
  (через `flushAsync`), поэтому CLI не теряет отложенные ошибки, а `<one-script>` —
  вывод и привязку обработчиков.

## Technical Context

**Language/Version**: TypeScript 5.9, strict, ES2022

**Primary Dependencies**: новых нет; используется генераторный драйвер `src/runtime/async.ts`

**Storage**: N/A (состояние `Обещаний` в памяти на время запуска)

**Testing**: Vitest — тесты парсера/AST (адаптация `ParserTests.cs`), рантайма (`Обещание`,
`Ждать`, ошибки, повторное ожидание), браузерные happy-dom; ручная — `examples/async.html`

**Target Platform**: браузер — основная среда; Node.js >= 20 — CLI и тесты

**Project Type**: runtime-библиотека / интерпретатор языка (single project)

**Performance Goals**: без регрессии прежних 474 тестов; async-вызовы без приостановок
завершаются без дополнительных таймеров; 20 async-вызовов по `Приостановить(100)` — быстрее
1 с; кванты как в спеке 011

**Constraints**: ядро без `node:*`/DOM; `dist/onescript.js` — IIFE; контекстные ключевые слова
не ломают идентификаторы `Ждать`/`Асинх`; обратная совместимость синхронных скриптов

**Scale/Scope**: парсер (+~80 строк), AST (+2 узла/поля), `src/runtime/promise.ts` (~120),
интерпретатор (+~90), `GlobalContext` (трекинг промисов, +~20), stdlib (регистрация типа,
unhandled-хук), 4–5 тестовых файлов, пример, docs

**Baseline (измерено перед планированием)**: `pnpm typecheck` ✓; `pnpm test` ✓ —
**62 файла, 474 теста**; `pnpm build` ✓; ветка `feature/async`, коммит `dbfc9b6`.

## Constitution Check

*GATE: пройден до Phase 0; перепроверен после Phase 1.*

| Принцип | Гейт | Статус | Обоснование |
|---|---|---|---|
| I. Совместимость с OneScript | Синтаксис/диагностика из эталона; расхождения зафиксированы | ✅ | Разбор и тексты ошибок — из `DefaultBslParser`/`ParserTests`; семантика 1C 8.3.18+; три расхождения (рантайм, top-level `Ждать`, handle для async-процедур) зафиксированы в [spec.md](spec.md), [research.md](research.md), `docs/status.md` и тестами |
| II. Один движок — две среды | Ядро без Node/DOM; браузерная приёмка | ✅ | `Обещание` — runtime-объект; unhandled-ошибки — через хук окружения (`console.error` в обеих средах); пример `examples/async.html` + happy-dom |
| III. Test-First | Падающий тест до реализации | ✅ | Сначала `tests/parser-async.test.ts`, `tests/async-await.test.ts`, `tests/browser-async.test.ts` (красные), затем код |
| IV. Слои и минимальный код | Направление зависимостей, без «на потом» | ✅ | `runtime` (promise, интерпретатор) → `stdlib` (регистрация) → обвязки; новых зависимостей нет; отмена/`КогдаВсе`/async HTTP исключены |
| V. Доказанное «готово» | `typecheck && test`, браузерная проверка | ✅ | Команды и ожидания — в [quickstart.md](quickstart.md) |

**Отклонения**: нет необоснованных. Top-level `Ждать` — расширение, обосновано
отсутствием платформенного цикла ожидания в нашем хосте; зафиксировано тестом.

### Post-Design Re-check (Phase 1)

Контракты не вводят Node/DOM в ядро; `Обещание` непрозрачно и не протекает в синхронный
быстрый путь. Гейты не изменились.

## Project Structure

### Documentation (this feature)

```text
specs/012-async-await/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/async-await-contract.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── lexer/                       # без изменений: все слова — Identifier
├── parser/
│   └── parser.ts                # MOD: контекстные Асинх/Ждать, parseMethod.isAsync,
│                                #      AwaitExpression, проверки контекста и диагностика
├── ast/nodes.ts                 # MOD: MethodDeclaration.isAsync, AwaitExpression
├── runtime/
│   ├── promise.ts               # NEW: BslPromise (Обещание), состояние, await, unhandled
│   ├── async.ts                 # MOD: flushPendingPromises, регистрация трекеров
│   ├── context.ts               # MOD: trackAsync/reportUnhandledError, pendingPromises,
│   │                            #      композиция flushAsync
│   ├── interpreter.ts           # MOD: AwaitExpression, вызов async-метода → BslPromise,
│   │                            #      eager start, ошибки в Обещание, срез квантов
│   ├── script-object.ts         # MOD: callExportedMethod async-методов → BslPromise
│   └── module-objects.ts        # MOD: BSL-модули/классы возвращают BslPromise
├── stdlib/
│   ├── global-context.ts        # MOD: composиция flushAsync (задания + промисы),
│   │                            #      хук необработанных ошибок
│   └── types.ts                 # MOD: `ТипЗнч`/`Тип("Обещание")` (без конструктора)
├── browser/onescript.ts         # MOD: уже дожидается run(); unhandled → console.error
└── node/cli.ts                  # MOD: unhandled → stderr (console.error), код возврата не меняется

tests/
├── parser-async.test.ts         # NEW: адаптация ParserTests.cs (12+ сценариев) + AST
├── async-await.test.ts          # NEW: US1–US3: результат, ошибка, повтор, не-обещание,
│                                #      async-процедура, top-level, композиция, идентификаторы
└── browser-async.test.ts        # NEW: <one-script>, отзывчивость, необработанные ошибки

examples/
└── async.html                   # NEW: ручная приёмка (async-функция + счётчик страницы)
```

**Structure Decision**: single project; `Обещание` живёт в `src/runtime` (нужен интерпретатору
и `GlobalContext`), публичная регистрация — в `stdlib`.

## Implementation Phases

### Phase A — парсер и AST (TDD)

1. AST: `MethodDeclaration.isAsync: boolean`, `AwaitExpression { operand }`.
2. Парсер: `isMethodStart()` c `Асинх`/`Async` перед `Процедура`/`Функция` (модуль,
   импорт, динамический код); `parseMethod` читает модификатор и ставит `inAsync`;
   `parseUnary` разбирает `Ждать`/`Await` как унарный префикс с операндом-`parsePostfix()`;
   контекстные проверки: await только в async-методе или теле модуля; `Ждать` без операнда,
   двойной `Ждать`, `Асинх` не перед методом, `Асинх ПриСозданииОбъекта` — ошибки с позицией.
3. Тесты `tests/parser-async.test.ts` — адаптация `ParserTests.cs` + наши расширения.

### Phase B — `Обещание` и исполнение

4. `src/runtime/promise.ts`: состояние pending/fulfilled/rejected, `await()`,
   `completion` для flush, трекинг в окружении, отложенное сообщение о необработанной ошибке.
5. Интерпретатор: `eval(AwaitExpression)` → `yield*` ожидания; вызов async-метода →
   eager start через `drive()`, результат/ошибка — в `BslPromise`; параметры по значению;
   async-методы в модулях/классах (`callExportedMethod`); срез квантов при async-исполнении.
6. Окружение: `GlobalContext.trackAsync`/`reportUnhandledError`/`pendingPromises`;
   `flushAsync` ждёт задания и незавершённые `Обещания`; хосты печатают необработанные ошибки.
7. Тесты `tests/async-await.test.ts`: все user story и edge cases.

### Phase C — браузер, пример, документация

8. `examples/async.html` + ссылка в `examples/index.html`; `tests/browser-async.test.ts`.
9. `docs/status.md` (реализовано, расхождения, тесты), `docs/bsl-surface.md` (синтаксис
   `Асинх`/`Ждать`, `Обещание`), `docs/architecture.md` (async-исполнение и `Обещание`).
10. `pnpm typecheck && pnpm test && pnpm build`; greps на Node-зависимости; ручная проверка.

## Risks & Mitigations

| Риск | Митигация |
|---|---|
| Контекстные ключевые слова ломают идентификаторы `Ждать`/`Асинх` | позиционная логика по образцу `Новый`; тесты эталонных случаев (`Перем Ждать`, `Процедура Ждать`, `П.Ждать`, `Ждать = 5`); без токенов ле��сера |
| Неоднозначность `Ждать(...)` (имя метода vs await) | как в эталоне: `Ждать (` трактуется как вызов идентификатора; документируется |
| Top-level `Ждать` конфликтует с переменной `Ждать` | await распознаётся только если следующий токен начинает выражение; иначе — идентификатор |
| Ошибка до первой приостановки | async-вызов ловит её и кладёт в `BslPromise`; наружу не бросает |
| Необработанные обещания и порядок flush | трекинг `completion` в окружении; unhandled-сообщение отложено и подавляется при `Ждать`; flush ждёт все |
| Дедлок взаимного ожидания | не детектируется (как в 1C/заданиях), документируется |
| Смешение с фоновыми заданиями | async-методы не попадают в реестр заданий; job на async-метод возвращает `Обещание` как результат (документируется) |

## Complexity Tracking

Нарушений конституции нет. `Обещание` — непрозрачный runtime-объект и не усложняет
синхронный путь: без async-вызовов `run()` остаётся синхронным.
