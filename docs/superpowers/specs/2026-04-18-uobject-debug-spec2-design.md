# UObject Debug — Spec 2: uniset-panel backend (Go)

**Date:** 2026-04-18
**Target branch:** story/uobject-debug-spec2 (from master, TBD)
**Status:** brainstorming-approved, pending implementation plan
**Part of:** UObject debug visualizer (4-spec decomposition, this is Spec 2).

## Goal

Дать `uniset-panel` возможность опрашивать trace-API, реализованный в Спеке 1
(uniset-side), агрегировать записи и рассылать их фронтенду через SSE.
Panel — единая точка входа: фронт к uniset-процессам не ходит напрямую.

Ключевые ограничения:
- **Reuse**: существующие `BasePoller[T,U]` / `SSEHub` / `ControlManager` — не
  новый транспорт, а ещё один domain-adapter.
- **Passthrough JSON**: не дублировать схему `TraceRecord` (определена в
  Спеке 1). Backend знает только envelope (`enabled`, `overflow`, `records`).
- **Per-(server, object) shared poller**: один пул для всех клиентов,
  смотрящих один объект; эффективный интервал = min из запрошенных.
- **Clean stream**: trace — отдельный SSE endpoint, независимый от
  `object_data`. Разные poll-периоды, независимый lifecycle.

## Scope

### В этом спеке
1. Go-пакет `internal/trace/` — типы (только envelope), HTTP client к
   uniset `/dump?trace=1`, `TracePoller`, registry `Manager`.
2. SSE event type `"trace"` + метод `SSEHub.BroadcastTraceBatch(...)`.
3. SSE handler `GET /api/trace/events?object=&server=&interval=&token=`.
4. Proxy endpoints `POST /api/trace/servers/:s/objects/:o/{enable,disable}`
   — тонкая обёртка над uniset `POST /<Object>/trace/{enable,disable}`.
5. Unit tests (fake HTTP + in-process SSE hub + handler contract).

### Вне этого спека (другие Спеки)
- **Спек 1** (uniset C++/codegen) — contract для этого Спека.
- **Спек 3** — frontend refactor (LiteGraph layer).
- **Спек 4** — UObject detail panel (UI для trace).
- Persistence trace в локальной БД (если понадобится история — отдельный
  ticket).
- Playwright E2E — фронт в Спеке 3/4.

## Architecture

```
Client (browser)
  │ GET /api/trace/events?object=X&server=S&interval=N
  ▼
handlers_trace.HandleTraceEvents
  │ clamp interval to [100,10000]ms
  │ traceMgr.Subscribe(S, X, N) → shared *TracePoller
  │ sseHub.AddClient(X, traceOnly=true)
  │
trace.Manager (registry of (serverID, objectName) → *TracePoller)
  │ NewTracePoller if first subscriber; Reuse if existing
  │
TracePoller goroutine (shared per (S, X))
  │ while subscribers > 0:
  │   GET http://<host>:<port>/X/dump?trace=1&since=<lastTimeUs>&limit=1024
  │   parse envelope (enabled, overflow, records as []json.RawMessage)
  │   update lastTimeUs from records[-1].time_us
  │   sseHub.BroadcastTraceBatch(S, name, X, {enabled, overflow, records})
  │   sleep effectiveInterval = min(subscribers.interval)
  │
Client получает поток trace-событий через SSE
```

## Go types

`internal/trace/types.go`:

```go
package trace

import "encoding/json"

// Envelope — что backend читает из uniset /dump?trace=1.
// Отдельные записи хранятся как raw JSON; их схема определена в Спеке 1
// (uniset-side) — не дублируется здесь.
type dumpEnvelope struct {
    Trace *struct {
        Enabled  bool              `json:"enabled"`
        Overflow bool              `json:"overflow"`
        Records  []json.RawMessage `json:"records"`
    } `json:"trace"`
}

// TraceBatch — payload SSE-события, пересылается фронту.
type TraceBatch struct {
    Enabled  bool              `json:"enabled"`
    Overflow bool              `json:"overflow"`
    Records  []json.RawMessage `json:"records"` // может быть пустым
}

// Вспомогательный: парсинг последней записи для watermark.
type recordTimeOnly struct {
    TimeUs int64 `json:"time_us"`
}
```

Поле `Type` на SSE-конверте — строка `"trace"` (новое значение в уже
существующем enum `SSEEvent.Type`).

## HTTP client

