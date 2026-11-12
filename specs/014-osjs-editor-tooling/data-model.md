# Data Model: Редакторные инструменты `.osjs`

Все сущности — либо статические артефакты репозитория, либо состояние процесса LSP-сервера.
Ничего не персистится на диск; данные движка и браузерной сборки не меняются.

## 1. Артефакты описания языка (статические, `editors/osjs/`)

| Поле | Тип | Примечание |
|---|---|---|
| `languageId` | `'osjs'` | единственный наш language id |
| `scopeName` | `'source.osjs'` | root scope грамматики; дублируется в `languages.json` |
| `extensions` | `['.osjs']` | без `.os` (FR-001) |
| `grammar` | путь | `osjs.tmLanguage.json` (вендоренная MIT-копия `1c-syntax`) |
| `configuration` | путь | `language-configuration.json` |
| `metadata` | путь | `languages.json` — то, что читает потребитель-редактор |
| `notice` | путь | `NOTICE.md` — копирайт/лицензия/коммит upstream, список правок |

**Правила валидации**: метаданные не содержат `*.os`; grammar scope начинается с
`source.osjs`; конфигурация валидна по схеме редактора; имена файлов — стабильные
(на них ссылаются будущий клиент VS Code и другие редакторы).

## 2. Каталог API движка (`src/lsp/generated/api-catalog.ts`)

Генерируется из таблиц `docs/reference.md`; имена сверяются с `src/` существующим
`scripts/check-api-docs.mjs`. Коммитится; рассинхронизация ловится drift-тестом.

```ts
interface ApiCatalog {
  schemaVersion: 1;
  generatedFrom: 'docs/reference.md';
  functions: FunctionInfo[];
  types: TypeInfo[];
  enums: EnumInfo[];
  /** Глобальные объекты из `registerGlobal` (Ожидаем, ФоновыеЗадания, …). */
  globals: string[];
}

interface ParamInfo {
  name: string;
  type: string;          // «Любое», «Строка», «Массив»…
  optional: boolean;     // из `?`
  variadic: boolean;     // из `…`
}

interface FunctionInfo {
  ru: string;
  en?: string;           // английский алиас, если есть
  params: ParamInfo[];
  returns: string | null; // null — «—» (значения нет)
  description: string;
  section: string;       // раздел справочника, например «Строки»
  env?: 'node' | 'browser'; // если раздел помечен средой
  arityKnown?: boolean;  // false — арность неизвестна (встроенные операторы), проверки пропускаются
}

interface MemberInfo {
  ru: string;
  en?: string;
  params?: ParamInfo[];
  returns?: string | null;
  description: string;
  access?: 'read' | 'write' | 'readwrite';
}

interface TypeInfo {
  ru: string;
  en?: string;
  constructible: boolean; // true только для зарегистрированных через registerType
  description?: string;
  methods: MemberInfo[];
  properties: MemberInfo[];
}

interface EnumInfo {
  ru: string;
  en?: string;
  values: { ru: string; en?: string; meaning: string }[];
}
```

**Инварианты**: только таблицы-источники из справочника; порядок стабилен (порядок
разделов и строк); `ru`/`en` — допустимые BSL-идентификаторы; `optional`/`variadic`
согласованы с парсером параметров; если `en` нет — поле отсутствует, а не пустая строка.
**Арность** для диагностик: `required = params.filter(!optional && !variadic).length`,
`max = variadic ? Infinity : params.length`.

## 3. Документ и анализ (память сервера)

```ts
interface DocumentState {
  uri: string;
  languageId: string;
  version: number;      // из LSP didOpen/didChange
  text: string;         // полная синхронизация: всегда актуальный текст
  analysis?: Analysis;  // кэш до следующего изменения
}

interface Analysis {
  tokens: Token[];        // с диапазонами (endLine/endColumn, UTF-16)
  trivia: Token[];        // комментарии и директивы — для semanticTokens
  imports: ImportDirective[];
  program?: Program;      // частичный AST в толерантном режиме
  diagnostics: Diagnostic[]; // синтаксис+препроцессинг, затем семантика
  symbols: SymbolTables;
}

interface SymbolTables {
  methods: MethodSymbol[];               // имя, параметры, диапазон, isFunction/isAsync/exported
  moduleVars: SymbolInfo[];              // `Перем` модуля и присваивания в теле модуля
  locals: SymbolInfo[];                  // параметры, `Перем` методов, счётчики циклов, неявные локальные
  importedModules: { path: string; moduleName: string; line: number }[];
  knownNames: Set<string>;               // нижний регистр: методы, переменные, параметры, имена импортов
}
```

