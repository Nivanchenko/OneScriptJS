# AGENTS.md — OneScriptJS

Точка входа для AI-агентов и автоматизации (DSH-режим). Здесь: цель проекта,
инструменты, команды, структура каталогов, карта «C# → TypeScript» и правила,
которых обязан придерживаться каждый агент.

## 1. Что это за проект

**OneScriptJS** — переписанный на TypeScript движок [OneScript](https://oscript.io)
(язык, совместимый с 1С/BSL). Требования из [`task.md`](task.md):

- запускаться на **Node.js** и в **браузере**;
- подключаться в браузере как `<script src="/osConnector.js"></script>`;
- исполнять код из кастомного элемента `<one-script>`, вывод функции
  `сообщить()` направлять в элемент `#output` (пример — [`examples/hello.html`](examples/hello.html)).

Оригинал на C# лежит в **`reference/OneScript/`** (игнорируется git-ом, см.
`.gitignore`). Это справочный исходник, а не код нашего репозитория — его **не
менять**.

## 2. Стек и инструменты

- **pnpm** — менеджер пакетов. Как запускать в DSH-окружении — см. §6.
- **Node.js** >= 20. В DSH-окружении использовать системный node из nvm, а не
  встроенный DSH-node (см. §6).
- **TypeScript** — strict-режим (`tsconfig.json`).
- **Vite** — сборка браузерного бандла и Node-библиотеки.
- **Vitest** — юнит-тесты.

## 3. Команды

| Действие | Команда |
|---|---|
| Установить зависимости | `pnpm install` |
| Проверка типов | `pnpm typecheck` |
| Собрать браузерный бандл (`dist/osConnector.js`) | `pnpm build:browser` |
| Собрать Node-библиотеку (`dist/node/`) | `pnpm build:node` |
| Полная сборка (типы + браузер + Node) | `pnpm build` |
| Запустить тесты | `pnpm test` |
| Тесты в watch-режиме | `pnpm test:watch` |
| Dev-сервер (для `examples/`) | `pnpm dev` |

## 4. Структура каталогов

```
OneScriptJS/
├── AGENTS.md               ← этот файл
├── task.md                 ← исходное ТЗ
├── package.json
├── tsconfig.json / tsconfig.build.json
├── vite.config.ts          ← браузерная сборка (osConnector.js)
├── vite.node.config.ts     ← Node-сборка (ESM + CJS)
├── vitest.config.ts
├── src/
│   ├── index.ts            ← точка входа библиотеки (Node / бандлеры)
│   └── browser/
│       └── osConnector.ts  ← браузерная точка входа (<one-script>)
├── tests/                  ← юнит-тесты Vitest
├── examples/               ← HTML-примеры (hello.html — приёмочный сценарий)
├── docs/
│   └── architecture.md     ← карта «C# → TypeScript» и план слоёв
└── reference/              ← исходник OneScript на C# (не коммитится)
```

## 5. Карта «C# → TypeScript» (кратко)

Подробнее — [`docs/architecture.md`](docs/architecture.md). Ключевые соответствия:

| Слой (C#, `reference/OneScript/src/`) | Назначение | Куда в TypeScript |
|---|---|---|
| `OneScript.Language` | лексер / препроцессор / парсер / AST | `src/lexer`, `src/parser`, `src/ast` |
| `OneScript.Core` | система типов, значения, контексты | `src/runtime` (типы/значения) |
| `ScriptEngine` | стековая ВМ, компилятор, фасад движка | `src/runtime` (ВМ) |
| `OneScript.StandardLibrary` | стандартная библиотека BSL | `src/stdlib` |
| `oscript`, `ScriptEngine.HostedScript` | CLI / хостинг | `src/node` (CLI) |
| веб-обёртки | браузерное исполнение | `src/browser/osConnector.ts` |

## 6. Правила и конвенции

1. **Менеджер пакетов** — только `pnpm`. В DSH-окружении встроенный DSH-node
   **не может** загружать нативные аддоны (macOS: «different Team IDs» у
   `.node`-библиотек rollup/esbuild), поэтому запускать pnpm нужно **системным
   node из nvm**:

   ```bash
   export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH"
   node "$DSH_PNPM" install   # $DSH_PNPM = путь к pnpm.mjs из load_workspace_dependencies
   node "$DSH_PNPM" test
   ```

   На обычной машине (без DSH) достаточно `pnpm install` / `pnpm test` с node >= 20.
2. **TDD** — сначала падающий тест (Vitest), потом минимальная реализация.
   Доступен скилл `generic-superpowers-test-driven-development`.
3. **Проверка перед «готово»** — прогнать `pnpm typecheck && pnpm test` (и при
   необходимости `pnpm build`), показать вывод как доказательство
   (`generic-superpowers-verification-before-completion`).
4. **BSL-имена двуязычные** — как в оригинале, поддерживать русские и английские
   алиасы идентификаторов (`Сообщить`/`Message`, `Если`/`If` и т.п.).
5. **Не трогать `reference/`** — только читать. Это эталон для сверки поведения.
6. **Коммиты** — только по явной просьбе пользователя. Не коммитить
   `reference/`, `node_modules/`, `dist/`, `coverage/`.
7. **Стиль** — 2 пробела, LF, строгий TypeScript; `.editorconfig` обязателен.
8. **Файлы в браузер** — `osConnector.ts` использует только браузерные API;
   общая логика живёт в `src/`, не в `src/browser/`.

## 7. Связанные документы

- [`task.md`](task.md) — исходное ТЗ и приёмочный HTML-пример.
- [`docs/architecture.md`](docs/architecture.md) — карта слоёв и статус переноса.
- `reference/OneScript/AGENTS.md` — инструкции к оригиналу (для справки).
- `reference/OneScript/docs/developer_docs.md` — архитектура C#-движка.
- `reference/OneScript/docs/contexts.md` — как устроены контексты/методы BSL.
