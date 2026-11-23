---

description: "Task list for feature 006 — разрешение имён в Выполнить/Вычислить"

---

# Tasks: Разрешение имён в `Выполнить` и `Вычислить`

**Input**: Design documents from `/specs/006-dynamic-names/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/dynamic-name-resolution.md](./contracts/dynamic-name-resolution.md),
[quickstart.md](./quickstart.md)

**Tests**: ОБЯЗАТЕЛЬНЫ (конституция III, TDD): каждый поведенческий шаг начинается с
падающего теста Vitest; красный тест — разрешение на реализацию.

**Organization**: истории US1 (P1) и US2 (P2); общий механизм — предварительный проход
по AST. US1 — видимость/изоляция; US2 — ошибка до исполнения.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: параллельно (разные файлы, нет зависимостей)
- **[Story]**: US1–US2 для фаз историй
- В описании — точные пути файлов

## Phase 1: Setup

- [X] T001 Зафиксировать baseline: `pnpm typecheck && pnpm test` зелёные (ожидается
  861 тест / 86 файлов); прогнать `node scripts/run-reference-tests.mjs` (после
  `pnpm build:node`) и сохранить текущие падения `eval.os`, в частности
  `ТестДолжен_ПроверитьВызовыВыполнитьСПопытками` → `013457+`. Хвост вывода — в отчёт.

## Phase 2: Foundational (блокирует обе истории)

- [X] T002 [P] `src/runtime/context.ts`: добавить опциональный
  `hasFunction?(name: string): boolean` в `RuntimeEnvironment` и реализовать в
  `GlobalContext` (`this.functions.has(name.toLowerCase())`). Поведение не меняется;
  окружения без предиката сохраняют прежний путь (см. contracts C6).

**Checkpoint**: интроспекция глобальных функций доступна; истории можно вести дальше.

---

## Phase 3: User Story 1 — динамический код видит окружение вызывающего (P1) 🎯 MVP

**Goal**: `Выполнить`/`Вычислить` видят и меняют локальные переменные/параметры и
модульные переменные; имена, созданные в тексте, не протекают в соседние вызовы; вложенный
фрагмент видит исполненные имена объемлющего.

**Independent Test**: `pnpm vitest run tests/eval-dynamic-names.test.ts` — сценарии
видимости/изоляции/вложенности зелёные.

### Tests for US1 (сначала падающие)

- [X] T003 [P] [US1] `tests/eval-dynamic-names.test.ts` (red): `Рез = 1; Выполнить
  "Рез = Рез + 3"` → `4`; `Выполнить "Т = 5"`, затем `Выполнить "Сообщить(Т)"` →
  ошибка `Неизвестный символ: Т`; метод модуля, читающий `Т`, видит `Неопределено`
  (динамический `Т` не протёк); вложенный `Выполнить` внутри `Исключение` читает
  локальную объемлющего исполнения; `Вычислить` видит локальную/параметр/модульную.
  Тесты падают: сейчас ошибки нет.

### Implementation for US1

- [X] T004 [US1] `src/runtime/dynamic-names.ts` (новый): сбор `moduleVars`/`moduleMethods`
  верхнего уровня, последовательный обход AST (`Statement`/`Expression`) с множеством
  `known`, предикат `readable` (область вызывающего через `Scope.findBinding`, глобальные
  значения `env.resolveGlobal`/`env.hasGlobal`, `ЭтотОбъект`/`ThisObject`), объявление имён
  на `Assignment`/`VariableDeclaration`/переменных циклов; ошибка
  `Error('Неизвестный символ: <имя>')` (контракт C2). Экспорт
  `checkDynamicNames(program, ctx)` и `checkDynamicExpression(expr, ctx)`.
- [X] T005 [US1] `src/runtime/interpreter.ts`: в `execDynamic` порядок «разбор → проверка →
  регистрация методов/`Перем` → исполнение» (проверка **до** мутации `ctx.methods`);
  в `evalDynamicExpression` — проверка выражения до `eval`; проверка оборачивается в
  `BslRuntimeError`, как ошибка разбора (R5).
- [X] T006 [US1] Довести US1 до зелёного: `pnpm vitest run tests/eval-dynamic-names.test.ts
  tests/eval.test.ts`; `pnpm typecheck`.

**Checkpoint**: US1 работает; существующие сценарии `tests/eval.test.ts` не сломаны.

---

## Phase 4: User Story 2 — неразрешённое имя — ошибка до исполнения (P2)

**Goal**: опечатка в динамическом тексте даёт «Неизвестный символ: <имя>» до исполнения,
ловится `Попытка`, побочных эффектов нет; разрешение текстово-последовательное; эталонный
сценарий даёт `0134567+`.

**Independent Test**: `pnpm vitest run tests/eval-dynamic-names.test.ts` — сценарии ошибки
и перенесённый эталонный тест зелёные; `eval.os` больше не падает на
`ТестДолжен_ПроверитьВызовыВыполнитьСПопытками`.

### Tests for US2 (сначала падающие)

- [X] T007 [P] [US2] `tests/eval-dynamic-names.test.ts` (red, расширить): `Выполнить
  "Сообщить(""до""); Х = Х + 1;"` — «до» не печатается, ошибка ловится `Попытка`,
  `ОписаниеОшибки()` содержит `Х`; последовательное разрешение
  `Выполнить "Новое = 5; Новое = Новое + 8"` успешно; присваивание в ветке `Если` разрешает
  чтение дальше; ошибка не активирует внутреннюю `Попытку` динамического текста; вызов
  неизвестной функции — `Неизвестный символ: <имя>`; `Вычислить("НетТакой + 1")` — ошибка;
  статика сохраняет `Неопределено` (FR-008); перенос
  `ТестДолжен_ПроверитьВызовыВыполнитьСПопытками` (эталон) с ожиданием `0134567+`.

### Implementation for US2

- [X] T008 [US2] `src/runtime/dynamic-names.ts`: предикат `callable` (методы модуля,
  `moduleMethods` фрагмента, встроенные функции интерпретатора, `env.hasFunction`),
  проверка `CallExpression` с `Identifier`-callee; проверка тел `MethodDeclaration`
  фрагмента (известны: окружение вызывающего + `moduleVars`/`moduleMethods` + параметры и
  локальные тела; присваивания верхнего уровня фрагмента методам не видны — R8).
- [X] T009 [US2] Довести US2 до зелёного: `pnpm vitest run tests/eval-dynamic-names.test.ts
  tests/eval.test.ts`; `pnpm build:node` и прогон эталонного `eval.os` — зафиксировать
  `0134567+` (остальные 3 падения `eval.os` — вне scope, SC-005).

**Checkpoint**: US1 и US2 работают; эталонный сценарий даёт ожидаемый результат.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T010 [P] `docs/reference.md`: в разделе встроенных функций заменить «Неизвестное имя
  в `Вычислить` даёт `Неопределено`» на контракт динамики (ошибка до исполнения; статика —
  `Неопределено`); при необходимости — уточнение в `docs/bsl-surface.md`.
- [X] T011 [P] `docs/status.md`: спека 006 → реализовано; в «Известных пробелах» обновить
  `eval.os` (цель зелёная, 3 теста вне scope: Node-контекст/`ОбъединитьПути`, спека 004);
  при появлении нового модуля ядра — упомянуть `dynamic-names.ts` в строке архитектуры.
- [X] T012 [P] `specs/006-dynamic-names/spec.md`: Status `Draft` → `Implemented`
  (реализовано), дата.
- [X] T013 [US2] Браузерная приёмка (конституция V): `tests/browser-script-tag.test.ts` —
  script-блок с `Попытка Выполнить "Х = Х + 1"; Исключение Сообщить(ОписаниеОшибки());
  КонецПопытки;` пишет в `console.log` «Неизвестный символ: Х» и страница не падает.
- [X] T014 Полный гейт: `pnpm typecheck && pnpm test && pnpm build:browser`; хвост вывода —
  доказательство. Ожидается: typecheck чисто, все тесты зелёные, бандл собирается.
- [X] T015 Финальная сверка диффа с контрактом и конституцией: нет новых зависимостей,
  ядро без Node/DOM, `shortcut` из research.md R4/R9 помечены комментарием в коде,
  `pnpm check:docs` не падает (публичных имён не добавлено).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: без зависимостей.
- **Foundational (Phase 2, T002)**: нужна до T004–T005; блокирует обе истории.
- **US1 (Phase 3)**: после T002; T003 (red) → T004 → T005 → T006.
- **US2 (Phase 4)**: после US1 (тот же файл `dynamic-names.ts` и тестовый файл);
  T007 (red) → T008 → T009.
- **Polish (Phase 5)**: T010–T012 параллельно после US2; T013 после US2; T014–T015 — в конце.

### Within Each User Story

- Сначала тест (red) и наблюдение падения; затем минимальная реализация; затем зелёный
  целевой прогон и `typecheck`.
- T004 и T005 — один и тот же механизм в разных файлах, но T005 зависит от T004.

### Parallel Opportunities

- T002 параллельно с T001.
- T003 (тесты US1) можно писать параллельно с T002 (разные файлы), но запуск red — после.
- T010, T011, T012 — разные файлы, параллельны.
- T013 (браузерный тест) — отдельный файл, может идти параллельно T010–T012 после T008.

## Parallel Example: US2

```bash
# После T008 (реализация проверки вызовов/тел методов) параллельно:
Task: "T010 docs/reference.md — контракт динамики"
Task: "T011 docs/status.md — статус 006 и пробелы eval.os"
Task: "T013 tests/browser-script-tag.test.ts — браузерная приёмка"
```

## Implementation Strategy

### MVP First (US1)

1. T001 baseline → T002 интроспекция → T003 red → T004–T005 проход и подключение →
   T006 зелёный US1.
2. **STOP and VALIDATE**: `tests/eval-dynamic-names.test.ts` (US1) + `tests/eval.test.ts`.

### Incremental Delivery

1. US1 — видимость/изоляция (базовое правило области видимости динамики).
2. US2 — ошибка неразрешённого имени + эталонный сценарий `0134567+`.
3. Polish — документация, браузерная приёмка, полный гейт.

### Notes

- [P] — разные файлы, нет зависимостей.
- Один новый исходный файл (`src/runtime/dynamic-names.ts`) и один тестовый
  (`tests/eval-dynamic-names.test.ts`) — последовательная работа по историям, без
  параллельных писателей в один файл.
- Коммиты — только по явной просьбе пользователя.

---

## Phase 6: Fix после независимого ревью (MAJOR — лексические локальные вызывающего)

- [X] T016 [P] [US2] `tests/eval-dynamic-names.test.ts`: 8 регрессионных тестов — `Перем` без
  присваивания, локаль, присвоенная позже, присвоение в неисполненной ветке, модульный уровень,
  изменение локали вызывающего из динамики, `Вычислить` до присваивания, переменная цикла до
  цикла, вложенный фрагмент до присваивания (апгрейд R4)
- [X] T017 [US2] `src/runtime/dynamic-names.ts`: `collectFrameLocals` (`declared`/`assigned`);
  `src/runtime/interpreter.ts`: `declareFrameLocals` при входе в кадр (`run`, `invokeMethodGen`,
  `invokeAsyncGen`, `invokeMethodWithOutputsGen`, `callMethod`, `execDynamic`); NIT: счётчик
  `Для` объявляется до проверки `to` (как `VisitForLoop` эталона)
- [X] T018 [P] Документация: `research.md` R4 → Resolved, R8 в `docs/status.md`; `contracts` C1;
  `docs/architecture.md` (модуль `dynamic-names.ts`); `docs/reference.md` (лексические локальные);
  числа тестов в `docs/status.md` (885/87)
- [X] T019 Верификация исправления независимым верификатором: полный гейт + сценарии дефекта;
  закрывает Lead по вердикту PASS

**Checkpoint**: MAJOR-дефект закрыт, документация синхронизирована.
