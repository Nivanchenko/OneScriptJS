# Specification Quality Checklist: Каноническая форма встраивания — `<script type="text/osjs">`

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-12
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

- Решение владельца зафиксировано явно: `<script type="text/osjs">` — канон, `<one-script>`
  удаляется, обратная совместимость не нужна (пользователей нет). Это продуктовое решение,
  поэтому упоминания HTML/script/runtime в спеке — пользовательская поверхность, а не
  детали реализации.
- Единственная мина raw text — `</script>` — по решению владельца закрывается **обязательной
  Error-диагностикой линтера** (FR-007); реализация правила — в спеке 015, здесь зафиксировано
  требование и код-кандидат `OSJS4001`.
- Информированные умолчания вынесены в Assumptions и «Dependencies & Open Decisions»:
  MIME `text/osjs` окончательный, `src`/динамическая вставка вне v1, диагностика `</script>`
  живёт в embedded-слое 015, CSP/happy-dom требуют проверки при реализации.
- Отдельно зафиксирована governance-зависимость: поправка конституции (принцип II,
  браузерный контракт) с Sync Impact Report (FR-013) — решение владельца получено.
