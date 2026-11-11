---

description: "Task list for feature 010-http-client"
---

# Tasks: HTTP-клиент BSL (HTTPСоединение, HTTPЗапрос, HTTPОтвет)

**Input**: Design documents from `specs/010-http-client/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/http-client-contract.md](contracts/http-client-contract.md),
[quickstart.md](quickstart.md)

**Tests**: Обязательны — принцип III конституции (Test-First, NON-NEGOTIABLE). Каждый
нетривиальный шаг начинается с падающего теста Vitest в `tests/`.

**Organization**: Задачи сгруппированы по историям из `spec.md`; каждая история
завершается независимой проверкой.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можно делать параллельно (разные файлы, нет зависимости от незавершённых задач)
- **[Story]**: к какой истории относится задача (US1, US2, US3)
- В описании — точный путь к файлу

## Path Conventions

Single project (см. `plan.md`): `src/`, `tests/` в корне репозитория.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Зафиксировать базовую линию до изменений.

- [x] T001 Подтвердить базовую линию: `pnpm typecheck` ✓ и `pnpm test` ✓ (ожидается 51 файл / 370 тестов); записать вывод в отчёт задачи

**Checkpoint**: база известна, регрессию можно измерять.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Транспортный контракт, объект запроса и регистрация типов — без этого не
работает ни одна история.

**⚠️ CRITICAL**: задачи US1–US3 не начинаются, пока фаза не завершена.

- [x] T002 [P] Экспортировать хелперы кодирования из `src/stdlib/binary.ts`: добавить
  `export { encode as encodeText, decode as decodeText, bytesToBase64 as toBase64 }` (не
  менять сигнатуры и поведение), чтобы HTTP не дублировал кодирование
- [x] T003 [P] Написать падающий тест `tests/http.test.ts`: `createGlobalContext()` без
  аргумента регистрирует типы `HTTPСоединение`/`HTTPConnection`, `HTTPЗапрос`/`HTTPRequest`;
  `Новый HTTPЗапрос` даёт `АдресРесурса = ""` и пустые `Заголовки`; `Новый HTTPЗапрос("/x", Новый Соответствие)`
  сохраняет адрес; `Новый HTTPСоединение("http://example.com")` без транспорта бросает
  «HTTP-запросы недоступны в этом окружении» (data-model.md §2.2, п. 1 и §4)
- [x] T004 [P] Написать падающий тест `tests/http.test.ts` (блок «ошибки конфигурации»):
  `ftp://example.com` → исключение о схеме; `Новый HTTPСоединение("example.com", 0)` без
  схемы даёт `Сервер = "example.com"`; порт `70000` → исключение; `Заголовки` не
  `Соответствие` (передать строку) → «Неверный тип аргумента»; седьмой аргумент SSL не
  `Неопределено` → исключение об SSL (data-model.md §2.2, пп. 1–4)
- [x] T005 Создать `src/stdlib/http.ts`: экспортируемые типы `HttpRequestData`,
  `HttpResponseData`, `HttpTransport` строго по contracts/http-client-contract.md §5; класс
  `BslHttpRequest` (`typeName = 'HTTPЗапрос'`, свойства `АдресРесурса`/`Заголовки`,
  сеттер `Заголовки` принимает только `BslMap`); функции `registerHttpFunctions(ctx, transport?)`
  и нормализацию схемы/порта — сделать T003 зелёным (без сетевых вызовов)
- [x] T006 [P] Добавить в `src/stdlib/global-context.ts`: сигнатуру
  `createGlobalContext(httpTransport?: HttpTransport)`, вызов `registerHttpFunctions(ctx, httpTransport)`
  после `registerBinaryFunctions`; тип `HttpTransport` реэкспортировать из `src/index.ts`
- [x] T007 Реализовать `src/stdlib/http.ts`: `BslHttpConnection` с валидацией
  конструктора по data-model.md §2.2 (схема, порт, SSL, отсутствие транспорта) и чтением
  свойств (§2.2, таблица) — сделать T004 зелёным
- [x] T008 [P] Написать падающий тест `tests/http-browser.test.ts`: создать `Window` из
  `happy-dom` с `settings.fetch.interceptor.beforeSyncRequest`, вернуть ответ
  `{status: 200, headers: new window.Headers({'Content-Type': 'application/json'}),
  body: Buffer.from('{"ok":true}')}`; подменить глобалы (`window`, `document`,
  `XMLHttpRequest`) и исполнить BSL `Соединение = Новый HTTPСоединение("http://example.com");
  Ответ = Соединение.Получить(Новый HTTPЗапрос("/api")); Сообщить(Ответ.КодСостояния);
  Сообщить(Ответ.ПолучитьТелоКакСтроку());` — ожидается `200` и `{"ok":true}`
