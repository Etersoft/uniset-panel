# IONC@server Combobox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить каскад `server`+`IONC object` select'ов в config-форме widget'ов одним autocomplete-комбобоксом формата `IONC @ Server`.

**Architecture:** Новый backend endpoint `/api/objects-by-type` отдаёт объекты по типу со всех серверов одним вызовом. Frontend session-cache `state.ioncRegistry` (TTL 5 мин + ручной refresh) питает локальный substring-autocomplete. Внешний контракт `renderSensorBindingFields/parseSensorBindingFields/initSensorBindingHandlers` сохраняется — меняется только их внутренняя реализация.

**Tech Stack:** Go (httptest), JS (vanilla, vitest+jsdom), Playwright E2E.

**Spec:** [docs/superpowers/specs/2026-05-15-ionc-server-combobox-design.md](../specs/2026-05-15-ionc-server-combobox-design.md)

---

## File Structure

**Backend:**
- *new* — `internal/api/handlers_objects_by_type.go` — handler `GetObjectsByType`
- *modify* — `internal/server/manager.go` — добавить метод `GetAllObjectsByType(typeFilter string) ([]ServerObjectsByType, error)` + тип `ServerObjectsByType`
- *modify* — `internal/api/server.go` — регистрация route
- *test* — `internal/api/handlers_objects_by_type_test.go`
- *test* — `internal/server/manager_test.go` — добавить тесты `GetAllObjectsByType`

**Frontend (JS):**
- *modify* — `ui/static/js/src/00-state.js` — добавить `state.ioncRegistry`
- *modify* — `ui/static/js/src/00-constants.js` — `IONC_REGISTRY_TTL_MS`, `IONC_COMBO_DEBOUNCE_MS`
- *modify* — `ui/static/js/src/60-widget-sensor-binding.js` — заменить два select'а на combo input + новые helpers `ensureIONCRegistry`, `getIONCEntries`, `setupIONCComboAutocomplete`
- *modify* — `ui/static/css/style.css` — стили `.ionc-combo-*`
- *test* — *new* `tests/unit/ionc-registry.test.ts`
- *test* — *new* `tests/unit/sensor-binding-combo.test.ts`
- *test* — *new* `tests/single/dashboard-widget-ionc-combo.spec.ts`

---

## Phase 1 — Backend

### Task 1: Тип `ServerObjectsByType` в manager

**Files:**
- Modify: `internal/server/manager.go` (после строки 35, рядом с `ServerObjects`)

- [ ] **Step 1: Добавить тип**

```go
// ServerObjectsByType группирует объекты заданного типа по серверам для UI.
// Используется /api/objects-by-type для combobox'а IONC@server в widget config.
type ServerObjectsByType struct {
	ServerID   string   `json:"serverId"`
	ServerName string   `json:"serverName"`
	Connected  bool     `json:"connected"`
	Objects    []string `json:"objects"`
}
```

- [ ] **Step 2: Run go vet**

