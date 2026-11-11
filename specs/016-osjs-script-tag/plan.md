# Implementation Plan: Каноническая форма встраивания — `<script type="text/osjs">`

**Branch**: `feat/linter` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-osjs-script-tag/spec.md`

## Summary

Перевести браузерный вход OneScriptJS с кастомного элемента `<one-script>` на HTML data
blocks `<script type="text/osjs">` и удалить старую форму. Движок собирает блоки в порядке
документа, исполняет каждый в свежем контексте (после готовности DOM, либо сразу при
поздней загрузке бандла), ошибки одного блока не мешают другим; `id` блока регистрирует
контекст для `data-os-*`. Мигрируются браузерные тесты, примеры, README/AGENTS/доки/
конституция/ТЗ; добавляются контракты диагностики `</script>` (Error) и `<script`/`<!--`
(Warning) для будущего embedded-слоя 015. Новых зависимостей нет, ядро и Node/CLI не
меняются.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), ES2022; браузерный бандл — Vite 6; тесты —
Vitest 3 + happy-dom.

**Primary Dependencies**: без новых. Используются существующие браузерные API (`document`,
`DOMContentLoaded`, `querySelectorAll`) и `src/runtime` (`run`, `preloadModuleSources`,
`createBrowserGlobalContext`, `registerScriptContext`, `scheduleDeclarativeBinding`).

**Storage**: нет.

**Testing**: Vitest; браузерные тесты `tests/browser-*.test.ts` (happy-dom) мигрируют на
`<script type="text/osjs">`; новый `tests/browser-script-tag.test.ts` покрывает семантику
(порядок, изоляция, raw-text, `id`-контексты, ошибки, отсутствие `<one-script>`).

**Target Platform**: браузер — основная среда (конституция II); Node/CLI не меняются.
Браузерный бандл — единый IIFE `dist/onescript.js`.

**Project Type**: single project (библиотека движка + браузерная обёртка).

**Performance Goals**: сканирование блоков O(n); исполнение последовательное, без
существенного замедления; типичная страница (десятки блоков) — доли секунды; рантайм не
блокирует страницу дольше, чем сейчас.

**Constraints**: только браузерные API в `src/browser`; ядро не получает DOM; raw-text
семантика (`<`, `>`, `&` literal, `</script>` обрывает); `src` и динамическая вставка — вне
v1; CSP/happy-dom/HTML-грамматика — проверки реализации; никаких новых зависимостей.

**Scale/Scope**: статические блоки после загрузки страницы; несколько блоков на страницу;
изоляция контекстов; миграция ~9 тестовых файлов, ~37 примеров, README/AGENTS/доки/
конституция/ТЗ.

## Constitution Check

*GATE: Must pass before Phase 0. Re-check after Phase 1.*

| Принцип | Проверка | Статус |
|---|---|---|
| I. Язык, формат `.osjs` и эталон | `.osjs`-формат и исполнение не меняются; меняется только носитель кода в HTML | PASS |
| II. Один движок — две среды (браузер — основная) | Браузерный контракт **переопределяется** (`<one-script>` → `<script type="text/osjs">`); это поправка конституции MAJOR с Sync Impact Report; решение владельца получено (спека 016). Ядро по-прежнему без DOM; Node-контракт неизменен | PASS при поправке конституции (входит в объём) |
| III. Test-First | Сначала тесты: новый браузерный suite и миграция существующих; красный → реализация → зелёный | PASS |
| IV. Слои и минимальный код | Меняется только `src/browser/onescript.ts` (+ комментарий в `dom-events.ts`); общий исполнитель минимизирует дубли; старый элемент и CSS удаляются; новых зависимостей нет | PASS |
| V. Доказанное «готово» | `pnpm typecheck && pnpm test && pnpm build`; браузерная приёмка — `examples/` в браузере (ручная, плюс happy-dom-тесты); вывод фиксируется | PASS |

Нарушений, требующих Complexity Tracking, нет. Единственная governance-операция —
поправка конституции (принцип II), она запланирована.

## Project Structure

### Documentation (this feature)

```text
specs/016-osjs-script-tag/
├── plan.md              # этот файл
├── research.md          # Phase 0: решения и альтернативы
├── data-model.md        # Phase 1: сущности и состояния
├── quickstart.md        # Phase 1: как проверить
├── contracts/           # Phase 1: runtime-контракт и контракт миграции
├── checklists/          # quality-чек-лист спеки (готов)
├── spec.md              # (готов) + Clarifications
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/browser/onescript.ts      # сбор script[type="text/osjs"], последовательное исполнение,
                              #   контексты/id, ошибки; удаление custom element + CSS
