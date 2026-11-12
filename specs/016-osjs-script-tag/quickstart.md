# Quickstart: проверка `<script type="text/osjs">`

## 1. Автоматические проверки

```bash
cd /Users/nikita.ivanchenko/Documents/repos/github/OneScriptJS
pnpm install                 # если нужно
pnpm typecheck
pnpm test                    # включает browser-script-tag + мигрированные browser-тесты
pnpm build                   # браузерный бандл dist/onescript.js + node/cli/lsp
```

Ожидаемо: всё зелёное; в выводе тестов присутствуют `tests/browser-script-tag.test.ts` и
`tests/browser-*.test.ts`.

Инварианты миграции:

```bash
grep -Rn "<one-script" --include='*.ts' --include='*.html' --include='*.md' \
  src tests examples README.md AGENTS.md docs task.md .specify/memory 2>/dev/null
```
Ожидаемо: только исторические пометки (016 spec / task.md note).

## 2. Проверка в браузере (основная среда)

```bash
pnpm build:browser
pnpm dev            # или pnpm demo
```
Открыть `examples/hello.html` (приёмочный сценарий task.md), затем остальные примеры из
`examples/index.html`. В консоли — ожидаемый вывод `Сообщить()`; в тексте страницы блоков
кода нет; `<one-script>` больше нигде не используется.

Что проверить руками:

1. `hello.html` печатает приветствие/данные — блок исполнен, в DOM он `script[type="text/osjs"]`.
2. Пример с несколькими блоками — вывод в порядке документа.
3. Страница с `А<Б` и `&` в BSL-строке — значения без искажений (raw text).
4. `id` блока + декларативный обработчик (`data-os-*`) — срабатывает в контексте блока.
5. Старая разметка `<one-script>` на тестовой странице — код **не** исполняется.
6. Консоль: ошибка в одном блоке не мешает остальным (сообщение в `console.error`).

## 3. Проверка опасных последовательностей

```bash
pnpm vitest run tests/browser-script-tag.test.ts
```
Тесты фиксируют: raw-text (`<`, `&`, `</div>`), обрыв `</script>` даёт ошибку разбора
(не тихий успех) и документированный гайдлайн. Полноценная Error-диагностика `OSJS4001`
и Warning `OSJS4002` — в embedded-спеке 015 (контракт — в `contracts/`).

## 4. Соответствие критериям спеки

| SC | Как проверить |
|---|---|
| SC-001 | browser-script-tag: порядок, блоки не отображаются |
| SC-002 | raw-text тест (`<`, `&`, `</div>`) |
| SC-003 | изоляция блоков, ошибка одного не мешает другим |
| SC-004 | `id` + `data-os-*`-контекст |
| SC-005 | `#Использовать` от `document.baseURI` (browser-modules тест) |
| SC-006 | обрыв `</script>` → ошибка разбора; диагностики — контракт 015 |
| SC-007 | `grep <one-script` (только исторические пометки) |
| SC-008 | полный `pnpm test && pnpm build`; примеры работают |
| SC-009 | поправка конституции |
| SC-010 | `git diff` — ядро/CLI/`.osjs` не тронуты |

**Ограничение**: CSP-поведение data blocks и точность happy-dom проверяются в реализации;
при расхождении — реальный браузер (спекa 007) и документирование.