Run: `cd /home/pv/Projects/uniset-panel && go vet ./internal/server/...`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add internal/server/manager.go
git commit -m "server: add ServerObjectsByType for IONC@server combobox"
```

---

### Task 2: Test — `GetAllObjectsByType` базовый случай

**Files:**
- Test: `internal/server/manager_test.go`

- [ ] **Step 1: Найти место для теста**

Открыть `internal/server/manager_test.go`, найти `TestManagerGetAllObjectsGrouped` (около строки 263) и добавить новый тест **после** него (используем тот же стиль mock'а).

- [ ] **Step 2: Добавить mock-helper для серверов с типами**

Добавить в `internal/server/manager_test.go` (если такого helper'а ещё нет; в handlers_test.go уже есть `startMockUnisetWithTypes`, но он в другом пакете — для server tests делаем свой):

```go
// startMockServerWithTypes создаёт httptest сервер, отдающий список объектов
// с проставленным objectType. Используется в тестах GetAllObjectsByType.
func startMockServerWithTypes(objects map[string]string) *httptest.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v2/list", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		names := make([]string, 0, len(objects))
		for n := range objects {
			names = append(names, n)
		}
		_ = json.NewEncoder(w).Encode(names)
	})
	for name, objectType := range objects {
		name, objectType := name, objectType
		mux.HandleFunc("/api/v2/"+name, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"object": map[string]interface{}{
					"id":         1,
					"name":       name,
					"objectType": objectType,
					"isActive":   true,
				},
			})
		})
	}
	return httptest.NewServer(mux)
}
```

- [ ] **Step 3: Написать failing-test**

```go
func TestManagerGetAllObjectsByType_basic(t *testing.T) {
	srv := startMockServerWithTypes(map[string]string{
		"SharedMemory": "IONotifyController",
		"MBSlave1":     "ModbusSlave",
	})
	defer srv.Close()

	store := storage.NewMemoryStorage()
	mgr := NewManager(store, time.Second, time.Hour, "", 0)
	if err := mgr.AddServer(config.ServerConfig{ID: "s1", URL: srv.URL, Name: "Server1"}); err != nil {
		t.Fatalf("AddServer: %v", err)
	}

	got, err := mgr.GetAllObjectsByType("IONotifyController")
	if err != nil {
		t.Fatalf("GetAllObjectsByType: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("want 1 server in result, got %d", len(got))
	}
	if got[0].ServerID != "s1" {
		t.Errorf("ServerID: want s1, got %s", got[0].ServerID)
	}
	if got[0].ServerName != "Server1" {
		t.Errorf("ServerName: want Server1, got %s", got[0].ServerName)
	}
	if !got[0].Connected {
		t.Error("Connected: want true")
	}
	if len(got[0].Objects) != 1 || got[0].Objects[0] != "SharedMemory" {
		t.Errorf("Objects: want [SharedMemory], got %v", got[0].Objects)
	}
}
```

- [ ] **Step 4: Run test — должен FAIL**

Run: `cd /home/pv/Projects/uniset-panel && go test ./internal/server/ -run TestManagerGetAllObjectsByType_basic -v`
Expected: FAIL with "mgr.GetAllObjectsByType undefined".

- [ ] **Step 5: Реализовать `GetAllObjectsByType`**

В `internal/server/manager.go` сразу после `GetAllObjectsGrouped` (около строки 402):

```go
// GetAllObjectsByType возвращает объекты заданного uniset-типа
// (например "IONotifyController") сгруппированные по серверам в порядке добавления.
//
// Per-server: список имён через GetObjects (с fallback на cache при недоступности),
// затем для каждого имени GetObjectData → фильтр по ObjectType. N+M uniset запросов
// на вызов; кэширование на бэке — follow-up.
//
// Если сервер недоступен и кэша нет — server entry с Objects=[], Connected=false
// (UI должен знать о существовании сервера).
// Если конкретный объект GetObjectData падает — объект пропускается, остальные ОК.
func (m *Manager) GetAllObjectsByType(typeFilter string) ([]ServerObjectsByType, error) {
	if typeFilter == "" {
		return nil, fmt.Errorf("type filter is required")
	}

	m.mu.RLock()
	instances := make([]*Instance, 0, len(m.order))
	for _, id := range m.order {
		if inst, ok := m.instances[id]; ok {
			instances = append(instances, inst)
		}
	}
	m.mu.RUnlock()

	result := make([]ServerObjectsByType, 0, len(instances))

	for _, inst := range instances {
		serverName := inst.Config.Name
		entry := ServerObjectsByType{
			ServerID:   inst.Config.ID,
			ServerName: serverName,
			Objects:    []string{},
		}

		names, err := inst.GetObjects()
		if err != nil {
			if cached := inst.GetCachedObjects(); cached != nil {
				names = cached
			} else {
				names = nil
			}
		}

		for _, name := range names {
			data, err := inst.GetObjectData(name)
			if err != nil || data == nil || data.Object == nil {
				continue
			}
			if data.Object.ObjectType == typeFilter {
				entry.Objects = append(entry.Objects, name)
			}
		}

		entry.Connected = inst.GetStatus().Connected
		result = append(result, entry)
	}

	return result, nil
}
```

- [ ] **Step 6: Run test — должен PASS**

Run: `cd /home/pv/Projects/uniset-panel && go test ./internal/server/ -run TestManagerGetAllObjectsByType_basic -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add internal/server/manager.go internal/server/manager_test.go
git commit -m "server: implement GetAllObjectsByType with per-server type filter"
```

---

### Task 3: Test — disconnected server (cache + no cache)

**Files:**
- Test: `internal/server/manager_test.go`

- [ ] **Step 1: Disconnected с кэшем — failing test**

```go
func TestManagerGetAllObjectsByType_disconnectedWithCache(t *testing.T) {
	srv := startMockServerWithTypes(map[string]string{
		"SharedMemory": "IONotifyController",
	})

	store := storage.NewMemoryStorage()
	mgr := NewManager(store, time.Second, time.Hour, "", 0)
	if err := mgr.AddServer(config.ServerConfig{ID: "s1", URL: srv.URL, Name: "Server1"}); err != nil {
		t.Fatalf("AddServer: %v", err)
	}

	// Прогреваем кэш реальным вызовом
	if _, err := mgr.GetAllObjectsByType("IONotifyController"); err != nil {
		t.Fatalf("warm-up call: %v", err)
	}

	// Закрываем сервер — теперь GetObjects будет ошибаться, но cache остался
	srv.Close()

	got, err := mgr.GetAllObjectsByType("IONotifyController")
	if err != nil {
		t.Fatalf("GetAllObjectsByType: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("want 1 server entry, got %d", len(got))
	}
	if got[0].Connected {
		t.Error("Connected: want false (server is down)")
	}
	// Без cache бэкенда типов: после disconnect мы не можем проверить ObjectType,
	// поэтому для disconnected с cache из имён получаем пустой Objects (это OK, документировано).
	// Если в будущем добавим typesCacheByServer — этот assertion заменится на
	// проверку что cached IONC objects возвращаются.
	t.Logf("disconnected entry: %+v", got[0])
}
```

- [ ] **Step 2: Run — должен PASS** (поведение уже корректное: disconnect → GetObjectData падает → объекты не попадают, но запись server остаётся)

Run: `cd /home/pv/Projects/uniset-panel && go test ./internal/server/ -run TestManagerGetAllObjectsByType_disconnectedWithCache -v`
Expected: PASS.

- [ ] **Step 3: Disconnected БЕЗ кэша**

```go
func TestManagerGetAllObjectsByType_disconnectedNoCache(t *testing.T) {
	srv := mockUnavailableServer()
	defer srv.Close()

	store := storage.NewMemoryStorage()
	mgr := NewManager(store, time.Second, time.Hour, "", 0)
	if err := mgr.AddServer(config.ServerConfig{ID: "s1", URL: srv.URL, Name: "Server1"}); err != nil {
		t.Fatalf("AddServer: %v", err)
	}

	got, err := mgr.GetAllObjectsByType("IONotifyController")
	if err != nil {
		t.Fatalf("GetAllObjectsByType: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("want 1 server entry (even without cache), got %d", len(got))
	}
	if got[0].Connected {
		t.Error("Connected: want false")
	}
	if len(got[0].Objects) != 0 {
		t.Errorf("Objects: want [], got %v", got[0].Objects)
	}
}
```

- [ ] **Step 4: Run — должен PASS**

Run: `cd /home/pv/Projects/uniset-panel && go test ./internal/server/ -run TestManagerGetAllObjectsByType_disconnectedNoCache -v`
Expected: PASS.

- [ ] **Step 5: Empty type filter**

```go
func TestManagerGetAllObjectsByType_emptyType(t *testing.T) {
	store := storage.NewMemoryStorage()
	mgr := NewManager(store, time.Second, time.Hour, "", 0)
	_, err := mgr.GetAllObjectsByType("")
	if err == nil {
		t.Error("want error for empty type filter, got nil")
	}
}
```

- [ ] **Step 6: Run — должен PASS**

Run: `cd /home/pv/Projects/uniset-panel && go test ./internal/server/ -run TestManagerGetAllObjectsByType_emptyType -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add internal/server/manager_test.go
git commit -m "test: cover GetAllObjectsByType edge cases (disconnected, empty type)"
```

---

### Task 4: HTTP handler `GetObjectsByType`

**Files:**
- Create: `internal/api/handlers_objects_by_type.go`
- Test: `internal/api/handlers_objects_by_type_test.go`

- [ ] **Step 1: Failing test**

```go
package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pv/uniset-panel/internal/config"
	"github.com/pv/uniset-panel/internal/server"
	"github.com/pv/uniset-panel/internal/storage"
)

func TestGetObjectsByType_basic(t *testing.T) {
	mock := startMockUnisetWithTypes(t, map[string]string{
		"SharedMemory":  "IONotifyController",
		"SharedMemory2": "IONotifyController",
		"MBSlave1":      "ModbusSlave",
	})
	defer mock.Close()

	store := storage.NewMemoryStorage()
	mgr := server.NewManager(store, 5*time.Second, time.Hour, "TestProc", 0)
	if err := mgr.AddServer(config.ServerConfig{
		ID: "srv1", URL: mock.URL, Name: "Server-srv1",
	}); err != nil {
		t.Fatalf("AddServer: %v", err)
	}
	defer mgr.RemoveServer("srv1")

	h := &Handlers{
		storage:      store,
		sseHub:       NewSSEHub(),
		pollInterval: 5 * time.Second,
	}
	h.SetServerManager(mgr)

	req := httptest.NewRequest(http.MethodGet, "/api/objects-by-type?type=IONotifyController", nil)
	rr := httptest.NewRecorder()
	h.GetObjectsByType(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d (body: %s)", rr.Code, rr.Body.String())
	}

	var resp struct {
		Type    string `json:"type"`
		Servers []struct {
			ServerID   string   `json:"serverId"`
			ServerName string   `json:"serverName"`
			Connected  bool     `json:"connected"`
			Objects    []string `json:"objects"`
		} `json:"servers"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Type != "IONotifyController" {
		t.Errorf("Type: want IONotifyController, got %s", resp.Type)
	}
	if len(resp.Servers) != 1 {
		t.Fatalf("Servers: want 1, got %d", len(resp.Servers))
	}
	srv := resp.Servers[0]
	if srv.ServerID != "srv1" || srv.ServerName != "Server-srv1" || !srv.Connected {
		t.Errorf("server entry mismatch: %+v", srv)
	}
	if len(srv.Objects) != 2 {
		t.Errorf("Objects: want 2, got %d (%v)", len(srv.Objects), srv.Objects)
	}
}
```

- [ ] **Step 2: Run — должен FAIL** ("h.GetObjectsByType undefined")

Run: `cd /home/pv/Projects/uniset-panel && go test ./internal/api/ -run TestGetObjectsByType_basic -v`
Expected: FAIL.

- [ ] **Step 3: Реализовать handler**

Создать `internal/api/handlers_objects_by_type.go`:

```go
package api

import "net/http"

// GetObjectsByType возвращает объекты заданного uniset-типа сгруппированные по серверам.
//   GET /api/objects-by-type?type=IONotifyController
// Используется combobox'ом IONC@server в config-форме активных widget'ов.
//
// Response:
//   { "type": "...", "servers": [{ serverId, serverName, connected, objects:[name,...] }, ...] }
func (h *Handlers) GetObjectsByType(w http.ResponseWriter, r *http.Request) {
	if h.serverMgr == nil {
		h.writeError(w, http.StatusServiceUnavailable, "server manager not configured")
		return
	}
	typeFilter := r.URL.Query().Get("type")
	if typeFilter == "" {
		h.writeError(w, http.StatusBadRequest, "type parameter is required")
		return
	}
	servers, err := h.serverMgr.GetAllObjectsByType(typeFilter)
	if err != nil {
		h.writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	h.writeJSON(w, map[string]interface{}{
		"type":    typeFilter,
		"servers": servers,
	})
}
```

- [ ] **Step 4: Run — должен PASS**

Run: `cd /home/pv/Projects/uniset-panel && go test ./internal/api/ -run TestGetObjectsByType_basic -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/api/handlers_objects_by_type.go internal/api/handlers_objects_by_type_test.go
git commit -m "api: add GET /api/objects-by-type endpoint for IONC@server combobox"
```

---

### Task 5: Edge-case handler tests

**Files:**
- Test: `internal/api/handlers_objects_by_type_test.go`

- [ ] **Step 1: Empty type → 400**

```go
func TestGetObjectsByType_emptyType(t *testing.T) {
	store := storage.NewMemoryStorage()
	mgr := server.NewManager(store, 5*time.Second, time.Hour, "", 0)
	defer func() { _ = mgr }() // keep mgr alive
	h := &Handlers{storage: store, sseHub: NewSSEHub(), pollInterval: 5 * time.Second}
	h.SetServerManager(mgr)

	req := httptest.NewRequest(http.MethodGet, "/api/objects-by-type", nil)
	rr := httptest.NewRecorder()
	h.GetObjectsByType(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("status: want 400, got %d (body: %s)", rr.Code, rr.Body.String())
	}
}
```

- [ ] **Step 2: No serverMgr → 503**

```go
func TestGetObjectsByType_noServerMgr(t *testing.T) {
	h := &Handlers{storage: storage.NewMemoryStorage(), sseHub: NewSSEHub(), pollInterval: 5 * time.Second}
	// serverMgr НЕ установлен

	req := httptest.NewRequest(http.MethodGet, "/api/objects-by-type?type=IONotifyController", nil)
	rr := httptest.NewRecorder()
	h.GetObjectsByType(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Errorf("status: want 503, got %d", rr.Code)
	}
}
```

- [ ] **Step 3: No matches → empty objects**

```go
func TestGetObjectsByType_noMatches(t *testing.T) {
	mock := startMockUnisetWithTypes(t, map[string]string{
		"MBSlave1": "ModbusSlave",
	})
	defer mock.Close()

	store := storage.NewMemoryStorage()
	mgr := server.NewManager(store, 5*time.Second, time.Hour, "", 0)
	if err := mgr.AddServer(config.ServerConfig{ID: "srv1", URL: mock.URL, Name: "S1"}); err != nil {
		t.Fatalf("AddServer: %v", err)
	}
	defer mgr.RemoveServer("srv1")

	h := &Handlers{storage: store, sseHub: NewSSEHub(), pollInterval: 5 * time.Second}
	h.SetServerManager(mgr)

	req := httptest.NewRequest(http.MethodGet, "/api/objects-by-type?type=IONotifyController", nil)
	rr := httptest.NewRecorder()
	h.GetObjectsByType(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d", rr.Code)
	}
	var resp struct {
		Servers []struct {
			Objects []string `json:"objects"`
		} `json:"servers"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(resp.Servers) != 1 || len(resp.Servers[0].Objects) != 0 {
		t.Errorf("expected 1 server with empty objects, got %+v", resp.Servers)
	}
}
```

- [ ] **Step 4: Run all 3 — должны PASS**

Run: `cd /home/pv/Projects/uniset-panel && go test ./internal/api/ -run TestGetObjectsByType -v`
Expected: PASS (4 tests total).

- [ ] **Step 5: Commit**

```bash
git add internal/api/handlers_objects_by_type_test.go
git commit -m "test: cover GetObjectsByType edge cases (empty type, no manager, no matches)"
```

---

### Task 6: Зарегистрировать route

**Files:**
- Modify: `internal/api/server.go:54` (рядом с `GET /api/objects`)

- [ ] **Step 1: Добавить route**

В `internal/api/server.go` после строки `s.mux.HandleFunc("GET /api/objects", s.handlers.GetObjects)` добавить:

```go
	s.mux.HandleFunc("GET /api/objects-by-type", s.handlers.GetObjectsByType)
```

- [ ] **Step 2: Test — endpoint доступен через router**

Добавить в `internal/api/handlers_objects_by_type_test.go`:

```go
func TestGetObjectsByType_routeRegistered(t *testing.T) {
	// Smoke: проверяем что endpoint зарегистрирован в router'е (не только в handler)
	mock := startMockUnisetWithTypes(t, map[string]string{
		"SharedMemory": "IONotifyController",
	})
	defer mock.Close()

	store := storage.NewMemoryStorage()
	mgr := server.NewManager(store, 5*time.Second, time.Hour, "", 0)
	if err := mgr.AddServer(config.ServerConfig{ID: "srv1", URL: mock.URL, Name: "S1"}); err != nil {
		t.Fatalf("AddServer: %v", err)
	}
	defer mgr.RemoveServer("srv1")

	h := &Handlers{storage: store, sseHub: NewSSEHub(), pollInterval: 5 * time.Second}
	h.SetServerManager(mgr)
	srv := NewServer("0.0.0.0:0", h, store, mgr)

	req := httptest.NewRequest(http.MethodGet, "/api/objects-by-type?type=IONotifyController", nil)
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d (body: %s)", rr.Code, rr.Body.String())
	}
}
```

- [ ] **Step 3: Run — должен PASS**

Run: `cd /home/pv/Projects/uniset-panel && go test ./internal/api/ -run TestGetObjectsByType_routeRegistered -v`
Expected: PASS.

(Если test показывает что `NewServer` имеет другую сигнатуру — посмотреть `internal/api/server.go:NewServer` и адаптировать вызов; пример выше предполагает 4-аргументный конструктор. Если конструктор другой — заменить на правильный вызов.)

- [ ] **Step 4: Commit**

```bash
git add internal/api/server.go internal/api/handlers_objects_by_type_test.go
git commit -m "api: register /api/objects-by-type route"
```

---

## Phase 2 — Frontend cache

### Task 7: Состояние и константы

**Files:**
- Modify: `ui/static/js/src/00-state.js`
- Modify: `ui/static/js/src/00-constants.js`

- [ ] **Step 1: Добавить state**

В `ui/static/js/src/00-state.js` (рядом с другими полями `state`, например после `state.servers`):

```javascript
// IONC@server registry для combobox'а в config-форме widget'ов.
// Lazy-populated; TTL 5 минут; ручное обновление через кнопку ↻.
state.ioncRegistry = {
    fetchedAt:    0,                  // ms; 0 = never fetched
    isFetching:   false,              // race guard для ↻ во время in-flight
    fetchPromise: null,               // shared promise для concurrent waiters
    servers:      new Map(),          // serverId → { serverName, connected, objects: [name,...] }
};
```

- [ ] **Step 2: Добавить константы**

В `ui/static/js/src/00-constants.js`:

```javascript
const IONC_REGISTRY_TTL_MS    = 5 * 60 * 1000;  // 5 минут — TTL session-cache
const IONC_COMBO_DEBOUNCE_MS  = 100;            // короче чем sensor-autocomplete (150ms),
                                                 // т.к. фильтрация локальная без fetch
```

И в `Object.assign(globalThis, {...})` блок (если такой есть для unit-test scope leak — см. CLAUDE.md про CHART_THEME):

```javascript
Object.assign(globalThis, {
    // ... existing keys ...
    IONC_REGISTRY_TTL_MS,
    IONC_COMBO_DEBOUNCE_MS,
});
```

- [ ] **Step 3: Пересобрать app.js**

Run: `cd /home/pv/Projects/uniset-panel && make app`
Expected: `Generated static/js/app.js from N files`.

- [ ] **Step 4: Commit**

```bash
git add ui/static/js/src/00-state.js ui/static/js/src/00-constants.js ui/static/js/app.js
git commit -m "state: add ioncRegistry session-cache + IONC_REGISTRY_TTL_MS constants"
```

---

### Task 8: `ensureIONCRegistry` — failing tests + implementation

**Files:**
- Create: `tests/unit/ionc-registry.test.ts`
- Modify: `ui/static/js/src/60-widget-sensor-binding.js`

- [ ] **Step 1: Создать failing test file**

Создать `tests/unit/ionc-registry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

function loadModule() {
    const constants = readFileSync(resolve(SRC_DIR, '00-constants.js'), 'utf8');
    const stateSrc = readFileSync(resolve(SRC_DIR, '00-state.js'), 'utf8');
    const utils = readFileSync(resolve(SRC_DIR, '06-utils.js'), 'utf8');
    const ac = readFileSync(resolve(SRC_DIR, '41-sensor-autocomplete.js'), 'utf8');
    const binding = readFileSync(resolve(SRC_DIR, '60-widget-sensor-binding.js'), 'utf8');
    new Function(`${constants}\n${stateSrc}\n${utils}\n${ac}\n${binding}`)();
}

describe('ensureIONCRegistry', () => {
    beforeEach(() => {
        loadModule();
        // Reset registry между тестами
        const reg = (globalThis as any).state.ioncRegistry;
        reg.fetchedAt = 0;
        reg.isFetching = false;
        reg.fetchPromise = null;
        reg.servers.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('cache miss → fetches and populates servers Map', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({
                type: 'IONotifyController',
                servers: [
                    { serverId: 's1', serverName: 'Server1', connected: true, objects: ['SharedMemory'] },
                ],
            }),
        })));

        const reg = await (globalThis as any).ensureIONCRegistry();
        expect(reg.servers.size).toBe(1);
        expect(reg.servers.get('s1')).toEqual({
            serverName: 'Server1', connected: true, objects: ['SharedMemory'],
        });
        expect(reg.fetchedAt).toBeGreaterThan(0);
    });

    it('cache hit (within TTL, non-empty) → no fetch', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const reg = (globalThis as any).state.ioncRegistry;
        reg.fetchedAt = Date.now();
        reg.servers.set('s1', { serverName: 'S1', connected: true, objects: ['X'] });

        await (globalThis as any).ensureIONCRegistry();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('cache expired → re-fetches', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true, json: async () => ({ type: 'IONotifyController', servers: [] }),
        }));
        vi.stubGlobal('fetch', fetchMock);

        const reg = (globalThis as any).state.ioncRegistry;
        reg.fetchedAt = Date.now() - (6 * 60 * 1000); // expired
        reg.servers.set('stale', { serverName: 'Stale', connected: true, objects: [] });

        await (globalThis as any).ensureIONCRegistry();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('force=true → re-fetches even if fresh', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true, json: async () => ({ type: 'IONotifyController', servers: [] }),
        }));
        vi.stubGlobal('fetch', fetchMock);

        const reg = (globalThis as any).state.ioncRegistry;
        reg.fetchedAt = Date.now();
        reg.servers.set('s1', { serverName: 'S1', connected: true, objects: ['X'] });

        await (globalThis as any).ensureIONCRegistry({ force: true });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('concurrent calls share fetchPromise (single fetch)', async () => {
        let resolveFetch: any;
        const fetchMock = vi.fn(() => new Promise((res) => {
            resolveFetch = () => res({
                ok: true,
                json: async () => ({ type: 'IONotifyController', servers: [] }),
            } as any);
        }));
        vi.stubGlobal('fetch', fetchMock);

        const p1 = (globalThis as any).ensureIONCRegistry();
        const p2 = (globalThis as any).ensureIONCRegistry();
        resolveFetch();
        await Promise.all([p1, p2]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('5xx → fetchedAt unchanged, throws (caller catches)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));

        const reg = (globalThis as any).state.ioncRegistry;
        const before = reg.fetchedAt;
        await expect((globalThis as any).ensureIONCRegistry()).rejects.toThrow();
        expect(reg.fetchedAt).toBe(before);
        expect(reg.fetchPromise).toBeNull();
    });
});

