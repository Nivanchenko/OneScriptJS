---

description: "Task list for Асинх/Ждать (фаза 2)"
---

# Tasks: Асинхронные методы (`Асинх`/`Ждать`, `Обещание`)

**Input**: Design documents from `specs/012-async-await/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/async-await-contract.md](contracts/async-await-contract.md)

**Tests**: обязательны (конституция, принцип III): сначала падающий тест, затем реализация.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: параллельно (другие файлы, нет зависимости от незавершённых задач)
- **[Story]**: US1 / US2 / US3
- Пути — от корня репозитория

## Phase 1: Setup

- [x] T001 Зафиксировать baseline: `pnpm typecheck && pnpm test` (62 файла, 474 теста) и
  `pnpm build`; при расхождении обновить раздел Baseline в [plan.md](plan.md)

---

## Phase 2: Foundational (парсер/AST и `Обещание`) ⚠️ БЛОКИРУЕТ ИСТОРИИ

- [x] T002 [P] Падающий `tests/parser-async.test.ts`: адаптация `ParserTests.cs` (≥ 12
  сценариев) — `Асинх Функция/Процедура` → `isAsync`, `А = Ждать Вызов().Поле` →
  `AwaitExpression` вокруг постфикса, `Ждать Операция();` как оператор, `Ждать` без
  операнда, `Ждать Ждать X`, `Асинх` не перед методом, `Асинх ПриСозданииОбъекта`,
  контекстные идентификаторы (`Перем Ждать`, `Процедура Ждать()`, `А = Ждать;`,
  `А = Ждать();`, `П.Ждать`, `Ждать = 5`), top-level `Ждать` разрешён, `Ждать` в
  синхронном методе — ошибка
- [x] T003 `src/ast/nodes.ts`: `MethodDeclaration.isAsync: boolean`,
  `AwaitExpression { kind: 'AwaitExpression'; operand: Expression }`; обновить exhaustive
  switch в интерпретаторе-заглушке при необходимости
- [x] T004 `src/parser/parser.ts`: контекстные `Асинх`/`Async` (методы модуля, импортов,
  динамического кода) и `Ждать`/`Await` (унарный префикс, операнд `parsePostfix`,
  оператор-выражение), `inAsync`/`awaitAllowed`, диагностика с позицией
- [x] T005 Довести `tests/parser-async.test.ts` до зелёного; `pnpm typecheck && pnpm test`
  (прежние 474 теста не меняются)
- [x] T006 `src/runtime/promise.ts`: `BslPromise` (`Обещание`) — состояния, `await()`,
  `resolve/reject`, `completion`, флаг `awaited`, отложенное уведомление о необработанной
  ошибке, BSL-заглушки (нет методов/свойств/конструктора), `Строка = "Обещание"`
- [x] T007 `src/runtime/context.ts` + `src/runtime/async.ts`: `pendingPromises`,
  `trackAsync`, `reportUnhandledError`, `flushPendingPromises`;
  `src/stdlib/global-context.ts`: композиция `flushAsync` (задания + `Обещания`),
  дефолтный хук необработанных ошибок (`console.error`)

**Checkpoint**: парсер разбирает `Асинх`/`Ждать`, `Обещание` создаётся и ожидается на уровне
runtime-примитивов; прежние тесты зелёные.

---

## Phase 3: User Story 1 — async-функция и `Ждать` (P1) 🎯 MVP

**Goal**: `Ждать АсинхФункция()` возвращает результат; ошибка ловится `Попыткой`; хост не
блокируется; повторное ожидание и ожидание не-`Обещания` работают.

**Independent Test**: quickstart §2.1–2.2: `5050` после паузы, `ОписаниеОшибки()` в
`Попытке`, `Ждать 42` = `42`, повторный `Ждать` даёт тот же результат.

- [x] T008 [P] [US1] Падающие тесты US1 в `tests/async-await.test.ts`: результат async-функции
  через top-level `Ждать`, порядок «маркер → результат», ошибка в точке `Ждать` (Попытка),
  ошибка до первой приостановки, повторное ожидание, ожидание не-`Обещания`, функция без
  приостановок
- [x] T009 [US1] Интерпретатор (`src/runtime/interpreter.ts`): `eval(AwaitExpression)` через
  `BslPromise.await()`; вызов async-метода — eager start через `drive()`, результат/ошибка
  в `Обещание`, параметры по значению, срез квантов при async-исполнении
- [x] T010 [US1] `src/runtime/script-object.ts`, `src/runtime/module-objects.ts`:
  экспортные async-методы возвращают `BslPromise`; хост-обвязки не требуют изменений
  (уже `MaybePromise`)
- [x] T011 [US1] Довести US1-тесты до зелёного; `pnpm typecheck && pnpm test`

**Checkpoint**: минимальный сценарий работает; MVP фазы 2 готов.

---

## Phase 4: User Story 2 — async-процедура и необработанные ошибки (P2)

**Goal**: async-процедура возвращает `Обещание` (ожидание → `Неопределено`); ошибка без
ожидания уходит в `console.error`/stderr и не роняет сценарий.

**Independent Test**: quickstart §2.3 и сценарий с падающей async-процедурой без `Ждать`:
вывод сценария на месте, ошибка в `console.error` один раз, `run()` завершается.

- [x] T012 [P] [US2] Падающие тесты US2 в `tests/async-await.test.ts`: процедура →
  `Обещание` → `Ждать` = `Неопределено`; fire-and-forget без ошибки не мешает сценарию;
  fire-and-forget с ошибкой → `console.error` один раз, сценарий продолжается; `run()`
  дожидается detached-`Обещаний` (вывод после `await run`)
- [x] T013 [US2] Довести поведение: settle процедуры, unhandled-уведомление (ровно один раз,
  подавляется при `Ждать`), flush незавершённых `Обещаний`; тесты зелёные
- [x] T014 [US2] `pnpm typecheck && pnpm test`

**Checkpoint**: обе формы async-метода и политика ошибок соответствуют контракту §2.

---

## Phase 5: User Story 3 — композиция и совместимость (P3)

**Goal**: async-методы вызывают друг друга, `Обещания` хранятся/передаются, async внутри
фоновых заданий и наоборот; старые идентификаторы `Ждать`/`Асинх` не сломаны.

**Independent Test**: скрипт с `Асинх Функцией Внешняя`, ожидающей `Внутреннюю`, даёт
результат; `Перем Ждать`/`Процедура Асинх()` работают; async-метод ждёт
`ФоновыеЗадания.ОжидатьВсе`.

- [x] T015 [P] [US3] Падающие тесты US3 в `tests/async-await.test.ts`: вложенные `Ждать`,
  `Обещание` в `Массиве`/`Структуре` и как параметр, async-метод + `Приостановить` +
  `ФоновыеЗадания.ОжидатьВсе`, job на async-метод возвращает `Обещание`, контекстные
  идентификаторы в рантайме
- [x] T016 [US3] Доделать выявленные пробелы (передача по значению, экспорт из модулей,
  job-результат), тесты зелёные; `pnpm typecheck && pnpm test`

**Checkpoint**: контракт §1–4 закрыт, все user story независимо проверяемы.

---

## Phase 6: Polish & Cross-Cutting

- [x] T017 [P] `tests/browser-async.test.ts` (happy-dom): `<one-script>` с async-функцией —
  маркер раньше результата, таймеры страницы тикают во время ожидания, необработанная
  ошибка async-процедуры попадает в `console.error` и не ломает страницу
- [x] T018 [P] `examples/async.html` (async-функция + нативный счётчик страницы) и ссылка
  из `examples/index.html`
- [x] T019 Обновить `docs/status.md` (реализовано, расхождения, число тестов),
  `docs/bsl-surface.md` (`Асинх`/`Ждать`, `Обещание`), `docs/architecture.md`
  (async-исполнение), статус спеки 012 → Implemented
- [x] T020 Финальная верификация: `pnpm typecheck && pnpm test && pnpm build`;
  `grep -c "node:" dist/onescript.js` → 0; CLI-сценарий из quickstart §4; список
  непокрытого вручную (реальный браузер) в отчёте

---

## Dependencies

```text
Phase 1
  └─▶ Phase 2 (парсер/AST + Обещание)  ← блокирует все истории
        ├─▶ US1 → US2
        ├─▶ US3 (после US1; пересекается с US2 по интерпретатору)
        └─▶ Polish после US1–US3
```

## Parallel Execution Examples

```text
T002  tests/parser-async.test.ts      # параллельно с T003 (AST)
T006  src/runtime/promise.ts          # параллельно с T004 (парсер) — разные файлы
T008  tests/async-await.test.ts (US1) # после T005/T006
T017  tests/browser-async.test.ts     # параллельно с T018 (пример)
```

## Implementation Strategy

MVP = Phase 2 + US1 (T001–T011): async-функция, `Ждать`, результат/ошибка, top-level.
Далее US2 (процедуры/unhandled), US3 (композиция/совместимость), затем браузер, пример и docs.
Не начинать US1, пока тесты парсера (T005) не зелёные, а `BslPromise` (T006) не готов.
