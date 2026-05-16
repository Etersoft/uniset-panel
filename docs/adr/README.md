# Architecture Decision Records

Каталог ADR (Architecture Decision Records) — архитектурные решения проекта
с обоснованием и контекстом. ADR — living документы: status может меняться
(Proposed → Accepted → Superseded), сами решения остаются для истории.

**Чем отличается от `docs/superpowers/specs/`:** ADR описывает архитектурное
решение проекта (вечное, кросс-фичное), specs — frozen-in-time design
конкретной фичи из brainstorming workflow.

## Соглашение по naming

`NNNN-<kebab-case-topic>.md` — последовательная нумерация.

## Структура ADR

- **Status:** Proposed / Accepted / Implemented / Superseded by NNNN
- **Context:** что было до, какие проблемы
- **Decision:** что решили + почему
- **Consequences:** trade-offs, follow-up'ы

## Index

- [0001 — Configurable Sidebar Groups](0001-sidebar-groups.md) — server-driven YAML config для группировки entities в sidebar, через `GET /api/sidebar`.
