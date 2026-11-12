# Data Model: каноническая форма встраивания `<script type="text/osjs">`

## 1. DataBlock (статический блок в DOM)

| Поле | Тип | Правила |
|---|---|---|
| `element` | `HTMLScriptElement` | `type` = `text/osjs` (ASCII case-insensitive); inline-содержимое |
| `id` | `string \| null` | регистрирует контекст для `data-os-*`; дубликат — «последний побеждает» |
| `source` | `string` | `element.textContent` (raw text; `<`, `>`, `&` literal) |
| `index` | `number` | порядок в документе (0-based) — определяет порядок исполнения |

**Инварианты**: блоки собираются только из документа в порядке `querySelectorAll`;
`src` игнорируется; динамически добавленные блоки не собираются; `<one-script>` не является
блоком и не исполняется.

## 2. ExecutionRun (один запуск движка)

| Поле | Тип | Правила |
|---|---|---|
| `state` | `'idle' \| 'waiting-dom' \| 'running' \| 'done'` | один запуск на документ; повторный запрещён флагом |
| `blocks` | `DataBlock[]` | зафиксированы на момент старта |
| `results` | `BlockResult[]` | по одному на блок, порядок сохраняется |

Состояния:

```
idle ──readyState !== 'loading'─────────────→ running ──all blocks──→ done
  │                                                   ▲
  └──readyState === 'loading' → waiting-dom ─DOMContentLoaded─┘
```

Ошибка блока не меняет состояние run: `BlockResult.error` фиксируется, исполнение продолжается.

## 3. BlockResult

| Поле | Тип | Правила |
|---|---|---|
| `index` | `number` | индекс блока |
| `id` | `string \| null` | для контекстов |
| `ok` | `boolean` | `false` при исключении/ошибке загрузки модулей |
| `error?` | `unknown` | в `console.error`, наружу не пробрасывается |

## 4. ContextRegistration

| Поле | Тип | Правила |
|---|---|---|
| `key` | `string \| null` | `id` блока или `null` |
| `context` | `GlobalContext` | свежий на блок |
| `default` | `boolean` | первый блок без `id` становится контекстом по умолчанию |

`data-os-*`-обработчики: `data-os-script="<id>"` → контекст по id; без атрибута → контекст
по умолчанию (первый блок без `id`); если его нет — обработчик не привязывается
(поведение как раньше, `resolveContext`).

## 5. MigrationInvariant (контракт миграции)

| Инвариант | Проверка |
|---|---|
| В `src/`, `tests/`, `examples/`, README/AGENTS/docs/task.md/конституции нет `<one-script>` (кроме исторических пометок) | `grep` + review |
| В браузерных тестах не осталось `customElements`/`createElement('one-script')` | `grep` |
| Все браузерные тесты создают блоки как `script[type="text/osjs"]` | review/grep |
| `examples/*.html` исполняются на новой форме | happy-dom/ручная проверка |
| `.osjs`-примеры/модули не переименованы; ядро/CLI не изменены | `git diff --stat` |

## 6. Диагностическое правило (контракт для спеки 015)

| Код | Severity | Условие | Где реализуется |
|---|---|---|---|
| `OSJS4001` | Error | последовательность `</script>` в BSL-коде (обрыв блока) | embedded-слой 015 |
| `OSJS4002` | Warning | `<script` или `<!--` в BSL-строке (legacy script-data) | embedded-слой 015 |

Диапазон — в координатах HTML-документа; сообщение объясняет риск и безопасную запись
(конкатенация строк / вынос HTML-шаблона). Runtime при обрыве сообщает ошибку разбора в
`console.error` и не пытается «угадать» причину.
