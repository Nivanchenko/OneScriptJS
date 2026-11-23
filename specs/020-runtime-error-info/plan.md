# Implementation Plan: Позиция, модуль и BSL-стек в ошибках исполнения

**Branch**: `feature/020-runtime-error-info` | **Date**: 2026-11-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/020-runtime-error-info/spec.md`

## Summary

Добавить в runtime-ошибки BSL снимок позиции (модуль, строка, исходная строка) и BSL-стека
вызовов, снятый в момент возникновения ошибки. Открыть эту информацию в 1С-совместимом
`ИнформацияОбОшибке` (`ИмяМодуля`, `НомерСтроки`, `ИсходнаяСтрока`, `ПолучитьСтекВызовов()`,
подробное описание со стеком) и вывести её в CLI (stderr) и браузер (`console.error`).
Тексты `ОписаниеОшибки()`/`Описание` не меняются. Технически: явный стек кадров в
генераторном интерпретаторе, дескриптор источника у каждого `Interpreter`, снимок ошибки в
момент throw, перенос снимка через `Попытка/Исключение`, перевыброс, async и фоновые задания.
Отладчик/DAP — вне объёма; инфраструктура кадров переиспользуется им позже.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node.js >= 20 (dev — v24), браузерная сборка IIFE

**Primary Dependencies**: без новых зависимостей (Vitest/happy-dom уже есть)

**Storage**: N/A — снимки ошибок живут в памяти; тексты модулей уже доступны загрузчику

**Testing**: Vitest (`tests/*.test.ts`), happy-dom для браузерных сценариев, CLI — через
дочерний процесс/прямой вызов хост-функции форматирования

**Target Platform**: браузер — основная среда (`dist/onescript.js`); Node — CLI и тесты

**Project Type**: движок языка (библиотека) + CLI + браузерный бандл

**Performance Goals**: накладные расходы только на вызовах (push/pop кадра) и на ошибке
(снимок); на каждый оператор — не более записи текущей строки; без новых `yield`, без
изменения синхронного быстрого пути

**Constraints**: ядро без `node:*` и DOM; браузерная сборка обязана работать; тексты ошибок
(`ОписаниеОшибки`, `Описание`) неизменны; публичный API — русские и английские алиасы;
`docs/reference.md` + каталог API синхронизируются; TDD

**Scale/Scope**: ~8–10 файлов в `src/`, 1 новый модуль снимка ошибки, 4–6 файлов тестов,
документация; оценка 1–3 дня

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Язык, формат `.osjs` и эталон** — PASS: семантика `ИнформацияОбОшибке` берётся из
  C#-эталона; расхождения (async/фоновые задания, маркеры динамического кода) фиксируются в
  research.md и тестами; все имена — RU/EN.
- **II. Один движок — две среды** — PASS: правки только в `src/runtime`, `src/stdlib` (без
  `node:*`), `src/node`/`src/browser` — только форматирование; браузерная сборка проверяется.
- **III. Test-First** — PASS: каждая задача начинается с падающего теста; план задач это
  фиксирует.
- **IV. Слои и минимальный код** — PASS: направление зависимостей сохраняется; новых
  зависимостей нет; новый модуль — только типы снимка + сборка кадра (без абстракций «на
  потом»).
- **V. Доказанное «готово»** — PASS: `pnpm typecheck && pnpm test`, `pnpm build`,
  `pnpm check:docs`, браузерная проверка через happy-dom/`examples/`.

Нарушений, требующих Complexity Tracking, нет.

## Project Structure

### Documentation (this feature)

```text
specs/020-runtime-error-info/
├── spec.md              # спека (готово)
├── plan.md              # этот файл
├── research.md          # Phase 0: семантика 1С/эталона и решения
├── data-model.md        # Phase 1: сущности и правила
├── quickstart.md        # Phase 1: как проверить руками
├── contracts/           # Phase 1: контракт BSL-API и формат вывода
│   ├── error-info-api.md
│   └── host-output.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2
```

### Source Code (repository root)

```text
src/
├── runtime/
│   ├── error-info.ts        # BslErrorInfo → богатый объект (поля/методы/алиасы)
│   ├── error-snapshot.ts    # НОВЫЙ: типы снимка ошибки/кадра + форматирование
│   ├── interpreter.ts       # стек кадров, текущая позиция, аннотация ошибки, динамика
│   ├── runner.ts            # передать дескриптор источника в Interpreter
│   ├── modules.ts           # дескриптор источника для импортов и классов
│   ├── context.ts           # тип текущей ошибки (снимок вместо строки)
│   ├── promise.ts           # необработанные ошибки — печать со снимком
│   └── ...
├── stdlib/
│   ├── script.ts            # идентификатор источника динамического сценария
│   ├── global-context.ts    # формат необработанных ошибок
│   └── tasks/               # ФоновоеЗадание.ИнформацияОбОшибке со снимком
├── node/cli.ts              # stderr: модуль:строка + стек
├── browser/onescript.ts     # console.error: блок/URL + строка + стек
└── browser/dom-events.ts    # ошибки обработчиков — тот же формат
tests/
├── runtime-errors.test.ts   # НОВЫЙ: позиция/стек/перевыброс/импорты/динамика
├── runtime-errors-async.test.ts # async/Обещания/задания
├── cli-errors.test.ts       # stderr CLI
└── browser-errors.test.ts   # console.error в happy-dom
docs/
├── reference.md             # API ИнформацияОбОшибке/КадрСтекаВызовов
└── status.md                # отметка о фиче
```

**Structure Decision**: single project; правки в существующих слоях, один новый модуль
`src/runtime/error-snapshot.ts` (типы + форматирование, без платформенных зависимостей).

## Complexity Tracking

> Нарушений конституции нет — раздел не заполняется.

## Phase 0 / Phase 1 outputs

- `research.md` — решения по семантике: модуль/строка/стек, перевыброс, динамический код,
  async/задания, формат `ПодробноеОписаниеОшибки`, поведение built-in функций.
- `data-model.md` — сущности: снимок ошибки, кадр, `ИнформацияОбОшибке`, `КадрСтекаВызовов`;
  правила идентификаторов источников; машина состояний перевыброса.
- `contracts/error-info-api.md` — BSL-контракт (свойства/методы/алиасы/ошибки).
- `contracts/host-output.md` — формат CLI stderr и браузерного `console.error`.
- `quickstart.md` — ручная проверка Node/браузер.
