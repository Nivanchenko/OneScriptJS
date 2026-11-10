# OneScriptJS 

Движок [OneScript](https://oscript.io) (язык, совместимый с 1С/BSL), переписанный на
TypeScript. Работает в **Node.js** и в **браузере**. Оригинал на C# — в
`reference/OneScript/` (эталон, не входит в репозиторий).

## Браузер

Соберите `dist/onescript.js` и подключите его, затем пишите код в `<one-script>`:

```html
<script src="/onescript.js"></script>

<one-script>
    имя = "Никита";
    сообщить("Привет, " + имя);
</one-script>
```

Вывод `Сообщить()` идёт в JavaScript `console.log`.

## Node.js

### Как библиотека

```ts
import { runScript, createGlobalContext, run } from 'onescriptjs';

runScript('сообщить("Привет, мир");'); // выведет в console.log

// или со своим окружением
run('сообщить(2 + 3);', createGlobalContext());
```

### Как CLI

```bash
pnpm build          # собрать браузерный бандл, Node-библиотеку и CLI
pnpm oscript script.os
echo 'сообщить("hi");' | pnpm oscript
```

## Разработка

```bash
pnpm install        # установить зависимости
pnpm typecheck      # проверка типов
pnpm test           # юнит-тесты (Vitest)
pnpm build          # полная сборка
```

См. также [`AGENTS.md`](AGENTS.md), [`docs/architecture.md`](docs/architecture.md),
[`docs/plan.md`](docs/plan.md), [`docs/bsl-surface.md`](docs/bsl-surface.md).

## Лицензия

MIT.