describe('getIONCEntries', () => {
    beforeEach(() => {
        loadModule();
        const reg = (globalThis as any).state.ioncRegistry;
        reg.fetchedAt = Date.now();
        reg.servers.clear();
        reg.servers.set('s1', { serverName: 'Server1', connected: true,  objects: ['SharedMemory', 'IMIT.MBI'] });
        reg.servers.set('s2', { serverName: 'Server2', connected: false, objects: ['SharedMemory'] });
        reg.servers.set('s3', { serverName: '',         connected: true,  objects: ['Obj'] });
    });

    it('flattens entries with displayString = `${objectName} @ ${serverName||serverId}`', () => {
        const entries = (globalThis as any).getIONCEntries();
        const map = new Map(entries.map((e: any) => [e.displayString, e]));
        expect(map.get('SharedMemory @ Server1')?.serverId).toBe('s1');
        expect(map.get('IMIT.MBI @ Server1')?.objectName).toBe('IMIT.MBI');
        expect(map.get('SharedMemory @ Server2')?.connected).toBe(false);
        expect(map.get('Obj @ s3')?.serverId).toBe('s3'); // serverName='' → fallback на serverId
    });

    it('sorts: online first (alphabetical), then offline', () => {
        const entries = (globalThis as any).getIONCEntries();
        const onlineCount = entries.filter((e: any) => e.connected).length;
        const offlineCount = entries.filter((e: any) => !e.connected).length;
        expect(onlineCount).toBe(3);
        expect(offlineCount).toBe(1);
        // first 3 are online
        for (let i = 0; i < onlineCount; i++) expect(entries[i].connected).toBe(true);
        for (let i = onlineCount; i < entries.length; i++) expect(entries[i].connected).toBe(false);
    });
});
```

- [ ] **Step 2: Run — должен FAIL** ("ensureIONCRegistry is not defined")

Run: `cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run ionc-registry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать функции в `60-widget-sensor-binding.js`**

