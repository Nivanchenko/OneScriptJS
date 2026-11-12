# Contract: артефакты описания языка `.osjs`

Редакторо-независимая поставка языка. Потребитель — редактор с поддержкой
TextMate-грамматик и/или LSP. Клиент VS Code появится позже и будет **ссылаться** на эти
артефакты, а не копировать их.

## Состав и раскладка

```text
editors/osjs/
├── osjs.tmLanguage.json          # TextMate-грамматика, root scope source.osjs
├── language-configuration.json   # скобки, комментарии, фолдинг, wordPattern
├── languages.json                # метаданные привязки и пути
└── NOTICE.md                     # MIT: копирайт, текст лицензии, upstream-коммит, список правок
```

Файлы — статические, коммитятся; имена и пути стабильны (на них ссылаются конфигурации
редакторов и будущий клиент).

## Вендоринг грамматики

- **Upstream**: `1c-syntax/vsc-language-1c-bsl`, файл `syntaxes/1c.tmLanguage.json`,
  зафиксированный коммит `c93f87c76d8a536a494039e9dc78a684b14b4e4c` (последнее изменение
  файла). Канонический source-of-truth — `1c-syntax/1c-syntax` (`1c.YAML-tmLanguage`); берём
  сгенерированный JSON, чтобы не вводить YAML→JSON шаг сборки.
- **Лицензия MIT** (© 2015 xDrivenDevelopment): копирайт и разрешение обязаны ехать с
  файлом ⇒ `NOTICE.md` содержит текст лицензии, URL/коммит upstream и перечень правок.
- Синхронизация с upstream — вручную, по мере необходимости; факт и коммит фиксируются в
  `NOTICE.md`.

**Обязательные правки при вендоринге** (все проверены на реальной грамматике):

1. `scopeName: "source.osjs"`, `name/displayName: "osjs"`, `fileTypes: ["osjs"]`
   (в upstream — `["bsl", "os"]` — убрать оба: `bsl` и `os`), `uuid` удалить/заменить.
2. Переименовать **все** суффиксы `.bsl` → `.osjs` (~40 scope-имён), иначе в `source.osjs`
   остаются чужие scope-суффиксы.
3. Диалект — два паттерна сразу после группы `miscellaneous` (до `meta.var-single-variable`,
   иначе `Асинх = …` уедет в `meta.*`), с границами слова:
   - `Асинх|Async` → `storage.modifier.async.osjs`
   - `Ждать|Await` → `keyword.operator.word.await.osjs`
   Контекстные ложные срабатывания (`Ждать(Х)`) допустимы (Edge Cases спеки).
4. Добавить ключевые слова движка, которых нет в upstream: `Перейти/Goto`,
   `Выполнить/Execute`, `ДобавитьОбработчик/AddHandler`, `УдалитьОбработчик/RemoveHandler`.
   Остальные наборы `KW_*` покрыты upstream.
5. Убрать `include: "#query"` из строкового паттерна (SDBL-грамматику не поставляем) и
   вложенный `comment.line.double-slash` внутри строки (SDBL-артефакт: строка-продолжение,
   начинающаяся с `//`, иначе станет комментарием).
6. Вычистить неподдерживаемое: `#Вставка/#КонецВставки/#Удаление/#КонецУдаления/#native/#stack`
   и спец-паттерны платформенных аннотаций; общий `&Имя` остаётся.
7. Удалить `support.*` (29 паттернов платформы 1C: `Справочники`, `НачатьТранзакцию`,
   `ПоказатьВопрос`, `XMLСтрока`, `Сообщить`, … — в нашем движке этого списка нет);
   вместо `support.function` для `Новый|New` оставить ключевое слово
   `keyword.other.new.osjs`. Имена функций/переменных — зона semantic tokens (FR-010/FR-012),
   ручной список запрещён.

**Питфоллы**: `//`-паттерн должен идти раньше строкового; BOM в JSON-файле грамматики
снимать до `parseRawGrammar` (JSON.parse падает); отдельный паттерн для `|` не нужен —
многострочность даёт string begin/end.

## `languages.json` — метаданные

```json
{
  "schemaVersion": 1,
  "languages": [
    {
      "id": "osjs",
      "aliases": ["OneScriptJS", "OSJS"],
      "extensions": [".osjs"],
      "filenames": [],
      "scopeName": "source.osjs",
      "grammar": "osjs.tmLanguage.json",
      "configuration": "language-configuration.json"
    }
  ]
}
```

**Инварианты**:
- `extensions` содержит только `.osjs`; `*.os` отсутствует (FR-001, SC-002) — проверяется
  тестом, включая отсутствие `os`/`bsl` в `fileTypes` самой грамматики.
- `id` — ровно `osjs`; `scopeName` совпадает с root scope грамматики; пути относительны.
- Файл валиден как JSON; будущий клиент VS Code маппится 1:1 в
  `contributes.languages/grammars`.

## Покрытие грамматики (FR-002)

Таблица задаёт **семейства scope из upstream**; точные имена фиксируются тестом
(`tests/grammar.test.ts`) и не выдумываются контрактом.

