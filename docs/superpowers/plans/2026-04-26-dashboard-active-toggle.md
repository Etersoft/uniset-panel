# Dashboard Active Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-26-dashboard-active-toggle-design.md`

**Foundation:** уже завершён в `2026-04-26-dashboard-active-controls-foundation.md` — есть `ActiveDashboardWidget`, smoke E2E, CSS состояний, debug hook.

**Goal:** Реализовать первый активный widget (Toggle): переключатель между двумя числовыми значениями для любого датчика IONC, с dropdown выбором IONC-объекта и autocomplete sensor'а; параллельно решить 4 архитектурных вопроса foundation'а и починить hardcoded `'SharedMemory'` в dashboard read-pathway.

**Architecture:** Backend: расширение `/api/objects` опциональным `?type=` фильтром (N+1 запрос данных через `serverMgr.GetObjectData` для определения типа — без кеша на этом этапе). Frontend: новый класс `ToggleWidget extends ActiveDashboardWidget` (готовое foundation API), переиспользуемая утилита `setupSensorAutocomplete`. Foundation refactor: `_updateInteractivityClass` + custom DOM events для реактивности, перенос hardcoded имени IONC-объекта в `config.objectName` per widget. Dashboard manager: маркер `data-active-widget="true"` на контейнерах, группировка sensor fetches по `(serverId, objectName)`.

**Tech Stack:** Go (`net/http`, encoding/json, table-tests), ES6 классы и custom events, Playwright E2E.

**E2E command form:** `docker compose run --rm e2e single/<spec>.spec.ts` (entrypoint accepts args). Stop dev profile first if running: `docker compose --profile dev down`.

---

## File Structure

| Файл | Действие | Ответственность |
|---|---|---|
| `internal/api/handlers.go` | **Modify** (`GetObjects` ~line 219) | Добавить опциональный `?type=` параметр; при наличии — N+1 fetch object data, фильтрация, возврат `[{name, objectType}]` вместо плоского списка имён |
| `internal/api/handlers_test.go` | **Create or Modify** | Table-test `TestGetObjects_TypeFilter` через `httptest.NewServer` с моком uniset client |
| `ui/static/js/src/02-control.js` | **Modify** | В конце `updateControlStatus` диспатчить `CustomEvent('controlStatusChanged')` |
| `ui/static/js/src/62-dashboard-manager.js` | **Modify** | (1) При `editMode` toggle — диспатчить `CustomEvent('dashboardEditModeChanged')`; (2) В `createWidget` — после `widget = new WidgetClass(...)`, если `widget instanceof ActiveDashboardWidget` — `container.dataset.activeWidget = "true"`; (3) `fetchSensorValues` рефактор — группировать по `(serverId, objectName)` |
| `ui/static/js/src/61-dashboard-active-base.js` | **Modify** | (1) `writeValue` — `objectName = config.objectName \|\| 'SharedMemory'`, body `sensor_id: config.sensorId` (вместо `config.sensor`); (2) Новый метод `_updateInteractivityClass`; (3) Constructor — addEventListener на `dashboardEditModeChanged` и `controlStatusChanged`; (4) `destroy` — removeEventListener; (5) После `render()` в наследниках — авто-вызов `_updateInteractivityClass` |
| `ui/static/css/style.css` | **Modify** | Заменить `[data-type^="active-"]` на `[data-active-widget="true"]` (2 места). Добавить `.toggle-widget` + связанные классы (fb-on/off/unknown, diverge) |
| `ui/static/js/src/41-sensor-autocomplete.js` | **Create** | Утилита `setupSensorAutocomplete(inputEl, hiddenIdEl, getObjectName, getServerId)` — debounce 150ms, dropdown, keyboard nav |
| `ui/static/js/src/61-dashboard-active-toggle.js` | **Create** | `ToggleWidget extends ActiveDashboardWidget` |
| `tests/single/dashboard-active-toggle.spec.ts` | **Create** | E2E: конфиг flow, состояния, write-flow, edit-mode, control-token, custom labels, read-pathway fix |
| `tests/single/dashboard-active-base.spec.ts` | **Modify** | Обновить под новый контракт (`config.objectName`, `config.sensorId`, marker `data-active-widget`) |
| `tests/mock-server/server.js` | **Modify (по необходимости)** | Если ещё нет — добавить mock `POST /api/objects/.../ionc/set` (returns 200) и иметь объект `SharedMemory2` для read-pathway теста |
| `CLAUDE.md` | **Modify** | Раздел про toggle widget и sensor autocomplete utility |

---

## Phase 0 — Baseline

### Task 0.1: Verify branch and baseline tests

- [ ] **Step 1: Confirm branch**

Run: `git branch --show-current`
Expected: `story/dashboard-active-controls`

- [ ] **Step 2: Baseline E2E sweep**

Run: `docker compose --profile dev down`

Run:
```bash
docker compose run --rm e2e \
  single/dashboard.spec.ts \
  single/dashboard-sse.spec.ts \
  single/dashboard-widgets.spec.ts \
  single/dashboard-active-base.spec.ts
```
Expected: all PASS. This is our reference for "no regressions" after the changes.

If anything fails — fix or report BLOCKED before starting Phase 1.

---

## Phase 1 — Backend: GetObjects type filter

### Task 1.1: Extend `GetObjects` with type filter

**Files:**
- Modify: `internal/api/handlers.go` (function `GetObjects` around line 219)

- [ ] **Step 1: Read current implementation**

Read `internal/api/handlers.go:219-231` to confirm current signature. Note that `h.client.GetObjectList()` returns plain `[]string`. For type filter we need `serverMgr.GetObjectData(serverID, name)` (from `internal/server/manager.go:386`) to read `Object.ObjectType`.

- [ ] **Step 2: Replace `GetObjects` with type-aware version**

Replace the `GetObjects` function body with:

```go
// GetObjects возвращает список доступных объектов.
//   GET /api/objects                                — плоский список имён (back-compat).
//   GET /api/objects?server=ID                      — список имён с конкретного сервера.
//   GET /api/objects?server=ID&type=IONotifyController — отфильтрованный список с типами.
//
// Когда type указан, возвращается [{name, objectType}, ...].
// Без type — back-compat формат {objects: ["A","B",...]}.
func (h *Handlers) GetObjects(w http.ResponseWriter, r *http.Request) {
	serverID := r.URL.Query().Get("server")
	typeFilter := r.URL.Query().Get("type")

	// === Back-compat path: без server и type — старое поведение ===
	if serverID == "" && typeFilter == "" {
		list, err := h.client.GetObjectList()
		if err != nil {
			h.writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		h.writeJSON(w, map[string]interface{}{"objects": list})
		return
	}

	// === Новый path: server указан ===
	if h.serverMgr == nil {
		h.writeError(w, http.StatusServiceUnavailable, "server manager not configured")
		return
	}
	if serverID == "" {
		h.writeError(w, http.StatusBadRequest, "server parameter is required when type is specified")
		return
	}

	// Получаем имена объектов на сервере
	grouped, err := h.serverMgr.GetAllObjectsGrouped()
	if err != nil {
		h.writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	var names []string
	for _, sg := range grouped {
		if sg.ServerID == serverID {
			names = sg.Objects
			break
		}
	}

	// Без type-фильтра — возвращаем плоский список имён (с server параметром)
	if typeFilter == "" {
		h.writeJSON(w, map[string]interface{}{"objects": names})
		return
	}

	// С type-фильтром — для каждого имени запрашиваем object data и фильтруем по ObjectType.
	// N+1 запросов; для типичных uniset-серверов N — десятки, приемлемо.
	type objectWithType struct {
		Name       string `json:"name"`
		ObjectType string `json:"objectType"`
	}
	result := make([]objectWithType, 0, len(names))
	for _, name := range names {
		data, err := h.serverMgr.GetObjectData(serverID, name)
		if err != nil || data == nil || data.Object == nil {
			continue // пропускаем недоступные
		}
		if data.Object.ObjectType == typeFilter {
			result = append(result, objectWithType{
				Name:       name,
				ObjectType: data.Object.ObjectType,
			})
		}
	}
	h.writeJSON(w, map[string]interface{}{"objects": result})
}
```

- [ ] **Step 3: Run existing handlers tests to confirm back-compat**

Run: `go test -mod=vendor -run TestGetObjects -v ./internal/api/...`
Expected: existing tests (if any) PASS.

If no existing test for `GetObjects` — that's fine (we'll add one in Task 1.2).

- [ ] **Step 4: Build to verify it compiles**

Run: `go build -mod=vendor ./...`
Expected: success, no errors.

- [ ] **Step 5: Commit**

