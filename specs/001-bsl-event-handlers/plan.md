# Implementation Plan: События BSL — подписка и вызов обработчиков

**Branch**: `feature/speckit_intergation` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-bsl-event-handlers/spec.md`

## Summary

Добавить в движок языковую поверхность событий BSL: операторы `ДобавитьОбработчик` /
`УдалитьОбработчик` (+ английские алиасы `AddHandler` / `RemoveHandler`), метод
`ВызватьСобытие` / `RaiseEvent` и свойство `ЭтотОбъект` / `ThisObject`. Подписки хранятся
в реестре, принадлежащем `GlobalContext` (общий на процесс исполнения), а не самому
интерпретатору: так скрипт может подписаться на событие объекта, созданного другим
модулем `ЗагрузитьСценарийИзСтроки`. Доставка синхронная, порядок — порядок подписки,
метод-обработчик обязан быть доступен через объект (экспортный).

Технический подход (детали и альтернативы — в [research.md](research.md)):

- **AST** (`src/ast/nodes.ts`): два оператора `AddHandlerStatement` / `RemoveHandlerStatement`
  с полями `eventSource: Expression`, `eventName: Expression`, `handlerTarget: Expression | null`,
  `handlerMethod: Expression`.
- **Парсер** (`src/parser/parser.ts`): распознавать операторы в `parseStatement`, проверять
  форму записи (свойство/индекс — иначе локализованная ошибка) и раскладывать её на
  «объект + выражение имени», не вычисляя обработчик как значение.
- **Рантайм**: новый `src/runtime/events.ts` (`EventProcessor`), новый
  `src/runtime/script-object.ts` (`ScriptModuleObject implements BslObject`),
  правки `src/runtime/interpreter.ts` (`ЭтотОбъект`, `ВызватьСобытие`, исполнение
  операторов), `src/runtime/context.ts` (поле `events`), `src/stdlib/global-context.ts`
  (создание реестра).
- **Браузер**: изменений в `src/browser/` не требуется — фича целиком в ядре; приёмка
  браузера подтверждается отдельным happy-dom-тестом страницы `<one-script>`.

## Technical Context

**Language/Version**: TypeScript 5.9, strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`), ES2022

**Primary Dependencies**: новых зависимостей нет; используются существующие Vite и Vitest

**Storage**: N/A (реестр подписок живёт в памяти `GlobalContext`)

**Testing**: Vitest (юнит/приёмочные), happy-dom (браузерный сценарий `<one-script>`)

**Target Platform**: браузер — основная среда; Node.js — вспомогательная (отладка и тесты)

**Project Type**: runtime-библиотека / интерпретатор языка (single project)

**Performance Goals**: без деградации существующего набора (300 тестов, 43 файла);
вызов события с *k* обработчиками — O(k), без обхода всех подписок процесса

**Constraints**: ядро (`src/lexer`, `src/parser`, `src/ast`, `src/runtime`, `src/stdlib`)
не импортирует Node/DOM; `dist/onescript.js` остаётся единым IIFE-бандлом; `pnpm typecheck`
и `pnpm test` зелёные

**Scale/Scope**: 2 новых модуля рантайма (~120 строк), 1 пара AST-узлов, 1 метод парсера,
правки интерпретатора; 8 эталонных сценариев `events.os`

**Baseline (измерено перед планированием)**: `pnpm typecheck` ✓; `pnpm test` ✓ (43 файла,
300 тестов); эталонный корпус `reference/OneScript/tests/*.os` — 18/66 проходят;
`events.os` падает на разборе: `ожидается ';'` (строка 57, колонка 21).

## Constitution Check

*GATE: пройден до Phase 0; перепроверен после Phase 1.*

| Принцип | Гейт | Статус | Обоснование |
|---|---|---|---|
| I. Совместимость с OneScript | Русские и английские имена; сверка с эталоном | ✅ | Ключевые слова/методы двуязычны (`LanguageDef.cs:119`, `BilingualString`); семантика взята из `BuildEventHandlerOperation`, `DefaultEventProcessor`, `events.os` |
| II. Один движок — две среды | Ядро без Node/DOM; браузерная приёмка | ✅ | Новая логика только в `src/runtime/*`; браузерный сценарий проверяется happy-dom-тестом |
| III. Test-First | Падающий тест до реализации | ✅ | Task-порядок: сначала `tests/events.test.ts` (красный), затем рантайм; каждый FR покрыт |
| IV. Слои и минимальный код | Направление зависимостей, отсутствие «на потом» | ✅ | `ast → parser → runtime → stdlib`; новая зависимость не вводится; ограничение (только методы у `ЭтотОбъект`) помечено `shortcut:` |
| V. Доказанное «готово» | `typecheck && test`, браузерная проверка | ✅ | Команды и ожидаемый результат зафиксированы в разделе Verification |

