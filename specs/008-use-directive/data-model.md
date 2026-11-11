# Data Model: Упрощённая директива #Использовать

**Date**: 2026-11-11 | **Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

## 1. AST и препроцессор

### 1.1 `VariableDeclaration` (расширение)

| Поле | Тип | Смысл | Валидация |
|---|---|---|---|
| `names` | `string[]` | Объявленные имена (без изменений) | непустой |
| `exportedNames?` | `string[]` | Подмножество `names`, объявленных с `Экспорт` | каждое входит в `names` |

`parser.parseVariableDeclaration` уже матчит `KW_EXPORT`; теперь сохраняет имена в
`exportedNames`. Если `Экспорт` не указан — поле отсутствует (не пустой массив), чтобы
существующие `toMatchObject`-тесты не ломались.

### 1.2 `ImportDirective`

| Поле | Тип | Смысл |
|---|---|---|
| `path` | `string` | Текст пути из кавычек, как написан |
| `line` | `number` | Строка директивы — для диагностики |

### 1.3 `preprocessScript(tokens)`

Возвращает `{ tokens: Token[]; imports: ImportDirective[] }`. `imports` — только директивы
`#Использовать`/`#Use` в активных ветках (`isEmitting()`), в порядке появления.
`preprocess(tokens)` остаётся публичной обёрткой (`preprocessScript(tokens).tokens`).

Правила извлечения (см. [контракт](contracts/use-directive-contract.md)):
строка в кавычках → импорт; `""` → кавычка в пути; хвостовой `//` — комментарий; без
кавычек — не импорт (no-op).

## 2. Определение скрипта

### 2.1 `ScriptModuleDef`

| Поле | Тип | Смысл |
|---|---|---|
| `path` | `string` | Разрешённый (канонический) путь |
| `name` | `string` | Имя для доступа (из имени файла) |
| `kind` | `'module' \| 'class'` | Наличие `ПриСозданииОбъекта`/`OnObjectCreate` |
| `program` | `Program` | Разобранный AST (переиспользуется всеми экземплярами класса) |
| `imports` | `ImportDirective[]` | Импорты файла (из `preprocessScript`) |

Валидация при создании: `name` — BSL-идентификатор; синтаксические ошибки оборачиваются
путём файла.

## 3. Кеш рантайма

### 3.1 `ModuleCacheEntry`

| Поле | Тип | Смысл |
|---|---|---|
| `path` | `string` | Канонический путь (ключ кеша) |
| `name` | `string` | Имя для доступа |
| `kind` | `'module' \| 'class'` | Вид скрипта |
| `state` | `'loading' \| 'ready'` | Готовность |
| `module?` | `BslModule` | Синглтон модуля |
| `def?` | `ScriptModuleDef` | Определение класса (фабрика экземпляров) |

Состояния:

```text
          import(path)
               │
               ▼
         ┌──────────┐   тело исполнено / тип зарегистрирован   ┌─────────┐
         │ loading  │ ───────────────────────────────────────▶ │  ready  │
         └──────────┘                                          └─────────┘
               │ ошибка импорта/исполнения
               ▼
         запись удаляется, ошибка пробрасывается
```

Инварианты:

1. Запись создаётся **до** рекурсивной загрузки импортов и исполнения тела (FR-012).
2. Повторный импорт того же ключа — возврат записи, без повторного исполнения (FR-010).
3. `loading`-модуль отвечает на доступ к члену ошибкой циклической инициализации (FR-013).
4. Кеш принадлежит `ModuleLoader`, создаваемому на один `run()` (FR-011).

### 3.2 `ModuleLoader`

| Поле | Тип | Смысл |
|---|---|---|
| `sources` | `Map<string, string>` | Канонический путь → исходник (готовит платформа) |
| `cache` | `Map<string, ModuleCacheEntry>` | Кеш импорта |
| `owned` | `Map<string, string>` | имя в нижнем регистре → путь (конфликты имён) |
| `resolve` | `(path, importer) => string` | Платформенное разрешение пути |
| `env` | `ModuleRegistry` | Реестр глобальных имён/типов |

