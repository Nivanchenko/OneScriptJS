# Архитектура OneScriptJS: карта «C# → TypeScript»

Этот документ — ориентир для переноса движка OneScript (C#) на TypeScript.
Он описывает слои оригинала и то, куда они лягут в нашем репозитории.

Источник: `reference/OneScript/docs/developer_docs.md`.

## Общая картина

OneScript — открытая реализация языка, совместимого с 1С/BSL, поверх стековой
виртуальной машины. Конвейер исполнения:

```
исходный код (.os / <one-script>)
  → лексер (LexicalAnalysis)
  → препроцессор (#Если / #Область / #Использовать)
  → парсер (SyntaxAnalysis → AST)
  → компилятор (CompilerFrontend → байткод)
  → стековая ВМ (MachineInstance / StackMachineExecutor)
  → стандартная библиотека (глобальные контексты)
```

## Слои C# и их TypeScript-аналоги

### 1. OneScript.Language → `src/lexer`, `src/parser`, `src/ast`

Преобразует исходник в токены и AST. Максимально независимый слой.

- `LexicalAnalysis/*` — лексер: состояния `String`/`Number`/`Comment`/`PreprocessorDirective`.
- `SyntaxAnalysis/*` — парсер и AST (`ModuleNode`, `MethodNode`, `CallNode`,
  `*LoopNode`, `BinaryOperationNode`/`UnaryOperationNode` и др.),
  препроцессор (`PreprocessingLexer`, `PreprocessorHandlers`, обработчики директив).
- Диагностика: `CodeError`, `ErrorPositionInfo`, `SyntaxErrorException`.

### 2. OneScript.Core → `src/runtime` (типы и значения)

Объектный каркас значений BSL, контексты, отражение.

- `Values/*` — `BslValue` и производные (строки/числа/дата/`Null`/`Undefined`/`Type`),
  ссылки на значения, сравнения и преобразования.
- `Contexts/*` — атрибуты `ContextClass`/`ContextMethod`/`ContextProperty`,
  построители `Bsl*Info`, отражение классов.
- `Compilation/Binding/*` — таблицы символов и привязка имён.

### 3. ScriptEngine → `src/runtime` (ВМ)

Стековая виртуальная машина и компилятор для неё.

- `Compiler/*` — `CompilerFrontend`, `StackMachineCodeGenerator` (байткод).
- `Machine/*` — `MachineInstance`/`StackMachineExecutor` (командный цикл, стек,
  кадры, исключения, итераторы), `ExecutionContext`, `BuiltinFunctions`.
- `Hosting/*`, `ScriptingEngine.cs` — фасад движка, DI, загрузка сборок.

### 4. OneScript.StandardLibrary → `src/stdlib`

Стандартные прикладные классы BSL: массивы, строки, файлы, сеть и т.д.
Двуязычные псевдонимы: `РусИмя`/`EngName`.

### 5. oscript / ScriptEngine.HostedScript → `src/node` (CLI)

Консольный хост для запуска `.os`-скриптов и встраивание движка в приложения.

### 6. Веб-обёртки → `src/browser/osConnector.ts`

Браузерное исполнение: регистрация `<one-script>`, запуск кода из содержимого
элемента, направление вывода `сообщить()` в `#output`.

## Статус переноса

Пока реализован только каркас проекта (см. `AGENTS.md`). Детальный план задач
по слоям фиксируется отдельно (пункт 2 исходного ТЗ).
