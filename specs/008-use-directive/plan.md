# Implementation Plan: Упрощённая директива #Использовать

**Branch**: `feat/includes` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-use-directive/spec.md`

## Summary

Директива `#Использовать "<путь>"` превращается из no-op в импорт одного BSL-файла. Файл
без `ПриСозданииОбъекта` становится модулем-синглтоном (доступ по имени файла, только
экспортные методы/переменные, тело исполняется при импорте), файл с конструктором —
классом (`Новый Имя(...)`, тело и конструктор на каждый экземпляр, независимое состояние).
Импорт кешируется на время `run()`; запись `loading` создаётся до исполнения тела, поэтому
циклы A↔B не зацикливаются, а ранний доступ к недоинициализированному модулю даёт явную
ошибку.

Технический подход (детали и альтернативы — в [research.md](research.md)):
- **Препроцессор** (`src/parser/preprocessor.ts`): `preprocessScript(tokens)` возвращает
  токены и список `ImportDirective` (только активные ветки `#Если`); `preprocess` остаётся
  обёрткой.
- **Ядро** (`src/runtime/modules.ts`, `src/runtime/module-objects.ts`): `ModuleLoader`
  (кеш, разрешение имён, регистрация, тело), `BslModule` / `BslInstance` / `BslClassRef`
  как `BslObject`.
- **Интерпретатор** (`src/runtime/interpreter.ts`, `src/runtime/context.ts`): метаданные
  экспорта (`exportedVars`, `exportedNames` в AST), API `hasExportedMethod` /
  `getExportedVar` / `hasConstructor` / `getMethod`; `GlobalContext.hasGlobal/hasType`.
- **Платформы**: Node — синхронный `collectModuleSources` (`node:fs`/`node:path`) и CLI;
  браузер — асинхронный `preloadModuleSources` через `fetch`, предзагрузка в
  `<one-script>` до синхронного `run()`. Движок остаётся синхронным.

## Technical Context

**Language/Version**: TypeScript 5.9, strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`), ES2022

**Primary Dependencies**: новых нет; используются `node:fs`/`node:path` (только `src/node/`) и браузерный `fetch`/`URL` (только `src/browser/`)

**Storage**: in-memory кеш импорта на один `run()`; файлы (Node) / HTTP (браузер) — только чтение

**Testing**: Vitest; happy-dom для `<one-script>` с заглушкой `fetch`; Node-тесты с временными каталогами и картой исходников

**Target Platform**: браузер — основная среда (предзагрузка по URL); Node.js — отладка, CLI и тесты

**Project Type**: runtime-библиотека / интерпретатор языка (single project)

**Performance Goals**: без деградации текущего набора (43 файла / 300 тестов); импорт файла не более одного раза за `run()`; обход импортов O(число файлов), вызов экспортного члена O(1) по Map

**Constraints**: синхронный `run()`; ядро (`lexer`/`parser`/`ast`/`runtime`/`stdlib`) без `node:*` и DOM; `dist/onescript.js` — единый IIFE-бандл; обратная совместимость `#Использовать asserts`; публичный API расширяется только опциями `RunOptions`

**Scale/Scope**: 2 новых модуля ядра (~250 строк), 2 платформенных загрузчика (~120 строк), правки AST/парсера/препроцессора/интерпретатора/контекста/раннера, 2–3 новых тестовых файла + правки `preprocessor.test.ts`/`parser.test.ts`

**Baseline (измерено перед планированием)**: `pnpm typecheck` ✓ (tsc без вывода); `pnpm test` ✓ — 43 файла, 300 тестов; браузерный бандл собирается текущей конфигурацией Vite.

## Constitution Check

*GATE: пройден до Phase 0; перепроверен после Phase 1.*

| Принцип | Гейт | Статус | Обоснование |
|---|---|---|---|
| I. Совместимость с OneScript | Двуязычные имена; сверка с эталоном; расхождения зафиксированы | ✅ | `#Использовать`/`#Use`, `ПриСозданииОбъекта`/`OnObjectCreate`; семантика класса — по `UserScriptContextInstance.OnInstanceCreation` (тело модуля, затем конструктор). Упрощение библиотек до файлов зафиксировано в Assumptions спеки и будет в `docs/status.md` |
| II. Один движок — две среды | Ядро без Node/DOM; браузерная приёмка | ✅ | Резолвинг и I/O инжектируются: `node:path`/`fs` — в `src/node/`, `fetch`/`URL` — в `src/browser/`; ядро получает карту исходников и функцию `resolve`. Браузерный сценарий проверяется happy-dom-тестом и ручным прогоном examples |
| III. Test-First | Падающий тест до реализации | ✅ | Порядок: тесты препроцессора/парсера → `tests/modules.test.ts` (красный) → ядро → платформы → браузерный тест; каждый FR покрыт |
| IV. Слои и минимальный код | Направление зависимостей; без «на потом» | ✅ | `ast → parser → runtime`; новые зависимости не вводятся; sentinel-объекты и `exportedNames` — минимум для наблюдаемого поведения; динамический импорт использует тот же загрузчик запуска |
| V. Доказанное «готово» | `typecheck && test`, браузерная проверка | ✅ | Команды и ожидаемые результаты — в разделе Verification; браузерная приёмка — тест `<one-script>` + ручной прогон |

### Post-Design Re-check (Phase 1)

После `data-model.md` и контракта гейты не изменились: контракты не вводят Node/DOM в
ядро, публичный API расширяется аддитивно (`RunOptions.basePath/modules/resolve`),
новых зависимостей нет. Отклонение от эталона одно и осознанное: библиотеки заменены
файловыми путями (без `lib.config`, версий и поиска по имени) — отражено в спеке и
`docs/status.md`.

## Project Structure

### Documentation (this feature)

