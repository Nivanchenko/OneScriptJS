---

description: "Task list for Фоновые задания BSL"
---

# Tasks: Фоновые задания BSL

**Input**: Design documents from `specs/011-background-jobs/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/background-jobs-contract.md](contracts/background-jobs-contract.md)

**Tests**: обязательны — конституция, принцип III (Test-First). Для каждой фазы сначала
пишется падающий тест, затем минимальная реализация.

**Organization**: задачи сгруппированы по историям; US1 → US2 → US3, фундамент (async-рантайм)
блокирует все истории.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можно делать параллельно (другие файлы, нет зависимости от незавершённых задач)
- **[Story]**: US1 / US2 / US3 — только в фазах историй
- Пути файлов — от корня репозитория

## Phase 1: Setup

- [x] T001 Зафиксировать baseline: `pnpm typecheck && pnpm test` (56 файлов, 435 тестов) и
  записать результат в `specs/011-background-jobs/plan.md` (раздел Baseline), если он устарел
- [x] T002 [P] Создать каталог `src/stdlib/tasks/` и пустой баррель `src/stdlib/tasks/index.ts`
  (экспорт `registerTasks`-заглушки), чтобы дальнейшие задачи не конфликтовали по структуре

---

## Phase 2: Foundational (async-рантайм) ⚠️ БЛОКИРУЕТ ВСЕ ИСТОРИИ

**Purpose**: генераторный интерпретатор с синхронным быстрым путём и `Приостановить` —
основа и для заданий, и для будущей фазы `Асинх`/`Ждать`.

- [x] T003 [P] Падающий тест `tests/async-runtime.test.ts`: скрипт без `Приостановить`
  исполняется синхронно (`run()` вернул `undefined`, `console.log` сразу); скрипт с
  `Приостановить(10)` возвращает Promise, вывод после `await`; `Попытка/Исключение` ловит
  ошибку, брошенную после приостановки; `Возврат`, циклы `Для`/`Пока`/`Для Каждого`,
  `Прервать`/`Продолжить` и `Перейти` работают после `Приостановить`
- [x] T004 Реализовать `src/runtime/async.ts`: `MaybePromise`, `isThenable`, `thenMaybe`,
  `yieldMaybe`, `drive(gen, { slice, beforeStep, afterStep })` с синхронным быстрым путём и
  `gen.throw` для reject, `sleep(ms)`, `yieldToHost()` (`MessageChannel` → fallback
  `setTimeout(0)`), `waitWithTimeout(promise, ms)` с обязательным `clearTimeout`
- [x] T005 Расширить контракты рантайма до `MaybePromise`: `src/runtime/context.ts`
  (`GlobalFunction`, `RuntimeEnvironment.call/construct`, `flushAsync?`),
  `src/runtime/object.ts` (`BslObject.callMethod/getProp/getIndex/setIndex`),
  `src/runtime/events.ts` (`Handler.invoke`, `raise`). Реализации-значения не меняются
- [x] T006 Конвертировать `src/runtime/interpreter.ts` в генераторы: `exec`, `eval`,
  `evalCall`, `callMethod`, циклы, `execTryExcept`, `execGotoBlock`, динамика; публичные
  методы — обёртки `drive()`. Добавить `Ctx.currentJob`, `forkForJob(task)` (общие
  `methods`/`moduleScope`/`moduleVars`/`exportedVars`/`ownerObject`, свой `Ctx`), срез квантов
  через `DriveOptions.slice`, установку/восстановление `env.currentInterpreter` на шаг
- [x] T007 Перевести мосты на `MaybePromise`: `src/runtime/script-object.ts`,
  `src/runtime/module-objects.ts`, `src/runtime/modules.ts` (`importAll`, `createInstance`),
  `src/stdlib/script.ts` (`BslScript`), `src/testing/runner.ts` (`runTests`)
- [x] T008 Обновить точки входа: `src/runtime/runner.ts` (цепочка импортов → тело →
  `flushAsync`), `src/index.ts` (`runScript`), `src/node/cli.ts` (`await run`),
  `src/browser/onescript.ts` (`Promise.resolve(run).then(binding)`), `src/browser/dom.ts` и
  `src/browser/dom-events.ts` (fire-and-forget с `.catch(console.error)`)
- [x] T009 Зарегистрировать глобальную `Приостановить`/`Sleep` в
  `src/stdlib/global-context.ts` поверх `sleep()` (`< 0` → ошибка аргумента)
- [x] T010 Сделать `tests/async-runtime.test.ts` зелёным; прогнать `pnpm typecheck && pnpm test`
  и убедиться, что все 435 прежних тестов проходят **без правок**

**Checkpoint**: sync fast-path доказан, `Приостановить` работает, обратная совместимость цела.

---

## Phase 3: User Story 1 — задание, результат и неблокирующее ожидание (P1) 🎯 MVP

**Goal**: `ФоновыеЗадания.Выполнить` → `ФоновоеЗадание` с состоянием/результатом/ошибкой;
`ОжидатьЗавершения`; основной скрипт не блокируется.

**Independent Test**: BSL-скрипт из quickstart §2.1/2.2 — маркер до результата, состояния,
`5050`, авария пишется в `ИнформацияОбОшибке`.

- [x] T011 [P] [US1] Падающие тесты `tests/background-jobs.test.ts` по US1: создание
  (`ИмяМетода`, `Объект`, `Параметры` = `Неопределено`/копия), состояния, результат функции,
  `Неопределено` для процедуры, авария + `ИнформацияОбОшибке.Описание`, `ОжидатьЗавершения` не
  бросает, маркер основного скрипта раньше результата, ожидание уже завершённого — `Истина`
- [x] T012 [P] [US1] `src/stdlib/tasks/state.ts`: состояние и RU/EN имена; добавить enum
  `СостояниеФоновогоЗадания`/`BackgroundJobState` в `src/stdlib/enums.ts`
- [x] T013 [US1] `src/stdlib/tasks/registry.ts` (минимально): добавление, перенос в конец при
  завершении, снимок в порядке «активные → завершённые», `TryRemove`, ёмкость 1000
- [x] T014 [US1] `src/stdlib/tasks/task.ts`: `BslBackgroundTask` (свойства `УникальныйИдентификатор`,
  `ИмяМетода`, `Объект`, `Состояние`, `Параметры`, `Результат`, `ИнформацияОбОшибке`;
  `ОжидатьЗавершения`), `start()` через fork+`drive` с квантами, `completion` без reject,
  перехват ошибки в `BslErrorInfo`
- [x] T015 [US1] `src/stdlib/tasks/manager.ts`: `Выполнить` с валидацией (объект, метод,
  `Параметры`-`Массив`/`Неопределено`, `Длительное` без эффекта), регистрация в реестре,
  планирование старта; `src/stdlib/tasks/index.ts` — `registerTasks(ctx)` (глобал
  `ФоновыеЗадания`/`BackgroundJobs`, `flushAsync`), вызов из `src/stdlib/global-context.ts`
- [x] T016 [US1] Довести `tests/background-jobs.test.ts` до зелёного; `pnpm typecheck && pnpm test`

**Checkpoint**: US1 работает независимо; MVP готов (после фундамента).

---

## Phase 4: User Story 2 — групповые ожидания и таймауты (P2)

**Goal**: `ОжидатьВсе`, `ОжидатьЛюбое`, `ОжидатьЗавершенияЗадач`, таймауты, аварийные задания.

**Independent Test**: quickstart §2.3 — таймаут даёт `Ложь`/`-1`, `ОжидатьЗавершенияЗадач`
бросает с перечнем аварийных, успешные удаляются из реестра.

- [x] T017 [P] [US2] Падающие тесты `tests/background-jobs-waits.test.ts`: `ОжидатьВсе`
  (успех/таймаут/пустой массив/не-задание в массиве), `ОжидатьЛюбое` (индекс/`-1`/пустой —
  ошибка), `ОжидатьЗавершенияЗадач` (успех/исключение/состав реестра после), таймаут `< 0`,
  `0` = бесконечно
- [x] T018 [US2] Реализовать в `src/stdlib/tasks/manager.ts` групповые методы поверх
  `waitWithTimeout`; для `ОжидатьЗавершенияЗадач` — снимок, исключение с перечнем аварийных,
  удаление успешных из `src/stdlib/tasks/registry.ts`
- [x] T019 [US2] Довести `tests/background-jobs-waits.test.ts` до зелёного;
  `pnpm typecheck && pnpm test`

**Checkpoint**: Все ожидания и таймауты соответствуют контракту §1.3–1.5.

---

## Phase 5: User Story 3 — реестр, фильтры, текущее задание, `Очистить` (P3)

**Goal**: диагностика и управление: порядок/вытеснение, фильтры, `ПолучитьТекущее`,
`Очистить`, недоступность `Новый МенеджерФоновыхЗаданий`.

**Independent Test**: quickstart §2.4; тесты на 1001 завершённом задании и на текущее задание
изнутри/снаружи.

- [x] T020 [P] [US3] Падающие тесты `tests/background-jobs-registry.test.ts`: порядок
  (активные/завершённые), фильтры по 4 ключам + игнор неизвестных + регистронезависимое
  `ИмяМетода`, вытеснение при 1001 (остаётся 1000, вытеснено раннее), активные не
  вытесняются, `Очистить` (не отменяет, не возвращает в реестр), `ПолучитьТекущее` внутри/вне,
  `Новый МенеджерФоновыхЗаданий` — ошибка
- [x] T021 [US3] Дозаполнить `src/stdlib/tasks/registry.ts` (порядок/вытеснение/фильтр),
  `src/stdlib/tasks/manager.ts` (`Очистить`, `ПолучитьФоновыеЗадания(Фильтр)`,
  `ПолучитьТекущее` через `env.currentInterpreter?.currentJob`), убедиться, что тип менеджера
  не зарегистрирован как конструктор
- [x] T022 [US3] Довести `tests/background-jobs-registry.test.ts` до зелёного;
  `pnpm typecheck && pnpm test`

**Checkpoint**: весь контракт §1–3 закрыт, соответствие data-model инвариантам I-B/I-C.

---

## Phase 6: Polish & Cross-Cutting

- [x] T023 [P] Браузерный тест `tests/browser-jobs.test.ts` (happy-dom): `<one-script>` с
  заданием — маркер раньше результата, таймеры страницы тикают во время `Приостановить`,
  ошибка задания не ломает страницу, `scheduleDeclarativeBinding` после завершения
- [x] T024 [P] Пример `examples/jobs.html` для ручной приёмки (quickstart §3) и ссылка из
  `examples/index.html`
- [x] T025 [P] Сверить объём с `reference/OneScript/tests/tasks.os`: воспроизвести в
  `tests/background-jobs-reference.test.ts` ≥ 15 сценариев без настоящих потоков; исключённые
  (`ТекущийПоток`, `БлокировкаРесурса`, изоляция данных, обработчики завершения, файлы,
  дочерние процессы) перечислить в комментарии и `docs/status.md`
- [x] T026 Обновить документацию: `docs/status.md` (реализовано, кооперативная модель,
  расхождение с потоками, количество тестов), `docs/bsl-surface.md` (новые имена),
  `docs/architecture.md` (async-драйвер и слой `stdlib/tasks`), таблица спек — статус
  `011-background-jobs` → «реализовано»
- [x] T027 Финальная верификация: `pnpm typecheck && pnpm test && pnpm build`;
  `grep -c "node:" dist/onescript.js` → `0`; `pnpm demo` + ручная проверка `examples/jobs.html`
  и `examples/hello.html`; показать вывод команд

---

## Dependencies

```text
Phase 1 (T001–T002)
    └─▶ Phase 2 (T003–T010)  ← блокирует ВСЕ истории
            ├─▶ Phase 3 / US1 (T011–T016)
            │       ├─▶ Phase 4 / US2 (T017–T019)
            │       └─▶ Phase 5 / US3 (T020–T022)
            └─▶ Phase 6 (T023–T027) после US1–US3