`internal/trace/client.go`:

```go
type Client struct {
    http *http.Client
    // Резолв (serverID → host:port) через интерфейс, чтобы в тестах
    // подставлять fake server manager.
    resolver ServerResolver
}

type ServerResolver interface {
    GetServerAddress(serverID string) (host string, port int, err error)
}

// Fetch возвращает envelope. Если uniset вернул не-200, ошибка оборачивает
// status code + тело (panel его логирует и отдаёт клиенту SSE error-event).
func (c *Client) Fetch(ctx context.Context, serverID, objectName string,
                      sinceTimeUs int64, limit int) (dumpEnvelope, error)
```

**Особенность JSON uniset**: верхний уровень — `{"<ObjectName>": {...}}`.
Client декодирует в `map[string]json.RawMessage`, достаёт нужный ключ,
парсит в `dumpEnvelope`. Если объект отсутствует в ответе — возвращает
`ErrObjectNotFound`.

## TracePoller

`internal/trace/poller.go`:

```go
type TracePoller struct {
    serverID   string
    serverName string
    objectName string

    client *Client
    sseHub SSEBroadcaster // interface, тестируется fake-ом

    mu          sync.Mutex
    subscribers map[string]int64 // subscriberID → interval_ms
    lastTimeUs  int64            // watermark для since=

    stopCh chan struct{}
    wg     sync.WaitGroup
}

func (p *TracePoller) AddSubscriber(id string, intervalMS int64)
func (p *TracePoller) RemoveSubscriber(id string) (subsLeft int)
func (p *TracePoller) effectiveInterval() time.Duration  // min of subscribers

// Запуск в goroutine. Останавливается из-вне через Stop() или автоматически
// когда subscribers == 0.
func (p *TracePoller) run(ctx context.Context)
```

### Алгоритм run()

```go
for {
    select {
    case <-p.stopCh:  return
    case <-ctx.Done(): return
    default:
    }

    resp, err := p.client.Fetch(ctx, p.serverID, p.objectName, p.lastTimeUs, 1024)
    switch {
    case err != nil:
        // exponential backoff 1s → 30s; после backoff — SSE error event
        p.sseHub.BroadcastTraceBatch(p.serverID, p.serverName, p.objectName,
            TraceBatch{Enabled: false}) // treat as unknown
        p.wait(backoff())
        continue

    case resp.Trace == nil || !resp.Trace.Enabled:
        p.sseHub.BroadcastTraceBatch(p.serverID, p.serverName, p.objectName,
            TraceBatch{Enabled: false})
        // Продолжаем polling: trace могут включить runtime.

    default:
        p.updateWatermark(resp.Trace.Records)
        p.sseHub.BroadcastTraceBatch(p.serverID, p.serverName, p.objectName,
            TraceBatch{
                Enabled:  true,
                Overflow: resp.Trace.Overflow,
                Records:  resp.Trace.Records,
            })
    }
    p.wait(p.effectiveInterval())
}
```

### Backoff

- Начальный: 1s; удваивается при последовательных ошибках; max = 30s.
- При успешном запросе backoff сбрасывается.

### Watermark

```go
func (p *TracePoller) updateWatermark(recs []json.RawMessage) {
    if len(recs) == 0 { return }
    var last recordTimeOnly
    if err := json.Unmarshal(recs[len(recs)-1], &last); err == nil && last.TimeUs > p.lastTimeUs {
        p.lastTimeUs = last.TimeUs
    }
}
```

## Manager (registry)

`internal/trace/manager.go`:

```go
type Manager struct {
    client *Client
    sseHub SSEBroadcaster

    mu      sync.Mutex
    pollers map[pollerKey]*TracePoller
}

type pollerKey struct {
    serverID   string
    objectName string
}

// Subscribe регистрирует клиента на (server, object) с заданным интервалом.
// Если poller ещё не существует — создаётся и запускается.
// Возвращает subscriberID для последующего unsubscribe.
func (m *Manager) Subscribe(serverID, serverName, objectName string,
                             intervalMS int64) (subscriberID string)

func (m *Manager) Unsubscribe(subscriberID string)
```

Subscriber ID — UUID. `Unsubscribe` → poller убирает его из своего map,
если subs==0 → poller.Stop(), manager удаляет poller из registry.

## SSE integration

### BroadcastTraceBatch

В `internal/api/sse.go` — новый метод, зеркалит существующие
`BroadcastIONCSensorBatchWithServer` и т.д.:

```go
func (h *SSEHub) BroadcastTraceBatch(serverID, serverName, objectName string,
                                      batch trace.TraceBatch) {
    h.Broadcast(SSEEvent{
        Type:       "trace",
        ServerID:   serverID,
        ServerName: serverName,
        ObjectName: objectName,
        Data:       batch,
        Timestamp:  time.Now(),
    })
}
```

### traceOnly flag на клиенте

`sseClient` получает флаг `traceOnly bool`. Broadcast-логика фильтрует:

```go
// В SSEHub.Broadcast:
for client := range h.clients {
    if client.traceOnly && event.Type != "trace" { continue }
    if !client.traceOnly && event.Type == "trace" { continue }
    // ... существующая фильтрация по objectName ...
    client.events <- event
}
```

Это гарантирует, что `/api/events` (обычный) и `/api/trace/events` (trace)
— полностью независимые каналы.

## Handlers

### GET `/api/trace/events`

`internal/api/handlers_trace.go`:

```go
// Params (query):
//   object   — required
//   server   — required (serverID)
//   interval — optional, clamp [100, 10000], default 500
//   token    — optional (для ControlManager; trace read-only, можно без)
func (h *Handlers) HandleTraceEvents(w http.ResponseWriter, r *http.Request) {
    // 1. Parse + validate query (object, server required; missing → 400).
    // 2. Clamp interval.
    // 3. subscriberID := h.traceMgr.Subscribe(server, serverName, object, interval)
    // 4. client := h.sseHub.AddClient(object) ; client.traceOnly = true
    // 5. defer: sseHub.RemoveClient(client); traceMgr.Unsubscribe(subscriberID)
    // 6. Stream events (set headers, flush, loop on client.events).
}
```

Формат SSE-строки: стандартный для проекта (`event: <Type>\ndata: <JSON>\n\n`).

### POST proxy

```go
// POST /api/trace/servers/:serverId/objects/:objectName/enable?size=N
// POST /api/trace/servers/:serverId/objects/:objectName/disable
func (h *Handlers) HandleTraceEnable(w http.ResponseWriter, r *http.Request)
func (h *Handlers) HandleTraceDisable(w http.ResponseWriter, r *http.Request)
```

Логика (одинаковая в обоих):
1. `serverId` + `objectName` из URL vars.
2. Resolve `host:port` через `ServerResolver`.
3. `POST http://<host>:<port>/<objectName>/trace/{enable|disable}?<query>` (query пробрасывается).
4. Passthrough status code + body.

### Route wiring

```go
// internal/api/server.go
s.mux.HandleFunc("GET /api/trace/events", s.handlers.HandleTraceEvents)
s.mux.HandleFunc("POST /api/trace/servers/{serverId}/objects/{objectName}/enable",
                 s.handlers.HandleTraceEnable)
s.mux.HandleFunc("POST /api/trace/servers/{serverId}/objects/{objectName}/disable",
                 s.handlers.HandleTraceDisable)
```

## Error handling

| Сценарий | Действие |
|---|---|
| uniset connection refused / timeout | exponential backoff 1s→30s; каждый failed cycle → SSE `{enabled: false}` (как индикация «что-то не так») |
| uniset 5xx | то же что connection refused |
| uniset 404 (объект не существует) | SSE `{error: "object not found"}`, poller.Stop() |
| uniset вернул `trace: null` / `enabled: false` | SSE `{enabled: false}`, продолжаем polling (может включат runtime) |
| uniset malformed JSON | log.error, continue polling, SSE `{enabled: false}` |
| overflow=true | пробрасывается клиенту как есть |
| missing server/object in request | 400 Bad Request |
| invalid interval format | clamp silently (default 500ms) |
| enable/disable proxy: uniset 403 | passthrough 403 (panel не меняет) |

## Clamping + defaults

- `interval_min = 100ms`, `interval_max = 10000ms`, `interval_default = 500ms`.
- `poll_limit = 1024` (hard-coded; хватает для типичной частоты).
- Backoff: start 1s, max 30s, multiplier 2x.

## Testing strategy

### Unit tests

- `trace/client_test.go`:
  - Ok: fake uniset возвращает dump с trace section, Fetch возвращает envelope.
  - 404: объект нет → `ErrObjectNotFound`.
  - Malformed JSON → error.
  - `enabled: false` → envelope.Trace.Enabled == false.

