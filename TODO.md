# TODO - UniSet2 Viewer

## Поддержка нескольких серверов (Multi-Server)

### Фаза 1: Конфигурация
- [ ] Поддержка множественных `--uniset-url` флагов
- [ ] Новый флаг `--config` для YAML файла
- [ ] Файл `internal/config/yaml.go` — загрузка YAML конфига
- [ ] Генерация ID для серверов без явного ID
- [ ] Структура `ServerConfig` (ID, URL, Name)

### Фаза 2: ServerManager
- [ ] `internal/server/instance.go` — ServerInstance (client + pollers для одного сервера)
- [ ] `internal/server/manager.go` — управление всеми серверами
- [ ] `internal/server/status.go` — ServerStatus, health check
- [ ] Методы: AddServer, RemoveServer, ListServers, GetAllObjects, Shutdown

### Фаза 3: Storage
- [ ] Добавить `serverID` в интерфейс Storage
- [ ] Обновить `memory.go` — ключ `serverID:object:variable`
- [ ] Обновить `sqlite.go` — колонка `server_id`, миграция

### Фаза 4: API
- [ ] `GET /api/servers` — список серверов со статусом
- [ ] `POST /api/servers` — добавить сервер
- [ ] `DELETE /api/servers/{id}` — удалить сервер
- [ ] `GET /api/servers/{id}/status`
- [ ] Обновить `GET /api/objects` — объекты со всех серверов с `server_id`
- [ ] Поддержка `?server=` или формата `serverID:objectName` в endpoints

### Фаза 5: SSE
- [ ] Добавить `ServerID`, `ServerName` в SSEEvent
- [ ] Новый тип события `server_status` для изменения состояния сервера

### Фаза 6: main.go
- [ ] Рефакторинг: замена одиночного client/poller на ServerManager
- [ ] Инициализация серверов из конфигурации

### Фаза 7: UI
- [ ] Отображение метки сервера у объектов
- [ ] Обработка `serverID` в SSE событиях
- [ ] UI для добавления/удаления серверов

---

## В работе

### Тестирование
- [ ] Playwright e2e тесты на SSE функциональность
- [ ] Playwright тесты на fallback к polling при недоступности SSE

### Типы объектов
- [ ] Проработать отображение для других типов объектов
- [ ] Документировать API рендереров для расширения

### Архитектура
- [ ] Обсудить: сервер возвращает сырой JSON, парсинг на UI (сервер не знает формат полей)