- [x] T009 Реализовать `src/browser/http-transport.ts` (`createBrowserHttpTransport`):
  синхронный `XMLHttpRequest`, `overrideMimeType('text/plain; charset=x-user-defined')`,
  байты через `charCodeAt(i) & 0xff`, заголовки через `setRequestHeader` (запрещённые
  платформой пропускать), ответ — через `getAllResponseHeaders()`; ошибки `send`/`status = 0`
  оборачивать `Error` с URL — сделать T008 зелёным
- [x] T010 [P] Подключить транспорт в `src/browser/context.ts`:
  `createGlobalContext(createBrowserHttpTransport())`; убедиться, что `src/stdlib/http.ts`
  не импортирует DOM/Node (проверить `grep`)

**Checkpoint**: типы зарегистрированы, запрос/соединение валидируются, браузерный транспорт
исполняет запрос; HTTP-объекты доступны в браузерном контексте.

---

## Phase 3: User Story 1 - Скрипт на странице получает данные с бэкенда (Priority: P1) 🎯 MVP

**Goal**: `Новый HTTPСоединение(...)` → `Новый HTTPЗапрос(...)` → `Получить` → `HTTPОтвет`
с кодом, заголовками и телом-строкой.

**Independent Test**: фейковый транспорт отдаёт `200` + JSON; BSL-скрипт печатает статус и
разбирает тело через `ПрочитатьJSON`; happy-dom-тест подтверждает прохождение через
браузерный транспорт.

### Tests for User Story 1 ⚠️ (сначала — красные)

- [x] T011 [P] [US1] Дописать в `tests/http.test.ts` блок US1 на фейковом транспорте
  (транспорт записывает полученный `HttpRequestData`): GET → метод `GET`, URL
  `http://example.com/api/users`, `КодСостояния = 200`, `ПрочитатьJSON(Ответ.ПолучитьТелоКакСтроку())`
  даёт поле; `Ответ.Заголовки.Получить("Content-Type")` содержит `application/json`
- [x] T012 [P] [US1] Тесты разрешения URL в `tests/http.test.ts`: база
  `https://api.example.com/base/` + ресурс `users` → `https://api.example.com/base/users`;
  ресурс `/users` → `https://api.example.com/users`; ресурс `""` → базовый URL; порт из
  конструктора переопределяет порт URL (`http://example.com:8080`)
- [x] T013 [P] [US1] Тесты тела ответа в `tests/http.test.ts`: `charset=windows-1251` без
  явной кодировки декодируется верно (байты через `ПолучитьДвоичныеДанныеИзСтроки(...,
  "windows-1251")`); явный аргумент кодировки переопределяет заголовок; `404` с телом —
  не исключение; `204`/`HEAD`/`Content-Length: 0` → `ПолучитьТелоКакСтроку() = Неопределено`
  (spec.md US1, сценарии 3–5)
- [x] T014 [P] [US1] Тест gzip-нормализации в `tests/http.test.ts`: ответ с
  `Content-Encoding: gzip` и `Content-Length: 999` → в `Заголовках` нет `Content-Encoding`,
  `Content-Length` равен фактической длине тела (spec.md FR-014)

### Implementation for User Story 1

- [x] T015 [US1] Реализовать в `src/stdlib/http.ts` `BslHttpResponse` (`typeName = 'HTTPОтвет'`):
  свойства `КодСостояния`/`Заголовки`, методы `ПолучитьТелоКакСтроку(Кодировка?)`,
  `ПолучитьТелоКакДвоичныеДанные`, `Закрыть`; правило отсутствия тела (data-model.md §2.3);
  нормализацию gzip — сделать T013/T014 зелёными
- [x] T016 [US1] Реализовать в `src/stdlib/http.ts` `BslHttpConnection.Получить`/`Get`:
  собрать URL `new URL(ресурс, база)`, заголовки из `BslMap` через `iterate()`/`getIndex`,
  вызвать транспорт, обернуть ошибку в «Не удалось выполнить HTTP-запрос <METHOD> <URL>:
  <причина>», создать `HTTPОтвет`; `ИмяФайла` (2-й аргумент) непустой → исключение
  «запись ответа в файл не поддерживается» — сделать T011/T012 зелёными
- [x] T017 [US1] Зарегистрировать `HTTPСоединение`/`HTTPConnection` в
  `registerHttpFunctions` (`src/stdlib/http.ts`); прогнать
  `pnpm typecheck && pnpm test` — T008 и US1-тесты зелёные

**Checkpoint (MVP)**: GET-сценарий работает на фейковом транспорте и в happy-dom; спека US1
покрыта тестами.