| Конструкция | Ожидаемый scope (upstream, после `.osjs`-переименования) |
|---|---|
| Ключевые слова/управление (`Если/If`, `Тогда/Then`, `Для/For`, `Попытка/Try`, …) | `keyword.control.*` |
| Типы/объявления (`Процедура/Procedure`, `Функция/Function`, `Перем/Var`, …) | `storage.type.*` |
| Модификаторы (`Экспорт/Export`, `Знач/Val`) | `storage.modifier.*` |
| Операторы (`И/And`, `Или/Or`, `Не/Not`, …) | `keyword.operator.*` |
| Константы `Истина/Ложь/Неопределено/Null` | `constant.language.*` |
| Числа | `constant.numeric.*` |
| Строки, в т.ч. многострочные с `|` | `string.quoted.double` |
| Даты `'ГГГГММДД'` | `constant.other.date` |
| Комментарии `//` | `comment.line.double-slash` |
| Директивы `#Если/#Иначе/#КонецЕсли` | `keyword.other.preprocessor` |
| Директивы `#Область/#КонецОбласти` | `keyword.other.section` + `entity.name.section` |
| Аннотации `&Имя` (с параметрами) | `storage.type.annotation` (+ `variable.annotation`) |
| Диалект `Асинх/Async` | `storage.modifier.async.osjs` |
| Диалект `Ждать/Await` | `keyword.operator.word.await.osjs` |

**Правила**:
- `fileTypes` не содержит `bsl`/`os`; в scope-именах нет суффикса `.bsl`.
- Многострочные строки с `|` не «разваливаются» на код после перевода строки.
- `wordPattern` включает кириллицу (см. ниже); контекстные `Асинх`/`Ждать` могут
  подсвечиваться всегда — это допустимая неточность.
- Нет висячих `#include` (обход `repository` тестом).
- Платформенные `support.*` и неподдерживаемые директивы отсутствуют (вендоринг §6–7).

## `language-configuration.json` — поведение редактора

Обязательные поля (FR-003):

```json
{
  "comments": { "lineComment": "//" },
  "brackets": [["(", ")"], ["[", "]"]],
  "autoClosingPairs": [
    { "open": "(", "close": ")" },
    { "open": "[", "close": "]" },
    { "open": "\"", "close": "\"", "notIn": ["string", "comment"] }
  ],
  "surroundingPairs": [["(", ")"], ["[", "]"], ["\"", "\""]],
  "folding": {
    "markers": {
      "start": "^\\s*#(Область|Region|Если|If)(?![\\wА-Яа-яЁё])",
      "end": "^\\s*#(КонецОбласти|EndRegion|КонецЕсли|EndIf)(?![\\wА-Яа-яЁё])"
    }
  },
  "wordPattern": "[A-Za-zА-Яа-яЁё\\u0370-\\u03FF_][A-Za-zА-Яа-яЁё\\u0370-\\u03FF0-9_]*"
}
```

**Правила и границы**:
- `folding.markers` — ровно одна пара `start`/`end`, поэтому `#Область` и `#Если`
  объединяются альтернацией (несогласованные пары дают неверный диапазон, но не поломку).
  Граница слова — negative lookahead `(?![\\wА-Яа-яЁё])`, а не `\\b`: в JS `\\b`/`\\w`
  ASCII-only и после кириллицы (`#Область`) не срабатывает, из-за чего маркер молча
  не матчится.
- Тела методов маркерами грамматики не складываются: `Процедура`/`Функция` скоупит только
  подпись. Используется indentation-folding редактора; LSP `foldingRange` — вне объёма
  (Out of Scope спеки).
- `wordPattern` — переносимая строка с явными диапазонами (а не `\p{L}`: в
  `language-configuration.json` нет флагов regex, `\p{L}` молча не матчит кириллицу).
  Диапазоны паритетны лексеру (`src/lexer/lexer.ts`, `IDENT_START/PART`, включая греческий).
- `language-configuration.json` — де-факто VS Code-формат (VS Code и форки; Theia через
  plugin API). Другие редакторы используют собственные адаптеры; переносимы реально
  грамматика + `languages.json`.

## Граница с сервером

- Грамматика — только лексика: комментарии, строки, числа, даты, ключевые слова RU/EN +
  диалект, операторы, директивы, аннотации, скобки; `entity.name.function` — только на
  объявлении метода.
- Сервер (semantic tokens) — имена по смыслу: function/method/variable/parameter/property/
  class/enumMember; перекрытие с грамматикой допустимо (VS Code накладывает semantic tokens
  поверх TextMate).
- Файл без сервера обязан оставаться читаемым (FR-010).

## Тесты артефактов (`tests/grammar.test.ts`)

- `vscode-textmate@^9.3.2` + `vscode-oniguruma@^2.0.1` (WASM), импорт **только default**
  (CJS-пакет без `exports`: named-import падает в Node ESM), путь к `onig.wasm` через
  `createRequire(...).resolve('vscode-oniguruma/release/onig.wasm')`.
- Фикстура `tests/fixtures/osjs/grammar.osjs` + таблица `{line, column, scope}`; инварианты:
  `scopeName === 'source.osjs'`, `fileTypes === ['osjs']`, нет `.bsl` в scope-именах, нет
  висячих includes, `languages.json` без `os`/`bsl`, обязательные поля конфигурации,
  `new RegExp(wordPattern).test('Сообщить')`.
- Анти-drift: импортировать наборы `KW_*`/`DIR_*` из `src/parser/keywords.ts` (единый
  источник — парсер и инструменты используют его) и проверить keyword-scope у каждого слова
  (этот тест ловит пропущенные `Перейти/Выполнить/ДобавитьОбработчик`).
- Отклонено: `vscode-tmgrammar-test` (только CLI, без `main`, тянет старый textmate),
  `@vscode/test-electron` (нужен VS Code), `onigasm` (deprecated).