src/browser/dom-events.ts     # комментарий: контекст блока (код не меняется)
src/browser/context.ts        # без изменений
src/runtime/**                # без изменений
src/node/**                   # без изменений

tests/browser-script-tag.test.ts   # новый suite: порядок, изоляция, raw-text, id, ошибки
tests/browser-*.test.ts            # миграция 9 файлов с <one-script> на script-блоки
tests/helpers/**                    # правки, если хелперы создают элементы

examples/*.html               # миграция разметки (~37 вхождений), index/hello
README.md, AGENTS.md, task.md # браузерный контракт
docs/architecture.md, docs/status.md
.specify/memory/constitution.md
specs/013-osjs-format/spec.md, specs/014-osjs-editor-tooling/spec.md
```

**Structure Decision**: single project. Меняется только браузерная обёртка (`src/browser`),
ядро/Node/CLI остаются; миграция тестов и примеров — механическая, но обязательная часть
definition of done (конституция V).

## Implementation Strategy

### Фаза A — Runtime (US1, US3)

- В `src/browser/onescript.ts`: удалить `OneScriptElement`/`customElements.define`/
  `injectHiddenStyle`; добавить `collectBlocks()` (`script[type]` с type
  `text/osjs` case-insensitively), `executeBlock(block)` (свежий контекст,
  `registerScriptContext(id|null, ctx)`, `preloadModuleSources` → `run` → `scheduleDeclarativeBinding`,
  `catch → console.error`), `runAll()` — последовательное исполнение в порядке документа
  (await по блоку, чтобы гарантировать порядок). Запуск: если `document.readyState !== 'loading'`
  — сразу, иначе по `DOMContentLoaded`; защита от повторного запуска (модуль-синглтон + флаг).
- Тесты: новый `tests/browser-script-tag.test.ts`; миграция `tests/browser-*.test.ts`
  (вспомогательные `render()` создают `script`-блоки до импорта модуля либо эмитят
  `DOMContentLoaded` — учесть timing happy-dom).
- Удалить `<one-script>` полностью: элемент не регистрируется, CSS не инжектируется.

### Фаза B — Raw-text и контракт диагностики (US2)

- Тесты raw-text: `А<Б`, `&`, `</div>` в строках не искажаются; HTML-комментарии не
  исполняются; `type` в другом регистре матчится.
- Зафиксировать в документации (quickstart/README) гайдлайн `</script>`/`<script`/`<!--`;
  контракт диагностик `OSJS4001` (Error) и `OSJS4002` (Warning) — в `contracts/`, реализация
  правил — в спеке 015.

### Фаза C — Миграция примеров (US4)

- `examples/*.html`: `<one-script>` → `<script type="text/osjs">`, закрывающий тег →
  `</script>`; список примеров/README-ссылки не ломаются; `.osjs`-модули не трогаются.

### Фаза D — Документация и governance (US4)

- README, AGENTS (`<one-script>` → новая форма), `docs/architecture.md`, `docs/status.md`.
- `task.md`: пометка о пересмотре контракта (исходное ТЗ остаётся историческим).
- Конституция: принцип II (браузерный контракт) + Sync Impact Report + версия MAJOR 3.0.0.
- Спеки 013/014: упоминания формы встраивания — привести к новой реальности (с пометкой).

### Фаза E — Проверка и фиксация

- `grep` по tracked-файлам: `<one-script>` только в исторических/решенческих упоминаниях
  (016, task.md-пометка).
- `pnpm typecheck && pnpm test && pnpm build`; браузерная приёмка `examples/hello.html`
  (dev/preview или happy-dom-тест); `pnpm demo` при возможности.
- `docs/status.md`: 016 → реализовано, заметки о CSP/happy-dom; `tasks.md` — все `[X]`;
  коммит и push.

## Complexity Tracking

| Нарушение/риск | Почему нужно | Простая альтернатива отклонена, потому что |
|---|---|---|
| Поправка конституции (принцип II, MAJOR) | Меняется браузерный контракт встраивания по решению владельца | Оставить `<one-script>` — тупиковая HTML-семантика, дублирование; владелец выбрал script-тег |
| Удаление старых браузерных тестов/примеров (breaking) | Пользователей нет; две формы навсегда дороже | Deprecated-алиас — лишний код/доки/тесты без выгоды |

## Risks & Mitigations

- **happy-dom**: поведение `script`-элементов/`querySelectorAll`/`DOMContentLoaded` может
  отличаться от браузера. Митигация: тесты строят блоки до импорта модуля/эмитят событие;
  при расхождениях — реальный браузерный тест (спекa 007, Playwright) как проверка.
- **Порядок исполнения**: `preloadModuleSources` асинхронен; митигация — последовательный
  `await` по блокам в `runAll`.
- **Data blocks и CSP**: неисполняемые inline-script под `script-src` — проверить; если
  политика блокирует, задокументировать требование; не менять поведение безопасности.
- **`</script>`/`<script`/`<!--` в строках**: задокументировано; обязательный Error для
  `</script>` реализуется в 015 (здесь — контракт), предупреждения — Warning.
- **Форматтеры/редакторы**: raw text обычно сохраняется; гайдлайн и тесты.
- **Ссылки на `<one-script>` в исторических спеках**: обновить аккуратно, чтобы не
  переписывать историю решений; явные пометки.