---

## Phase 4: User Story 2 - Скрипт отправляет данные на сервер (Priority: P2)

**Goal**: POST/PUT/DELETE/PATCH/HEAD и произвольный метод; тело строкой и двоичными
данными; заголовки запроса уходят на сервер.

**Independent Test**: фейковый транспорт-эхо возвращает полученные метод/заголовки/тело;
BSL-скрипт проверяет каждый метод и оба вида тела.

### Tests for User Story 2 ⚠️ (сначала — красные)

- [x] T018 [P] [US2] Дописать в `tests/http.test.ts`: `УстановитьТелоИзСтроки("привет")` +
  `ОтправитьДляОбработки` → метод `POST`, тело равно `encodeText("привет", undefined, false)`
  (UTF-8 без BOM), заголовок `Content-Type` из `Заголовки.Вставить` передан; метод `Записать`
  → `PUT` с теми же байтами (contract §3)
- [x] T019 [P] [US2] Тесты `tests/http.test.ts`: `УстановитьТелоИзДвоичныхДанных` →
  `Записать` передаёт байты как есть; `Удалить` → `DELETE`; `Изменить` → `PATCH`;
  `ПолучитьЗаголовки` → `HEAD` и тело отсутствует; `ВызватьHTTPМетод("OPTIONS", Запрос)` →
  метод `OPTIONS`; тело, заданное для `GET`/`HEAD`, в транспорте равно `null` (FR-009)
- [x] T020 [P] [US2] Тест неизвестного метода/свойства в `tests/http.test.ts`: вызов
  `Ответ.ПолучитьТелоКакПоток()` и `Запрос.УстановитьИмяФайлаТела("x")` дают «Метод … не
  найден» (contract §2, «не реализованы»)

### Implementation for User Story 2

- [x] T021 [US2] Добавить в `BslHttpRequest` (`src/stdlib/http.ts`) методы тела:
  `УстановитьТелоИзСтроки` (кодирование `encodeText(data, encoding, false)`; третий аргумент
  BOM принимается и не влияет на байты), `ПолучитьТелоКакСтроку`,
  `УстановитьТелоИзДвоичныхДанных` (проверка `BslBinaryData`), `ПолучитьТелоКакДвоичныеДанные`
  — сделать T018-часть зелёной
- [x] T022 [US2] Добавить в `BslHttpConnection` методы `ОтправитьДляОбработки`/`Post`,
  `Записать`/`Put`, `Удалить`/`Delete`, `Изменить`/`Patch`, `ПолучитьЗаголовки`/`Head`,
  `ВызватьHTTPМетод`/`CallHTTPMethod` поверх общего `GetResponse(request, method, output)`;
  тело передавать только для методов вне `GET`/`HEAD`/`CONNECT` — сделать T018/T019/T020
  зелёными
- [x] T023 [US2] Прогнать `pnpm typecheck && pnpm test`; проверить, что US1-тесты не
  сломаны

**Checkpoint**: все HTTP-методы и оба вида тела работают; US1 и US2 независимо зелёные.

---

## Phase 5: User Story 3 - Понятные ошибки и параметры соединения (Priority: P3)

**Goal**: basic-auth, таймаут/редирект/свойства соединения, локализованные ошибки, Node-
транспорт, закрытие ответа.

**Independent Test**: фейковый транспорт видит `Authorization`; ошибки схемы/типа/SSL
локализованы; эхо-сервер в отдельном процессе подтверждает Node-транспорт; после `Закрыть`
тело `Неопределено`.

### Tests for User Story 3 ⚠️ (сначала — красные)

- [x] T024 [P] [US3] Дописать в `tests/http.test.ts`: `Новый HTTPСоединение("http://example.com", 0, "user", "pass")`
  → транспорт получает `Authorization: Basic <base64 UTF-8 user:pass>`; свойства
  `Сервер`, `Порт`, `Пользователь`, `Пароль`, `Таймаут`, `РазрешитьАвтоматическоеПеренаправление`
  читаются; `РазрешитьАвтоматическоеПеренаправление = Ложь` меняется, остальные свойства
  read-only (data-model.md §2.2; contract §3)
- [x] T025 [P] [US3] Тесты `tests/http.test.ts`: `Таймаут = 5` → `timeoutMs = 5000` в
  транспорте; `Таймаут = 0` → `0`; `Прокси = Неопределено`; после `Ответ.Закрыть()`
  `ПолучитьТелоКакСтроку()` = `Неопределено`, повторный `Закрыть()` не бросает; транспорт
  бросает `Error("boom")` → исключение содержит `GET`, URL и `boom`