```bash
git add internal/api/handlers.go
git commit -m "feat(api): /api/objects accepts optional ?type= filter

Без параметров — back-compat плоский список имён.
С ?server=ID — список имён с указанного сервера.
С ?server=ID&type=IONotifyController — отфильтрованный список
{name, objectType} (N+1 GetObjectData запросов; для десятков объектов
на сервере приемлемо, кеш типов — отдельной задачей если потребуется).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.2: Test for type filter

**Files:**
- Modify or Create: `internal/api/handlers_test.go`

- [ ] **Step 1: Read existing handlers_test.go**

Run: `head -50 internal/api/handlers_test.go 2>/dev/null || echo 'no handlers_test.go yet'`

If file exists, find existing test patterns (look for `httptest.NewServer`, mock server fixtures). If not, the new test file must set up the test infrastructure.

- [ ] **Step 2: Find or write a mock for `serverMgr`**

Run: `grep -n "type Manager\|GetAllObjectsGrouped\|GetObjectData" internal/server/manager.go | head -5`

The test will need a way to inject a fake `serverMgr` that returns predetermined `GetAllObjectsGrouped` and `GetObjectData` responses. Options:
- Use httptest.NewServer to mock the underlying uniset HTTP API and let real `serverMgr` call it.
- Refactor to interface (out of scope for this task).

Simpler: use a real `serverMgr` pointed at an `httptest.NewServer` mocking the uniset endpoints `/api/v2/list` (object list) and `/api/v2/{name}` (object data with ObjectType).

- [ ] **Step 3: Write the test**

Add to `internal/api/handlers_test.go` (create file if absent — package `api`):

```go
package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pv/uniset-panel/internal/config"
	"github.com/pv/uniset-panel/internal/server"
)

// startMockUniset возвращает httptest сервер, отдающий список объектов и их данные.
func startMockUniset(t *testing.T, objects map[string]string) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v2/list", func(w http.ResponseWriter, r *http.Request) {
		names := make([]string, 0, len(objects))
		for n := range objects {
			names = append(names, n)
		}
		_ = json.NewEncoder(w).Encode(names)
	})
	for name, objectType := range objects {
		name, objectType := name, objectType
		mux.HandleFunc("/api/v2/"+name, func(w http.ResponseWriter, r *http.Request) {
			payload := map[string]interface{}{
				"object": map[string]interface{}{
					"id":         1,
					"name":       name,
					"objectType": objectType,
				},
				name: map[string]interface{}{},
			}
			_ = json.NewEncoder(w).Encode(payload)
		})
	}
	return httptest.NewServer(mux)
}

func TestGetObjects_TypeFilter(t *testing.T) {
	mock := startMockUniset(t, map[string]string{
		"SharedMemory":  "IONotifyController",
		"SharedMemory2": "IONotifyController",
		"MBSlave1":      "ModbusSlave",
		"OPCUA1":        "OPCUAExchange",
	})
	defer mock.Close()

	mgr := server.NewManager(nil, nil, 0, 0)
	if err := mgr.AddServer(config.ServerConfig{ID: "srv1", URL: mock.URL}); err != nil {
		t.Fatalf("AddServer: %v", err)
	}
	defer mgr.RemoveServer("srv1")

	h := &Handlers{serverMgr: mgr}

	tests := []struct {
		name        string
		query       string
		wantStatus  int
		wantNames   []string  // names expected (in any order)
		wantHasType bool      // expect [{name, objectType}] vs ["name1", ...]
	}{
		{
			name:        "no params back-compat",
			query:       "",
			wantStatus:  http.StatusBadGateway, // нет client.GetObjectList настроен — ожидаем ошибку, а не paниku
		},
		{
			name:        "server only — flat names",
			query:       "?server=srv1",
			wantStatus:  http.StatusOK,
			wantNames:   []string{"SharedMemory", "SharedMemory2", "MBSlave1", "OPCUA1"},
			wantHasType: false,
		},
		{
			name:        "type filter IONotifyController",
			query:       "?server=srv1&type=IONotifyController",
			wantStatus:  http.StatusOK,
			wantNames:   []string{"SharedMemory", "SharedMemory2"},
			wantHasType: true,
		},
		{
			name:        "type filter ModbusSlave",
			query:       "?server=srv1&type=ModbusSlave",
			wantStatus:  http.StatusOK,
			wantNames:   []string{"MBSlave1"},
			wantHasType: true,
		},
		{
			name:        "type filter no matches",
			query:       "?server=srv1&type=NotExisting",
			wantStatus:  http.StatusOK,
			wantNames:   []string{},
			wantHasType: true,
		},
		{
			name:       "type without server",
			query:      "?type=IONotifyController",
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/objects"+tc.query, nil)
			rr := httptest.NewRecorder()
			h.GetObjects(rr, req)

			if rr.Code != tc.wantStatus {
				t.Fatalf("status: want %d, got %d (body: %s)", tc.wantStatus, rr.Code, rr.Body.String())
			}
			if rr.Code != http.StatusOK {
				return
			}

			var resp map[string]json.RawMessage
			if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			objsRaw, ok := resp["objects"]
			if !ok {
				t.Fatalf("response missing objects field: %s", rr.Body.String())
			}

			gotNames := []string{}
			if tc.wantHasType {
				var arr []struct {
					Name       string `json:"name"`
					ObjectType string `json:"objectType"`
				}
				if err := json.Unmarshal(objsRaw, &arr); err != nil {
					t.Fatalf("unmarshal typed array: %v", err)
				}
				for _, o := range arr {
					gotNames = append(gotNames, o.Name)
				}
			} else {
				var arr []string
				if err := json.Unmarshal(objsRaw, &arr); err != nil {
					t.Fatalf("unmarshal flat names: %v", err)
				}
				gotNames = arr
			}

			if !sameSet(gotNames, tc.wantNames) {
				t.Errorf("names: want %v, got %v", tc.wantNames, gotNames)
			}
		})
	}
}

// sameSet returns true if a and b have the same elements regardless of order.
func sameSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	count := map[string]int{}
	for _, x := range a {
		count[x]++
	}
	for _, x := range b {
		if count[x] == 0 {
			return false
		}
		count[x]--
	}
	return true
}

// helper to make strings.Contains explicit (used in some assertions)
var _ = strings.Contains
```

NOTE: The test mock relies on the actual `server.NewManager` constructor signature. Verify it via `grep "func NewManager" internal/server/manager.go` and adjust the `server.NewManager(...)` call to match the real signature. If the constructor needs more dependencies (sse hub, storage), pass `nil` where acceptable, or skip those args if optional in the real signature. **If the real signature is incompatible — flag as DONE_WITH_CONCERNS and propose a follow-up to refactor `Handlers` to use a small `serverMgrIface` interface for testability.**

- [ ] **Step 4: Run the test**

Run: `go test -mod=vendor -run TestGetObjects_TypeFilter -v ./internal/api/...`
Expected: PASS.

If FAIL — debug. Common issues: (a) server.NewManager signature differs — adjust call; (b) `serverMgr.AddServer` is async (needs poll cycle) — give it a small sleep or call a sync method. If that's the case, simplify by mocking `serverMgrIface` instead.

- [ ] **Step 5: Commit**

```bash
git add internal/api/handlers_test.go
git commit -m "test(api): GetObjects type filter cases

- back-compat без параметров
- server-only (плоский список)
- type=IONotifyController, type=ModbusSlave (фильтр)
- type без server (400)
- type с no matches (пустой список)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — Foundation refactor (events для interactivity, marker, objectName в base)

### Task 2.1: Dispatch `controlStatusChanged` event

**Files:**
- Modify: `ui/static/js/src/02-control.js` (function `updateControlStatus` ~line 39)

- [ ] **Step 1: Read current `updateControlStatus`**

Run: `sed -n '38,50p' ui/static/js/src/02-control.js`

- [ ] **Step 2: Append event dispatch at end of function**

In `updateControlStatus(status)`, after `updateAllControlButtons();` line, add:

```javascript
    // Notify active dashboard widgets so they can refresh their interactivity class.
    document.dispatchEvent(new CustomEvent('controlStatusChanged', {
        detail: { ...state.control }
    }));
```

The full function should now end with `updateAllControlButtons(); document.dispatchEvent(...);`.

- [ ] **Step 3: Rebuild app.js + sanity grep**

Run: `make app`
Expected: success.

Run: `grep -c "controlStatusChanged" ui/static/js/app.js`
Expected: at least `1`.

- [ ] **Step 4: Commit**

