# Implementation Plan: Фоновые задания (МенеджерФоновыхЗаданий, ФоновоеЗадание, Приостановить)

**Branch**: `feature/async` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/011-background-jobs/spec.md`

## Summary

Добавить в движок фоновые задания OneScript: глобальный `ФоновыеЗадания`
(`МенеджерФоновыхЗаданий`), `ФоновоеЗадание`, перечисление `СостояниеФоновогоЗадания`,
реестр с вытеснением и `Приостановить`. Модель исполнения — кооперативная: задания —
логические потоки в одном JS-потоке, переключаются в точках ожидания и по квантам; модульные
переменные и объекты общие.

Ключевое техническое решение — **генераторный интерпретатор с синхронным быстрым путём**.
`exec`/`eval` интерпретатора становятся генераторами, которые на точках приостановки
делают `yield Promise`. Драйвер `drive()` до первого `yield` исполняет всё синхронно и
возвращает обычное значение, а после — Promise. За счёт этого:

- скрипты без ожиданий исполняются синхронно, как сейчас (обратная совместимость, 435
  тестов не переписываются);
- скрипты с `Приостановить`/ожиданиями возвращают хост-среде Promise, и хост его ждёт;
- `Попытка/Исключение`, `Возврат`, `Прервать`, `Продолжить`, `Перейти` и области видимости
  сохраняются нативно: исключение и сигналы проходят через `yield*`/`gen.throw` так же, как
  в синхронной версии.

Фоновые задания и `Приостановить` живут в `src/stdlib/tasks/` и используют расширенный
контракт рантайма (`MaybePromise` в `RuntimeEnvironment` и `BslObject`).

## Technical Context

**Language/Version**: TypeScript 5.9, strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`), ES2022

**Primary Dependencies**: новых нет; таймеры — стандартные `setTimeout`/`MessageChannel`, доступные и в браузере, и в Node

**Storage**: N/A (реестр заданий и результаты — в памяти)

**Testing**: Vitest (Node) + happy-dom для браузерных сценариев; TDD по конституции, принцип III

**Target Platform**: браузер — основная среда (`<one-script>`, `dist/onescript.js`); Node.js >= 20 — CLI и тесты

**Project Type**: runtime-библиотека / интерпретатор языка (single project)

**Performance Goals**: без регрессии существующего набора; накладные расходы генераторного
интерпретатора на синхронных скриптах — приемлемые (цель: `pnpm test` не дольше чем в 2 раза);
20 заданий по `Приостановить(100)` завершаются быстрее 1 с; квант — не реже чем раз в ~10 мс
непрерывного исполнения задания

**Constraints**: ядро (`src/lexer`, `src/parser`, `src/ast`, `src/runtime`, `src/stdlib`) не
импортирует `node:*` и не обращается к DOM; `dist/onescript.js` — единый IIFE-бандл;
`pnpm typecheck` и `pnpm test` зелёные; скрипты без ожиданий остаются синхронными

**Scale/Scope**: конверсия `src/runtime/interpreter.ts` (~720 строк) в генераторы; новый
`src/runtime/async.ts` (~150 строк); `src/stdlib/tasks/` (~400 строк); правки контрактов
`RuntimeEnvironment`/`BslObject`/`EventProcessor` и ~8 файлов обвязки; 3–4 новых тестовых
файла; пример `examples/jobs.html`

**Baseline (измерено перед планированием, 2026-11-11)**: `pnpm typecheck` ✓; `pnpm test` ✓ —
**56 файлов, 435 тестов**, 1.66 с. `docs/status.md` актуален.

## Constitution Check

*GATE: пройден до Phase 0; перепроверен после Phase 1.*

| Принцип | Гейт | Статус | Обоснование |
|---|---|---|---|
| I. Совместимость с OneScript | Имена, сигнатуры и семантика из эталона; расхождения зафиксированы | ✅ | API и состояния — из `Tasks/*.cs` и `tasks.os`; единственное расхождение «потоки → кооперативность» зафиксировано в [spec.md](spec.md), [research.md](research.md), `docs/status.md` и тестами |
| II. Один движок — две среды | Ядро без Node/DOM, браузер — приёмка | ✅ | `setTimeout`/`MessageChannel` — стандартные API обеих сред; задачи и планировщик живут в `src/runtime`/`src/stdlib`; браузерная приёмка — `<one-script>` + happy-dom + `examples/jobs.html` |
| III. Test-First | Падающий тест до реализации | ✅ | Сначала `tests/background-jobs.test.ts`, `tests/async-runtime.test.ts`, `tests/browser-jobs.test.ts`; затем реализация |
| IV. Слои и минимальный код | Направление зависимостей, без «на потом» | ✅ | `runtime` (драйвер, интерпретатор) → `stdlib` (задачи, глобальная `Приостановить`) → обвязки; менеджер заданий — в `stdlib`, а не в ядре; новых зависимостей нет |
| V. Доказанное «готово» | `typecheck && test`, браузерная проверка | ✅ | Команды и ожидаемые результаты — в [quickstart.md](quickstart.md) |

