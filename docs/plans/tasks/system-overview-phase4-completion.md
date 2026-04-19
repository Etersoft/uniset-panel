# Phase 4 Completion: Integration (Sidebar + SSE)

Metadata:
- Dependencies: Task 06, Task 07
- Size: Verification only

## Чеклист завершения Phase 4

- [ ] Task 06: Case `'overview'` добавлен в `activateSidebarGroupItem()`
- [ ] Task 06: Клик на "System Overview" в sidebar открывает вкладку
- [ ] Task 07: SSE обновления отражаются на canvas
- [ ] Task 07: Pulse-анимация работает при изменении значений
- [ ] Task 07: Цвета ребер переключаются (active/inactive)
- [ ] `make app` + `make build` успешны

## E2E верификация (из Design Doc)

Integration Point 2: Sidebar -> Tab
- [ ] Клик на "System Overview" в sidebar открывает вкладку с canvas

Integration Point 3: SSE -> Canvas Update
- [ ] При изменении значения датчика значение на порте обновляется
- [ ] Ребро меняет цвет при переходе значения 0 <-> не-0

## Команды верификации

```bash
# Сборка
make app
make build

# Визуальная проверка
docker compose up dev-viewer -d --build
# 1. Кликнуть "System Overview" в sidebar
# 2. Наблюдать обновление значений в реальном времени
```
