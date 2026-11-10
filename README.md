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

### Работа с DOM

В браузерной сборке дополнительно доступен объект `Документ`:

```html
<one-script>
    Заголовок = Документ.СоздатьЭлемент("h1");
    Заголовок.Текст = "Привет из BSL";
    Заголовок.ДобавитьВ(Документ.ТелоКорпуса);
</one-script>
```

`Документ.ПолучитьЭлемент("id")`, `СоздатьЭлемент("div")`, `Запросить("css-селектор")`,
`ТелоКорпуса`, `Заголовок`; у элемента — `Текст`, `HTML`, `Значение`, `Класс`, `Стиль`,
`Родитель`, `Дети`, атрибуты и классы.

### События элементов

Подписка из BSL — код исполняется в области видимости своего `<one-script>`:

```html
<button id="кнопка">+1</button>
<output id="вывод">0</output>

<one-script>
    Перем Счёт;
    Счёт = 0;
    Вывод = Документ.ПолучитьЭлемент("вывод");

    Документ.ПолучитьЭлемент("кнопка").НаСобытие("Нажатие",
        "Счёт = Счёт + 1; Вывод.Текст = Строка(Счёт);");
</one-script>
```

Или декларативно, без BSL-обвязки:

```html
<button data-os-click="Счёт = Счёт + 1;">+1</button>
```

Поддерживаются `data-os-click`, `data-os-input`, `data-os-change`,
`data-os-mouseenter`, `data-os-mouseleave`, `data-os-dblclick`,
`data-os-keydown`, `data-os-submit`. Контекст исполнения — `<one-script id="…">`
из атрибута `data-os-script="…"` (по умолчанию первый на странице).

> Чтобы обработчик менял переменную между вызовами, объявите её через `Перем`
> (иначе присваивание создаёт локальную — как в 1С внутри процедуры).

Готовые примеры: [`examples/dom.html`](examples/dom.html),
[`examples/counter.html`](examples/counter.html),
[`examples/input.html`](examples/input.html),
[`examples/hover.html`](examples/hover.html).

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