**Отклонение (обосновано ниже)**: прогон `events.os` целиком отложен — см. Complexity Tracking.

### Post-Design Re-check (Phase 1)

После проектирования `data-model.md` и `contracts/event-handler-contract.md` гейты не
изменились: контракты не вводят Node/DOM-зависимостей, новых принципов не нарушают.
Отклонение осталось одно (перенос полного прогона `events.os`).

## Project Structure

### Documentation (this feature)

```text
specs/001-bsl-event-handlers/
├── plan.md                                    # этот файл
├── research.md                                # Phase 0: решения и альтернативы
├── data-model.md                              # Phase 1: сущности и инварианты
├── quickstart.md                              # Phase 1: сценарии проверки
├── contracts/
│   └── event-handler-contract.md              # Phase 1: грамматика и семантика
└── tasks.md                                   # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── ast/
│   └── nodes.ts                # + AddHandlerStatement, RemoveHandlerStatement
├── parser/
│   └── parser.ts               # + KW_ADD_HANDLER/KW_REMOVE_HANDLER, parseHandler()
├── runtime/
│   ├── events.ts               # новый: EventProcessor (реестр подписок и доставка)
│   ├── script-object.ts        # новый: ScriptModuleObject (ЭтотОбъект как BslObject)
│   ├── object.ts               # + опциональный hasMethod() у BslObject
│   ├── context.ts              # + events?: EventProcessor в RuntimeEnvironment
│   ├── interpreter.ts          # + этотобъект/вызватьсобытие, исполнение операторов
│   └── runner.ts               # без изменений
├── stdlib/
│   ├── global-context.ts       # + создание EventProcessor
│   └── script.ts               # + export-only hasMethod у BslScript (FR-011)

tests/
├── events.test.ts              # новый: 8 сценариев events.os + краевые случаи
├── events-registry.test.ts     # новый: unit-тесты EventProcessor
├── parser.test.ts              # + разбор операторов и диагностика
├── browser-events.test.ts      # новый: <one-script> в happy-dom
└── acceptance.test.ts          # без изменений (регрессия)
```

**Structure Decision**: single project — движок уже живёт одним пакетом; новых пакетов и
каталогов не вводим. Изменения локализованы в существующих слоях `ast` → `parser` →
`runtime` + одна регистрация в `stdlib`.

## Complexity Tracking

| Отклонение | Почему нужно | Почему упрощённый вариант отвергнут |
|---|---|---|
| Полный прогон `events.os` отложен (FR-013/SC-001 уточнены) | Файл регистрирует класс через `ПодключитьСценарий(ТекущийСценарий().Источник, "ТестСобытий")` и создаёт `Новый ТестСобытий` — это остаток T39 (регистрация типа из файла + доступ к файлу), которого в движке нет | Реализация `ПодключитьСценарий` требует чтения файла (Node-only слой) и затрагивает реестр типов — отдельная фича, раздувающая объём и ломающая «браузер первым»; 8 сценариев воспроизводятся в Vitest через существующий `ЗагрузитьСценарийИзСтроки` |
| `ЭтотОбъект` отдаёт только методы (доступ к модульным переменным через него не поддержан) | Для событий нужен только метод-обработчик; `ДобавитьОбработчик … ЭтотОбъект.Метод` разбирается структурно и не вычисляет `getProp` | Поддержка чтения/записи переменных через `ЭтотОбъект` шире требования и требует решений о видимости/`Экспорт`; помечено `shortcut: доступ к переменным, когда появится рефлексия (T45)` |

## Verification

Выполняется в порядке принципа II/V конституции:

```bash
pnpm typecheck && pnpm test          # ожидается: 0 ошибок, все тесты зелёные (300 + новые)
pnpm build                           # ожидается: браузер, Node-библиотека, CLI и типы собираются
node scripts/run-reference-tests.mjs # ожидается: 18/66 без регрессий (events.os остаётся в 18)
```

Браузерный гейт: `tests/browser-events.test.ts` исполняет `<one-script>` с подпиской и
объявлением события через happy-dom и проверяет вывод — это приёмочная проверка «работает
в браузере», а не только Node-тест.

Эталонная приёмка: 8 сценариев `events.os` воспроизведены в `tests/events.test.ts`
(подписка, отписка, локальный метод, объектный метод, индексные формы, ошибка неэкспортного
метода, два события одного источника, подавление дубликата).
