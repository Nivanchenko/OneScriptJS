---

description: "Task list for feature 008-use-directive"
---

# Tasks: Упрощённая директива #Использовать

**Input**: Design documents from `specs/008-use-directive/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Включены обязательно — конституция III (TDD): падающий тест до реализации. Каждая
история начинается с тестов и заканчивается их зелёным прогоном.

**Organization**: Задачи сгруппированы по пользовательским историям: US1 (модуль, P1),
US2 (класс, P2), US3 (кеш и циклы, P3). Foundational-фаза общая для всех историй.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можно выполнять параллельно (разные файлы, нет зависимостей)
- **[Story]**: US1 / US2 / US3 — только в фазах историй
- В описании всегда указан точный путь к файлу

## Path Conventions

Single project: `src/`, `tests/` в корне репозитория (см. plan.md, Structure Decision).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: подтвердить базовую линию и подготовить тестовую инфраструктуру.

- [x] T001 Проверить базовую линию в корне репозитория командами из `package.json`: `pnpm typecheck && pnpm test`; ожидаемо 43 файла / 300 тестов, `tsc` без ошибок. Зафиксировать вывод в описании изменения.
- [x] T002 [P] Создать тестовый хелпер `tests/helpers/module-fixtures.ts`: сборка карты `Map<путь, исходник>` из объекта, posix-нормализация ключей и временный каталог с файлами `.os` (для Node-сценариев).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: общие метаданные экспорта, извлечение директив и реестр имён — без них не
работает ни одна история.

**⚠️ CRITICAL**: US1/US2/US3 не начинаются, пока эта фаза не завершена.

- [x] T003 [P] Добавить падающие тесты `exportedNames` в `tests/parser.test.ts`: `Перем Поле Экспорт;` → `exportedNames: ['Поле']`; `Перем А, Б Экспорт;`; отсутствие поля без `Экспорт`; смешанное `Перем А Экспорт, Б;` (сейчас парсер выбрасывает признак).
- [x] T004 [P] Добавить падающие тесты `preprocessScript` в `tests/preprocessor.test.ts`: кавычки, `#Use`, хвостовой `//`, экранирование `""`, unquoted `asserts` (no-op), неактивная ветка `#Если`, пустой путь, номера строк `ImportDirective`.
- [x] T005 [P] Добавить падающие тесты метаданных в `tests/module-metadata.test.ts`: `Interpreter` отдаёт экспортные переменные/методы (`hasExportedMethod`, `getExportedVar`, `setExportedVar`), `getMethod`/`hasConstructor`; `GlobalContext.hasGlobal`/`hasType` различают занятые имена и встроенные типы.
- [x] T006 Реализовать `VariableDeclaration.exportedNames` в `src/ast/nodes.ts` и заполнение в `src/parser/parser.ts` (сохранить `names` и текущие `toMatchObject`-тесты).
- [x] T007 Реализовать `preprocessScript(tokens)` и `ImportDirective` в `src/parser/preprocessor.ts`; `preprocess(tokens)` оставить обёрткой над `.tokens`; извлечение — только в активных ветках `#Если`.
- [x] T008 Реализовать `exportedVars` и API экспорта в `src/runtime/interpreter.ts`; `ModuleRegistry` + `hasGlobal`/`hasType` в `src/runtime/context.ts` (`GlobalContext` — реализация).

**Checkpoint**: метаданные и извлечение директив готовы; можно начинать US1.

---

## Phase 3: User Story 1 - Модуль из файла (Priority: P1) 🎯 MVP

**Goal**: `#Использовать "<файл>"` загружает модуль-синглтон; доступны только экспортные
методы и переменные; тело исполняется один раз при импорте; работает в Node и браузере.

**Independent Test**: карта исходников из двух файлов → главный скрипт вызывает экспортную
функцию, читает/пишет экспортную переменную; повторный импорт не повторяет инициализацию;
неэкспортный член снаружи недоступен; та же сцена на странице `<one-script>` с заглушкой `fetch`.

### Tests for User Story 1 ⚠️

> Сначала тесты; убедиться, что они красные.

- [x] T009 [P] [US1] Добавить тесты модуля в `tests/modules.test.ts`: экспортная функция/переменная (чтение и запись), неэкспортные члены → ошибки, тело исполняется ровно один раз, импорт выполняется до первой строки кода, `#Использовать asserts` — no-op, конфликт имён, недопустимое имя файла, ошибка разбора вложенного файла с его путём.
- [x] T010 [P] [US1] Добавить тесты Node-загрузчика в `tests/files-modules.test.ts`: временный каталог, относительный путь от импортирующего файла, абсолютный `/…`/`C:\…` путь, отсутствующий файл с сообщением из контракта.
- [x] T011 [P] [US1] Добавить тесты браузера в `tests/browser-modules.test.ts`: happy-dom, заглушка `fetch`, относительный URL и `/`-URL, успешный вызов модуля, HTTP 404 → `console.error` с URL, страница не падает.

### Implementation for User Story 1

