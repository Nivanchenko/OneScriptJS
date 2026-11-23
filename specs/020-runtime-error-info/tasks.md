# Tasks: Позиция, модуль и BSL-стек в ошибках исполнения

**Input**: Design documents from `specs/020-runtime-error-info/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: TDD обязателен (конституция III). В каждой задаче сначала падающий тест, потом
минимальная реализация.

**Branch**: `feature/020-runtime-error-info` (уже создана и активна)

## Format: `[ID] [P?] [Story] Description`

- **[P]** — можно параллелить (разные файлы, нет зависимостей)
- **[Story]** — US1..US5 из spec.md

## Phase 1: Setup

- [x] T001 Ветка `feature/020-runtime-error-info`, артефакты спеки/плана (spec, plan, research,
  data-model, contracts, quickstart) — выполнено Lead.
- [x] T002 Базовая линия: `pnpm typecheck && pnpm test` зелёные до изменений; зафиксировать
  число тестов.

---

## Phase 2: Foundational (блокирует все истории)

- [x] T003 [P] Тесты снимка ошибки — `tests/runtime-errors.test.ts`: ошибка `1/0` на известной
  строке даёт снимок (описание, модуль, строка, исходная строка, кадры); текст
  `ОписаниеОшибки()` не изменился.
- [x] T004 Создать `src/runtime/error-snapshot.ts`: типы `ErrorSnapshot`/`FrameSnapshot`,
  `captureError(error, position, frames)`, `annotateError(error, ...)`,
  `formatErrorDetails(snapshot)` (чистые функции, без `node:*`/DOM).
- [x] T005 Стек кадров в `src/runtime/interpreter.ts`: массив кадров, push/pop в `runGen`,
  `callMethod`, `invokeMethodGen`, `invokeAsyncGen`, `invokeMethodWithOutputsGen`,
  `execDynamic`; обновление `line` кадра в `exec`; снимок в `annotateError`. Тесты на
  простую ошибку и вложенный вызов.
- [x] T006 Дескриптор источника: `RunOptions.sourceId?` в `src/runtime/runner.ts`; `Interpreter`
  хранит `sourceId`/`sourceText`; `src/runtime/modules.ts` передаёт разрешённый путь и текст
  для импортов/классов; `src/stdlib/script.ts` — id динамического сценария; браузерный вход
  передаёт id блока (см. T012). Тесты: главный скрипт, импорт.
- [x] T007 Аннотация ошибок на границе BSL: `exec` ловит `Error` без снимка и вешает снимок
  (позиция оператора, стек); сигналы `Return/Break/Continue/Goto` не трогаются;
  `ctx.currentError` хранит снимок (а `ОписаниеОшибки()` по-прежнему отдаёт текст). Тесты:
  ошибка интерпретатора, ошибка stdlib, ошибка в `Попытка` (наружу не уходит, свойства
  доступны).

**Checkpoint**: снимок снимается, тексты не изменились — можно делать выводы хостов и API.

---

## Phase 3: User Story 1 — вывод в CLI и браузере (P1)

- [x] T008 [P] [US1] Тесты CLI — `tests/cli-errors.test.ts`: рефактор `src/node/cli.ts` до
  экспортируемого `runCli(argv, io)`; temp-файл с ошибкой; stderr = `путь:строка: описание` +
  `Стек вызовов:`; exit 1; stdin → `<stdin>`; ошибка в импорте — путь модуля.
- [x] T009 [US1] Реализовать `runCli` и формат в `src/node/cli.ts` через
  `formatErrorDetails`.
- [x] T010 [P] [US1] Тесты браузера — `tests/browser-errors.test.ts`: inline-блок →
  `console.error` содержит `#block<N>:<строка>` и стек; внешний `.osjs` → URL; несколько
  блоков — второй исполняется после ошибки первого.
- [x] T011 [US1] Реализовать в `src/browser/onescript.ts`: id блока (URL + `#id`/`#blockN`),
  передача в `run`, формат `console.error`.
- [x] T012 [P] [US1] Тест ошибки декларативного обработчика (`data-os-*`) и BSL-события:
  `console.error` с позицией обработчика; реализация в `src/browser/dom-events.ts`/
  `src/browser/events`-пути.

**Checkpoint**: US1 независимо проверяем (CLI + happy-dom).

---

## Phase 4: User Story 2 — BSL-API `ИнформацияОбОшибке` (P1)

- [x] T013 [P] [US2] Тесты BSL-API — `tests/runtime-errors.test.ts`: `ИмяМодуля`,
  `НомерСтроки`, `ИсходнаяСтрока`, `Причина`=Null, `ПолучитьСтекВызовов()` (Массив кадров,
  порядок), алиасы EN, пустая ошибка вне `Исключение`, неизвестное свойство.
