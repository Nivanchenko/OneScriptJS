# Specification Quality Checklist: Асинхронные методы (`Асинх`/`Ждать`, `Обещание`)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-11
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- `Асинх`/`Ждать`/`Обещание` — пользовательская поверхность языка из эталона и 1C, а не
  детали реализации.
- Ключевые решения приняты как информированные умолчания и явно вынесены в Assumptions:
  (1) `Ждать` в теле модуля разрешён — иначе в нашем движке некому ожидать `Обещание`;
  (2) async-процедура тоже возвращает `Обещание` — по запросу пользователя;
  (3) `Обещание` непрозрачно, как в 1C 8.3.18.
  Каждое расхождение с эталоном зафиксировано в шапке спеки и будет закреплено тестом и
  `docs/status.md` (конституция, принцип I).
- Вне scope: отмена/таймауты ожидания, `КогдаВсе`/`КогдаЛюбой`, async-конструкторы,
  async-обработчики событий с ожиданием, async-импорт модулей, async HTTP.
- Кларификации не потребовались: синтаксис и диагностика заданы парсером эталона,
  семантика исполнения — 1C:Enterprise 8.3.18+; спорные места решены в пользу
  работоспособности в браузере и явно отмечены.