```text
specs/008-use-directive/
├── plan.md                                  # этот файл
├── research.md                              # Phase 0: решения и альтернативы
├── data-model.md                            # Phase 1: сущности и инварианты
├── quickstart.md                            # Phase 1: сценарии проверки
├── contracts/
│   └── use-directive-contract.md            # Phase 1: грамматика, пути, ошибки, API
└── tasks.md                                 # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── ast/
│   └── nodes.ts                    # + VariableDeclaration.exportedNames
├── parser/
│   ├── parser.ts                   # + заполнение exportedNames
│   └── preprocessor.ts             # + preprocessScript(), ImportDirective, разбор пути
├── runtime/
│   ├── context.ts                  # + ModuleRegistry, GlobalContext.hasGlobal/hasType
│   ├── interpreter.ts              # + exportedVars, accessor-API, getMethod/hasConstructor
│   ├── modules.ts                  # новый: ModuleLoader, ScriptModuleDef, resolveByName
│   ├── module-objects.ts           # новый: BslModule, BslInstance, BslClassRef
│   └── runner.ts                   # + предзагрузка импортов перед исполнением
├── node/
│   ├── module-source.ts            # новый: collectModuleSources() (fs/path)
│   └── cli.ts                      # + сбор карты исходников
├── browser/
│   ├── module-source.ts            # новый: preloadModuleSources() (fetch/URL)
│   └── onescript.ts                # + асинхронная предзагрузка перед run()
└── index.ts                        # + экспорт RunOptions (типы), при необходимости helper

tests/
├── modules.test.ts                 # новый: модуль, класс, экспорт, арность, ошибки
├── modules-cycle.test.ts           # новый: кеш, повторный импорт, A↔B
├── browser-modules.test.ts         # новый: <one-script> + fetch-заглушка
├── preprocessor.test.ts            # + извлечение импортов, неактивные ветки
└── parser.test.ts                  # + exportedNames
```

**Structure Decision**: single project, существующие слои. Новые файлы ядра — `runtime/`
(не `stdlib/`: загрузчик — часть исполнения, а не библиотечных функций). Платформенные
загрузчики — строго в `src/node/` и `src/browser/`, по одному файлу на среду.

## Implementation Outline

Порядок фиксирует TDD: каждый шаг начинается с теста (кроме чисто инфраструктурных).

1. **Метаданные экспорта** — тест `parser.test.ts` (`Перем Поле Экспорт` →
   `exportedNames`), затем AST и парсер; тест интерпретатора на `exportedVars` и API
   доступа — затем `interpreter.ts`.
2. **Извлечение директив** — тесты `preprocessor.test.ts`: кавычки, `#Use`, комментарий,
   unquoted no-op, неактивная ветка `#Если`, пустой путь; затем `preprocessScript`.
3. **Ядро импорта** — `tests/modules.test.ts` на карте исходников и default-`resolve`:
   модуль (экспорт/неэкспорт, тело один раз), класс (конструктор, два экземпляра),
   коллизии, недопустимое имя, ошибки парсинга; затем `modules.ts`/`module-objects.ts` и
   правки `context.ts`, `runner.ts`.
4. **Циклы и кеш** — `tests/modules-cycle.test.ts`: повторный импорт (включая `./m.os`
   vs `m.os`), A↔B, ранний доступ; затем доработка состояний загрузчика.
5. **Node** — тест CLI/`collectModuleSources` на временном каталоге; затем
   `src/node/module-source.ts`, `cli.ts`.
6. **Браузер** — `tests/browser-modules.test.ts` с заглушкой `fetch` (относительный URL,
   `/`-URL, 404 → `console.error`); затем `src/browser/module-source.ts`, `onescript.ts`.
7. **Документация и регрессия** — `docs/status.md`, `docs/bsl-surface.md`
   (`#Использовать`), `docs/architecture.md` (при новом слое), прогон полного набора,
   `pnpm build`, ручная проверка `examples/hello.html`.

## Complexity Tracking

Нарушений конституции нет; таблица не заполняется.

Осознанные ограничения (не нарушения), помечаются в коде `shortcut:`:
- браузерный runtime-`fetch` для динамических сценариев невозможен в синхронном
  `run()`: `ЗагрузитьСценарийИзСтроки` видит только предзагруженные источники;
- циклы гарантируют только однократность и отсутствие зависания, но не порядок
  инициализации;
- `.os` не подставляется, поиска библиотек/`lib.config`/версий нет — по спеке.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
```

Ожидаемо: `tsc` без ошибок; все тесты зелёные (базовая линия 43/300 + новые файлы);
`dist/onescript.js` и Node-сборка собираются. Браузерная приёмка: happy-dom-тест
`browser-modules.test.ts` и ручное открытие страницы с `#Использовать` на `pnpm dev`.
Приёмочный `examples/hello.html` — без изменений.

## Risks

- **Регистрация имён до исполнения тела**: при ошибке импорта имя остаётся в
  `GlobalContext` (нет API удаления). Скрипт всё равно останавливается; риск — повторное
  использование того же контекста после ошибки. Решение: документировать, при
  необходимости — удаление записи кеша (уже есть) и повторная регистрация.
- **Sentinel-объекты классов в глобальных именах** могут попасть в `ТипЗнч`/`Строка` при
  неосторожном использовании — сообщения об ошибках это закрывают, но поведение стоит
  проверить тестом.
- **Browser fetch и CORS**: загрузка с чужого origin без CORS-заголовков не сработает.
  Это ограничение браузера, а не движка; фиксируется в Assumptions/`docs/status.md`.
- **Производительность больших деревьев**: карта исходников строится полностью до
  исполнения — для десятков файлов приемлемо; при тысячах потребуется ленивый режим
  (вне scope).