- [x] T026 [P] [US3] Написать `tests/http-node.test.ts`: поднять эхо-сервер в отдельном
  процессе (`spawn(process.execPath, ['-e', serverScript])`, порт из stdout), выполнить BSL
  через `createNodeGlobalContext()` (`GET /echo` → `200`, тело `"ok"`), погасить сервер в
  `finally`; при недоступном порте — исключение с URL
- [x] T027 [US3] Реализовать `src/node/http-transport.ts` (`createNodeHttpTransport`):
  `spawnSync(process.execPath, ['-e', script], {input: JSON.stringify(...), encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024})`; script читает stdin, выполняет `fetch` с
  `redirect: allowRedirect ? 'follow' : 'manual'`, `AbortSignal.timeout(timeoutMs)` при
  `timeoutMs > 0`, печатает `{status, headers, bodyBase64}` или `{error}`; ошибки/код выхода
  → `Error` — сделать T026 зелёным
- [x] T028 [P] [US3] Подключить транспорт в `src/node/context.ts`:
  `createGlobalContext(createNodeHttpTransport())`; проверить `dist/cli.mjs` на BSL-скрипте
  из quickstart.md §3 — сделать T024/T025 зелёными
- [x] T029 [US3] Прогнать `pnpm typecheck && pnpm test`; проверить отсутствие Node-импортов
  в ядре (`grep -rn "node:" src/stdlib src/runtime src/parser src/lexer src/ast` → пусто)

**Checkpoint**: все три истории независимо зелёные; браузерный бандл не тянет Node-код.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Документация и доказанная готовность.

- [x] T030 [P] Обновить `docs/status.md`: добавить HTTP-клиент в «Что реализовано» и строку
  `010-http-client` в таблицу спецификаций (статус «реализовано»), актуализировать счётчик
  тестов
- [x] T031 [P] Обновить `docs/bsl-surface.md` (если в нём перечислены объекты stdlib) —
  добавить `HTTPСоединение`/`HTTPЗапрос`/`HTTPОтвет` и их методы
- [x] T032 Собрать браузерный бандл `pnpm build:browser` и проверить: в `dist/onescript.js`
  есть `HTTPСоединение`, нет `node:child_process`; при необходимости `pnpm build:node` и
  `pnpm build:cli`
- [x] T033 Прогнать сценарии [quickstart.md](quickstart.md): §1 (автотесты + сборка) и §3
  (CLI с локальным сервером) — вывод зафиксирован. §2 (реальный браузер) — ручная
  проверка пользователя: headless Chrome в DSH-окружении не подключается к localhost;
  браузерный транспорт покрыт happy-dom-тестом и сборкой бандла

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: без зависимостей.
- **Foundational (Phase 2)**: после Setup; блокирует US1–US3.
- **US1 (Phase 3)**: после Phase 2.
- **US2 (Phase 4)**: после Phase 2; использует `BslHttpRequest`/`BslHttpConnection` из Phase 2–3.
- **US3 (Phase 5)**: после Phase 2; Node-транспорт независим от US1/US2 по коду, но тесты
  используют готовое соединение.
- **Polish (Phase 6)**: после US1–US3.

### Within Each Story

- Тесты (T0xx) пишутся и краснеют до реализации.
- `BslHttpResponse` → `BslHttpConnection.Get` (US1).
- Тело запроса (`BslHttpRequest`) → методы соединения (US2).
- Свойства/ошибки → Node-транспорт (US3).

### Parallel Opportunities

- T002/T003/T004 — разные файлы/блоки, параллельно.
- T011–T014 — разные блоки `tests/http.test.ts`, параллельно (один файл: правки
  последовательны, но тесты независимы).
- T018–T020, T024–T025 — аналогично.
- T026 и T027 — тест Node-транспорта и его реализация разделены TDD-порядком.
- T030/T031 — документация параллельно.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 → Phase 2 → Phase 3.
2. **STOP and VALIDATE**: `tests/http.test.ts` (US1) и `tests/http-browser.test.ts` зелёные.
3. Демо: страница с `Получить` и `ПрочитатьJSON` (quickstart.md §2).

### Incremental Delivery

1. Foundation + US1 → GET-сценарий (MVP).
2. US2 → отправка данных на бэкенд.
3. US3 → аутентификация, ошибки, Node/CLI.
4. Polish → docs и сборка.

---

## Notes

- [P] = разные файлы/блоки, нет зависимости от незавершённых задач.
- [Story] связывает задачу с историей из spec.md.
- Перед реализацией каждой задачи-теста — убедиться, что он красный.
- Не коммитить (коммиты — только по явной просьбе).
- Не трогать `reference/OneScript/`.