- [x] T012 [US1] Создать `src/runtime/module-objects.ts`: `BslModule implements BslObject` (экспорт-only методы/переменные, ошибки «не найдено у типа …»), `nameFromPath`/проверка BSL-идентификатора, тексты ошибок из контракта.
- [x] T013 [US1] Создать `src/runtime/modules.ts`: `ScriptModuleDef` (разбор, `kind`, `imports`), `ModuleLoader` с `sources`/`resolve`/`cache`/`owned`, `importAll`, регистрация модуля (`registerGlobal` + `registerType` с ошибкой «модуль не класс»), проверки коллизий и пустого пути; default posix-`resolve` для тестов.
- [x] T014 [US1] Подключить импорт в `src/runtime/runner.ts`: `RunOptions.basePath/modules/resolve`, `preprocessScript` до исполнения, вызов `loader.importAll`; экспортировать `RunOptions` из `src/index.ts`; при отсутствии источника — ошибка контракта.
- [x] T015 [US1] Создать `src/node/module-source.ts` (`collectModuleSources`: синхронный DFS, `node:path`/`node:fs`, UTF-8, BOM, нормализация ключей) и подключить в `src/node/cli.ts` (карта + `resolve` в `run`).
- [x] T016 [US1] Создать `src/browser/module-source.ts` (`preloadModuleSources`: `fetch`, `new URL(p, importerUrl)`, BOM, ошибки HTTP/сети); обновить `src/browser/onescript.ts` — асинхронная предзагрузка перед синхронным `run`, ошибки через `console.error`, при отсутствии импортов сохранить текущую синхронную семантику.

**Checkpoint**: US1 работает независимо — Node CLI и `<one-script>` грузят модуль; MVP готов.

---

## Phase 4: User Story 2 - Класс с конструктором (Priority: P2)

**Goal**: файл с `ПриСозданииОбъекта`/`OnObjectCreate` — класс: `Новый Класс(...)`, тело
на экземпляр, конструктор с обязательными/необязательными параметрами, независимое состояние.

**Independent Test**: класс с конструктором `(Обязательный, Необязательный = "…")`; два
`Новый` с разными аргументами дают независимые состояния, необязательный получает default;
`Класс.Метод` и `Новый Модуль` дают разные понятные ошибки; неверная арность — сообщение контракта.

### Tests for User Story 2 ⚠️

- [x] T017 [P] [US2] Добавить тесты класса в `tests/modules-class.test.ts`: аргументы и значение по умолчанию, два независимых экземпляра, тело исполняется на каждый экземпляр до конструктора, конструктор не вызывается снаружи, `Класс.Метод` → ошибка, `Новый Модуль` → ошибка, неверная арность (меньше обязательных / больше всех), `ТипЗнч(Экземпляр)` = имя класса.

### Implementation for User Story 2

- [x] T018 [US2] Добавить `BslInstance` и `BslClassRef` в `src/runtime/module-objects.ts`: экземпляр на своём `Interpreter` (тело → конструктор), экспорт-only поверхность, `typeName` = имя класса, sentinel для `Класс.Метод` с подсказкой `Новый`.
- [x] T019 [US2] Добавить в `src/runtime/modules.ts` определение класса, регистрацию типа и `BslClassRef`, фабрику `Новый`: поиск конструктора по двуязычному имени, проверка арности с сообщением `Параметры конструктора: необходимых параметров: <req>, передано параметров: <n>`, значения по умолчанию в области модуля.

**Checkpoint**: US2 работает независимо при готовой US1 (общий загрузчик).

---

## Phase 5: User Story 3 - Кеш, повторные импорты и циклы (Priority: P3)

**Goal**: один файл грузится не более одного раза за `run()`; разные написания пути — одна
запись; A↔B не зацикливается; ранний доступ к недоинициализированному модулю — явная ошибка.

**Independent Test**: повторный импорт и `./m.os` vs `m.os` дают одну инициализацию; пара
файлов с взаимным импортом завершается без зависания, тела по одному разу; обращение к члену
`loading`-модуля — ошибка контракта; два `run()` независимы.

### Tests for User Story 3 ⚠️

- [x] T020 [P] [US3] Добавить тесты в `tests/modules-cycle.test.ts`: повторный импорт (в т.ч. в другом написании пути) — тело один раз; A↔B завершается и тела по одному разу; ошибка `Модуль '<имя>' ещё загружается (циклический импорт)`; директива в неактивной ветке `#Если` не грузит файл; два `run()` с одним файлом дают независимое состояние.

### Implementation for User Story 3

- [x] T021 [US3] Довести кеш в `src/runtime/modules.ts`: канонический ключ (нормализация `..`/`.`), запись `loading` до зависимостей и тела, повторный импорт — возврат записи, `ready` после успеха; в `src/runtime/module-objects.ts` — ошибка раннего доступа.
- [x] T022 [US3] Обработать ошибки импорта в `src/runtime/modules.ts` и `src/runtime/module-objects.ts`: удалять запись кеша при сбое, не оставлять «полуготовый» модуль доступным, пробрасывать ошибку без обёртки; проверить конфликт имён между двумя путями и с встроенными именами (`hasGlobal`/`hasType`).

