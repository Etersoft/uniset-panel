# Task 2.2: Регистрация маршрута

Metadata:
- Dependencies: Task 03 (handler должен существовать)
- Provides: Маршрут `GET /api/servers/{id}/overview` в `setupRoutes()`
- Size: Small (1 файл)

## Содержание задачи

Зарегистрировать маршрут `GET /api/servers/{id}/overview` в функции `setupRoutes()` файла `internal/api/server.go`. Маршрут привязывается к handler'у `handleServerOverview`, реализованному в Task 03.

## Целевые файлы
- [ ] `internal/api/server.go` (Modify)

## Шаги реализации

### 1. Подготовка
- [ ] Прочитать `internal/api/server.go`, найти `setupRoutes()`
- [ ] Определить подходящее место для нового маршрута (рядом с другими серверными маршрутами)

### 2. Добавление маршрута
- [ ] Добавить строку в `setupRoutes()`:
  ```go
  s.mux.HandleFunc("GET /api/servers/{id}/overview", s.handlers.handleServerOverview)
  ```
- [ ] Разместить рядом с существующими server-related маршрутами или в новой секции с комментарием:
  ```go
  // System Overview
  s.mux.HandleFunc("GET /api/servers/{id}/overview", s.handlers.handleServerOverview)
  ```

### 3. Проверка
- [ ] `go build ./internal/api/...` компилируется
- [ ] `go test ./internal/api/...` проходит (включая тесты из Task 03)

## Критерии завершения
- [ ] Маршрут `GET /api/servers/{id}/overview` зарегистрирован в `setupRoutes()`
- [ ] `go test ./internal/api/...` проходит
- [ ] `make build` успешен
- [ ] Верификация: L3 (Build Success) + L2 (тесты из Task 03 продолжают проходить)

## Команды верификации
```bash
# Компиляция
go build ./internal/api/...

# Все тесты API
go test ./internal/api/... -v

# Полная сборка
make build

# Проверка маршрута в коде
grep 'overview' internal/api/server.go
```

## Заметки
- Область влияния: Одна строка в `internal/api/server.go`
- Ограничения: Не менять существующие маршруты
- Паттерн маршрута: `"GET /api/servers/{id}/overview"` -- использует Go 1.22+ pattern matching с `{id}` параметром
