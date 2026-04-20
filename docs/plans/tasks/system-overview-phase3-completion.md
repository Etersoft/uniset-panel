# Phase 3 Completion: Frontend (Основной JS-модуль)

Metadata:
- Dependencies: Task 05
- Size: Verification only

## Чеклист завершения Phase 3

- [ ] Task 05: `ui/static/js/src/58-system-overview.js` создан
- [ ] Task 05: `openSystemOverview()` создает вкладку с canvas
- [ ] Task 05: Узлы и ребра рендерятся на основе backend-данных
- [ ] Task 05: Layout размещает узлы left-to-right
- [ ] Task 05: Fit to Screen работает
- [ ] `make app` + `make build` успешны

## E2E верификация (из Design Doc)

Integration Point 2: Sidebar -> Tab (предварительно -- без sidebar, через console)
- [ ] Вызов `openSystemOverview(serverId, serverName)` из console браузера создает вкладку
- [ ] Canvas отображает узлы процессов
- [ ] Ребра между совпадающими портами видны

## Команды верификации

```bash
# Сборка
make app
make build

# Визуальная проверка
docker compose up dev-viewer -d --build
# В console браузера: openSystemOverview('serverId', 'ServerName')
```