В начало `ui/static/js/src/60-widget-sensor-binding.js` (после комментария-заголовка, перед `renderSensorBindingFields`) добавить:

```javascript
// ============================================================================
// IONC@server registry — session-cache для combobox'а в config-форме widget'ов.
// TTL 5 минут (IONC_REGISTRY_TTL_MS) + ручной refresh через кнопку ↻.
// fetchPromise shared между concurrent open вызовами.
// 5xx / network error: fetchedAt НЕ обновляется (cache не помечается fresh),
// существующие данные сохраняются для fallback.
// ============================================================================

async function ensureIONCRegistry({ force = false } = {}) {
    const reg = state.ioncRegistry;
    const fresh = (Date.now() - reg.fetchedAt) < IONC_REGISTRY_TTL_MS;
    if (!force && fresh && reg.servers.size > 0) return reg;
    if (reg.fetchPromise) return reg.fetchPromise;
    reg.isFetching = true;
    reg.fetchPromise = (async () => {
        const resp = await fetch('/api/objects-by-type?type=IONotifyController');
        if (!resp.ok) throw new Error(`/api/objects-by-type: HTTP ${resp.status}`);
        const data = await resp.json();
        reg.servers.clear();
        (data.servers || []).forEach(s => {
            reg.servers.set(s.serverId, {
                serverName: s.serverName || '',
                connected:  !!s.connected,
                objects:    Array.isArray(s.objects) ? s.objects : [],
            });
        });
        reg.fetchedAt = Date.now();
        return reg;
    })().finally(() => {
        reg.isFetching = false;
        reg.fetchPromise = null;
    });
    return reg.fetchPromise;
}

function getIONCEntries() {
    const out = [];
    state.ioncRegistry.servers.forEach((srv, serverId) => {
        const sn = srv.serverName || serverId;
        srv.objects.forEach(objectName => {
            out.push({
                serverId,
                serverName: srv.serverName,
                connected:  srv.connected,
                objectName,
                displayString: `${objectName} @ ${sn}`,
            });
        });
    });
    out.sort((a, b) => {
        if (a.connected !== b.connected) return a.connected ? -1 : 1;
        return a.displayString.localeCompare(b.displayString);
    });
    return out;
}

function findIONCEntry(serverId, objectName) {
    const srv = state.ioncRegistry.servers.get(serverId);
    if (!srv) return null;
    if (!srv.objects.includes(objectName)) return null;
    const sn = srv.serverName || serverId;
    return {
        serverId, serverName: srv.serverName, connected: srv.connected,
        objectName, displayString: `${objectName} @ ${sn}`,
    };
}
```

И в `globalThis` exports блок (внизу файла) добавить:

```javascript
    globalThis.ensureIONCRegistry = ensureIONCRegistry;
    globalThis.getIONCEntries     = getIONCEntries;
    globalThis.findIONCEntry      = findIONCEntry;
```

- [ ] **Step 4: Run — должен PASS**

Run: `cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run ionc-registry.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Пересобрать app.js**

Run: `cd /home/pv/Projects/uniset-panel && make app`
Expected: `Generated static/js/app.js`.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/ionc-registry.test.ts ui/static/js/src/60-widget-sensor-binding.js ui/static/js/app.js
git commit -m "binding: add ensureIONCRegistry/getIONCEntries/findIONCEntry helpers"
```

---

## Phase 3 — UI replacement (combo input)

### Task 9: Заменить два select'а на combo input в `renderSensorBindingFields`

**Files:**
- Modify: `ui/static/js/src/60-widget-sensor-binding.js:15-58`

- [ ] **Step 1: Failing test — combo input render shape**