```bash
git add ui/static/js/src/02-control.js ui/static/js/app.js
git commit -m "feat(control): dispatch controlStatusChanged DOM event

Активные dashboard widgets подпишутся, чтобы реактивно
обновлять active-disabled state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.2: Dispatch `dashboardEditModeChanged` event

**Files:**
- Modify: `ui/static/js/src/62-dashboard-manager.js` (function `toggleEditMode`)

- [ ] **Step 1: Find the editMode toggle**

Run: `grep -n "editMode\s*=" ui/static/js/src/62-dashboard-manager.js | head -10`

Find where `dashboardState.editMode = !dashboardState.editMode;` lives (typically inside `toggleEditMode()`).

- [ ] **Step 2: After every `dashboardState.editMode = X;` mutation, dispatch event**

For each occurrence of `dashboardState.editMode = ...;` in the file (typically 1–3 places), append immediately after:

```javascript
        document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', {
            detail: { editMode: dashboardState.editMode }
        }));
```

If the mutation lives inside a function like `toggleEditMode`, place it at the end of that function.

- [ ] **Step 3: Rebuild + grep**

Run: `make app`
Run: `grep -c "dashboardEditModeChanged" ui/static/js/app.js`
Expected: ≥ 1.

- [ ] **Step 4: Commit**

```bash
git add ui/static/js/src/62-dashboard-manager.js ui/static/js/app.js
git commit -m "feat(dashboard): dispatch dashboardEditModeChanged DOM event

Активные widgets подпишутся, чтобы реактивно отключать
интерактив при входе в edit mode.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.3: ActiveDashboardWidget — `_updateInteractivityClass` + listeners + objectName/sensorId in writeValue

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-base.js`

- [ ] **Step 1: Read current file**

Read `ui/static/js/src/61-dashboard-active-base.js` in full to know exact line numbers.

- [ ] **Step 2: Replace constructor to add listeners**

Find the constructor (currently sets `commandValue=null`, `feedbackValue=null`, etc.). Append at end of constructor:

```javascript
        // Reactive interactivity: refresh active-disabled класс when edit mode
        // or controlToken state changes.
        this._interactivityListener = () => this._updateInteractivityClass();
        document.addEventListener('dashboardEditModeChanged', this._interactivityListener);
        document.addEventListener('controlStatusChanged', this._interactivityListener);
```

- [ ] **Step 3: Update `writeValue` to use `config.objectName` and `config.sensorId`**

In `writeValue(value)`, find the section that builds the URL and body. Replace:

```javascript
        const sensor = this.config?.sensor;
        if (!sensor) {
            this._setWriteState('error', 'Sensor not configured');
            return;
        }

        const serverId = this._resolveServerId();
        if (!serverId) {
            this._setWriteState('error', 'No connected server');
            return;
        }

        const url = `/api/objects/SharedMemory/ionc/set?server=${encodeURIComponent(serverId)}`;
        try {
            const resp = await controlledFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensor_id: sensor, value })
            });
```

with:

```javascript
        // sensorId — числовой ID, должен быть резолвлен заранее (autocomplete сохраняет его в config).
        // sensor (имя) — fallback, для обратной совместимости со smoke TestActiveWidget'ом.
        const sensorId = this.config?.sensorId ?? this.config?.sensor;
        if (sensorId === undefined || sensorId === null || sensorId === '') {
            this._setWriteState('error', 'Sensor not configured');
            return;
        }

        const serverId = this._resolveServerId();
        if (!serverId) {
            this._setWriteState('error', 'No connected server');
            return;
        }

        const objectName = this.config?.objectName || 'SharedMemory';
        const url = `/api/objects/${encodeURIComponent(objectName)}/ionc/set?server=${encodeURIComponent(serverId)}`;
        try {
            const resp = await controlledFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensor_id: sensorId, value })
            });
```

- [ ] **Step 4: Add `_updateInteractivityClass` method**

Right after `isInteractive()` method, add:

```javascript
    // Toggles 'active-disabled' class and 'data-control-blocked' attr on the
    // widget container so CSS can show "click does nothing right now" state.
    _updateInteractivityClass() {
        const root = this.container || this.element;
        if (!root) return;
        const interactive = this.isInteractive();
        root.classList.toggle('active-disabled', !interactive);
        if (!interactive) {
            root.dataset.controlBlocked = 'true';
            // Не затираем title если там сообщение об ошибке записи.
            if (!root.title) root.title = 'Take control to interact';
        } else {
            delete root.dataset.controlBlocked;
            if (root.title === 'Take control to interact') root.title = '';
        }
    }
```

- [ ] **Step 5: Update `destroy` to remove listeners**

Replace:

```javascript
    destroy() {
        clearTimeout(this._writeStateTimer);
        clearTimeout(this._pendingTimeoutTimer);
        super.destroy();
    }
```

with:

```javascript
    destroy() {
        clearTimeout(this._writeStateTimer);
        clearTimeout(this._pendingTimeoutTimer);
        document.removeEventListener('dashboardEditModeChanged', this._interactivityListener);
        document.removeEventListener('controlStatusChanged', this._interactivityListener);
        super.destroy();
    }
```

- [ ] **Step 6: Rebuild + grep checks**

Run: `make app`
Run: `grep -c "_updateInteractivityClass" ui/static/js/app.js` — expected ≥ 2 (definition + listener handler).
Run: `grep -c "config?.objectName" ui/static/js/app.js` — expected ≥ 1.
Run: `grep -c "config?.sensorId" ui/static/js/app.js` — expected ≥ 1.

- [ ] **Step 7: Run smoke E2E to confirm TestActiveWidget still works**

Run: `docker compose --profile dev down`
Run: `docker compose run --rm e2e single/dashboard-active-base.spec.ts`

Expected: 2/2 PASS. The TestActiveWidget uses `config.sensor: 1` (numeric) which the new code accepts via the `?? this.config?.sensor` fallback.

If FAIL — most likely the existing smoke test uses a string sensor name. In that case, update `tests/single/dashboard-active-base.spec.ts` to use `config: { sensorId: 1 }` instead of `config: { sensor: 1 }`. (This counts as a small co-change of the test in the same task; commit together.)

- [ ] **Step 8: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-base.js ui/static/js/app.js tests/single/dashboard-active-base.spec.ts
git commit -m "feat(dashboard): ActiveDashboardWidget _updateInteractivityClass + objectName/sensorId

- writeValue теперь читает config.objectName (default 'SharedMemory')
  и config.sensorId (число, резолвится autocomplete'ом),
  с fallback на config.sensor для smoke-теста TestActiveWidget.
- Новый метод _updateInteractivityClass: реактивно обновляет
  active-disabled класс по событиям dashboardEditModeChanged /
  controlStatusChanged.
- destroy чистит listeners.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.4: Dashboard manager — set `data-active-widget` marker

**Files:**
- Modify: `ui/static/js/src/62-dashboard-manager.js` (function `createWidget`)

- [ ] **Step 1: Find the widget instantiation**

Run: `grep -n "new WidgetClass\|widget = new" ui/static/js/src/62-dashboard-manager.js | head -5`

Find the line `const widget = new WidgetClass(widgetConfig.id, widgetConfig.config, container);` (or similar).

- [ ] **Step 2: Add marker right after instantiation**

Immediately after `const widget = new WidgetClass(...)`, add:

```javascript
        // Маркер для CSS правил (.dashboard-widget[data-active-widget="true"]):
        // используется для edit-mode grayscale и active-disabled индикатора.
        if (widget instanceof ActiveDashboardWidget) {
            container.dataset.activeWidget = 'true';
        }
```

- [ ] **Step 3: Also call `_updateInteractivityClass` once after render**

After `widget.render();` line (find via `grep -n "widget.render()" ui/static/js/src/62-dashboard-manager.js`), add:

```javascript
        // Initial interactivity sync (без него виджет создаётся в правильном
        // visual state до первого editMode toggle / controlToken event).
        if (typeof widget._updateInteractivityClass === 'function') {
            widget._updateInteractivityClass();
        }
```

- [ ] **Step 4: Rebuild + grep**

Run: `make app`
Run: `grep -c 'dataset.activeWidget' ui/static/js/app.js`
Expected: `1`.

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/62-dashboard-manager.js ui/static/js/app.js
git commit -m "feat(dashboard): mark active widget containers with data-active-widget

Контейнеры виджетов, наследующих ActiveDashboardWidget, получают
data-active-widget='true' — для CSS правил edit-mode/active-disabled.
После render — инициализирующий _updateInteractivityClass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 — Foundation CSS migration (`data-type^="active-"` → `data-active-widget`)

### Task 3.1: Replace selectors

**Files:**
- Modify: `ui/static/css/style.css`

- [ ] **Step 1: Find existing selectors**

Run: `grep -n 'data-type\^="active-"\|data-control-blocked\|active-disabled' ui/static/css/style.css`

Expected: 2 lines using `data-type^="active-"` (one for edit-mode grayscale, one for active-disabled).

- [ ] **Step 2: Replace**

Use Edit tool. Replace:

```css
/* В edit mode активные виджеты обесцвечиваются — пользователь видит,
   что клики не записывают, а открывают конфиг. */