**Отклонения**: настоящего параллелизма нет (следствие браузера как основной среды);
контракт `BslObject`/`RuntimeEnvironment` расширяется до `MaybePromise` — это цена
сохранения синхронного быстрого пути. Обе позиции обоснованы в [research.md](research.md);
необоснованных нарушений нет.

### Post-Design Re-check (Phase 1)

Контракты `contracts/background-jobs-contract.md` не вводят Node/DOM-зависимостей в ядро;
`MaybePromise` не протекает в публичный BSL, а генераторный драйвер не меняет семантику
синхронных скриптов. Гейты не изменились.

## Project Structure

### Documentation (this feature)

```text
specs/011-background-jobs/
├── plan.md              # этот файл
├── research.md          # Phase 0: решения и альтернативы
├── data-model.md        # Phase 1: сущности, состояния, инварианты
├── quickstart.md        # Phase 1: сценарии проверки
├── contracts/
│   └── background-jobs-contract.md   # BSL-поверхность и контракт рантайма
├── checklists/
│   └── requirements.md  # создан /speckit-specify
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── runtime/
│   ├── async.ts                 # NEW: MaybePromise, генераторный drive(), sleep/
│   │                            #      yieldToHost(), waitWithTimeout(), срез квантов
│   ├── interpreter.ts           # MOD: exec/eval/… → генераторы; JobContext/currentJob;
│   │                            #      публичные методы возвращают MaybePromise
│   ├── context.ts               # MOD: GlobalFunction/RuntimeEnvironment → MaybePromise,
│   │                            #      flushAsync?, поле для менеджера заданий
│   ├── object.ts                # MOD: BslObject.callMethod/getProp/getIndex/setIndex → MaybePromise
│   ├── events.ts                # MOD: raise/invoke → MaybePromise
│   ├── runner.ts                # MOD: run() → MaybePromise; flushAsync после тела модуля;
│   │                            #      цепочка импортов
│   ├── modules.ts               # MOD: importAll/importOne/createInstance → MaybePromise
│   ├── module-objects.ts        # MOD: BslModule/BslInstance методы → MaybePromise
│   └── script-object.ts         # MOD: ScriptModuleObject.callMethod → MaybePromise
├── stdlib/
│   ├── global-context.ts        # MOD: registerTasks(ctx), альяс Приостановить/Sleep
│   ├── enums.ts                 # MOD: СостояниеФоновогоЗадания / BackgroundJobState
│   ├── script.ts                # MOD: BslScript-мосты → MaybePromise
│   └── tasks/                   # NEW: фоновые задания
│       ├── index.ts             #   registerTasks(): глобал, enum, flush-хук
│       ├── manager.ts           #   BslBackgroundTasksManager (BslObject)
│       ├── task.ts              #   BslBackgroundTask (BslObject), жизненный цикл
│       ├── registry.ts          #   порядок, ёмкость 1000, вытеснение, фильтры
│       └── state.ts             #   состояния и их имена RU/EN
├── browser/
│   ├── onescript.ts             # MOD: дождаться run() (Promise) и только потом binding
│   ├── dom.ts                   # MOD: обработчики — fire-and-forget с .catch
│   └── dom-events.ts            # MOD: то же для data-os-*
├── node/
│   └── cli.ts                   # MOD: await run(...)
├── testing/
│   └── runner.ts                # MOD: runTests → MaybePromise
└── index.ts                     # MOD: runScript → MaybePromise

tests/
├── background-jobs.test.ts      # NEW: менеджер, задание, состояния, результат/ошибка
├── background-jobs-registry.test.ts  # NEW: реестр, фильтры, порядок, вытеснение
├── async-runtime.test.ts        # NEW: sync fast-path, Приостановить, кооперативность,
│                                #      кванты, обратная совместимость, синхронные тесты
└── browser-jobs.test.ts         # NEW: <one-script> + задания + отзывчивость страницы

examples/
└── jobs.html                    # NEW: ручная приёмка (маркер → ожидание → результат)
```

**Structure Decision**: single project; ядро остаётся средово-нейтральным, фоновые задания —
слой `src/stdlib/tasks/`, обвязки платформ только дожидаются `run()`.

## Implementation Phases

### Phase A — генераторный async-рантайм (фундамент)