Создать `tests/unit/sensor-binding-combo.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

function loadModule() {
    const constants = readFileSync(resolve(SRC_DIR, '00-constants.js'), 'utf8');
    const stateSrc  = readFileSync(resolve(SRC_DIR, '00-state.js'), 'utf8');
    const utils     = readFileSync(resolve(SRC_DIR, '06-utils.js'), 'utf8');
    const ac        = readFileSync(resolve(SRC_DIR, '41-sensor-autocomplete.js'), 'utf8');
    const binding   = readFileSync(resolve(SRC_DIR, '60-widget-sensor-binding.js'), 'utf8');
    new Function(`${constants}\n${stateSrc}\n${utils}\n${ac}\n${binding}`)();
}

function seedRegistry(entries: Array<{serverId:string, serverName:string, connected:boolean, objects:string[]}>) {
    const reg = (globalThis as any).state.ioncRegistry;
    reg.fetchedAt = Date.now();
    reg.servers.clear();
    entries.forEach(e => reg.servers.set(e.serverId, {
        serverName: e.serverName, connected: e.connected, objects: e.objects,
    }));
}

describe('renderSensorBindingFields — combo shape', () => {
    beforeEach(() => { loadModule(); document.body.innerHTML = ''; });

    it('renders combo input + hidden serverId/objectName + refresh button', () => {
        const html = (globalThis as any).renderSensorBindingFields(
            { serverId: 's1', objectName: 'SharedMemory' }, {}
        );
        document.body.innerHTML = `<form>${html}</form>`;
        const form = document.querySelector('form')!;
        expect(form.querySelector<HTMLInputElement>('.ionc-combo-input')).not.toBeNull();
        expect(form.querySelector<HTMLInputElement>('input[type="hidden"][name="serverId"]')?.value).toBe('s1');
        expect(form.querySelector<HTMLInputElement>('input[type="hidden"][name="objectName"]')?.value).toBe('SharedMemory');
        expect(form.querySelector('.ionc-combo-refresh')).not.toBeNull();
    });

    it('respects fieldPrefix for hidden inputs', () => {
        const html = (globalThis as any).renderSensorBindingFields(
            { serverId: 's2', objectName: 'IMIT' }, { fieldPrefix: 'item-3-' }
        );
        document.body.innerHTML = `<form>${html}</form>`;
        const form = document.querySelector('form')!;
        expect(form.querySelector<HTMLInputElement>('input[type="hidden"][name="item-3-serverId"]')?.value).toBe('s2');
        expect(form.querySelector<HTMLInputElement>('input[type="hidden"][name="item-3-objectName"]')?.value).toBe('IMIT');
    });

    it('still renders sensor input + hidden sensorId (existing contract)', () => {
        const html = (globalThis as any).renderSensorBindingFields(
            { serverId: 's1', objectName: 'X', sensor: 'AI42_S', sensorId: 42 }, {}
        );
        document.body.innerHTML = `<form>${html}</form>`;
        const form = document.querySelector('form')!;
        expect(form.querySelector<HTMLInputElement>('input[name="sensor"]')?.value).toBe('AI42_S');
        expect(form.querySelector<HTMLInputElement>('input[type="hidden"][name="sensorId"]')?.value).toBe('42');
    });
});

describe('parseSensorBindingFields — preserves contract', () => {
    beforeEach(() => { loadModule(); document.body.innerHTML = ''; });

    it('reads hidden serverId/objectName + sensor/sensorId', () => {
        document.body.innerHTML = `
            <form>
                <input type="hidden" name="serverId" value="srv7">
                <input type="hidden" name="objectName" value="MyIONC">
                <input type="text" name="sensor" value="Temp_S">
                <input type="hidden" name="sensorId" value="123">
            </form>
        `;
        const form = document.querySelector('form')!;
        const parsed = (globalThis as any).parseSensorBindingFields(form, {});
        expect(parsed).toEqual({ serverId: 'srv7', objectName: 'MyIONC', sensor: 'Temp_S', sensorId: 123 });
    });
});
```

- [ ] **Step 2: Run — должен FAIL** (`.ionc-combo-input` ещё не рендерится)

