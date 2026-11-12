# Contract: LSP-сервер `.osjs`

Пользовательская поверхность первой версии: **один документ, полная синхронизация,
stdio-транспорт, LSP 3.17**. Сервер редакторо-независим; тонкий клиент VS Code появится
отдельно и не должен требовать изменений в этом контракте.

## Транспорт и жизненный цикл

- Процесс запускается как `node dist/lsp/server.mjs` от `src/node/lsp-server.ts`
  (5 строк: `createConnection(ProposedFeatures.all, process.stdin, process.stdout)` →
  `registerHandlers(connection)`); стримы передаются явно, флаг `--stdio` не обязателен.
- JSON-RPC 2.0 по stdio с framing `Content-Length` реализует официальный SDK
  (`vscode-languageserver@11`); собственный framing не пишем.
- Последовательность: `initialize` (запрос) → `initialized` (уведомление) → работа →
  `shutdown` (запрос) → `exit` (уведомление). После `shutdown` запросы, кроме `exit`,
  получают `InvalidRequest`.
- `initialize` объявляет кодировку позиций `utf-16`; иные кодировки не поддерживаются
  (`shortcut: клиенту, предложившему только utf-8, всё равно отвечаем utf-16`).
- Неизвестный метод — `MethodNotFound`; неизвестное уведомление игнорируется без падения.
- Сервер не читает и не пишет файлы, не ходит в сеть, не отправляет телеметрию. Резолв
  `#Использовать` путь→file-URI — инжектированная функция из `src/node`
  (`resolveImport(importPath, documentUri)`); `src/lsp` не импортирует `node:*`.

## Объявленные возможности (capabilities)

```ts
{
  positionEncoding: 'utf-16',
  textDocumentSync: { openClose: true, change: 1 },   // Full
  completionProvider: { triggerCharacters: ['.'], resolveProvider: false },
  hoverProvider: true,
  documentSymbolProvider: true,
  definitionProvider: true,
  semanticTokensProvider: {
    legend: {
      tokenTypes: [
        'keyword', 'operator', 'number', 'string', 'comment', 'decorator',
        'function', 'method', 'variable', 'parameter', 'property', 'enumMember',
      ],
      tokenModifiers: [],
    },
    full: true,
    range: false, // delta/range не объявляем
  },
}
```

`diagnosticProvider` **не** объявляется: диагностика только push, смешивать модели нельзя.
Никаких возможностей «на будущее» не объявляется: только реализованные.

## Методы

| Метод | Направление | Поведение |
|---|---|---|
| `textDocument/didOpen` | клиент → сервер | создаёт `DocumentState` (uri, version, languageId, text); синхронно анализирует и публикует `publishDiagnostics` с `version` |
| `textDocument/didChange` | клиент → сервер | полный текст новой версии; инкрементальные range-изменения не поддерживаются (change = Full); синхронный пересчёт |
| `textDocument/didClose` | клиент → сервер | удаляет состояние и публикует пустые диагностики для uri |
| `textDocument/publishDiagnostics` | сервер → клиент | полный набор диагностик для версии документа; никогда не «дополняет» старый набор; `didClose` → `[]` |
| `textDocument/completion` | запрос | `CompletionItem[]` (`label`, `kind`, `detail` = сигнатура, `documentation` markdown, `sortText`); без snippets/`resolve`; пустой массив допустим |
| `textDocument/hover` | запрос | `Hover | null`; `contents` — markdown (учесть `hover.contentFormat` клиента), `range?` |
| `textDocument/semanticTokens/full` | запрос | дельта-кодированный массив 5 ints/token; только стандартные token types (D16); пустой массив, если нет токенов |
| `textDocument/documentSymbol` | запрос | `DocumentSymbol[]` с `range` + `selectionRange`: методы (`Method`/`Function`), `#Область` (`Namespace`); при отсутствии иерархической поддержки — flatten в `SymbolInformation` |
| `textDocument/definition` | запрос | `Location | Location[] | null`: локальный метод/переменная — наш uri+range; `#Использовать` — `Location` файла модуля (`range 0:0`); untitled — `null` |

### Общие правила поведения

- **Чужой язык**: если `languageId !== 'osjs'`, сервер не анализирует документ и не
  публикует диагностик; запросы подсказок для него возвращают пустой результат.
- **Версии**: анализ синхронный ⇒ порядок ответов и версий детерминирован; диагностики
  публикуются с `version` из `didOpen/didChange`. При появлении асинхронного анализа —
  guard `version < current → drop`.
- **Отказы**: исключение в провайдере ловится, логируется (stderr), на запрос возвращается
  корректный пустой результат, сервер продолжает работу. Падение процесса — дефект.
- **Пределы**: не более 200 диагностик на документ; completion — не более 500 items;
  semantic tokens — без лимита при файле ≤ 10 000 строк, дальше — без токенов.
- **Сообщения** диагностик — на русском; `source: 'osjs'`; стабильные `code`
  (см. `contracts/diagnostics.md`).
- **Регистрация**: `registerHandlers(connection)` в `src/lsp/server.ts` без side effects —
  in-process тест переиспользует боевую регистрацию, capabilities не разъезжаются.

## Проверяемость (контрактные тесты)

1. In-process: сервер `createConnection(ProposedFeatures.all, toServer, toClient)` +
   клиент `createMessageConnection(StreamMessageReader/Writer)` (`vscode-jsonrpc/node`) на
   `PassThrough`-стримах; сценарии: initialize → didOpen с 3 ошибками → publishDiagnostics
   (3, верные range/version) → didChange с исправлением → пустой набор; чужой languageId;
   запрос до initialize.
2. Smoke реального процесса: `spawn(process.execPath, ['dist/lsp/server.mjs'])` →
   initialize → completion → shutdown/exit (код 0); `describe.skipIf(!existsSync(dist))`,
   чтобы `pnpm test` не требовал сборки; прецедент — `tests/http-node.test.ts`.
3. Негативные: невалидный JSON-RPC — сервер отвечает ошибкой протокола и остаётся жив.

## Совместимость с артефактами языка

Сервер не привязан к конкретному редактору: его единственный вход — LSP-клиент. Связка
«`*.osjs` → languageId `osjs` → наш сервер» настраивается в клиенте по метаданным
`editors/osjs/languages.json` (`id`, `extensions`, `scopeName`, пути к артефактам; см.
`contracts/language-artifacts.md`).