- `trace/poller_test.go` (с fake Client):
  - Один подписчик, несколько циклов → SSE events шлются.
  - Два подписчика с интервалами 100ms и 500ms → effective == 100ms.
  - Отписка одного → effective recompute.
  - Все отписались → goroutine stops (в тесте проверяется через channel close или WaitGroup).
  - Overflow из uniset → долетает в SSE.
  - Uniset timeout → backoff, восстановление после успеха.

- `trace/manager_test.go`:
  - First subscribe → создан poller, start.
  - Second subscribe on same (s, o) → reuse.
  - Last unsubscribe → poller removed from registry.

- `api/sse_test.go` (extend):
  - `BroadcastTraceBatch` → клиент с `traceOnly=true` получает событие.
  - Клиент без `traceOnly` НЕ получает trace события.
  - `traceOnly=true` клиент НЕ получает `object_data` событий.

- `api/handlers_trace_test.go`:
  - Missing required params → 400.
  - Clamp interval: 50ms → 100ms, 20000ms → 10000ms.
  - Enable proxy: happy path + 403 passthrough.
  - Disable proxy: happy path.

### Integration tests

- `internal/trace/integration_test.go`:
  - `httptest.NewServer` как fake-uniset с детерминированным `/dump?trace=1`.
  - Manager + Poller + SSEHub + handler в одной цепочке.
  - Клиент через `GET /api/trace/events` получает ожидаемый поток.

### Не включаем

- Playwright E2E — фронт в Спеке 3/4.
- Benchmark под нагрузку — profiler покажет при необходимости.

## Files to create/modify

### New

- `internal/trace/types.go`
- `internal/trace/client.go`
- `internal/trace/poller.go`
- `internal/trace/manager.go`
- `internal/trace/client_test.go`
- `internal/trace/poller_test.go`
- `internal/trace/manager_test.go`
- `internal/trace/integration_test.go`
- `internal/api/handlers_trace.go`
- `internal/api/handlers_trace_test.go`
- `docs/DocPages/UObject-debug-trace-panel.md` (user-facing docs: endpoints +
  параметры).

### Modified

- `internal/api/sse.go` — `BroadcastTraceBatch` method + `traceOnly` field
  на `sseClient` + filter logic в `Broadcast`.
- `internal/api/sse_test.go` — тесты на новую фильтрацию.
- `internal/api/server.go` — routes.
- `internal/api/handlers.go` — field `traceMgr *trace.Manager` и wiring в
  `NewHandlers`.

### Not modified

- `internal/poller/` — не трогаем. У trace своя жизнь, не наследует от
  `BasePoller[T,U]`, потому что watermark и backoff logic специфичны (нет
  list-based subscription, нет ItemFetcher-like контракта).

## Backward compatibility

- Новые endpoints `/api/trace/*` — 404 не появятся (раньше их не было).
- Существующий `/api/events` — не меняется; `traceOnly` флаг работает только
  для клиентов новых endpoints.
- Фронту (Спек 3) — не приходит ничего нового, пока он не подпишется на
  `/api/trace/events`.

## Implementation order (для плана)

1. `types.go` + `client.go` + unit tests (фундамент).
2. `poller.go` (одиночный subscriber) + unit tests.
3. `poller.go` multi-subscriber + adaptive interval.
4. `manager.go` (registry) + unit tests.
5. SSE integration (`BroadcastTraceBatch`, `traceOnly` flag) + тесты.
6. `handlers_trace.go` — SSE endpoint + unit tests.
7. `handlers_trace.go` — proxy endpoints + tests.
8. Integration test (end-to-end с httptest-fake uniset).
9. Documentation + route wiring.

## Open risks

- **ServerResolver contract** — зависит от существующего `ServerManager`
  в uniset-panel. Нужно проверить сигнатуру (наверняка есть что-то вроде
  `GetServerByID(id) (ServerInfo, error)`). Если потребуется доработка —
  выносится в implementation plan как отдельная задача.
- **Backoff ослабляет latency при полной отладочной сессии** — 30s max
  между попытками может быть заметно если uniset был недоступен долго.
  Рассмотреть `reset on subscriber add` (новый клиент → reset backoff
  немедленно).
- **`traceOnly` фильтр добавляется в SSEHub.Broadcast** — горячий путь.
  Нужно убедиться, что ветвление `if event.Type == "trace" { … }` не
  ломает хеширование / не мешает остальным типам событий (test coverage
  на sse_test.go должен покрыть).