**Правила**:
- Позиции внутри сервера — LSP-совместимые: строка 0-based, character 0-based, UTF-16;
  движок отдаёт 1-based строку/колонку → преобразование `-1`, без пересчёта кодовых точек.
- Диапазон токена = `[start, end)`; для многострочных строк конец считается по последней
  строке лексемы; для semantic tokens многострочная строка разбивается на сегменты по
  строкам (LSP-токен не может пересекать строку).
- Пустой/невалидный документ не даёт исключений: анализ всегда возвращает `Analysis` с
  диагностикой и, если возможно, частичным AST.

## 4. Диагностика

```ts
interface Diagnostic {
  range: Range;                  // 0-based, UTF-16
  severity: 1 | 2 | 3 | 4;       // Error | Warning | Information | Hint
  code: string;                  // стабильный ID правила, см. contracts/diagnostics.md
  source: 'osjs';
  message: string;               // русский, с позицией/контекстом
}
```

**Правила**:
- Ошибки разбора/лексера/препроцессора — `Error` (1xxx/2xxx), семантика — `Warning` (3xxx);
  стилевых правил нет (FR-006).
- На документ публикуется не более **200** диагностик; лишние отбрасываются по позиции с
  пометкой в логе сервера (защита от «тысячи ошибок» в промежуточном состоянии).
- Дедупликация по `(code, range.start, message)`; сортировка по позиции; устаревшие наборы
  заменяются целиком (`publishDiagnostics` для версии документа).

## 5. Токены подсветки

```ts
interface SemanticToken {
  line: number;        // 0-based
  startChar: number;   // 0-based, UTF-16
  length: number;      // UTF-16 code units, в пределах одной строки
  tokenType: 'keyword' | 'operator' | 'number' | 'string' | 'comment'
           | 'decorator' | 'function' | 'method' | 'variable'
           | 'parameter' | 'property' | 'enumMember';
}
```

**Легенда**: только стандартные типы LSP (клиенты рендерят лишь объявленные ими типы),
`tokenModifiers: []`. Маппинг: директива препроцессора → `keyword`, дата → `number`,
аннотация → `decorator`, имя метода → `method`, имя глобальной функции → `function`.
Порядок легенды фиксирован и объявляется в capabilities. Токены сортируются по позиции;
пересечения запрещены (строки/комментарии — высший приоритет). Многострочный литерал
разбивается на сегменты по строкам.

## 6. Модель вывода типов для `Член.` (только completion)

```ts
type InferredType =
  | { kind: 'known'; name: string }   // имя типа из каталога
  | { kind: 'unknown' };
```

Источники (все — по AST, без исполнения):
1. `Новый <Тип>` / `Новый("<Тип>")` — тип известен.
2. Переменная, которой **один раз** присвоено выражение с известным типом в текущей
   области (при повторном присваивании другим типом — `unknown`; лучше промолчать).
3. Прямой вызов stdlib-функции, у которой в каталоге ровно один тип возврата (например,
   `СтрРазделить(...)` → `Массив`).
Параметры методов и модульные переменные без инициализатора — `unknown`.

## 7. Жизненный цикл состояния

```
initialize ─→ (idle) ──didOpen──→ analyze(DocumentState) ──publishDiagnostics──→ (idle)
                ↑                        │
                │                   didChange (version+1) → analysis=undefined → analyze
                │                        │
                └──didClose───────────────┘ (состояние документа удаляется)

shutdown → exit: состояние очищается, незавершённые запросы не выполняются.
```

- Документы с `languageId !== 'osjs'` не анализируются и не диагностируются (FR-001, SC-002).
- Анализ выполняется последовательно; запросы к документу используют последний
  завершённый анализ (без ожидания — если анализ ещё не готов, ответ может быть пустым,
  но после `publishDiagnostics` состояние консистентно).
- Перезапуск процесса сервера — чистое состояние; клиент присылает `didOpen` заново.
