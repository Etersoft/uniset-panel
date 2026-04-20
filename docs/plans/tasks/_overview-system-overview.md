# Overall Design Document: System Overview

Дата генерации: 2026-03-11
Целевой план: system-overview-workplan.md

## Обзор проекта

### Цель
Реализовать компонент "System Overview" -- диагностическую blueprint-диаграмму для визуализации межпроцессных связей в системе UniSet2. Инженеры смогут видеть потоки данных между процессами одного сервера в реальном времени.

### Контекст
Каждый процесс (UObject) просматривается изолированно в своей вкладке. Нет способа увидеть связи между процессами на уровне системы. System Overview решает эту проблему, отображая процессы как узлы blueprint-диаграммы, связанные через общие датчики.

## Проектирование разбиения задач

### Политика разбиения
Vertical slice: каждая задача реализует законченный функциональный элемент. Порядок определяется техническими зависимостями: vendor -> constants -> backend -> route -> frontend -> sidebar -> SSE -> E2E.

- Уровни верификации: L3 (build) для foundation задач, L2 (tests) для backend, L1 (functional) для integration

### Карта связей между задачами

```
Task 01 (1.1): Vendor LiteGraph.js + index.html → Deliverable: vendor file + script tag
  ↓
Task 02 (1.2): Constants → Deliverable: константы в 00-constants.js
  ↓ (параллельно с Task 01)
Task 03 (2.1): Backend handler + tests → Deliverable: handlers_overview.go + tests
  ↓
Task 04 (2.2): Route registration → Deliverable: маршрут в server.go
  ↓
Task 05 (3.1): Frontend module → Deliverable: 58-system-overview.js
  ↓
Task 06 (4.1): Sidebar integration → Deliverable: case 'overview' в sidebar
Task 07 (4.2): SSE integration → Deliverable: SSE callback в overview module
  ↓
Task 08 (5.1): E2E tests + QA → Deliverable: system-overview.spec.ts
```

### Анализ влияния изменений интерфейсов

| Существующий интерфейс | Новый интерфейс | Конвертация | Задача |
|------------------------|-----------------|-------------|--------|
| `setupRoutes()` | `setupRoutes()` + новый маршрут | Нет (добавление) | Task 04 |
| `activateSidebarGroupItem()` | + case 'overview' | Нет (добавление) | Task 06 |
| SSE `object_data` handling | + overview update callback | Нет (read-only) | Task 07 |

### Общие точки обработки
- Константы Overview -- определяются один раз в Task 02, используются в Task 05/07
- Структуры API контракта (`OverviewResponse`) -- определяются в Task 03, потребляются в Task 05
- `openSystemOverview()` -- определяется в Task 05, вызывается из Task 06

## Соображения по реализации

### Принципы, поддерживаемые на протяжении всей работы
1. Использовать хелперы `writeJSON`/`writeError` для backend (CLAUDE.md)
2. Константы в `UPPER_CASE` в `00-constants.js` (CLAUDE.md)
3. `make app` после каждого изменения JS файлов (CLAUDE.md)
4. Tab keys в формате `${serverId}:overview` для вкладок overview

### Риски и контрмеры
- Риск: LiteGraph.js `onDrawForeground` может быть недостаточен для отображения значений
  Контрмера: Spike-тест при реализации Task 05, fallback -- tooltip при наведении
- Риск: Узлы с 20+ портами слишком высокие
  Контрмера: Ограничить N первых портов + "..." индикатор

### Управление областью влияния
- Разрешенная область изменений: Файлы из File Map в Design Doc
- Области без изменений: Существующие рендереры (10-29), Dashboard (60-69), SSE hub логика, config система