Операции:

- `importAll(directives, importerPath): void` — разрешить и загрузить по порядку.
- `import(resolvedPath, directive): void` — кеш/чтение исходника/разбор/регистрация/тело.
- `instantiate(def, args): BslInstance` — фабрика экземпляра класса.

## 4. Объекты рантайма

### 4.1 `BslModule implements BslObject`

| Поле | Тип | Смысл |
|---|---|---|
| `typeName` | `string` | Имя файла без расширения |
| `entry` | `ModuleCacheEntry` | Ссылка на запись (проверка `ready`) |
| `interpreter?` | `Interpreter` | Заполняется после исполнения тела |

Поверхность: `callMethod` — только экспортные методы; `getProp`/`setProp` — только
экспортные переменные; `getIndex`/`setIndex` — ошибка; `toDisplayString` — имя.

### 4.2 `BslInstance implements BslObject`

| Поле | Тип | Смысл |
|---|---|---|
| `typeName` | `string` | Имя класса |
| `interpreter` | `Interpreter` | Собственный интерпретатор экземпляра |

Создаётся фабрикой: `new Interpreter(env)` → `run(def.program)` (тело на экземпляр) →
проверка арности → `invokeMethod('ПриСозданииОбъекта', args)`.

### 4.3 `BslClassRef implements BslObject`

Sentinel, регистрируемый как глобальное имя класса. Любая операция (`getProp`,
`callMethod`, `setProp`, `getIndex`, `setIndex`) бросает ошибку «класс не является
модулем» с подсказкой `Новый <имя>(...)`.

## 5. Реестр (расширение `GlobalContext`)

`GlobalContext` реализует существующие `registerGlobal`/`registerType`/`resolveGlobal` и
получает:

| Метод | Смысл |
|---|---|
| `hasGlobal(name): boolean` | Занято ли имя переменной/модуля |
| `hasType(name): boolean` | Занято ли имя типа (включая встроенные) |

Интерфейс `ModuleRegistry` (в `src/runtime/context.ts`) описывает требуемую загрузчику
поверхность; если контекст её не реализует, импорт файла даёт понятную ошибку.

## 6. Поток исполнения `run()`

```text
run(source, env, options)
  ├─ tokenize(source)
  ├─ preprocessScript(tokens) ──▶ { tokens, imports }
  ├─ if imports.length:
  │    ModuleLoader(env, { sources: options.modules, resolve: options.resolve })
  │    loader.importAll(imports, options.basePath)
  └─ Interpreter(env).run(parse(tokens))
```

`RunOptions`:

| Поле | Тип | Смысл |
|---|---|---|
| `path?` | `string` | Путь исполняемого файла (для `ТекущийСценарий`, как раньше) |
| `basePath?` | `string` | База для разрешения импортов главного файла |
| `modules?` | `Map<string, string>` | Предзагруженные исходники |
| `resolve?` | `(path, importer) => string` | Платформенное разрешение пути |

По умолчанию `basePath = path ?? ''`, `resolve` — posix-нормализация (для тестов без
платформы). Node и браузер передают свои `resolve`.

## 7. Видимость и типы значений

| Выражение | Результат |
|---|---|
| `Модуль.Поле` | значение экспортной переменной; иначе ошибка |
| `Модуль.Поле = x` | запись экспортной переменной; иначе ошибка |
| `Модуль.Функция(...)` | вызов экспортной функции/процедуры |
| `Новый Класс(...)` | `BslInstance` с независимым состоянием |
| `Класс.Метод` | ошибка «класс не является модулем» |
| `Новый Модуль` | ошибка «модуль не является классом» |
| `ТипЗнч(Экземпляр)` | тип с именем класса (через `typeName`) |

Имена методов/переменных/типов сравниваются без учёта регистра — как во всём движке.
