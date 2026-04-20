# Task 2.1: Backend handler и unit-тесты

Metadata:
- Dependencies: Нет (backend независим от frontend)
- Provides: `internal/api/handlers_overview.go`, `internal/api/handlers_overview_test.go`
- Size: Medium (2 файла)

## Содержание задачи

Реализовать backend handler `handleServerOverview` для endpoint `GET /api/servers/{id}/overview`. Handler агрегирует IO-данные всех объектов сервера и вычисляет граф связей (edges) по совпадению имен датчиков между outputs одних процессов и inputs других. Как side-effect вызывает `Watch()` для всех объектов сервера (чтобы SSE начал отправлять данные).

## Целевые файлы
- [x] `internal/api/handlers_overview.go` (Create)
- [x] `internal/api/handlers_overview_test.go` (Create)

## Шаги реализации (TDD: Red-Green-Refactor)

### 1. Red Phase -- написание тестов

- [x] Создать `internal/api/handlers_overview_test.go`
- [x] Реализовать табличные тесты `TestHandleServerOverview`:

| Сценарий | Input | Expected |
|----------|-------|----------|
| `serverMgr == nil` | Любой ID | 503 `{"error": "server manager not initialized"}` |
| Несуществующий serverID | `"nonexistent"` | 404 `{"error": "server not found"}` |
| Пустой сервер (0 объектов) | ID существующего сервера без объектов | 200, `nodes: [], edges: []` |
| Объект без IO | 1 объект, `IOData` пустой | 200, 1 node с пустыми `inputs`/`outputs` |
| 2 объекта с совпадающими IO | Объект A: Out["sensorX"], Объект B: In["sensorX"] | 200, 2 nodes, 1 edge |
| Watch() вызван | Любой сервер с объектами | Watch вызван для каждого объекта |

- [x] Для тестов использовать паттерн mock-сервера из существующих тестов в `internal/api/`:
  - Mock `server.Manager` через создание реального `Manager` с mock `Instance`
  - Или использовать `httptest.NewRecorder` для проверки handler'а напрямую
- [x] Запустить тесты -- убедиться что все падают (handler ещё не реализован)

### 2. Green Phase -- реализация handler'а

- [x] Создать `internal/api/handlers_overview.go`
- [x] Определить структуры контракта (из Design Doc):
  ```go
  type OverviewPort struct {
      Name  string      `json:"name"`
      Value interface{} `json:"value"`
  }

  type OverviewNode struct {
      Name    string         `json:"name"`
      Inputs  []OverviewPort `json:"inputs"`
      Outputs []OverviewPort `json:"outputs"`
  }

  type OverviewEdge struct {
      FromNode string `json:"fromNode"`
      FromPort string `json:"fromPort"`
      ToNode   string `json:"toNode"`
      ToPort   string `json:"toPort"`
  }

  type OverviewResponse struct {
      ServerName string         `json:"serverName"`
      Nodes      []OverviewNode `json:"nodes"`
      Edges      []OverviewEdge `json:"edges"`
  }
  ```

- [x] Реализовать метод `func (h *Handlers) handleServerOverview(w http.ResponseWriter, r *http.Request)`:
  1. Проверить `h.serverMgr != nil` -- иначе 503
  2. Извлечь `id` из `r.PathValue("id")`
  3. Получить сервер: `h.serverMgr.GetServer(id)` -- если нет, 404
  4. Получить объекты: `instance.GetCachedObjects()`
  5. Для каждого объекта:
     - `instance.GetLastData(objectName)` для получения IO данных
     - `instance.Watch(objectName)` как side-effect
     - Построить `OverviewNode` с inputs/outputs
  6. Построить `outputIndex`: `map[sensorName] -> []{objectName}`
  7. Для каждого объекта, для каждого Input:
     - Если `sensorName` есть в `outputIndex` -> создать `OverviewEdge`
  8. Ответить `h.writeJSON(w, response)`

- [x] Использовать хелперы по CLAUDE.md:
  - `h.writeJSON(w, data)` для ответа
  - `h.writeError(w, status, message)` для ошибок
- [x] Сортировать ports по имени для стабильного вывода

### 3. Refactor Phase

- [x] Вынести алгоритм вычисления edges в отдельную функцию для тестируемости
- [x] Убедиться что все тесты проходят
- [x] `go vet ./internal/api/...` без ошибок

## Критерии завершения
- [x] Handler реализован с `writeJSON`/`writeError`
- [x] Все unit-тесты проходят
- [x] Контракт API соответствует Design Doc (`OverviewResponse`)
- [x] Edge computation корректен (AC F1, F3)
- [x] Watch() вызывается для всех объектов сервера (Design Doc: SSE Integration)
- [x] Верификация: L2 (Test Operation)

## Команды верификации
```bash
# Запуск тестов handler'а
go test ./internal/api/... -run TestHandleServerOverview -v

# Проверка компиляции
go build ./internal/api/...

# Статический анализ
go vet ./internal/api/...
```

## Заметки
- Область влияния: Только `internal/api/` -- новые файлы, не модификация существующих
- Ограничения: Не модифицировать существующие handler'ы и `Handlers` struct
- Использовать `r.PathValue("id")` для извлечения serverID (Go 1.22+ pattern)
- Ключевые существующие методы:
  - `h.serverMgr.GetServer(id)` -> `(*Instance, bool)`
  - `instance.GetCachedObjects()` -> объекты сервера
  - `instance.GetLastData(name)` -> `*uniset.ObjectData`
  - `instance.Watch(name)` -- подписка на обновления
- `IOData.In` и `IOData.Out` -- это `map[string]IOVar`, где ключ -- имя датчика