.dashboard-grid.edit-mode .dashboard-widget[data-type^="active-"]:not(.label-widget):not(.divider-widget) {
    filter: grayscale(0.5);
    opacity: 0.85;
}

/* Когда controlToken не активен — визуально блокированный виджет с курсором. */
.dashboard-widget.active-disabled,
.dashboard-widget[data-type^="active-"][data-control-blocked="true"] {
    cursor: not-allowed;
    opacity: 0.6;
}
```

with:

```css
/* В edit mode активные виджеты обесцвечиваются — пользователь видит,
   что клики не записывают, а открывают конфиг. */
.dashboard-grid.edit-mode .dashboard-widget[data-active-widget="true"] {
    filter: grayscale(0.5);
    opacity: 0.85;
}

/* Когда controlToken не активен / edit mode — визуально блокированный виджет. */
.dashboard-widget[data-active-widget="true"][data-control-blocked="true"],
.dashboard-widget.active-disabled {
    cursor: not-allowed;
    opacity: 0.6;
}
```

- [ ] **Step 3: Verify CSS rendering didn't break — run base smoke E2E**

Run: `docker compose --profile dev down`
Run: `docker compose run --rm e2e single/dashboard-active-base.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add ui/static/css/style.css
git commit -m "refactor(css): use data-active-widget marker instead of data-type^=active-

Развязывает CSS от конкретных имён типов виджетов — теперь
ToggleWidget/CheckboxWidget/etc. могут использовать естественные
имена ('toggle', 'checkbox') без затрат на active- префикс.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 — Dashboard manager: read pathway fix (group by objectName)

### Task 4.1: Refactor `fetchSensorValues` to group by `(serverId, objectName)`

**Files:**
- Modify: `ui/static/js/src/62-dashboard-manager.js` (function `fetchSensorValues` ~lines 405–442)

- [ ] **Step 1: Read current function fully**

Run: `sed -n '405,445p' ui/static/js/src/62-dashboard-manager.js`

- [ ] **Step 2: Replace with grouping version**

Replace the entire `fetchSensorValues` function with:

```javascript
    // Fetch sensor values from IONC API, grouped by (serverId, objectName)
    // taken from the consuming widget's config. Falls back to first connected
    // server + 'SharedMemory' for sensors whose widget config doesn't specify them
    // (back-compat for old saved dashboards).
    async fetchSensorValues(sensorNames) {
        // Build (serverId, objectName) → Set<sensorName> grouping.
        // For each sensor we look at *all* widgets subscribed to it and pick
        // the (serverId, objectName) of the first one with a non-default config.
        // If none specifies, use defaults (first connected server, 'SharedMemory').
        const defaultServerId = this._defaultIONCServerId();
        if (!defaultServerId) return;

        const groups = new Map(); // key: `${serverId}|${objectName}` → Set<sensorName>

        for (const name of sensorNames) {
            const widgetIds = dashboardState.sensorSubscriptions.get(name);
            let serverId = defaultServerId;
            let objectName = 'SharedMemory';
            if (widgetIds && widgetIds.size > 0) {
                // Look at first widget for this sensor — its config wins.
                const firstId = widgetIds.values().next().value;
                const widget = dashboardState.widgets.get(firstId);
                if (widget?.config?.objectName) objectName = widget.config.objectName;
                if (widget?.config?.serverId) serverId = widget.config.serverId;
            }
            const key = `${serverId}|${objectName}`;
            if (!groups.has(key)) groups.set(key, new Set());
            groups.get(key).add(name);
        }

        // Fetch each group with a single search request per sensor (existing API
        // doesn't support batch search — one call per name). Could be optimized
        // later by switching to GET .../ionc/sensors with no search and filtering
        // client-side when group is large.
        for (const [key, namesSet] of groups) {
            const [serverId, objectName] = key.split('|');
            for (const name of namesSet) {
                try {
                    const url = `/api/objects/${encodeURIComponent(objectName)}/ionc/sensors`
                        + `?server=${encodeURIComponent(serverId)}`
                        + `&search=${encodeURIComponent(name)}&limit=1`;
                    const response = await fetch(url);
                    if (!response.ok) continue;
                    const data = await response.json();
                    if (!data.sensors || data.sensors.length === 0) continue;
                    const sensor = data.sensors.find(s => s.name === name);
                    if (!sensor) continue;
                    state.sensorValuesCache.set(name, {
                        value: sensor.value,
                        error: null,
                        timestamp: Date.now()
                    });
                    this.handleSensorUpdate(name, sensor.value, null);
                } catch (err) {
                    console.warn('Failed to fetch sensor value:', name, err);
                }
            }
        }
    }

    // Helper: pick the first connected server (used as default IO source).
    _defaultIONCServerId() {
        for (const [id, server] of state.servers) {
            if (server.connected) return id;
        }
        return null;
    }
```

- [ ] **Step 3: Rebuild + grep**

Run: `make app`
Run: `grep -c "_defaultIONCServerId" ui/static/js/app.js`
Expected: ≥ 2 (definition + call).

Run: `grep -c "/SharedMemory/ionc/sensors?server=" ui/static/js/app.js`
Expected: 0 (hardcoded path is gone — now built from variables).

- [ ] **Step 4: Verify dashboard E2E (smoke + sse)**

Run: `docker compose --profile dev down`
Run: `docker compose run --rm e2e single/dashboard-sse.spec.ts single/dashboard-active-base.spec.ts`
Expected: all PASS. The default fallback (`'SharedMemory'`) keeps existing dashboards working.

If FAIL — read errors carefully. If broken because the test mock's IONC object isn't named `'SharedMemory'`, that's a real test setup issue to investigate (and likely the source of the original bug we're fixing).

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/62-dashboard-manager.js ui/static/js/app.js
git commit -m "fix(dashboard): read IONC values from per-widget objectName, not hardcoded

