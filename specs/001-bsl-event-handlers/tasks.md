---

description: "Task list for feature 001-bsl-event-handlers"
---

# Tasks: События BSL — подписка и вызов обработчиков

**Input**: Design documents from `specs/001-bsl-event-handlers/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/event-handler-contract.md](contracts/event-handler-contract.md), [quickstart.md](quickstart.md)

**Tests**: Обязательны — принцип III конституции (Test-First, NON-NEGOTIABLE). Каждый
нетривиальный шаг начинается с падающего теста Vitest в `tests/`.

**Organization**: Задачи сгруппированы по историям из `spec.md`; каждая история
завершается независимой проверкой.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можно делать параллельно (разные файлы, нет зависимости от незавершённых задач)
- **[Story]**: к какой истории относится задача (US1, US2, US3)
- В описании — точный путь к файлу

## Path Conventions

Single project (см. `plan.md`): `src/`, `tests/` в корне репозитория.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Зафиксировать базовую линию до изменений.

- [x] T001 Подтвердить базовую линию и записать вывод: `pnpm typecheck`, `pnpm test` (ожидается 43 файла / 300 тестов), `node scripts/run-reference-tests.mjs` (ожидается 18/66); проверить, что `events.os` падает на разборе (строка 57)

**Baseline (T001, факт)**: `pnpm typecheck` ✓; `pnpm test` — 54 файла / 398 тестов зелёные;
`node scripts/run-reference-tests.mjs` — 18/66; `events.os` — `Ошибка разбора: ожидается ';'`
(строка 57, колонка 21). Ожидание «43 файла / 300 тестов» устарело: база выросла после
спек 008–010.

**Checkpoint**: база известна, регрессию можно измерять.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Общая инфраструктура, без которой не работает ни одна история.

**⚠️ CRITICAL**: задачи US1–US3 не начинаются, пока фаза не завершена.

- [x] T002 [P] Добавить AST-узлы `AddHandlerStatement` / `RemoveHandlerStatement` в `src/ast/nodes.ts` и включить их в union `Statement`; поля строго по `data-model.md` §1: `eventSource: Expression`, `eventName: Expression`, `handlerTarget: Expression | null`, `handlerMethod: Expression`
- [x] T003 [P] Добавить опциональный `hasMethod?(name: string): boolean` в интерфейс `BslObject` в `src/runtime/object.ts` (не менять существующие реализации)
- [x] T004 [P] Написать падающие unit-тесты реестра в `tests/events-registry.test.ts`: порядок вызовов, дедупликация по `(target по ссылке, method.toLowerCase())`, `raise` без подписчиков = no-op, независимость источников, исключение в обработчике прерывает цепочку и не перехватывается (FR-010)
- [x] T005 Реализовать `EventProcessor` в `src/runtime/events.ts`: `Map<BslObject, Map<string, Handler[]>>`; `Handler { target: BslObject; method: string; invoke: (args: Value[]) => Value }`; `add` (дедупликация по `(target, method.toLowerCase())`; при `local: true` проверка `hasMethod` не выполняется) и `raise` (список копируется перед обходом, исключения обработчиков не перехватываются) — сделать T004 зелёным
- [x] T006 [P] Подключить реестр к окружению: `events?: EventProcessor` в `RuntimeEnvironment` (`src/runtime/context.ts`) и создание экземпляра в `createGlobalContext` (`src/stdlib/global-context.ts`)
- [x] T007 Написать падающий тест в `tests/events.test.ts`: `ЭтотОбъект` возвращает объект-модуль, у которого вызывается метод
- [x] T008 Создать `ScriptModuleObject implements BslObject` в `src/runtime/script-object.ts`: `typeName = 'Сценарий'`, `callMethod` → `interpreter.invokeMethod`, `hasMethod` → новый `interpreter.isExported(name)` (добавить в `src/runtime/interpreter.ts`); `getProp`/`setProp`/`getIndex`/`setIndex` бросают ошибку; пометить `shortcut:` про модульные переменные (см. `plan.md`, Complexity Tracking); добавить в `src/runtime/interpreter.ts` разрешение идентификатора `ЭтотОбъект`/`ThisObject` (после области видимости и глобалов) → ленивый `ScriptModuleObject` — сделать T007 зелёным
- [x] T009 Добавить в `Interpreter.evalCall` обработку `ВызватьСобытие`/`RaiseEvent`: имя → `toStringValue(args[0])`, параметры — элементы `BslArray` через `iterate()` (иначе пустой массив), доставка через `env.events` на объекте текущего модуля; тест-первым в `tests/events.test.ts`

**Checkpoint**: реестр, объект-модуль и встроенные имена работают; можно начинать истории.

---

## Phase 3: User Story 1 - Подписка на событие и вызов обработчика (Priority: P1) 🎯 MVP

**Goal**: `ДобавитьОбработчик Источник.Событие, Обработчик` регистрирует подписку, а
`ВызватьСобытие` из метода источника доставляет параметры обработчику синхронно.

**Independent Test**: Скрипт создаёт источник через `ЗагрузитьСценарийИзСтроки`, подписывает
метод и объявляет событие с параметрами — обработчик вызван ровно один раз, параметры
пришли в том же порядке.

### Tests for User Story 1 ⚠️ (сначала — красные)

- [x] T010 [P] [US1] Дописать в `tests/events.test.ts` сценарии US1: подписка + событие с двумя параметрами (вызов 1, порядок `"П1"`, `"П2"`); событие без подписчиков — тишина; синхронность (к моменту возврата из `СгенерироватьСобытие` обработчик отработал); исключение в обработчике доходит до кода, объявившего событие

### Implementation for User Story 1

- [x] T011 [P] [US1] Парсер: `KW_ADD_HANDLER = {добавитьобработчик, addhandler}` и `parseHandler('add')` в `src/parser/parser.ts` — разбор member-источника `Объект.Событие` и обработчика в формах `Identifier` (`handlerTarget = null`) / member; индексные формы и сообщения об ошибках — в US3; тесты разбора — в `tests/parser.test.ts`
- [x] T012 [P] [US1] Интерпретатор: `case 'AddHandlerStatement'` в `exec` (`src/runtime/interpreter.ts`) — вычислить `eventSource`, `eventName`, `handlerTarget` (`null` → `scriptObject` с `local: true`; объектная форма → `local: false`), `handlerMethod`; вызвать `env.events.add(...)`
- [x] T013 [US1] Сделать сценарии T010 зелёными; прогнать `pnpm typecheck && pnpm test`

**Checkpoint (MVP)**: подписка и доставка работают; `tests/events.test.ts` (US1) зелёные.

---

## Phase 4: User Story 2 - Отписка и независимость подписок (Priority: P2)

**Goal**: `УдалитьОбработчик` снимает подписку; повторная подписка не дублирует вызов;
несколько событий одного источника независимы.

**Independent Test**: Подписать обработчик, вызвать событие, снять подписку, вызвать снова —
второго вызова нет.

### Tests for User Story 2 ⚠️ (сначала — красные)

- [x] T014 [P] [US2] Дописать в `tests/events.test.ts` сценарии US2: отписка → 0 вызовов; отписка без подписки — без ошибки; повторная подписка → ровно 1 вызов; три разных обработчика на одно событие → 3 вызова в порядке подписки (SC-002); один метод на двух событиях одного источника — независимость

### Implementation for User Story 2

- [x] T015 [P] [US2] Добавить `remove` в `src/runtime/events.ts` (отсутствующая подписка — no-op; удаление не меняет порядок остальных); дедупликация и `raise` уже реализованы в T005
- [x] T016 [P] [US2] Парсер: `KW_REMOVE_HANDLER = {удалитьобработчик, removehandler}` и `parseHandler('remove')` в `src/parser/parser.ts` → `RemoveHandlerStatement`; тесты разбора — в `tests/parser.test.ts`
- [x] T017 [P] [US2] Интерпретатор: `case 'RemoveHandlerStatement'` в `exec` (`src/runtime/interpreter.ts`) → `env.events.remove(...)`
- [x] T018 [US2] Сделать T014 зелёными; регрессия `pnpm typecheck && pnpm test`

**Checkpoint**: US1 и US2 работают независимо.

---

## Phase 5: User Story 3 - Формы записи и ошибки (Priority: P3)

**Goal**: Динамические имена событий и обработчиков, локальный метод модуля, точные
ошибки разбора и ошибка «Метод объекта не обнаружен» для неэкспортного метода.

**Independent Test**: Подписка `Источник["Мое" + "Событие"]` на локальный метод
`ОбработчикМодуля` (неэкспортный) срабатывает; неверная форма даёт локализованную ошибку.

### Tests for User Story 3 ⚠️ (сначала — красные)

- [x] T019 [P] [US3] Дописать в `tests/events.test.ts` сценарии US3: индексные формы источника/имени/метода; локальный (неэкспортный) метод по имени срабатывает при одноимённой переменной (выбирается метод); неэкспортный метод через `ЭтотОбъект` → «Метод объекта не обнаружен»; английские алиасы `AddHandler`/`RemoveHandler`/`RaiseEvent`/`ThisObject`

### Implementation for User Story 3

- [x] T020 [US3] Парсер (`src/parser/parser.ts`): поддержка `IndexExpression` для источника и обработчика; проверка формы с сообщениями и позицией из `contracts/event-handler-contract.md` §2 («Ожидается имя события» / «Ожидается имя обработчика события»); тесты разбора — в `tests/parser.test.ts`
- [x] T021 [US3] Включить экспортную проверку только для объектной формы: `EventProcessor.add` при `local: false` вызывает `target.hasMethod(method)` и бросает `Метод объекта не обнаружен (<имя>)`; добавить экспортный `hasMethod` в `BslScript` (`src/stdlib/script.ts`); локальная форма (`local: true`) идёт мимо проверки и вызывает метод через `interpreter.invokeMethod`
- [x] T022 [US3] Английские алиасы: `ThisObject`, `AddHandler`, `RemoveHandler`, `RaiseEvent` в `src/parser/parser.ts` и `src/runtime/interpreter.ts` (тесты уже в T019)
- [x] T023 [US3] Сделать T019 зелёными; регрессия `pnpm typecheck && pnpm test`

**Checkpoint**: все формы и диагностика соответствуют контракту.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T024 [P] Браузерная приёмка: `tests/browser-events.test.ts` на happy-dom — `<one-script>` с `ДобавитьОбработчик` и объявлением события, проверка вывода через `console.log`
- [ ] T025 [P] Проверить ядро на изоляцию сред: в `src/lexer`, `src/parser`, `src/ast`, `src/runtime`, `src/stdlib` нет импортов `node:*`, `fs`, `path`, `document`, `window` (grep); собрать `pnpm build:browser`
- [ ] T026 [P] Обновить документацию: `docs/status.md` (T44 закрыт, отложенный полный прогон `events.os` → T39) и отметка T44 в `docs/plan.md`
- [ ] T027 Финальная проверка по `quickstart.md` и `plan.md` → Verification: `pnpm typecheck && pnpm test`, `pnpm build`, `node scripts/run-reference-tests.mjs` (не хуже 18/66); зафиксировать вывод

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: без зависимостей.
- **Foundational (T002–T009)**: после T001; **блокирует** US1–US3.
  - T005 после T004 (тест-первым); T004 [P] параллельно с T002/T003.
  - T006 [P] параллельно с T002–T005.
  - T007 → T008 (тест-первым: сначала красный тест на `ЭтотОбъект`).
  - T008 → T009 (оба `interpreter.ts` и `tests/events.test.ts` — последовательно).
- **US1 (T010–T013)**: после Foundational.
- **US2 (T014–T018)**: после US1 (общие файлы `parser.ts`, `interpreter.ts`, `events.ts`).
- **US3 (T019–T023)**: после US1; пересекается с US2 по файлам, поэтому выполняется после него.
- **Polish (T024–T027)**: после всех историй.

### User Story Dependencies

- **US1 (P1)**: MVP, ни от чего не зависит после Foundational.
- **US2 (P2)**: расширяет US1 (`remove`, парсер `УдалитьОбработчик`), проверяется собственными сценариями.
- **US3 (P3)**: расширяет US1/US2 формами и диагностикой; независимо тестируется через T019.

### Within Each User Story

- Сначала тесты (красные) → потом реализация → затем прогон и регрессия.
- US1 (MVP) завершается целиком до US2; US2 — до US3.

### Parallel Opportunities

- Phase 2: T002, T003, T004, T006 — разные файлы.
- US1: T010, T011, T012 — разные файлы (`tests/events.test.ts`, `parser.ts`, `interpreter.ts`).
- US2: T014–T017 — разные файлы (`events.test.ts`, `events.ts`, `parser.ts`, `interpreter.ts`).
- Polish: T024, T025, T026 — независимы.

---

## Parallel Example: Developer A (US1)

```text
T010 — tests/events.test.ts (сценарии US1, красные)
T011 — src/parser/parser.ts (parseHandler 'add')
T012 — src/runtime/interpreter.ts (exec AddHandlerStatement)
T013 — прогон и регрессия
```

## Implementation Strategy

### MVP First (US1)

1. T001 + T002–T009 (Foundational).
2. T010–T013 (US1) → **STOP и VALIDATE** сценарии US1 независимо.
3. Только после этого US2 → US3.

### Incremental Delivery

1. Foundational → каркас событий.
2. US1 → подписка и доставка (MVP).
3. US2 → отписка/дубликаты.
4. US3 → формы и диагностика.
5. Polish → браузер, документация, финальная проверка.

---

## Notes

- [P] — разные файлы, без зависимости от незавершённых задач.
- Тесты пишутся до реализации и сначала должны падать (принцип III).
- Коммиты — только по явной просьбе пользователя; в задачи не входят.
- `events.os` целиком не входит в приёмку (T39: `ПодключитьСценарий`) — см. `plan.md`, Complexity Tracking.
- Экспортные ограничения касаются только объектной формы подписки; голый идентификатор
  (локальный метод) — всегда допустим (см. `research.md` R4, `data-model.md` §2).