```

- US1 зависит от фундамента; US2 и US3 зависят от US1 (общие `manager.ts`/`task.ts`).
- Внутри фаз тесты идут до реализации; `[P]` — разные файлы.

## Parallel Execution Examples

```text
# Фундамент: тест и заготовка параллельно (разные файлы)
T003  tests/async-runtime.test.ts
T004  src/runtime/async.ts          (только после T003 — красный тест)

# US1: тест и enum параллельно
T011  tests/background-jobs.test.ts
T012  src/stdlib/tasks/state.ts + src/stdlib/enums.ts

# US2/US3: тесты параллельно, реализация — последовательно в manager/registry
T017  tests/background-jobs-waits.test.ts
T020  tests/background-jobs-registry.test.ts

# Polish: пример и браузерный тест параллельно
T023  tests/browser-jobs.test.ts
T024  examples/jobs.html
```

## Implementation Strategy

**MVP** = Phase 2 + US1 (T001–T016): скрипт может запустить задание, дождаться его и получить
результат/ошибку, не подвешивая страницу. Дальше — US2 (ожидания групп), US3 (реестр), затем
браузерная приёмка и документация.

Фаза 2 — самая рискованная: сначала sync fast-path и зелёные 435 тестов, только потом
async-сценарии. Не начинать US1, пока T010 не зелёный.
