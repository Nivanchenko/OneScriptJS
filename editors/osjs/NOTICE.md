# NOTICE — TextMate-грамматика OneScriptJS (`.osjs`)

## Авторство и лицензия

`osjs.tmLanguage.json` — производная работа от TextMate-грамматики BSL:

- **Upstream**: <https://github.com/1c-syntax/vsc-language-1c-bsl>
- **Файл**: `syntaxes/1c.tmLanguage.json`
- **Зафиксированный коммит**: `c93f87c76d8a536a494039e9dc78a684b14b4e4c`
  (последнее изменение файла на момент вендоринга)
- **Канонический source-of-truth**: `1c-syntax/1c-syntax` (`1c.YAML-tmLanguage`);
  используется сгенерированный JSON, чтобы не вводить YAML→JSON шаг сборки.

```text
The MIT License (MIT)
=====================

Copyright © 2015 xDrivenDevelopment

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the “Software”), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
```

## Правки относительно upstream

Вендоренная копия — не upstream verbatim. Перед использованием применены правки
(полное обоснование — `specs/014-osjs-editor-tooling/contracts/language-artifacts.md`):

1. **Метаданные**: `scopeName: "source.osjs"`, `name`/`displayName`: `osjs`,
   `fileTypes: ["osjs"]` (в upstream — `["bsl","os"]`; оба значения убраны), `uuid` удалён.
2. **Scope-суффиксы**: все `.bsl` → `.osjs` (40 scope-имён), иначе в `source.osjs`
   остаются чужие суффиксы.
3. **Диалект движка**: `Асинх|Async` → `storage.modifier.async.osjs`,
   `Ждать|Await` → `keyword.operator.word.await.osjs` (паттерны после `#miscellaneous`,
   до `meta.var-single-variable`, с границами слова).
4. **Ключевые слова движка**, отсутствовавшие в upstream: `Перейти/Goto`,
   `Выполнить/Execute`, `ДобавитьОбработчик/AddHandler`, `УдалитьОбработчик/RemoveHandler`.
5. **SDBL удалён**: репозиторий `#query` и его `include` в строковом паттерне, а также
   вложенный `comment.line.double-slash` внутри строки (SDBL-артефакт: строка-продолжение,
   начинающаяся с `//`, иначе становилась бы комментарием).
6. **Неподдерживаемое вычищено**: директивы `#Вставка`/`#КонецВставки`/`#Удаление`/
   `#КонецУдаления`/`#native`/`#stack`; спец-аннотации платформы
   (`storage.modifier.directive`: `&НаКлиенте`, `&НаСервере`, …) — общий `&Имя` остаётся.
7. **`support.*` удалены** (29 паттернов платформенных имён 1C — `Справочники`,
   `НачатьТранзакцию`, `ПоказатьВопрос`, `XMLСтрока`, `Сообщить`, …): в движке
   OneScriptJS их нет, а имена функций/переменных — зона semantic tokens. Вместо
   `support.function` для `Новый|New` оставлено ключевое слово `keyword.other.new.osjs`.

## Синхронизация с upstream

Синхронизация **ручная**, по мере необходимости. При обновлении:

1. Взять `syntaxes/1c.tmLanguage.json` из нового коммита `1c-syntax/vsc-language-1c-bsl`.
2. Снять BOM (если появился) и заново применить все правки из списка выше.
3. Обновить в этом файле коммит и, при изменении состава правок, их список.
4. Прогнать `pnpm vitest run tests/grammar.test.ts` — он фиксирует фактические
   scope-имена и инварианты вендоринга.
