# Contract: миграция на `<script type="text/osjs">`

Обратная совместимость не требуется (пользователей нет); миграция обязательна и полная.

## Что должно быть заменено

| Область | Файлы | Правило |
|---|---|---|
| Runtime | `src/browser/onescript.ts` | custom element/CSS удалены; сбор и исполнение script-блоков |
| Комментарии | `src/browser/dom-events.ts` | упоминание контекста блока (код не меняется) |
| Тесты | `tests/browser-*.test.ts` (9 файлов), `tests/browser-script-tag.test.ts` (новый) | блоки создаются как `script[type="text/osjs"]`; нет `customElements`/`createElement('one-script')` |
| Примеры | `examples/*.html` (~37 вхождений), `examples/index.html` | открывающий/закрывающий теги заменены; `.osjs`-модули не трогаются |
| README/AGENTS | `README.md`, `AGENTS.md` | браузерный контракт — новая форма; старые ссылки убраны |
| Доки | `docs/architecture.md`, `docs/status.md` | описание браузерной обёртки обновлено |
| Governance | `.specify/memory/constitution.md` | принцип II (браузерный контракт), Sync Impact Report, версия MAJOR 3.0.0 |
| ТЗ | `task.md` | пометка о пересмотре контракта (историческое ТЗ сохраняется) |
| Спеки | `specs/013`, `specs/014`, `specs/015` | упоминания формы встраивания приведены к новой реальности (с пометкой) |

## Инварианты приёмки

1. `grep -R "<one-script"` по tracked-файлам не находит вхождений **кроме**:
   - `specs/016-osjs-script-tag/spec.md` (описание удаления/истории),
   - исторической пометки в `task.md`.
2. `grep -R "customElements\|createElement('one-script')\|createElement(\"one-script\")" src tests` — пусто.
3. Все браузерные тесты используют `script[type="text/osjs"]`.
4. `examples/*.html` не содержат `<one-script>`; число открывающих и закрывающих
   `script`-тегов сбалансировано; страницы исполняются (happy-dom/ручная проверка).
5. `.osjs`-файлы, ядро (`src/lexer`, `src/parser`, `src/ast`, `src/runtime`, `src/stdlib`),
   `src/node`, CLI не изменены (кроме перечисленного).
6. `pnpm typecheck && pnpm test && pnpm build` зелёные; браузерный бандл собирается.

## Команды проверки

```bash
pnpm typecheck
pnpm test
pnpm build
grep -Rn "<one-script" --include='*.ts' --include='*.html' --include='*.md' --include='*.js' \
  src tests examples README.md AGENTS.md docs task.md .specify/memory 2>/dev/null
```

## Definition of Done

Все инварианты выше + `docs/status.md` (016 → реализовано) + `tasks.md` (все `[X]`) +
поправка конституции + коммит и push.