- [x] T014 [US2] Реализовать в `src/runtime/error-info.ts`: богатый `BslErrorInfo`, класс
  `КадрСтекаВызовов`, алиасы; `src/stdlib/types.ts` — канонизация `CallStackFrame`.
- [x] T015 [P] [US2] Тесты `ПодробноеОписаниеОшибки` (метод + свойство-совместимость) и формата
  из contracts/error-info-api.md.
- [x] T016 [US2] Реализовать подробное описание в `error-info.ts`/`error-snapshot.ts`.

**Checkpoint**: BSL-код видит позицию и стек; тексты `Описание`/`ОписаниеОшибки` прежние.

---

## Phase 5: User Story 3 — перевыброс (P2)

- [x] T017 [P] [US3] Тесты — `tests/runtime-errors.test.ts`: `ВызватьИсключение;` сохраняет
  строку/стек исходной ошибки; `ВызватьИсключение ИнформацияОбОшибке()` — то же; новый
  `ВызватьИсключение "текст"` — строка перевыброса; вложенные `Попытка`.
- [x] T018 [US3] Реализовать сохранение снимка в `RaiseStatement`/`execTryExcept`/`ctx.currentError`
  в `src/runtime/interpreter.ts`.

**Checkpoint**: US3 работает независимо.

---

## Phase 6: User Story 4 — импорты, классы, динамика, события (P2)

- [x] T019 [P] [US4] Тесты — `tests/runtime-errors.test.ts`/`tests/modules-*.test.ts`:
  ошибка в импортируемом модуле (путь модуля + строка + стек с вызывающим); в конструкторе
  класса; в `Выполнить`/`Вычислить` (маркер `<Выполнить>`, строка фрагмента, кадр
  вызывающего); в обработчике события.
- [x] T020 [US4] Доделать идентификаторы источников и кадры для импортов/классов/динамики/
  событий (`src/runtime/modules.ts`, `src/runtime/interpreter.ts`, `src/stdlib/script.ts`,
  `src/runtime/events.ts` при необходимости).

**Checkpoint**: US4 работает.

---

## Phase 7: User Story 5 — async и фоновые задания (P3)

- [x] T021 [P] [US5] Тесты — `tests/runtime-errors-async.test.ts`: ошибка в `Асинх`-методе
  (позиция возникновения, кадр async-метода), `Ждать` пробрасывает снимок, необработанная
  ошибка `Обещания` печатается с позицией/стеком, аварийное `ФоновоеЗадание` отдаёт
  `ИнформацияОбОшибке` со свойствами.
- [x] T022 [US5] Реализовать перенос снимка в `src/runtime/promise.ts`,
  `src/stdlib/tasks/*`, `src/stdlib/global-context.ts`.

**Checkpoint**: US5 работает.

---

## Phase 8: Polish & Cross-Cutting

- [x] T023 [P] Документация: `docs/reference.md` (ИнформацияОбОшибке, КадрСтекаВызовов,
  встроенные функции), `docs/status.md` (фича 020), при необходимости
  `docs/architecture.md` (новый модуль снимка); затем `pnpm build:catalog` и
  `pnpm check:docs`.
- [x] T024 [P] Пример/README: `examples/errors.html` (демонстрация свойств) + упоминание в
  `README.md`; проверить, что страница исполняется в dev-сервере.
- [x] T025 Верификация: `pnpm typecheck && pnpm test`, `pnpm build`, `pnpm check:docs`,
  `pnpm typecheck:vscode`; приложить хвост вывода. Ручная проверка по quickstart.md.
- [ ] T026 Независимый агент-верификатор: прогон полного набора, ревью диффа против
  конституции, edge cases, проверка неизменности текстов ошибок; отчёт Lead.
- [ ] T027 Исправить замечания верификатора; повторить T025; финальный отчёт Lead.
- [ ] T028 Коммит — только если пользователь явно попросит.

## Dependencies & Execution Order

- Phase 2 (T003–T007) блокирует все US.
- После Phase 2: US1 (T008–T012) и US2 (T013–T016) можно параллелить по файлам; US3 (T017–T018)
  зависит от US2 (перевыброс ErrorInfo); US4 (T019–T020) — от T006; US5 (T021–T022) — от T007.
- Polish (T023–T027) — после всех US.

## Notes

- Не менять тексты `ОписаниеОшибки()`/`Описание`; точные `toEqual` в тестах — контракт.
- Ядро без `node:*`/DOM; браузерная сборка — обязательна.
- Новых зависимостей нет.
- Каждая задача: тест → красный → реализация → зелёный → следующий.
