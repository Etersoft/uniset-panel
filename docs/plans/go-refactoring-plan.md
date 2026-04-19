# Go Code Refactoring Plan

## Фаза 1: Высокий эффект

### 1.1 Разбить main() на setup-функции
**Файл:** `cmd/server/main.go` (414 строк в одной функции)

Выделить:
- `setupStorage(cfg) → storage.Storage`
- `loadSensorConfigs(cfg) → map + default`
- `setupRecording(cfg, store) → *recording.Manager`
- `setupManagers(cfg, ...) → managers struct`
- `setupHTTPServer(cfg, handlers) → *http.Server`
- `gracefulShutdown(server, managers)`

### 1.2 Удалить мёртвый код
- `SetUWSGatePoller()` в `internal/api/handlers.go:98-101` — никогда не вызывается
- Поле `uwsgatePoller` в `internal/api/handlers.go:47` — никогда не заполняется
- `GetServerByURL()` в `internal/server/manager.go:234-245` — только в тестах (оставить или удалить?)

### 1.3 Унифицировать логирование
Сейчас 3 подхода:
- `logger.Debug/Info()` — обёртки из `internal/logger`
- `slog.Debug/Info()` — напрямую из stdlib
- `m.logger.Info()` — поле структуры

Решение: перевести всё на `slog.*()` напрямую (стандарт Go, без лишних обёрток).
Либо: перевести всё на `logger.*()` обёртки (единообразие).

---

## Фаза 2: Средний эффект

### 2.1 Консолидировать require/get Poller хелперы
`internal/api/helpers.go:69-171` — 6 функций → 1-2 дженерик-функции

### 2.2 Обобщить broadcast-методы в SSE
`internal/api/sse.go:191-300` — 4 одинаковых метода → 1 generic

### 2.3 Вынести повторяющиеся паттерны хендлеров
- Journal: проверка journalMgr + getClient → хелпер
- Launcher: getLauncher + context.WithTimeout → обёртка

### 2.4 NewInstance() — config struct вместо 12 параметров
`internal/server/instance.go:68-81`

---

## Фаза 3: Тесты

### 3.1 API handlers (приоритет: ionc, modbus, opcua, logserver)
### 3.2 recording/export.go
### 3.3 helpers.go