Run: `cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run sensor-binding-combo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Изменить `renderSensorBindingFields`**

Заменить тело функции в `ui/static/js/src/60-widget-sensor-binding.js:15-58` на:

```javascript
function renderSensorBindingFields(config = {}, opts = {}) {
    const prefix = opts.fieldPrefix || '';
    const sensorLabel = opts.sensorLabel || 'Sensor';
    const objectNameDefault = opts.objectNameDefault || 'SharedMemory';

    const serverId = config.serverId || '';
    const objectName = config.objectName || objectNameDefault;
    // displayString рендерится как orphan-fallback; setupIONCComboAutocomplete
    // переписывает после ensureIONCRegistry, если registry содержит pair.
    const initialDisplay = serverId && objectName
        ? `${objectName} @ ${serverId}`
        : '';

    return `
        <div class="widget-config-field ionc-combo-row">
            <label>IONC @ Server</label>
            <div class="ionc-combo-wrap">
                <input type="text" class="widget-input ionc-combo-input"
                       name="${prefix}ioncCombo" autocomplete="off"
                       placeholder="введите для поиска…"
                       value="${escapeAttr(initialDisplay)}"
                       data-test="cfg-${prefix}ioncCombo">
                <button type="button" class="ionc-combo-refresh"
                        title="Обновить список"
                        data-test="cfg-${prefix}ioncRefresh">↻</button>
                <input type="hidden" name="${prefix}serverId" value="${escapeAttr(serverId)}"
                       data-test="cfg-${prefix}serverId">
                <input type="hidden" name="${prefix}objectName" value="${escapeAttr(objectName)}"
                       data-test="cfg-${prefix}objectName">
            </div>
        </div>
        <div class="widget-config-field">
            <label>${escapeHtml(sensorLabel)}</label>
            <div class="sensor-select-wrap">
                <input type="text" class="widget-input sensor-select-input" name="${prefix}sensor" autocomplete="off"
                       placeholder="Click to select or type to search..."
                       value="${escapeAttr(config.sensor || '')}" data-test="cfg-${prefix}sensor">
                <input type="hidden" name="${prefix}sensorId" value="${escapeAttr(config.sensorId ?? '')}" data-test="cfg-${prefix}sensorId">
            </div>
        </div>
    `;
}
```

(`parseSensorBindingFields` НЕ меняется — она читает hidden inputs `serverId`/`objectName`/`sensor`/`sensorId`, и в новой DOM-структуре они всё ещё есть с теми же `name=`.)

- [ ] **Step 4: Run — все 4 теста должны PASS**

Run: `cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run sensor-binding-combo.test.ts`
Expected: PASS.

- [ ] **Step 5: Пересобрать app.js**

Run: `cd /home/pv/Projects/uniset-panel && make app`
Expected: `Generated`.

- [ ] **Step 6: Commit**

```bash
git add ui/static/js/src/60-widget-sensor-binding.js ui/static/js/app.js tests/unit/sensor-binding-combo.test.ts
git commit -m "binding: replace 2 selects with single ionc-combo input + hidden serverId/objectName"
```

---

### Task 10: `setupIONCComboAutocomplete` — wiring + dropdown

**Files:**
- Modify: `ui/static/js/src/60-widget-sensor-binding.js`
- Test: `tests/unit/sensor-binding-combo.test.ts`

- [ ] **Step 1: Failing tests на autocomplete-поведение**

Добавить в `tests/unit/sensor-binding-combo.test.ts` (внутри файла, после существующих describe'ов):

```typescript
describe('setupIONCComboAutocomplete', () => {
    beforeEach(() => {
        loadModule();
        document.body.innerHTML = '';
        seedRegistry([
            { serverId: 's1', serverName: 'Server1', connected: true,  objects: ['SharedMemory', 'IMIT.MBI'] },
            { serverId: 's2', serverName: 'Server2', connected: false, objects: ['SharedMemory'] },
        ]);
    });

    afterEach(() => vi.restoreAllMocks());

    function mountForm(config: any = {}) {
        const html = (globalThis as any).renderSensorBindingFields(config, {});
        document.body.innerHTML = `<form>${html}</form>`;
        const form = document.querySelector('form')! as HTMLFormElement;
        return form;
    }

    it('preselects display string when (serverId, objectName) found in registry', () => {
        const form = mountForm({ serverId: 's1', objectName: 'SharedMemory' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        expect(input.value).toBe('SharedMemory @ Server1');
        expect(input.dataset.orphan).toBeUndefined();
    });

    it('marks orphan when pair not in registry', () => {
        const form = mountForm({ serverId: 'unknown', objectName: 'GhostObj' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        expect(input.value).toBe('GhostObj @ unknown (offline)');
        expect(input.dataset.orphan).toBe('true');
    });

    it('focus opens dropdown with all entries online-first', () => {
        const form = mountForm({ serverId: 's1', objectName: 'SharedMemory' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        input.dispatchEvent(new FocusEvent('focus'));
        const items = document.querySelectorAll('.ionc-combo-item');
        expect(items.length).toBe(3); // 2 online + 1 offline
        // First item is online (preselected)
        expect(items[0].textContent).toContain('SharedMemory @ Server1');
    });

    it('typing filters by substring (matches both halves of @)', async () => {
        const form = mountForm({ serverId: 's1', objectName: 'SharedMemory' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        input.dispatchEvent(new FocusEvent('focus'));
        input.value = 'IMIT';
        input.dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 150)); // past debounce 100ms
        const items = document.querySelectorAll('.ionc-combo-item');
        expect(items.length).toBe(1);
        expect(items[0].textContent).toContain('IMIT.MBI @ Server1');
    });

    it('matches by server name half', async () => {
        const form = mountForm({ serverId: 's1', objectName: 'SharedMemory' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        input.dispatchEvent(new FocusEvent('focus'));
        input.value = 'Server2';
        input.dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 150));
        const items = document.querySelectorAll('.ionc-combo-item');
        expect(items.length).toBe(1);
        expect(items[0].textContent).toContain('Server2');
    });

    it('pickItem fills hidden inputs and fires change event', () => {
        const form = mountForm({ serverId: 's1', objectName: 'SharedMemory' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const hiddenServer = form.querySelector<HTMLInputElement>('input[name="serverId"]')!;
        const hiddenObject = form.querySelector<HTMLInputElement>('input[name="objectName"]')!;

        let changeFired = 0;
        hiddenServer.addEventListener('change', () => changeFired++);
        hiddenObject.addEventListener('change', () => changeFired++);

        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        input.dispatchEvent(new FocusEvent('focus'));
        const items = document.querySelectorAll('.ionc-combo-item');
        // pick "IMIT.MBI @ Server1"
        const target = Array.from(items).find(el => el.textContent?.includes('IMIT.MBI'))! as HTMLElement;
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

        expect(hiddenServer.value).toBe('s1');
        expect(hiddenObject.value).toBe('IMIT.MBI');
        expect(input.value).toBe('IMIT.MBI @ Server1');
        expect(changeFired).toBeGreaterThanOrEqual(2);
    });

    it('refresh button triggers force fetch', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ type: 'IONotifyController', servers: [
                { serverId: 's1', serverName: 'Server1', connected: true, objects: ['SharedMemory'] },
            ] }),
        }));
        vi.stubGlobal('fetch', fetchMock);

        const form = mountForm({ serverId: 's1', objectName: 'SharedMemory' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const refreshBtn = form.querySelector<HTMLButtonElement>('.ionc-combo-refresh')!;
        refreshBtn.click();
        await new Promise(r => setTimeout(r, 0));
        await new Promise(r => setTimeout(r, 0));
        expect(fetchMock).toHaveBeenCalled();
    });

    it('single match → input disabled + auto-fill', () => {
        // Reset registry to single entry
        const reg = (globalThis as any).state.ioncRegistry;
        reg.servers.clear();
        reg.servers.set('only', { serverName: 'Only', connected: true, objects: ['OnlyIONC'] });

        const form = mountForm({}); // no preselect
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        const hiddenServer = form.querySelector<HTMLInputElement>('input[name="serverId"]')!;
        expect(input.value).toBe('OnlyIONC @ Only');
        expect(input.disabled).toBe(true);
        expect(hiddenServer.value).toBe('only');
    });
});
```

- [ ] **Step 2: Run — должны FAIL** ("setupIONCComboAutocomplete is not a function")

Run: `cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run sensor-binding-combo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Реализовать `setupIONCComboAutocomplete`**

В `ui/static/js/src/60-widget-sensor-binding.js` (после `findIONCEntry`, перед `renderSensorBindingFields`):

```javascript
// setupIONCComboAutocomplete — wiring combobox'а IONC@server.
// Привязывает к input/hidden/refresh-кнопке. Идемпотентен через
// form.dataset[`ioncCombo_${prefix}_wired`].
function setupIONCComboAutocomplete(form, prefix = '') {
    const flagKey = `ioncCombo_${prefix.replace(/[^a-z0-9]/gi, '_')}_wired`;
    if (form.dataset[flagKey] === 'true') return;
    form.dataset[flagKey] = 'true';

    const input        = form.querySelector(`[name="${prefix}ioncCombo"]`);
    const hiddenServer = form.querySelector(`[name="${prefix}serverId"]`);
    const hiddenObject = form.querySelector(`[name="${prefix}objectName"]`);
    const refreshBtn   = input?.closest('.ionc-combo-wrap')?.querySelector('.ionc-combo-refresh');
    if (!input || !hiddenServer || !hiddenObject) return;

    let dropdown = null;
    let debounceTimer = null;
    let activeIndex = -1;
    let currentItems = [];
    let currentFilter = '';

    function destroyDropdown() {
        if (dropdown) { dropdown.remove(); dropdown = null; }
        activeIndex = -1;
        currentItems = [];
    }

    function renderItems() {
        if (!dropdown) return;
        if (currentItems.length === 0) {
            dropdown.innerHTML = '<div class="ionc-combo-empty">Нет совпадений</div>';
            return;
        }
        const filterLower = currentFilter.toLowerCase();
        const itemsHtml = currentItems.map((it, idx) => {
            const cls = [
                'ionc-combo-item',
                idx === activeIndex ? 'active' : '',
                it.connected ? '' : 'offline',
                hiddenServer.value === it.serverId && hiddenObject.value === it.objectName ? 'preselected' : '',
            ].filter(Boolean).join(' ');
            const offlineMark = it.connected ? '' : '<span class="ionc-combo-offline-mark">⚠ offline</span>';
            const star = (hiddenServer.value === it.serverId && hiddenObject.value === it.objectName)
                ? '<span class="ionc-combo-star">★</span>' : '';
            return `<div class="${cls}" data-idx="${idx}">
                ${star}<span class="ionc-combo-display">${highlightMatch(it.displayString, filterLower)}</span>${offlineMark}
            </div>`;
        }).join('');
        dropdown.innerHTML = itemsHtml;
        dropdown.querySelectorAll('.ionc-combo-item').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                pickItem(parseInt(el.dataset.idx, 10));
            });
        });
    }

    function highlightMatch(text, filterLower) {
        if (!filterLower) return escapeHtml(text);
        const lower = text.toLowerCase();
        const idx = lower.indexOf(filterLower);
        if (idx < 0) return escapeHtml(text);
        return `${escapeHtml(text.slice(0, idx))}<mark>${escapeHtml(text.slice(idx, idx + filterLower.length))}</mark>${escapeHtml(text.slice(idx + filterLower.length))}`;
    }

    function buildDropdown() {
        if (dropdown) return;
        dropdown = document.createElement('div');
        dropdown.className = 'ionc-combo-dropdown';
        const rect = input.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.top = `${rect.bottom + 2}px`;
        dropdown.style.width = `${rect.width}px`;
        dropdown.style.zIndex = String(SENSOR_AUTOCOMPLETE_DROPDOWN_Z_INDEX);
        document.body.appendChild(dropdown);
    }

    function applyFilter(text) {
        currentFilter = text;
        const all = getIONCEntries();
        if (!text) {
            currentItems = all;
        } else {
            const t = text.toLowerCase();
            currentItems = all.filter(it => it.displayString.toLowerCase().includes(t));
        }
        activeIndex = -1;
        renderItems();
    }

    function pickItem(idx) {
        const item = currentItems[idx];
        if (!item) return;
        input.value = item.displayString;
        delete input.dataset.orphan;
        hiddenServer.value = item.serverId;
        hiddenObject.value = item.objectName;
        hiddenServer.dispatchEvent(new Event('change', { bubbles: true }));
        hiddenObject.dispatchEvent(new Event('change', { bubbles: true }));
        destroyDropdown();
    }

    function preselectFromConfig() {
        const sid = hiddenServer.value;
        const oname = hiddenObject.value;
        if (!sid || !oname) return;
        const entry = findIONCEntry(sid, oname);
        if (entry) {
            input.value = entry.displayString;
            delete input.dataset.orphan;
        } else {
            input.value = `${oname} @ ${sid} (offline)`;
            input.dataset.orphan = 'true';
        }
    }

    function applySingleMatchOrPreselect() {
        const all = getIONCEntries();
        if (all.length === 1) {
            const it = all[0];
            input.value = it.displayString;
            input.disabled = true;
            input.title = 'Только 1 IONC@server в системе';
            hiddenServer.value = it.serverId;
            hiddenObject.value = it.objectName;
            hiddenServer.dispatchEvent(new Event('change', { bubbles: true }));
            hiddenObject.dispatchEvent(new Event('change', { bubbles: true }));
            return;
        }
        input.disabled = false;
        input.title = '';
        preselectFromConfig();
    }

    // Initial population — может быть синхронной если registry уже заполнен
    if (state.ioncRegistry.servers.size > 0) {
        applySingleMatchOrPreselect();
    } else {
        ensureIONCRegistry().then(applySingleMatchOrPreselect).catch(() => {
            preselectFromConfig(); // fallback: пометит orphan
        });
    }

    input.addEventListener('focus', () => {
        if (input.disabled) return;
        buildDropdown();
        applyFilter(input.value || '');
    });

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            buildDropdown();
            applyFilter(input.value || '');
        }, IONC_COMBO_DEBOUNCE_MS);
    });

    input.addEventListener('keydown', (e) => {
        if (!dropdown || currentItems.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, currentItems.length - 1);
            renderItems();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            renderItems();
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0) {
                e.preventDefault();
                pickItem(activeIndex);
            }
        } else if (e.key === 'Escape') {
            destroyDropdown();
        }
    });

    input.addEventListener('blur', () => {
        // Delay so mousedown on item fires first.
        setTimeout(destroyDropdown, SENSOR_AUTOCOMPLETE_BLUR_DELAY_MS);
    });

    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            if (state.ioncRegistry.isFetching) return;
            refreshBtn.classList.add('spinning');
            try {
                await ensureIONCRegistry({ force: true });
                applySingleMatchOrPreselect();
                if (dropdown) applyFilter(input.value || '');
            } catch (err) {
                console.warn('IONC registry refresh failed:', err);
            } finally {
                refreshBtn.classList.remove('spinning');
            }
        });
    }
}
```

И в `globalThis` exports:

```javascript
    globalThis.setupIONCComboAutocomplete = setupIONCComboAutocomplete;
```

- [ ] **Step 4: Run — все тесты должны PASS**

Run: `cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run sensor-binding-combo.test.ts`
Expected: PASS (все тесты).

- [ ] **Step 5: Пересобрать app.js**

Run: `cd /home/pv/Projects/uniset-panel && make app`

- [ ] **Step 6: Commit**

```bash
git add ui/static/js/src/60-widget-sensor-binding.js ui/static/js/app.js tests/unit/sensor-binding-combo.test.ts
git commit -m "binding: implement setupIONCComboAutocomplete with substring search + refresh"
```

---

### Task 11: Подключить combo wiring в `initSensorBindingHandlers`

**Files:**
- Modify: `ui/static/js/src/60-widget-sensor-binding.js:150-213`

- [ ] **Step 1: Failing test — initSensorBindingHandlers wires combo**

Добавить в `tests/unit/sensor-binding-combo.test.ts`:

```typescript
describe('initSensorBindingHandlers — combo integration', () => {
    beforeEach(() => {
        loadModule();
        document.body.innerHTML = '';
        seedRegistry([
            { serverId: 's1', serverName: 'Server1', connected: true, objects: ['SharedMemory'] },
        ]);
    });

    it('wires combo and resets sensor input on object change', () => {
        const html = (globalThis as any).renderSensorBindingFields(
            { serverId: 's1', objectName: 'SharedMemory', sensor: 'OldSensor', sensorId: 99 }, {}
        );
        document.body.innerHTML = `<form>${html}</form>`;
        const form = document.querySelector('form')! as HTMLFormElement;

        (globalThis as any).initSensorBindingHandlers(form, {}, {});

        const hiddenObject = form.querySelector<HTMLInputElement>('input[name="objectName"]')!;
        const sensorInput  = form.querySelector<HTMLInputElement>('input[name="sensor"]')!;
        const sensorIdHidden = form.querySelector<HTMLInputElement>('input[name="sensorId"]')!;

        // Симулируем смену object (как делает pickItem)
        hiddenObject.value = 'OtherObj';
        hiddenObject.dispatchEvent(new Event('change', { bubbles: true }));

        // sensor должен быть сброшен (ac.resetOnObjectChange()):
        expect(sensorInput.value).toBe('');
        expect(sensorIdHidden.value).toBe('');
    });

    it('idempotent — second call no-op', () => {
        const html = (globalThis as any).renderSensorBindingFields(
            { serverId: 's1', objectName: 'SharedMemory' }, {}
        );
        document.body.innerHTML = `<form>${html}</form>`;
        const form = document.querySelector('form')! as HTMLFormElement;

        (globalThis as any).initSensorBindingHandlers(form, {}, {});
        // Второй вызов не должен бросить и не должен повторно wired'ить
        expect(() => (globalThis as any).initSensorBindingHandlers(form, {}, {})).not.toThrow();
    });
});
```

- [ ] **Step 2: Run — должен FAIL** (старая `loadIONCObjects` логика селектами больше не работает, тесты отвалятся, или вообще не сетятся handlers потому что `objectSelect` нет).

Run: `cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run sensor-binding-combo.test.ts -t "initSensorBindingHandlers"`
Expected: FAIL.

- [ ] **Step 3: Заменить тело `initSensorBindingHandlers`**

Заменить старую реализацию (`60-widget-sensor-binding.js:150-213`) на:

```javascript
// initSensorBindingHandlers — wires combobox IONC@server + sensor autocomplete.
// Идемпотентен через form.dataset[flagKey].
//
// При смене hidden objectName/serverId (через pickItem combo'а) — sensor input
// сбрасывается через ac.resetOnObjectChange() (контракт сохранён).
function initSensorBindingHandlers(form, config = {}, opts = {}) {
    const prefix = opts.fieldPrefix || '';
    const flagKey = `sensorBinding_${prefix.replace(/[^a-z0-9]/gi, '_')}_wired`;
    if (form.dataset[flagKey] === 'true') return null;
    form.dataset[flagKey] = 'true';

    const hiddenServer = form.querySelector(`[name="${prefix}serverId"]`);
    const hiddenObject = form.querySelector(`[name="${prefix}objectName"]`);
    const sensorInput  = form.querySelector(`[name="${prefix}sensor"]`);
    const hiddenIdInput = form.querySelector(`[name="${prefix}sensorId"]`);
    if (!hiddenServer || !hiddenObject || !sensorInput || !hiddenIdInput) return null;

    setupIONCComboAutocomplete(form, prefix);

    const ac = setupSensorAutocomplete(
        sensorInput,
        hiddenIdInput,
        () => hiddenObject.value,
        () => hiddenServer.value
    );

    hiddenServer.addEventListener('change', () => {
        if (ac && typeof ac.resetOnObjectChange === 'function') ac.resetOnObjectChange();
    });
    hiddenObject.addEventListener('change', () => {
        if (ac && typeof ac.resetOnObjectChange === 'function') ac.resetOnObjectChange();
    });

    return {
        resetSensor() {
            if (ac && typeof ac.resetOnObjectChange === 'function') ac.resetOnObjectChange();
        },
    };
}
```

- [ ] **Step 4: Run — должны PASS**

Run: `cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run sensor-binding-combo.test.ts`
Expected: PASS.

- [ ] **Step 5: Пересобрать app.js**

Run: `cd /home/pv/Projects/uniset-panel && make app`

- [ ] **Step 6: Commit**

```bash
git add ui/static/js/src/60-widget-sensor-binding.js ui/static/js/app.js tests/unit/sensor-binding-combo.test.ts
git commit -m "binding: rewire initSensorBindingHandlers через combo (drop loadIONCObjects)"
```

---

## Phase 4 — CSS + UX polish

### Task 12: CSS для combo

**Files:**
- Modify: `ui/static/css/style.css`

- [ ] **Step 1: Добавить стили в конец `style.css`**

```css
/* === IONC@server combobox === */
.ionc-combo-row .ionc-combo-wrap {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
}
.ionc-combo-input {
    flex: 1;
    min-width: 0;
}
.ionc-combo-input:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    background: #1a202c;
}
.ionc-combo-input[data-orphan="true"] {
    border-color: #fbbf24;
    color: #fbbf24;
}
.ionc-combo-refresh {
    background: #1f2937;
    color: #9ca3af;
    border: 1px solid #374151;
    border-radius: 4px;
    padding: 4px 8px;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
}
.ionc-combo-refresh:hover { color: #60a5fa; border-color: #60a5fa; }
.ionc-combo-refresh.spinning {
    animation: ionc-spin 0.8s linear infinite;
    pointer-events: none;
}
@keyframes ionc-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
}

.ionc-combo-dropdown {
    background: #0b1220;
    border: 1px solid #374151;
    border-radius: 4px;
    max-height: 320px;
    overflow-y: auto;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
}
.ionc-combo-item {
    padding: 6px 10px;
    color: #d1d5db;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid #1f2937;
}
.ionc-combo-item:last-child { border-bottom: 0; }
.ionc-combo-item:hover, .ionc-combo-item.active { background: #1e293b; color: #fff; }
.ionc-combo-item.preselected { color: #93c5fd; }
.ionc-combo-item.offline {
    opacity: 0.55;
    color: #9ca3af;
}
.ionc-combo-display { flex: 1; min-width: 0; }
.ionc-combo-display mark { background: #fbbf24; color: #111827; padding: 0 2px; border-radius: 2px; }
.ionc-combo-star { color: #fbbf24; flex: 0 0 auto; }
.ionc-combo-offline-mark {
    color: #fbbf24;
    font-size: 10px;
    flex: 0 0 auto;
    margin-left: auto;
}
.ionc-combo-empty {
    padding: 10px;
    color: #6b7280;
    text-align: center;
    font-size: 12px;
    font-style: italic;
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/static/css/style.css
git commit -m "css: styles for IONC@server combobox (dropdown, offline marker, refresh spin)"
```

---

## Phase 5 — E2E + regression

### Task 13: E2E smoke test

**Files:**
- Create: `tests/single/dashboard-widget-ionc-combo.spec.ts`

- [ ] **Step 1: Написать E2E spec**

Создать `tests/single/dashboard-widget-ionc-combo.spec.ts` — взять за образец существующий `tests/single/dashboard-widget-settings.spec.ts` (структура: page.goto, switchView, edit mode, showWidgetConfig).

Минимум 3 теста:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Dashboard widget IONC@server combobox', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Wait for app initialized + at least one server connected
        await page.waitForFunction(() => (window as any).state?.servers?.size > 0);
    });

    test('combo input renders and dropdown shows IONC@server entries', async ({ page }) => {
        // Switch to dashboard view + create new widget
        await page.evaluate(async () => {
            const dm = (window as any).dashboardManager;
            dm.switchView('dashboard');
            // Create a fresh dashboard
            (window as any).dashboardState.dashboards.set('test-combo', {
                version: 1, meta: { name: 'test-combo' }, grid: { cols: 24, rowHeight: 30, gap: 4 }, widgets: [],
            });
            await dm.loadDashboard('test-combo');
            dm.toggleEditMode();
            await new Promise(r => setTimeout(r, 100));
        });

        // Open widget picker (Add toggle widget)
        await page.evaluate(() => (window as any).dashboardManager.showWidgetPicker());
        await page.waitForSelector('.widget-picker-modal, .modal-overlay');
        await page.click('text=Toggle');
        await page.waitForSelector('.widget-config-form');

        // combo input present
        const combo = page.locator('.ionc-combo-input');
        await expect(combo).toBeVisible();
        await combo.focus();
        await page.waitForSelector('.ionc-combo-dropdown');
        const items = await page.locator('.ionc-combo-item').count();
        expect(items).toBeGreaterThan(0);
    });

    test('refresh button triggers fetch', async ({ page }) => {
        await page.evaluate(async () => {
            const dm = (window as any).dashboardManager;
            dm.switchView('dashboard');
            (window as any).dashboardState.dashboards.set('test-refresh', {
                version: 1, meta: { name: 'test-refresh' }, grid: { cols: 24, rowHeight: 30, gap: 4 }, widgets: [],
            });
            await dm.loadDashboard('test-refresh');
            dm.toggleEditMode();
        });
        await page.evaluate(() => (window as any).dashboardManager.showWidgetPicker());
        await page.click('text=Toggle');
        await page.waitForSelector('.ionc-combo-input');

        const responses: string[] = [];
        page.on('response', r => {
            if (r.url().includes('/api/objects-by-type')) responses.push(r.url());
        });

        await page.click('.ionc-combo-refresh');
        await page.waitForFunction(() => !document.querySelector('.ionc-combo-refresh.spinning'));
        expect(responses.length).toBeGreaterThan(0);
    });

    test('orphan widget (unknown server) shows (offline) suffix', async ({ page }) => {
        await page.evaluate(async () => {
            const dm = (window as any).dashboardManager;
            dm.switchView('dashboard');
            (window as any).dashboardState.dashboards.set('test-orphan', {
                version: 1, meta: { name: 'test-orphan' }, grid: { cols: 24, rowHeight: 30, gap: 4 },
                widgets: [{
                    id: 'w-orphan', type: 'toggle',
                    position: { col: 1, row: 1, width: 4, height: 3 },
                    config: {
                        serverId: 'ghost-server-id', objectName: 'GhostObj',
                        sensor: 'X', sensorId: 999, valueOff: 0, valueOn: 1,
                    },
                }],
            });
            await dm.loadDashboard('test-orphan');
            dm.toggleEditMode();
            await new Promise(r => setTimeout(r, 200));
        });
        await page.evaluate(() => (window as any).dashboardManager.showWidgetConfig('w-orphan'));
        await page.waitForSelector('.ionc-combo-input');

        const value = await page.locator('.ionc-combo-input').inputValue();
        expect(value).toContain('GhostObj');
        expect(value).toContain('(offline)');
        const orphanAttr = await page.locator('.ionc-combo-input').getAttribute('data-orphan');
        expect(orphanAttr).toBe('true');
    });
});
```

- [ ] **Step 2: Запустить через Docker**

Run: `cd /home/pv/Projects/uniset-panel && docker compose --profile dev down && make js-tests TEST=single/dashboard-widget-ionc-combo.spec.ts`
Expected: 3 tests PASS.

(Если падает из-за прежнего `state.ioncRegistry` контекста другого spec'а — добавить `beforeEach` сброс `state.ioncRegistry.fetchedAt = 0`.)

- [ ] **Step 3: Commit**

```bash
git add tests/single/dashboard-widget-ionc-combo.spec.ts
git commit -m "e2e: dashboard widget IONC@server combobox — render, refresh, orphan paths"
```

---

### Task 14: Регрессия — прогон существующих active widget E2E

**Files:** только запуск.

- [ ] **Step 1: Запустить все active-widget E2E**

Run:
```bash
cd /home/pv/Projects/uniset-panel && \
docker compose --profile dev down && \
make js-tests TEST=single/dashboard-active-toggle.spec.ts && \
make js-tests TEST=single/dashboard-active-button.spec.ts && \
make js-tests TEST=single/dashboard-active-setpoint.spec.ts && \
make js-tests TEST=single/dashboard-active-generator.spec.ts && \
make js-tests TEST=single/dashboard-widget-settings.spec.ts
```
Expected: All PASS.

- [ ] **Step 2: Если что-то упало — починить**

Самые вероятные точки регрессии:
- Тест ищет `select[name="serverId"]` или `select[name="objectName"]` — заменить на `input[type="hidden"][name="serverId"]` (значение читается так же).
- Тест выбирает option в select'е → теперь нужно либо триггерить combo pickItem (`page.evaluate(() => document.querySelector('.ionc-combo-item').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))`), либо устанавливать hidden value напрямую через `page.evaluate(() => { const h = document.querySelector('input[name="serverId"]'); h.value = 's1'; h.dispatchEvent(new Event('change', { bubbles: true })); })`.

Внести правки в spec'и, перепрогнать упавшие.

- [ ] **Step 3: Commit (только если потребовались правки spec'ов)**

```bash
git add tests/single/<changed-specs>
git commit -m "test: adapt existing widget E2E to ionc-combo input (no-select-anymore)"
```

---

### Task 15: Финальный полный прогон + push

**Files:** только команды.

- [ ] **Step 1: Прогнать все unit-тесты**

Run: `cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run`
Expected: All PASS.

- [ ] **Step 2: Прогнать все Go тесты**

Run: `cd /home/pv/Projects/uniset-panel && go test ./...`
Expected: All PASS.

- [ ] **Step 3: Прогнать все E2E**

Run: `cd /home/pv/Projects/uniset-panel && docker compose --profile dev down && make js-tests`
Expected: All PASS.

- [ ] **Step 4: Push**

```bash
git push github story/dashboard-active-controls
```

- [ ] **Step 5: Cleanup**

Удалить старый комментарий `<small>список загружается из /api/objects?type=IONotifyController</small>` если он остался где-то еще, и убедиться что `loadIONCObjects` нигде больше не упоминается.

Run: `grep -rn "loadIONCObjects" /home/pv/Projects/uniset-panel/ui/`
Expected: пусто (или только в commit messages).

---

## Spec Coverage Self-Check

| Spec section | Реализовано в task'е |
|---|---|
| Goal — combo replacing 2 selects | Task 9 |
| Architecture diagram (data-flow) | Tasks 7–11 |
| Files list (backend + frontend) | Tasks 1–13 |
| API contract `/api/objects-by-type` | Tasks 1–6 |
| Backend invariants (400/503/partial success) | Tasks 4, 5 |
| Cache shape (state.ioncRegistry, ensureIONCRegistry) | Tasks 7, 8 |
| `getIONCEntries` sort online-first | Task 8 |
| DOM-структура combo + hidden + refresh | Task 9 |
| Behavior (focus/typing/pick/refresh/orphan/single) | Task 10 |
| Sensor cascade preserved | Task 11 |
| Error handling (5xx, empty, concurrent) | Tasks 5, 8 |
| Persistence Invariants — config никогда не очищается | Task 10 (orphan path), Task 13 (E2E orphan test) |
| CSS (dropdown, offline marker, refresh spin) | Task 12 |
| Backend tests | Tasks 2, 3, 5, 6 |
| Frontend unit tests (registry + combo) | Tasks 8, 10, 11 |
| E2E tests | Task 13 |
| Регрессия | Task 14 |
| Constants | Task 7 |

Все секции спеки покрыты задачами. Migration не нужна (см. spec — orphan path обрабатывает старые widget'ы автоматически).