**Checkpoint**: все три истории работают; кеш и циклы соответствуют FR-010…FR-013.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: документация, пример, ручная приёмка и финальные доказательства.

- [x] T023 [P] Обновить документацию: `docs/status.md` (статус 008, известные пробелы), `docs/bsl-surface.md` (директива `#Использовать` — импорт файлов, не библиотек), `docs/architecture.md` (слой импорта/кеша, если появился новый модуль).
- [x] T024 [P] Добавить браузерный пример `examples/modules.html` и `examples/lib/Модуль.os` (относительный и `/`-путь, вывод через `Сообщить`).
- [x] T025 Прогнать сценарии `specs/008-use-directive/quickstart.md` через CLI на временных каталогах: модуль, класс, цикл, диагностика; зафиксировать вывод.
- [x] T026 [P] Проверить и при необходимости добавить `shortcut:`-комментарии: динамическая загрузка в `src/stdlib/script.ts` не резолвит импорты; порядок циклической инициализации в `src/runtime/modules.ts`.
- [x] T027 Финальная проверка: `pnpm typecheck && pnpm test && pnpm build`; открыть `examples/hello.html` на dev-сервере и подтвердить три прежние строки в консоли.

---

## Phase 7: Расширение — импорт из ЗагрузитьСценарийИзСтроки

**Goal**: динамический сценарий резолвит `#Использовать` через загрузчик текущего запуска.

- [x] T028 Добавить тесты в `tests/modules-dynamic.test.ts`: имя сценария как база, путь текущего сценария, общий кеш с главным скриптом, чтение через `loadSource`, ошибка без него.
- [x] T029 Реализовать `ModuleHost` в `src/runtime/context.ts`, сохранить загрузчик в `run()` (`src/runtime/runner.ts`), резолвинг импортов в `src/stdlib/script.ts`, `loadSource` в `src/runtime/modules.ts` и `src/node/cli.ts`.
- [x] T030 Обновить `specs/008-use-directive/spec.md` (FR-021), контракт §4.4 и `docs/`, прогнать `pnpm typecheck && pnpm test`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: без зависимостей.
- **Foundational (Phase 2)**: после Setup; **блокирует все истории**.
- **US1 (Phase 3)**: после Phase 2. Даёт `ModuleLoader` и платформенные загрузчики.
- **US2 (Phase 4)**: после Phase 2 и US1 (использует общий загрузчик), но тестируется отдельно.
- **US3 (Phase 5)**: после Phase 2 и US1; с US2 не пересекается по смыслу (только модули).
- **Polish (Phase 6)**: после всех выбранных историй.

### Within Each User Story

- Тесты (T009–T011, T017, T020) пишутся и краснеют до реализации.
- Ядро (`module-objects.ts`, `modules.ts`) → раннер → платформенные загрузчики.
- Внутри US1 Node и браузер можно вести параллельно после T014.

### User Story Dependencies

- **US1 (P1)**: независима после Phase 2.
- **US2 (P2)**: зависит от US1 (фабрика экземпляров в том же загрузчике); самостоятельной
  ценности без US1 не несёт.
- **US3 (P3)**: зависит от US1; расширяет состояния кеша, не меняя поверхность US2.

### Parallel Opportunities

- Phase 2: T003, T004, T005 — разные тестовые файлы; T002 — отдельный файл.
- US1: T009/T010/T011 — разные тестовые файлы; T015 (Node) и T016 (браузер) — разные
  каталоги после готового T014.
- US2 и US3 после US1 можно вести параллельно (разные тестовые файлы; изменения в
  `modules.ts` — последовательно).
- Polish: T023 и T024 — разные файлы.

---

## Parallel Example: User Story 1

```bash
# Тесты US1 параллельно (разные файлы):
Task: "tests/modules.test.ts — поверхность модуля и ошибки"
Task: "tests/files-modules.test.ts — загрузчик Node"
Task: "tests/browser-modules.test.ts — <one-script> + fetch"

# После T013/T014 — платформы параллельно:
Task: "src/node/module-source.ts + cli.ts"
Task: "src/browser/module-source.ts + onescript.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 → Phase 2 (foundational) — без них истории не начинать.
2. Phase 3 (US1) — модуль в Node и браузере.
3. **STOP and VALIDATE**: `tests/modules.test.ts`, `files-modules.test.ts`,
   `browser-modules.test.ts` зелёные; quickstart §1, §5.
4. Демо/CLI: `node dist/cli.mjs` с двумя файлами.

### Incremental Delivery

1. US1 → приёмка модуля (MVP).
2. US2 → приёмка классов; регрессия US1.
3. US3 → кеш/циклы; регрессия US1–US2.
4. Polish → документация, пример, `typecheck && test && build`, `hello.html`.

### Notes

- [P] — разные файлы, нет зависимостей; один файл в параллель не редактировать.
- Тесты обязательны (конституция III); каждый FR из спеки покрыт задачей.
- После каждой истории — `pnpm typecheck && pnpm test`, история не считается готовой на красном.
- Коммиты — только по явной просьбе пользователя.