1. `src/runtime/async.ts`: `MaybePromise`, `isThenable`, `thenMaybe`, `drive(gen, opts)`
   (sync fast-path + async loop с `gen.next`/`gen.throw`), `yieldMaybe`,
   `sleep`, `yieldToHost`, `waitWithTimeout`, счётчик среза квантов.
2. Контракты: `BslObject` и `RuntimeEnvironment` → `MaybePromise`; `EventProcessor` →
   `MaybePromise`; обновить реализации-мосты (`script-object`, `module-objects`, `script`).
3. Конверсия `interpreter.ts` в генераторы: каждый `this.eval/exec/...` → `yield*`;
   публичные методы (`run`, `invokeMethod`, `callExportedMethod`, `invokeMethodWithOutputs`,
   `executeInModule`) оборачивают приватные генераторы в `drive()`. `Приостановить` — первый
   потребитель приостановки.
4. Хосты и вызовы: `runner.run` (включая импорт модулей и `flushAsync`), `index.runScript`,
   CLI, testing-runner, браузерный `<one-script>`, DOM-обработчики, `ЗагрузитьСценарийИзСтроки`.

Критерий выхода: существующие 435 тестов зелёные без изменений; `tests/async-runtime.test.ts`
доказывает sync fast-path, `Приостановить` и кооперативное переключение.

### Phase B — фоновые задания

5. `registry.ts` + `state.ts` по семантике `BackgroundTasksRegistry`/`TaskStateEnum`.
6. `task.ts`: создание, `start()` (fork интерпретатора + drive с квантами), состояния,
   `Результат`/`ИнформацияОбОшибке`, `ОжидатьЗавершения` с таймаутом; `completion` никогда
   не reject-ится, ошибка хранится в задании.
7. `manager.ts`: `Выполнить` (валидация и копия `Параметры`), `Очистить`, `ОжидатьВсе`,
   `ОжидатьЛюбое`, `ОжидатьЗавершенияЗадач`, `ПолучитьФоновыеЗадания` (фильтры),
   `ПолучитьТекущее`; `Новый МенеджерФоновыхЗаданий` невозможен (тип не регистрируется).
8. `index.ts`: регистрация `ФоновыеЗадания`/`BackgroundJobs`, enum, `flushAsync`
   (дождаться активных заданий перед завершением запуска).

Критерий выхода: `tests/background-jobs*.test.ts` зелёные; `reference/OneScript/tests/tasks.os`
в объёме (≥ 15 сценариев) воспроизведён.

### Phase C — браузер, приёмка и документация

9. `examples/jobs.html` + `tests/browser-jobs.test.ts` (отзывчивость страницы, вывод после
   ожидания, ошибки заданий не ломают страницу).
10. `docs/status.md` (реализовано, расхождение с потоками), `docs/bsl-surface.md` (новые
    имена), `docs/architecture.md` (async-драйвер, слой tasks), обновить таблицу спек.
11. `pnpm typecheck && pnpm test && pnpm build`; `grep` на `node:*` в браузерном бандле.

## Risks & Mitigations

| Риск | Митигация |
|---|---|
| Конверсия интерпретатора в генераторы ломает семантику (return/break/goto/try) | TS строго ловит пропущенный `yield*`; существующие 435 тестов — регрессионный барьер; сначала sync fast-path, потом async-тесты |
| Утечки Promise в синхронный путь (скрипт неожиданно стал async) | `drive()` возвращает значение, если генератор завершился до `yield`; отдельный тест «синхронный скрипт вернул undefined» |
| Кванты замедляют задания / не дают странице отзывчивости | срез только в job-режиме, порог по времени (~10 мс), `MessageChannel` с fallback на `setTimeout`; SC-002 |
| Общий динамический контекст (`env.currentInterpreter`, `ctx.currentError`) при интерливинге | у задания свой `Ctx` (fork) с `currentError`/`currentJob`; env.currentInterpreter выставляется драйвером на время шага; ограничения `ТекущийСценарий` в задании — в `docs/status.md` |
| События/DOM-обработчики нельзя дождаться | `ВызватьСобытие` в BSL — `yield*`; DOM-обработчики fire-and-forget с `.catch`; ограничение зафиксировано |
| Импорт модулей с async-телом | `importAll` стал MaybePromise; тела импортируемых модулей рекомендуется синхронные; при приостановке цепочка импорта дожидается (без изменения семантики) |
| Таймеры в тестах Vitest недетерминированы | реальные таймеры + допуски (SC-001/SC-002 с запасом), никаких sleep-проверок на точные миллисекунды |

## Complexity Tracking

Нарушений конституции нет. Расширение `BslObject`/`RuntimeEnvironment` до `MaybePromise` —
осознанная цена синхронного быстрого пути; альтернатива (полностью async API или дубль
интерпретатора) отклонена в [research.md](research.md) R2.