Раньше fetchSensorValues всегда шёл в /api/objects/SharedMemory/...
Теперь группирует sensors по (serverId, objectName) из widget config
(default 'SharedMemory' и первый подключённый сервер для совместимости
со старыми dashboard'ами без objectName).

Это позволяет дашбордам с widget'ами на разных IONC объектах работать.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5 — Sensor autocomplete utility

### Task 5.1: Create `41-sensor-autocomplete.js`

**Files:**
- Create: `ui/static/js/src/41-sensor-autocomplete.js`

- [ ] **Step 1: Create file with the utility**

```javascript
// ============================================================================
// setupSensorAutocomplete — переиспользуемый IONC sensor selector.
//
// Привязывается к input'у. По вводу — debounce, fetch к
// /api/objects/{objectName}/ionc/sensors?server=...&search=...&limit=20,
// показывает выпадающий suggest. Клик/Enter — подставляет name + сохраняет
// числовой id в hidden input. Стрелки ↑↓ — навигация. Esc — закрыть.
// При смене objectName (через resetOnObjectChange()) — очищает выбор.
// ============================================================================

const SENSOR_AUTOCOMPLETE_DEBOUNCE_MS = 150;
const SENSOR_AUTOCOMPLETE_LIMIT = 20;

function setupSensorAutocomplete(inputEl, hiddenIdEl, getObjectName, getServerId) {
    if (!inputEl) return null;

    let dropdown = null;
    let debounceTimer = null;
    let activeIndex = -1;
    let currentItems = [];

    function destroyDropdown() {
        if (dropdown) {
            dropdown.remove();
            dropdown = null;
        }
        activeIndex = -1;
        currentItems = [];
    }

    function buildDropdown() {
        destroyDropdown();
        dropdown = document.createElement('div');
        dropdown.className = 'sensor-autocomplete-dropdown';
        // Положение — абсолютно под input (input должен быть в position:relative контексте,
        // или мы используем fixed с подсчётом координат).
        const rect = inputEl.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.top = `${rect.bottom + 2}px`;
        dropdown.style.width = `${rect.width}px`;
        dropdown.style.zIndex = '10000';
        document.body.appendChild(dropdown);
    }

    function renderItems(items) {
        if (!dropdown) return;
        currentItems = items;
        if (items.length === 0) {
            dropdown.innerHTML = '<div class="sensor-autocomplete-empty">Не найдено</div>';
            return;
        }
        dropdown.innerHTML = items.map((s, idx) => `
            <div class="sensor-autocomplete-item ${idx === activeIndex ? 'active' : ''}"
                 data-idx="${idx}"
                 data-id="${s.id}"
                 data-name="${escapeHtml(s.name)}">
                <div class="sensor-autocomplete-name">${escapeHtml(s.name)}</div>
                <div class="sensor-autocomplete-meta">id=${s.id} · type=${escapeHtml(s.type || '?')} · value=${s.value ?? '—'}</div>
            </div>
        `).join('');
        dropdown.querySelectorAll('.sensor-autocomplete-item').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault(); // prevent input blur before we read values
                pickItem(parseInt(el.dataset.idx, 10));
            });
        });
    }

    function pickItem(idx) {
        const item = currentItems[idx];
        if (!item) return;
        inputEl.value = item.name;
        if (hiddenIdEl) hiddenIdEl.value = String(item.id);
        destroyDropdown();
    }

    async function fetchAndShow(searchText) {
        const objectName = (getObjectName && getObjectName()) || 'SharedMemory';
        const serverId = (getServerId && getServerId()) || '';
        if (!serverId) {
            buildDropdown();
            renderItems([]);
            return;
        }
        try {
            const url = `/api/objects/${encodeURIComponent(objectName)}/ionc/sensors`
                + `?server=${encodeURIComponent(serverId)}`
                + (searchText ? `&search=${encodeURIComponent(searchText)}` : '')
                + `&limit=${SENSOR_AUTOCOMPLETE_LIMIT}`;
            const resp = await fetch(url);
            if (!resp.ok) {
                buildDropdown();
                renderItems([]);
                return;
            }
            const data = await resp.json();
            const items = data.sensors || [];
            buildDropdown();
            activeIndex = -1;
            renderItems(items);
        } catch (e) {
            console.warn('sensor autocomplete fetch failed:', e);
        }
    }

    inputEl.addEventListener('focus', () => {
        fetchAndShow(inputEl.value.trim());
    });

    inputEl.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchAndShow(inputEl.value.trim()),
            SENSOR_AUTOCOMPLETE_DEBOUNCE_MS);
    });

    inputEl.addEventListener('keydown', (e) => {
        if (!dropdown || currentItems.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, currentItems.length - 1);
            renderItems(currentItems);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            renderItems(currentItems);
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0) {
                e.preventDefault();
                pickItem(activeIndex);
            }
        } else if (e.key === 'Escape') {
            destroyDropdown();
        }
    });

    inputEl.addEventListener('blur', () => {
        // Delay so click on dropdown item fires first (mousedown handler runs).
        setTimeout(destroyDropdown, 150);
    });

    return {
        // Каллер вызывает при смене IONC объекта в форме конфига.
        resetOnObjectChange() {
            inputEl.value = '';
            if (hiddenIdEl) hiddenIdEl.value = '';
            destroyDropdown();
        },
        destroy() {
            destroyDropdown();
        }
    };
}

window.setupSensorAutocomplete = setupSensorAutocomplete;
```

- [ ] **Step 2: Append CSS for the dropdown**

In `ui/static/css/style.css`, append:

```css
/* Sensor autocomplete dropdown (used by active widgets config form) */
.sensor-autocomplete-dropdown {
    background: #0f172a;
    border: 1px solid #4b5563;
    border-radius: 4px;
    max-height: 240px;
    overflow-y: auto;
    box-shadow: 0 4px 16px rgba(0,0,0,0.6);
}
.sensor-autocomplete-item {
    padding: 6px 10px;
    cursor: pointer;
    border-bottom: 1px solid #1f2937;
}
.sensor-autocomplete-item:hover,
.sensor-autocomplete-item.active {
    background: #1e3a5f;
}
.sensor-autocomplete-name {
    color: #d8dce2;
    font-size: 13px;
    font-weight: 500;
}
.sensor-autocomplete-meta {
    color: #9ca3af;
    font-size: 10px;
    margin-top: 2px;
}
.sensor-autocomplete-empty {
    padding: 10px;
    color: #6b7280;
    font-size: 12px;
    text-align: center;
}
```

- [ ] **Step 3: Rebuild + grep**

Run: `make app`
Run: `grep -c "setupSensorAutocomplete" ui/static/js/app.js`
Expected: ≥ 2 (definition + window export).

- [ ] **Step 4: Sanity check in browser**

Run: `docker compose up dev-viewer -d --build`
Open `http://localhost:8000`. In DevTools console:
```javascript
typeof setupSensorAutocomplete  // "function"
```
Run: `docker compose down`

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/41-sensor-autocomplete.js ui/static/js/app.js ui/static/css/style.css
git commit -m "feat(dashboard): setupSensorAutocomplete utility

Переиспользуемый IONC sensor selector с debounced search,
keyboard navigation (↑↓/Enter/Esc), сохранением (name, id) пары.
Будет использоваться toggle, checkbox, setpoint, generator widget'ами.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 6 — ToggleWidget

### Task 6.1: Create `61-dashboard-active-toggle.js`

**Files:**
- Create: `ui/static/js/src/61-dashboard-active-toggle.js`

- [ ] **Step 1: Create the file with the class**

```javascript
// ============================================================================
// ToggleWidget — переключатель между двумя числовыми значениями (DI/DO/AI/AO).
// Слитая композиция: цвет track = feedback, позиция handle = command.
// Жёлтая граница при расхождении command vs feedback.
//
// Config:
//   sensor      — имя датчика (для отображения, autocomplete сохраняет имя)
//   sensorId    — числовой ID датчика (используется в writeValue)
//   objectName  — имя IONC-объекта (default 'SharedMemory')
//   valueOff    — числовое значение OFF (default 0)
//   valueOn     — числовое значение ON (default 1)
//   labelOff    — текстовая подпись OFF (default 'OFF')
//   labelOn     — текстовая подпись ON (default 'ON')
//   label       — заголовок виджета (default = имя датчика)
//   requireConfirmation — bool, наследуется от base
// ============================================================================

class ToggleWidget extends ActiveDashboardWidget {
    static type = 'toggle';
    static displayName = 'Toggle';
    static description = 'Two-state switch (writes to digital or analog sensor)';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="3" fill="currentColor"/></svg>';
    static defaultSize = { width: 3, height: 2 };
    static minSize = { width: 2, height: 2 };
    static maxSize = { width: 6, height: 3 };

    // === Render ===
    render() {
        const label = this.config?.label || this.config?.sensor || 'Toggle';

        this.element = document.createElement('div');
        this.element.className = 'widget-content toggle-widget';
        this.element.innerHTML = `
            <div class="toggle-name" data-test="name">${escapeHtml(label)}</div>
            <div class="toggle-track" data-test="track" data-handle-pos="left">
                <div class="toggle-handle"></div>
            </div>
            <div class="toggle-state-text" data-test="state-text">${escapeHtml(this._currentLabel())}</div>
        `;
        this.container.appendChild(this.element);

        this.element.querySelector('[data-test="track"]').addEventListener('click', () => this.onClick());

        // Initial state — отрисовать по текущим feedback/command (могут быть null).
        this.renderFeedback();
        this.renderCommand();
    }

    // Возвращает labelOn если current value считается ON, иначе labelOff.
    _currentLabel() {
        const labelOff = this.config?.labelOff || 'OFF';
        const labelOn = this.config?.labelOn || 'ON';
        const current = this.commandValue ?? this.feedbackValue;
        return current === this.config?.valueOn ? labelOn : labelOff;
    }

    onClick() {
        // Если widget не интерактивен — клик игнорируется (writeValue сам это знает,
        // но мы ещё не проходим path validation если просто вернём ничего).
        if (!this.isInteractive()) return;
        const valueOff = this.config?.valueOff ?? 0;
        const valueOn = this.config?.valueOn ?? 1;
        const current = this.commandValue ?? this.feedbackValue;
        const next = current === valueOn ? valueOff : valueOn;
        this.writeValue(next);
    }

    renderCommand() {
        const track = this.element?.querySelector('[data-test="track"]');
        if (!track) return;
        const valueOn = this.config?.valueOn ?? 1;
        // Position: командная (если есть command) — приоритет; иначе по feedback.
        const refValue = this.commandValue ?? this.feedbackValue;
        track.dataset.handlePos = refValue === valueOn ? 'right' : 'left';

        // diverge: если command есть и НЕ совпадает с feedback (включая unknown).
        const diverges = this.commandValue !== null
            && this.commandValue !== undefined
            && this.commandValue !== this.feedbackValue;
        track.classList.toggle('diverge', !!diverges);

        // Update state text (cmd-side).
        const stateText = this.element?.querySelector('[data-test="state-text"]');
        if (stateText) stateText.textContent = this._currentLabel();
    }

    renderFeedback() {
        const track = this.element?.querySelector('[data-test="track"]');
        if (!track) return;
        const valueOff = this.config?.valueOff ?? 0;
        const valueOn = this.config?.valueOn ?? 1;

        track.classList.remove('fb-on', 'fb-off', 'fb-unknown');
        if (this.feedbackValue === valueOn) {
            track.classList.add('fb-on');
        } else if (this.feedbackValue === valueOff) {
            track.classList.add('fb-off');
        } else {
            track.classList.add('fb-unknown');
        }

        // Tooltip с фактическим числовым значением (для unknown — особенно полезно).
        if (this.feedbackValue !== null && this.feedbackValue !== undefined) {
            track.title = `actual: ${this.feedbackValue}`;
        }

        // Re-evaluate diverge after feedback update.
        this.renderCommand();
    }

    // === Config form ===

    static getActiveConfigFields(config = {}) {
        return `
            <div class="widget-config-field">
                <label>IONC Object</label>
                <select class="widget-input" name="objectName" data-test="cfg-objectName">
                    <option value="${escapeHtml(config.objectName || 'SharedMemory')}" selected>${escapeHtml(config.objectName || 'SharedMemory')}</option>
                </select>
                <small style="color:#6b7280">список загружается из /api/objects?type=IONotifyController</small>
            </div>
            <div class="widget-config-field">
                <label>Sensor (autocomplete)</label>
                <input type="text" class="widget-input" name="sensor" autocomplete="off"
                       value="${escapeHtml(config.sensor || '')}" data-test="cfg-sensor">
                <input type="hidden" name="sensorId" value="${config.sensorId ?? ''}" data-test="cfg-sensorId">
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>valueOff</label>
                    <input type="number" class="widget-input" name="valueOff"
                           value="${config.valueOff ?? 0}" data-test="cfg-valueOff">
                </div>
                <div class="widget-config-field">
                    <label>valueOn</label>
                    <input type="number" class="widget-input" name="valueOn"
                           value="${config.valueOn ?? 1}" data-test="cfg-valueOn">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>labelOff</label>
                    <input type="text" class="widget-input" name="labelOff"
                           value="${escapeHtml(config.labelOff || '')}" placeholder="OFF" data-test="cfg-labelOff">
                </div>
                <div class="widget-config-field">
                    <label>labelOn</label>
                    <input type="text" class="widget-input" name="labelOn"
                           value="${escapeHtml(config.labelOn || '')}" placeholder="ON" data-test="cfg-labelOn">
                </div>
            </div>
        `;
    }

    static initConfigHandlers(form, config = {}) {
        // Populate IONC Object dropdown.
        const objectSelect = form.querySelector('[name="objectName"]');
        const sensorInput = form.querySelector('[name="sensor"]');
        const hiddenIdInput = form.querySelector('[name="sensorId"]');
        if (!objectSelect || !sensorInput || !hiddenIdInput) return;

        // Resolve serverId for the dropdown — use first connected (same default
        // как в _resolveServerId() базового класса).
        let serverId = '';
        for (const [id, srv] of state.servers) {
            if (srv.connected) { serverId = id; break; }
        }

        // Fetch IONC objects list.
        if (serverId) {
            fetch(`/api/objects?server=${encodeURIComponent(serverId)}&type=IONotifyController`)
                .then(r => r.ok ? r.json() : { objects: [] })
                .then(data => {
                    const objs = data.objects || [];
                    const currentValue = config.objectName || 'SharedMemory';
                    objectSelect.innerHTML = objs.map(o => {
                        const name = typeof o === 'string' ? o : o.name;
                        return `<option value="${escapeHtml(name)}" ${name === currentValue ? 'selected' : ''}>${escapeHtml(name)}</option>`;
                    }).join('');
                    // Если currentValue нет в списке — добавим как disabled
                    if (!objs.some(o => (typeof o === 'string' ? o : o.name) === currentValue)) {
                        const opt = document.createElement('option');
                        opt.value = currentValue;
                        opt.textContent = `${currentValue} (текущий, не найден)`;
                        opt.selected = true;
                        objectSelect.prepend(opt);
                    }
                })
                .catch(e => console.warn('Failed to load IONC objects:', e));
        }

        // Setup autocomplete on sensor input.
        const ac = setupSensorAutocomplete(
            sensorInput,
            hiddenIdInput,
            () => objectSelect.value,
            () => serverId
        );

        // Reset sensor when object changes.
        objectSelect.addEventListener('change', () => {
            if (ac && typeof ac.resetOnObjectChange === 'function') {
                ac.resetOnObjectChange();
            }
        });
    }

    static parseConfigForm(form) {
        // Override base parseConfigForm to use sensor name + sensorId field.
        const labelInput = form.querySelector('[name="label"]');
        const requireConfInput = form.querySelector('[name="requireConfirmation"]');
        return {
            sensor:      form.querySelector('[name="sensor"]')?.value || '',
            sensorId:    parseInt(form.querySelector('[name="sensorId"]')?.value, 10) || null,
            objectName:  form.querySelector('[name="objectName"]')?.value || 'SharedMemory',
            valueOff:    Number(form.querySelector('[name="valueOff"]')?.value ?? 0),
            valueOn:     Number(form.querySelector('[name="valueOn"]')?.value ?? 1),
            labelOff:    form.querySelector('[name="labelOff"]')?.value || '',
            labelOn:     form.querySelector('[name="labelOn"]')?.value || '',
            label:       labelInput?.value || '',
            requireConfirmation: requireConfInput?.checked || false,
        };
    }
}

window.ToggleWidget = ToggleWidget;
```

NOTE: `parseConfigForm` (not `parseActiveConfigFields`) is overridden directly because the base form's `sensor` field is reused as the name input, but we also need the hidden `sensorId`. Spec listed `parseActiveConfigFields` as the extension point — here we go one level higher (override `parseConfigForm` itself) to handle the field reuse cleanly. That's a pragmatic deviation from the spec sketch.

- [ ] **Step 2: Register in WIDGET_TYPES**

Open `ui/static/js/src/62-dashboard-manager.js`. Find the `WIDGET_TYPES` registry (~line 6):

```javascript
const WIDGET_TYPES = {
    'gauge': GaugeWidget,
    'level': LevelWidget,
    ...
    'chart': ChartWidget
};
```

Add `'toggle': ToggleWidget,` to the registry (alphabetical or just append before the closing brace).

- [ ] **Step 3: `initConfigHandlers` integration**

Many existing widgets use a static method `initConfigHandlers(form, config)` that the dashboard manager calls when opening the widget config dialog. Verify the call exists:

Run: `grep -n "initConfigHandlers" ui/static/js/src/62-dashboard-manager.js`

If found, ToggleWidget's `initConfigHandlers` will be called automatically. If not found in dashboard-manager — locate where the config dialog mounts the form HTML and add a call: `if (typeof WidgetClass.initConfigHandlers === 'function') WidgetClass.initConfigHandlers(form, config);` right after rendering the form.

- [ ] **Step 4: Rebuild app.js + grep**

Run: `make app`
Run: `grep -c "class ToggleWidget extends ActiveDashboardWidget" ui/static/js/app.js`
Expected: `1`.

Run: `grep "'toggle': ToggleWidget" ui/static/js/app.js`
Expected: 1 match.

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-toggle.js ui/static/js/src/62-dashboard-manager.js ui/static/js/app.js
git commit -m "feat(dashboard): ToggleWidget — first active widget

Слитая композиция (цвет track=feedback, позиция handle=command),
жёлтая граница при расхождении, серый 'unknown' для AI/AO значений.
labelOff/labelOn кастомизируются. Конфигурация: dropdown IONC объекта
(populated через /api/objects?type=IONotifyController), autocomplete
sensor'а с сохранением sensor_id.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 7 — Toggle CSS

### Task 7.1: Add `.toggle-widget` styles

**Files:**
- Modify: `ui/static/css/style.css` (append at the end)

- [ ] **Step 1: Append toggle styles**

```css

/* ============================================================================
 * ToggleWidget
 * ============================================================================ */

.toggle-widget {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 100%;
    cursor: pointer;
}

.toggle-widget .toggle-name {
    font-size: 13px;
    color: #d8dce2;
    font-weight: 600;
    text-align: center;
}

.toggle-widget .toggle-track {
    width: 72px;
    height: 32px;
    border-radius: 16px;
    position: relative;
    transition: background 0.15s, box-shadow 0.2s;
}

.toggle-widget .toggle-track .toggle-handle {
    position: absolute;
    top: 2px;
    width: 28px;
    height: 28px;
    background: #fff;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0,0,0,.4);
    transition: left 0.15s;
}

.toggle-widget .toggle-track[data-handle-pos="left"]  .toggle-handle { left: 2px; }
.toggle-widget .toggle-track[data-handle-pos="right"] .toggle-handle { left: 42px; }

.toggle-widget .toggle-track.fb-on      { background: #22c55e; }
.toggle-widget .toggle-track.fb-off     { background: #374151; border: 1px solid #4b5563; }
.toggle-widget .toggle-track.fb-unknown { background: #1f2937; border: 1px dashed #6b7280; }

.toggle-widget .toggle-track.diverge {
    box-shadow: 0 0 0 2px #f59e0b, 0 0 8px rgba(245,158,11,0.4);
}

.toggle-widget .toggle-state-text {
    font-size: 11px;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

/* Тонкое скрытие state-text при минимальном размере 2x2 — хайдим если высота строки <= ... */
@media (max-height: 80px) {
    .toggle-widget .toggle-state-text { display: none; }
}
```

- [ ] **Step 2: Sanity check in browser**

Run: `docker compose up dev-viewer -d --build`
Open dashboard view, добавить Toggle widget вручную, убедиться визуально что:
- Toggle отрисован (трек с handle).
- В edit-mode виджет grayscale (0.5).
- В view-mode без controlToken — opacity 0.6 (`active-disabled`).

Run: `docker compose down`

- [ ] **Step 3: Commit**

```bash
git add ui/static/css/style.css
git commit -m "feat(dashboard): CSS for ToggleWidget

Слитый вид (трек+handle), цветовые состояния fb-on/off/unknown,
жёлтая граница для diverge.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 8 — E2E test

### Task 8.1: Mock-server preparation

**Files:**
- Modify (по необходимости): `tests/mock-server/server.js`

- [ ] **Step 1: Audit mock-server capabilities**

Run: `grep -n "POST\|/ionc/set\|SharedMemory2\|IONotifyController" tests/mock-server/server.js | head -20`

We need:
1. `POST /api/objects/SharedMemory/ionc/set` — принимает `{sensor_id, value}`, отвечает 200 OK.
2. `GET /api/objects?type=IONotifyController` (proxied through panel; mock-uniset just needs to expose an object with `objectType: 'IONotifyController'` from `/api/v2/{name}` — already present?).
3. (For read-pathway test) Second IONotifyController object named `SharedMemory2` available on mock-uniset.

- [ ] **Step 2: Add missing endpoints if needed**

If `POST /ionc/set` not present, add a handler (the mock simulates uniset, not panel — but `/ionc/set` is a panel endpoint forwarded to uniset's `setValue` API). Realistically the mock is uniset side; the panel forwards to uniset's `setValue`. Examine real backend forwarding to see what mock endpoint to add.

If complex — for E2E we can intercept the panel's `POST /ionc/set` directly via Playwright route (`page.route(...)`)  and avoid mock-server changes. This is what the smoke E2E (Task 4.2 in foundation) already does.

If the mock already handles this correctly for IONC → no changes, skip to Step 4.

- [ ] **Step 3: Add `SharedMemory2` (IONotifyController-typed) if absent**

Open `tests/mock-server/server.js` and find where `SharedMemory` object is exposed (`grep -n SharedMemory tests/mock-server/server.js`). Duplicate the relevant block to also expose a `SharedMemory2` object with same shape (different sensor list to verify per-widget read pathway).

- [ ] **Step 4: Restart mock if changes were made**

If mock-server file was modified, the e2e container will use the updated version on next run automatically (volume-mounted).

- [ ] **Step 5: Commit (if changes made)**

```bash
git add tests/mock-server/server.js
git commit -m "test(mock): add SharedMemory2 IONotifyController for read-pathway test

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

If no changes were needed — skip the commit and note in the report.

---

### Task 8.2: Write `dashboard-active-toggle.spec.ts`

**Files:**
- Create: `tests/single/dashboard-active-toggle.spec.ts`
- Read for reference: `tests/single/dashboard-active-base.spec.ts`

- [ ] **Step 1: Read existing smoke spec for patterns**

Run: `cat tests/single/dashboard-active-base.spec.ts`

Note: control-status mock pattern, dashboard creation via `evaluate`, Playwright route for `/ionc/set`.

- [ ] **Step 2: Write the test file**

Create `tests/single/dashboard-active-toggle.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('ToggleWidget — first active widget', () => {
    test.beforeEach(async ({ page }) => {
        // Mock control status: act as controller from the start
        await page.route('**/api/control/status', async (route) => {
            await route.fulfill({ json: { enabled: true, isController: true, hasController: true, timeoutSec: 60 } });
        });
        // Mock POST /ionc/set as success
        await page.route('**/ionc/set**', async (route) => {
            if (route.request().method() === 'POST') {
                await route.fulfill({ json: { status: 'ok' } });
            } else {
                await route.continue();
            }
        });

        await page.goto('/');
        await page.waitForFunction(() =>
            typeof (window as any).dashboardState !== 'undefined' &&
            typeof (window as any).ToggleWidget !== 'undefined' &&
            typeof (window as any).dashboardManager !== 'undefined'
        );

        // Pretend we're controller (для canControl()).
        await page.evaluate(() => {
            const w: any = window;
            w.state.control = { enabled: true, isController: true, hasController: true, timeoutSec: 60, token: 'admin' };
        });
    });

    async function createToggleDashboard(page, configOverrides = {}) {
        await page.evaluate((overrides) => {
            const w: any = window;
            const widgetCfg = {
                id: 'tw-1',
                type: 'toggle',
                config: {
                    sensor: 'TEST_PUMP',
                    sensorId: 100,
                    objectName: 'SharedMemory',
                    valueOff: 0,
                    valueOn: 1,
                    labelOff: 'OFF',
                    labelOn: 'ON',
                    ...overrides,
                },
                position: { col: 0, row: 0, width: 3, height: 2 },
            };
            const dashCfg = {
                meta: { name: 'TEST_TOGGLE', description: '' },
                widgets: [widgetCfg],
            };
            w.dashboardState.dashboards.set('TEST_TOGGLE', dashCfg);
            w.dashboardManager.loadDashboard('TEST_TOGGLE');
            w.switchView('dashboard');
        }, configOverrides);
    }

    test('writes valueOn on click when feedback=valueOff', async ({ page }) => {
        await createToggleDashboard(page);
        // Set feedback to OFF (0).
        await page.evaluate(() => {
            const w: any = window;
            const widget = w.dashboardState.widgets.get('tw-1');
            widget.update(0);
        });

        const postPromise = page.waitForRequest(req =>
            req.url().includes('/ionc/set') && req.method() === 'POST'
        );

        await page.locator('[data-test="track"]').click();

        const req = await postPromise;
        const body = JSON.parse(req.postData() || '{}');
        expect(body.sensor_id).toBe(100);
        expect(body.value).toBe(1);

        // URL должен указывать на правильный объект
        expect(req.url()).toContain('/api/objects/SharedMemory/ionc/set');
    });

    test('shows fb-on green when feedback=valueOn, no diverge', async ({ page }) => {
        await createToggleDashboard(page);
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('tw-1').update(1);
        });
        const track = page.locator('[data-test="track"]');
        await expect(track).toHaveClass(/fb-on/);
        await expect(track).not.toHaveClass(/diverge/);
    });

    test('shows diverge yellow border when cmd != feedback', async ({ page }) => {
        await createToggleDashboard(page);
        // Feedback OFF
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('tw-1').update(0);
        });
        // Click → command becomes ON, before feedback updates
        await page.locator('[data-test="track"]').click();
        // Состояние pending, command=1, feedback всё ещё 0
        await expect(page.locator('[data-test="track"]')).toHaveClass(/diverge/);
    });

    test('shows fb-unknown for value not equal to valueOff or valueOn', async ({ page }) => {
        await createToggleDashboard(page, { valueOff: 0, valueOn: 100 });
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('tw-1').update(47);
        });
        const track = page.locator('[data-test="track"]');
        await expect(track).toHaveClass(/fb-unknown/);
        await expect(track).toHaveAttribute('title', /actual:\s*47/);
    });

    test('custom labels are displayed', async ({ page }) => {
        await createToggleDashboard(page, { labelOff: 'STOP', labelOn: 'START' });
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('tw-1').update(0);
        });
        await expect(page.locator('[data-test="state-text"]')).toHaveText('STOP');

        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('tw-1').update(1);
        });
        await expect(page.locator('[data-test="state-text"]')).toHaveText('START');
    });

    test('edit mode: click does not write', async ({ page }) => {
        await createToggleDashboard(page);
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.editMode = true;
            document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', { detail: { editMode: true } }));
        });

        let requestSent = false;
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') requestSent = true;
        });

        await page.locator('[data-test="track"]').click({ force: true });
        await page.waitForTimeout(500);
        expect(requestSent).toBe(false);

        // Container marked as inactive
        const container = page.locator('.dashboard-widget[data-active-widget="true"]').first();
        await expect(container).toBeVisible();
    });

    test('control token absent: widget marked active-disabled', async ({ page }) => {
        await createToggleDashboard(page);
        await page.evaluate(() => {
            const w: any = window;
            w.state.control = { enabled: true, isController: false, hasController: false, timeoutSec: 60, token: null };
            document.dispatchEvent(new CustomEvent('controlStatusChanged', { detail: w.state.control }));
        });

        const container = page.locator('.dashboard-widget[data-widget-id="tw-1"]').first();
        await expect(container).toHaveClass(/active-disabled/);
        await expect(container).toHaveAttribute('data-control-blocked', 'true');

        let requestSent = false;
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') requestSent = true;
        });
        await page.locator('[data-test="track"]').click({ force: true });
        await page.waitForTimeout(500);
        expect(requestSent).toBe(false);
    });

    test('read-pathway: writes use widget objectName, not hardcoded', async ({ page }) => {
        await createToggleDashboard(page, { objectName: 'SharedMemory2', sensorId: 200 });
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('tw-1').update(0);
        });

        const postPromise = page.waitForRequest(req =>
            req.url().includes('/ionc/set') && req.method() === 'POST'
        );
        await page.locator('[data-test="track"]').click();
        const req = await postPromise;
        expect(req.url()).toContain('/api/objects/SharedMemory2/ionc/set');
        const body = JSON.parse(req.postData() || '{}');
        expect(body.sensor_id).toBe(200);
    });
});
```

- [ ] **Step 3: Run the test**

Run: `docker compose --profile dev down`
Run: `docker compose run --rm e2e single/dashboard-active-toggle.spec.ts`

Expected: All 7 tests PASS. May fail on first attempt due to selector/mock issues — debug and fix.

Common failure modes:
- `dashboardManager` singleton may have a different name on `window` — adjust based on how foundation smoke E2E does it (see `dashboard-active-base.spec.ts`).
- `state.control` properties may need different shape — check `02-control.js`.
- `_updateInteractivityClass` is not called eagerly — confirm Task 2.4 step 3 added the post-render call.
- `data-active-widget` attribute may not be set for the test — confirm Task 2.4 step 2 properly identified ToggleWidget as `instanceof ActiveDashboardWidget`.

Iterate until all 7 pass.

- [ ] **Step 4: Commit**

```bash
git add tests/single/dashboard-active-toggle.spec.ts
git commit -m "test(dashboard): E2E for ToggleWidget

7 cases: write flow, fb-on/off/unknown, diverge, custom labels,
edit-mode block, control-token block, custom objectName routing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 9 — Regression sweep

### Task 9.1: Run all related specs in one sweep

- [ ] **Step 1: Stop dev profile**

Run: `docker compose --profile dev down`

- [ ] **Step 2: Run combined sweep**

Run:
```bash
docker compose run --rm e2e \
  single/generator.spec.ts \
  single/ionotifycontroller.spec.ts \
  single/dashboard.spec.ts \
  single/dashboard-sse.spec.ts \
  single/dashboard-widgets.spec.ts \
  single/dashboard-active-base.spec.ts \
  single/dashboard-active-toggle.spec.ts
```

Expected: all PASS (with at most the 1 known historical flake in ionotifycontroller.spec.ts).

- [ ] **Step 3: Fix any new regressions**

If any non-flake test fails — investigate. Most likely sources of regression:
- `data-active-widget` marker breaks something that grepped on `data-type^="active-"` (search for `data-type^="active-` in test files and JS).
- `fetchSensorValues` rewrite breaks SSE-cache flow (check `dashboard-sse.spec.ts`).

Fix root cause, do NOT mock around it. Commit fixes separately.

- [ ] **Step 4: Report final result**

If all green — Phase 9 done. If something is still red — STOP and report as DONE_WITH_CONCERNS or BLOCKED with the failing test names.

---

## Phase 10 — Documentation

### Task 10.1: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Locate the active widgets section**

Run: `grep -n "Active dashboard widgets\|ActiveDashboardWidget" CLAUDE.md | head -5`

Find the existing section added during foundation.

- [ ] **Step 2: Append toggle subsection and autocomplete utility**

In the "Active dashboard widgets" section, after the foundation paragraph, add:

```markdown

**ToggleWidget (`61-dashboard-active-toggle.js`):** двухсостоянный
переключатель для DI/DO/AI/AO датчиков. Конфиг включает: `objectName`
(IONC объект), `sensorId` (числовой ID), `valueOff`/`valueOn` (любые
числа), `labelOff`/`labelOn` (текстовые подписи). Композиция: цвет
track = feedback от сервера, позиция handle = последняя команда; жёлтая
граница при расхождении command vs feedback; серый «unknown» при
feedback ≠ valueOn ≠ valueOff (типично для AI/AO — фактическое число
показывается в `title` tooltip).

**Sensor autocomplete (`41-sensor-autocomplete.js`):** утилита
`setupSensorAutocomplete(inputEl, hiddenIdEl, getObjectName, getServerId)`
— дебаунс 150ms, dropdown с keyboard navigation (↑↓/Enter/Esc),
сохраняет (name, id) пару. Используется в config-формах активных widget'ов
для выбора датчика. При смене IONC объекта — `resetOnObjectChange()`
обнуляет выбор.

**Backend:** `GET /api/objects?server=ID&type=IONotifyController` —
отфильтрованный по типу список объектов с метаданными
`[{name, objectType}]`. Без `type` — back-compat плоский список имён.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: ToggleWidget + sensor autocomplete + objects type filter

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage check:**

| Spec section | Implemented in |
|---|---|
| ToggleWidget class (контракт §92-154) | Phase 6 (Task 6.1) |
| Слитая композиция / state matrix | Phase 6 + Phase 7 (CSS) |
| labelOff/labelOn в config | Phase 6 (config form + render) |
| Two-way binding (commandValue/feedbackValue) | Phase 6 (renderCommand/renderFeedback) |
| Жёлтая граница при diverge | Phase 7 CSS + Phase 6 toggle логика |
| Серый "unknown" с tooltip | Phase 6 renderFeedback + Phase 7 CSS |
| sensor_id автоматический resolve | Phase 5 (autocomplete сохраняет id) + Phase 2.3 (writeValue использует sensorId) |
| objectName per widget | Phase 2.3 (writeValue) + Phase 6 (config form) + Phase 4 (read pathway) |
| dropdown IONC объекта с фильтром | Phase 1 backend + Phase 6 config form |
| autocomplete sensor'а | Phase 5 (utility) + Phase 6 (integration) |
| `_updateInteractivityClass` + active-disabled | Phase 2.3 (метод) + Phase 2.1/2.2 (events) + Phase 4 CSS migration |
| `data-active-widget` marker | Phase 2.4 + Phase 3 CSS migration |
| Read pathway fix | Phase 4 |
| E2E coverage (8 состояний + конфиг + write + edit + control) | Phase 8 (7 тестов покрывают) |
| Regression sweep | Phase 9 |
| Документация | Phase 10 |
| Future enhancements (стили) | НЕ в этом плане (по дизайну) |

✅ Все требования спека покрыты.

**2. Placeholder scan:** грепнул на TBD/TODO/«implement later» — нет. Note про parseConfigForm в Task 6.1 — содержательная заметка с обоснованием pragmatic deviation, не placeholder.

**3. Type consistency:** проверил.
- `_updateInteractivityClass` — везде с подчёркиванием (Task 2.3 def, Task 2.4 call, Task 6.1 неявно через base).
- `setupSensorAutocomplete` — единое имя в Task 5.1 def и Task 6.1 call, signature `(inputEl, hiddenIdEl, getObjectName, getServerId)`.
- `config.objectName`, `config.sensorId` — единый shape в Task 2.3 (writeValue), Task 4.1 (read pathway), Task 6.1 (config form), Task 8.2 (E2E).
- Custom events: `dashboardEditModeChanged`, `controlStatusChanged` — единые имена в Task 2.1, 2.2, 2.3.

✅ Consistency сохранена.

**4. Open questions resolved:**
- Реализация type-фильтра — выбран N+1 fetch (Task 1.1, без серверного кеша; кеш — отдельной задачей если потребуется).
- Кеш ID датчиков — id сохраняется в config при выборе через autocomplete; retry на HTTP 4xx — отложен (open question остаётся в спеке как «защитный механизм если потребуется», но в первой версии не реализуется — YAGNI).
- labelOff/labelOn responsive — `@media (max-height: 80px)` в Task 7.1 скрывает state-text при минимальном размере.
