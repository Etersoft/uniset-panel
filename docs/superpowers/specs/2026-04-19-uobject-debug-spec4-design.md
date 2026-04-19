# UObject Debug — Spec 4: UObject detail panel + trace backend

**Date:** 2026-04-19
**Target branch:** story/uobject-debug-spec4 (from master, after Spec 3 merged)
**Status:** brainstorming-approved, pending implementation plan
**Part of:** UObject debug visualizer (4-spec decomposition, this is Spec 4 — final).

## Goal

Дать инженеру полнофункциональную панель отладки одного UObject'а:
realtime snapshot его переменных, графики trends с историей, и поток
dispatch-trace событий. Открывается по двойному клику на ноду в System
Overview (CustomEvent contract из Spec 3).

Spec 4 объединяет в одной ветке два ранее разделённых куска:

- **Spec 2 backend** (trace polling, SSE channel, proxy endpoints) —
  изолирован только ради trace; реализуется здесь целиком.
- **Spec 4 frontend** (detail panel tab, 3 inner tabs, force via SM,
  persistent state) — основной вклад.

Ключевые границы:

- **Reuse** — где возможно (ionc freeze/unfreeze для force, overview
  state pattern для persistence, existing SSE hub, Chart.js).
- **Один PR** — Spec 2 существует только чтобы обслуживать Spec 4
  (нет других потребителей), разделение замедлило бы integration
  testing.
- **Lazy** — snapshot polling и trace SSE стартуют только при
  открытии panel; до этого network-silent.

## Scope

### В этом спеке

1. **Backend — Spec 2 часть:**
   - Go-пакет `internal/trace/` (types, HTTP client, TracePoller, Manager).
   - SSE event type `"trace"` + `SSEHub.BroadcastTraceBatch`.
   - Handler `GET /api/trace/events?object=&server=&interval=`.
   - Proxy `POST /api/trace/servers/{s}/objects/{o}/{enable,disable}`.
   - Unit + integration тесты.

2. **Backend — Spec 4 часть (debug proxy):**
   - Go-пакет `internal/debug/` (HTTP client к uniset `/debug/*`).
   - Handler `GET /api/servers/{id}/objects/{name}/snapshot` → uniset
     `/debug/snapshot`.
   - Handler `GET /api/servers/{id}/objects/{name}/history?var=X&depth=N`
     → uniset `/debug/history`.
   - Unit тесты (fake uniset + handler contract).

3. **Frontend — detail panel tab:**
   - Listener на `uniset:node-double-clicked` → создание/активация
     per-object tab.
   - Inner-tab navigation (Variables / Trends / Message Log).
   - Tab lifecycle (open → poll start, close → poll/SSE cleanup).
   - Panel state persistence (localStorage, debounced save,
     beforeunload flush).

4. **Variables tab:**
   - 4 collapsible секции: Inputs (`in_*`), Outputs (`out_*`),
     Locals, FB Instances.
   - Table с Name / Value / Type / Changed-indicator.
   - Flash animation при изменении value.
   - Forced indicator (🔒 F) на rows, чей sensor ID в envelope
     `forced` list.
   - Row click → toggle в Trends.
   - Row right-click context menu: Force value / Unforce
     (только для in_*/out_*).

5. **Trends tab:**
   - Stacked charts: один Chart.js canvas per selected variable.
   - Window selector: 30s / 1m / 5m / all.
   - Clear / Export CSV.
   - Initial history на select (backend proxy) + live updates из
     snapshot poll.

6. **Message Log tab:**
   - Virtualized table с trace records.
   - Enable / Disable toggle + size selector (64–1024).
   - Pause / Clear / Export CSV.
   - Filter (client-side substring на type/name/supplier).
   - Overflow banner.
   - Resolved names (sensor ID → имя) через snapshot sensor_map.

7. **Force/unforce через SM freeze/unfreeze:**
   - Reuse existing `/api/objects/{SM-name}/ionc/freeze` и
     `/unfreeze` endpoints.
   - Modal dialog для value input; confirm → POST.
   - Security через existing `--control-token` mechanism.
   - Применимо только к `in_*`/`out_*` rows.

8. **Testing:**
   - Backend: unit + integration (existing `httptest` pattern).
   - Frontend: Vitest unit + Playwright E2E.
   - Mock server extensions (stub snapshot / history / trace).

### Вне этого спека

- **Persistent Message Log (server-side archival)** — client-side
  buffer пропадает при close tab.
- **Side-by-side multi-object compare** — каждый detail = отдельный
  tab; compare — через manual sidebar juggling.
- **Alert rules / notifications** при trigger condition в trace.
- **Pin / sticky mode** для detail panels — lifecycle привязан к tab.
- **Advanced Log search** (regex, time range) — только substring
  filter в MVP.
- **Breadcrumb navigation** (back to overview highlighted node) —
  existing CustomEvent + URL params достаточно.

## Architecture

```
System Overview tab                    Detail panel tab (new, per object)
┌───────────────────────┐              ┌────────────────────────────────────┐
│  [blueprint graph]    │  dblclick    │ [DG_Control]  Server: Node1        │
│  UniSetProcessNode    │  ────────>   │ ┌Variables│Trends│Message Log┐     │
│                       │  uniset:     │ │                              │   │
│  FB Status panel      │  node-       │ │  (active tab content)        │   │
│  (Spec 3, existing)   │  double-     │ │                              │   │
└───────────────────────┘  clicked     │ └──────────────────────────────┘   │
                                       └────────────────────────────────────┘
                                               ▲           ▲            ▲
                                   snapshot    │  history  │  trace     │
                                   poll 500ms  │  (on      │  SSE       │
                                               │   select) │  stream    │
                                               │           │            │
                                      ┌────────────────────────────────┐
                                      │ uniset-panel Go backend        │
                                      │                                │
                                      │  /api/servers/{s}/objects/{o}/ │
                                      │      snapshot                  │
                                      │      history?var=X&depth=N     │
                                      │  /api/trace/events             │
                                      │  /api/trace/servers/{s}/       │
                                      │      objects/{o}/{enable|disable}
                                      │                                │
                                      │  Reused:                       │
                                      │  /api/objects/{SM}/ionc/       │
                                      │      {freeze|unfreeze}         │
                                      └─────────────┬──────────────────┘
                                                    │
                                    uniset (C++) per-server:
                                      /debug/snapshot
                                      /debug/history?var=X&depth=N
                                      /<obj>/dump?trace=1&since=&limit=
                                      /<obj>/trace/enable?size=N
                                      /<obj>/trace/disable
                                      (SM existing for freeze/unfreeze)
```

### CustomEvent entry point

Spec 3 уже эмитит `uniset:node-double-clicked` из canvas dblclick
обёртки. Spec 4 — listener:

```js
// 60-detail-panel.js
document.addEventListener('uniset:node-double-clicked', (e) => {
    const { serverId, serverName, objectName } = e.detail;
    openOrActivateDetailTab(serverId, serverName, objectName);
});

// Cleanup: if user closes the System Overview tab, any detail panel
// tabs for that server become orphan (their snapshot poll and trace
// SSE still run). Close them proactively.
document.addEventListener('uniset:schema-closed', (e) => {
    const { serverId } = e.detail;
    for (const key of Object.keys(detailInstances)) {
        if (detailInstances[key].serverId === serverId) {
            closeDetailPanel(key); // stops polls, unsubscribes, removes tab
        }
    }
});
```

Single click (`uniset:node-clicked`) — highlight в overview (Spec 3
Task 10); Spec 4 НЕ реагирует.

### Module decomposition (frontend)

Префикс `60-*` — после overview (58-*) в alphabetical concat.

```
60-detail-panel.js        // listener, tab lifecycle, inner-tab switching
60-detail-variables.js    // Variables tab: snapshot poll, render, force dialog
60-detail-trends.js       // Trends tab: history fetch, live merge, CSV export
60-detail-messagelog.js   // Message Log tab: trace subscribe, virtualized render
60-detail-state.js        // per-panel localStorage persistence
```

Каждый модуль — single responsibility, vanilla JS globals (проект
без ES modules), стиль консистентен с 58-overview-*.

### Lifecycle per detail panel

```
open:
  create tab DOM (if not exists)
  inst = { serverId, objectName, activeInnerTab, snapshotTimer,
           traceToken, trendsBuffer, logBuffer, ... }
  load state from localStorage (or defaults)
  applyInnerTab(inst.activeInnerTab)
  startSnapshotPoll(inst)  // 500ms fetch loop
  if state.activeInnerTab === 'messagelog': subscribeTraceIfEnabled(inst)
  emit 'uniset:detail-opened' (for any future listeners)

switch inner tab:
  persistState(inst.activeInnerTab = newTab)
  // snapshot poll keeps running (Variables + Trends both use it)
  // trace subscription independent of inner tab (see lifecycle A below)

close tab:
  stopSnapshotPoll(inst)
  unsubscribeTrace(inst.traceToken)
  flushState(inst)
  delete detailInstances[inst.key]
  emit 'uniset:detail-closed'
```

**Trace lifecycle (option A selected in brainstorm):** subscribe при
открытии Message Log tab первый раз, НЕ отписывается при переключении
на другой inner tab — так buffer накапливается для возврата.
Отписка — только при close detail panel tab целиком или на `Disable`
toggle.

## Frontend modules

### `60-detail-panel.js`

**Публичное API:**

```js
const detailInstances = {}; // key: `${serverId}:${objectName}`

function openDetailPanel(serverId, serverName, objectName) {...}
function closeDetailPanel(key) {...}
function switchInnerTab(inst, tabName) {...} // 'variables'|'trends'|'messagelog'
```

**Listener:** на `uniset:node-double-clicked` — открыть или активировать.

**Tab DOM:**

```html
<div class="detail-panel" data-key="srv-1:DG_Control">
    <div class="detail-header">
        <span class="detail-obj">DG_Control</span>
        <span class="detail-server">Server: Node1</span>
    </div>
    <div class="detail-inner-tabs">
        <button data-inner="variables" class="active">Variables</button>
        <button data-inner="trends">Trends</button>
        <button data-inner="messagelog">Message Log</button>
    </div>
    <div class="detail-inner-content">
        <div data-inner-panel="variables" class="active">...</div>
        <div data-inner-panel="trends">...</div>
        <div data-inner-panel="messagelog">...</div>
    </div>
</div>
```

Tab button в main tabs area использует existing tabs infrastructure
(`openTab` helper из `50-ui-tabs.js`, tabKey = `detail:${serverId}:${objectName}`).

### `60-detail-variables.js`

**Snapshot poll:**

```js
function startSnapshotPoll(inst) {
    const fetchOnce = async () => {
        try {
            const resp = await fetch(
                `/api/servers/${inst.serverId}/objects/${inst.objectName}/snapshot`);
            if (!resp.ok) { handleError(inst, resp); return; }
            const envelope = await resp.json();
            inst.snapshot = envelope;
            renderVariables(inst);
            updateTrendsFromSnapshot(inst); // in 60-detail-trends.js
        } catch (err) {
            console.warn('[detail] snapshot fetch failed', err);
        }
    };
    fetchOnce(); // immediate
    inst.snapshotTimer = setInterval(fetchOnce, 500);
}
```

**Render:**

```js
function renderVariables(inst) {
    const groups = groupVars(inst.snapshot.vars); // by prefix
    // 4 <section> blocks: inputs/outputs/locals/fb_instances
    // Each: header with count + collapse arrow, <table> with Name/Value/Type/Δ
    // forced indicator from inst.snapshot.forced + sensor_map
    // flash classes (flash-up/flash-down) on value change
}
```

**Group detection:**

```js
function groupVars(vars) {
    const groups = { inputs: [], outputs: [], locals: [], fb_instances: [] };
    for (const [name, value] of Object.entries(vars)) {
        if (name.startsWith('in_')) groups.inputs.push({ name, value });
        else if (name.startsWith('out_')) groups.outputs.push({ name, value });
        else if (name.includes('.')) groups.fb_instances.push({ name, value });
        else groups.locals.push({ name, value });
    }
    return groups;
}
```

**Force / unforce:**

```js
function onVariableContextMenu(inst, varName, event) {
    event.preventDefault();
    const group = varGroup(varName);
    if (group !== 'inputs' && group !== 'outputs') return; // no-op

    const sensorId = inst.snapshot.sensor_map[varName];
    if (!sensorId) return; // envelope broken
    const smObject = inst.snapshot.sm_object || 'SharedMemory';
    const isForced = inst.snapshot.forced.includes(sensorId);

    if (isForced) {
        showConfirm(`Unforce ${varName}?`, () =>
            postUnforce(inst.serverId, smObject, sensorId));
    } else {
        showValueDialog(`Force ${varName} to:`, inst.snapshot.vars[varName],
            (value) => postForce(inst.serverId, smObject, sensorId, value));
    }
}

async function postForce(serverId, smObject, sensorId, value) {
    return fetch(`/api/objects/${smObject}/ionc/freeze?server=${serverId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensor_id: sensorId, value: Number(value) }),
    });
}
// postUnforce analogous with /ionc/unfreeze + { sensor_id }
```

После success — force action refresh snapshot immediately для UI feedback.

### `60-detail-trends.js`

**State (per-panel):**

```js
inst.selectedTrends = new Set(); // variable names
inst.trendsBuffer = {};          // { varName: [{t, v}, ...] }
inst.trendsWindow = 60;          // seconds (state persisted)
```

**On select (from Variables row click):**

```js
async function addToTrends(inst, varName) {
    if (inst.selectedTrends.has(varName)) {
        inst.selectedTrends.delete(varName);
        delete inst.trendsBuffer[varName];
    } else {
        inst.selectedTrends.add(varName);
        await fetchHistory(inst, varName);
    }
    renderTrends(inst);
    persistState(inst);
}

async function fetchHistory(inst, varName) {
    const depth = Math.ceil(inst.trendsWindow * 1000 / 500); // 500ms poll
    const resp = await fetch(
        `/api/servers/${inst.serverId}/objects/${inst.objectName}`
        + `/history?var=${encodeURIComponent(varName)}&depth=${depth}`);
    if (!resp.ok) { inst.trendsBuffer[varName] = []; return; }
    const body = await resp.json();
    inst.trendsBuffer[varName] = (body.points || []).map(p => ({ t: p.t, v: p.v }));
}
```

**Live updates:**

```js
function updateTrendsFromSnapshot(inst) {
    const now = Date.now();
    for (const varName of inst.selectedTrends) {
        const value = inst.snapshot.vars[varName];
        if (value === undefined) continue;
        const buf = inst.trendsBuffer[varName] ||= [];
        buf.push({ t: now, v: value });
        // prune by window
        const cutoff = now - inst.trendsWindow * 1000;
        while (buf.length && buf[0].t < cutoff) buf.shift();
    }
    renderTrends(inst); // Chart.js update
}
```

**Charts:** Chart.js (vendored, reused from dashboard), one `<canvas>`
per selected variable (stacked vertically, as approved in brainstorm).

**Export CSV:**

```csv
timestamp_ms,variable,value
1713456000123,in_SensorTemp,75
1713456000623,in_SensorTemp,76
1713456000123,out_MotorSpeed,1500
...
```

### `60-detail-messagelog.js`

**State (per-panel):**

```js
inst.logBuffer = [];           // TraceRecord[]
inst.traceToken = null;        // from UnisetOverview.trace.subscribe
inst.logPaused = false;
inst.logFilter = '';
inst.logSize = 256;
inst.logEnabled = false;       // controlled by user toggle
```

**Subscribe / unsubscribe:**

```js
function subscribeTrace(inst) {
    if (inst.traceToken) return; // already
    inst.traceToken = window.UnisetOverview.trace.subscribe(
        inst.serverId, inst.objectName, 500,
        (batch) => onTraceBatch(inst, batch)
    );
}
function unsubscribeTrace(inst) {
    if (!inst.traceToken) return;
    window.UnisetOverview.trace.unsubscribe(inst.traceToken);
    inst.traceToken = null;
}

function onTraceBatch(inst, batch) {
    inst.logEnabled = batch.enabled;
    if (batch.overflow) showOverflowBanner(inst);
    if (batch.records && !inst.logPaused) {
        for (const rec of batch.records) {
            inst.logBuffer.push(rec);
            if (inst.logBuffer.length > 5000) inst.logBuffer.shift(); // hard cap
        }
        renderLog(inst);
    }
}
```

**Enable / disable toggle:**

```js
async function toggleEnable(inst) {
    if (inst.logEnabled) {
        await window.UnisetOverview.trace.disable(inst.serverId, inst.objectName);
    } else {
        await window.UnisetOverview.trace.enable(inst.serverId, inst.objectName, inst.logSize);
        subscribeTrace(inst); // lazy subscribe
    }
    // envelope-reported enabled will update inst.logEnabled
}
```

**Virtualized list:** simple windowing — render only rows in viewport
(scroll offset → index range), buffer ~20 above/below для smooth scroll.
~5000 rows max (hard cap), typical 256–1024.

**Record rendering:**

```
Time             Event         Name (id)       Val   From
12:45:12.123     sensorInfo    Temp(101)       75    Disp(42)
.               +2.3ms
```

- `time_us` → local time HH:MM:SS.mmm
- `event_time_us` → delay "+N.Nms" если non-zero (dispatch - event)
- `id` → lookup в inst.snapshot.sensor_map (reverse) → имя, fallback ID
- `supplier_id` → same lookup approach (suppliers отдельная таблица
  если в envelope, иначе ID-only)
- `type` → sensorInfo/timerInfo/sysCommand, row colored accordingly

**Filter:** client-side substring в concatenated `${type} ${name} ${supplier} ${value}`.

### `60-detail-state.js`

**Key:** `uniset-panel:detail:<serverId>:<objectName>` (JSON).

**Schema:**

```json
{
  "v": 1,
  "activeInnerTab": "variables",
  "selectedTrends": ["in_SensorTemp", "out_MotorSpeed"],
  "trendsWindow": 60,
  "logFilter": "sensorInfo",
  "logSize": 256,
  "logPaused": false,
  "logEnabled": true,
  "varsCollapsed": { "inputs": false, "outputs": false,
                     "locals": true, "fb_instances": true }
}
```

**Behavior:** идентичен `58-overview-state.js` — debounced
`saveDetailState` (300ms), `flushDetailState` на beforeunload, load
at tab open, reset на version mismatch.

**Reuse:** где совместимо — извлечь общий helper в отдельный файл
(`02-state-helpers.js`?) чтобы не дублировать debounce + try/catch.
Если extract — делать в первом task'е и `58-overview-state.js`
тоже мигрировать. **Implementer решает** на старте плана.

## Backend modules

### `internal/trace/` (Spec 2 scope)

Файлы и ответственности — строго по существующему
`docs/superpowers/specs/2026-04-18-uobject-debug-spec2-design.md`:

- `types.go` — dumpEnvelope, TraceBatch, recordTimeOnly.
- `client.go` — HTTP client к uniset `/dump?trace=1`.
- `poller.go` — TracePoller с shared subscribers + adaptive interval +
  backoff + watermark.
- `manager.go` — registry `(serverID, objectName) → *TracePoller`.
- `*_test.go` — unit + integration.

### `internal/debug/` (Spec 4 additions)

```go
package debug

type Client struct {
    http     *http.Client
    resolver ServerResolver // reuse from trace package or extract to shared
}

type Snapshot struct {
    Object    string            `json:"object"`
    Server    string            `json:"server"`
    Vars      map[string]any    `json:"vars"`
    SensorMap map[string]int64  `json:"sensor_map"` // in_*/out_* → sensor ID
    Forced    []int64           `json:"forced"`
    SMObject  string            `json:"sm_object"` // from uniset config
}

type HistoryPoint struct {
    T int64 `json:"t"` // ms since epoch
    V any   `json:"v"`
}

type History struct {
    Var    string         `json:"var"`
    Points []HistoryPoint `json:"points"`
}

func (c *Client) Snapshot(ctx context.Context, serverID, objectName string) (*Snapshot, error)
func (c *Client) History(ctx context.Context, serverID, objectName, varName string, depth int) (*History, error)
```

**Uniset response adaptation:** uniset `/debug/snapshot` JSON имеет
top-level `{"<ObjectName>": {vars, sensor_map, forced, sm_object}}`;
client разворачивает в flat Snapshot. Аналогично для history.

### `internal/api/handlers_debug.go`

```go
// GET /api/servers/{id}/objects/{name}/snapshot
func (h *Handlers) HandleSnapshot(w http.ResponseWriter, r *http.Request) {
    serverId := r.PathValue("id")
    name := r.PathValue("name")
    if serverId == "" || name == "" { h.writeError(w, 400, "..."); return }

    snap, err := h.debugClient.Snapshot(r.Context(), serverId, name)
    if err != nil { h.writeError(w, mapDebugErr(err), err.Error()); return }
    h.writeJSON(w, snap)
}

// GET /api/servers/{id}/objects/{name}/history?var=X&depth=N
func (h *Handlers) HandleHistory(w http.ResponseWriter, r *http.Request) {
    // parse var + depth (clamp depth to [1, 10000])
    // call debugClient.History(...)
    // passthrough result
}

func mapDebugErr(err error) int { // 404 / 501 / 502 / 503 ...
    ...
}
```

### `internal/api/handlers_trace.go` (Spec 2 scope)

Handlers + proxies, по Spec 2 design doc. Не дублирую — вся логика
already specified в spec2-design.md, реализуется как часть Spec 4 work.

### Route wiring (`internal/api/server.go`)

```go
// Spec 2 routes:
s.mux.HandleFunc("GET /api/trace/events", s.handlers.HandleTraceEvents)
s.mux.HandleFunc("POST /api/trace/servers/{serverId}/objects/{objectName}/enable",
                 s.handlers.HandleTraceEnable)
s.mux.HandleFunc("POST /api/trace/servers/{serverId}/objects/{objectName}/disable",
                 s.handlers.HandleTraceDisable)

// Spec 4 routes (using {id}/{name} to match existing convention in server.go):
s.mux.HandleFunc("GET /api/servers/{id}/objects/{name}/snapshot",
                 s.handlers.HandleSnapshot)
s.mux.HandleFunc("GET /api/servers/{id}/objects/{name}/history",
                 s.handlers.HandleHistory)
```

### `Handlers` struct additions

```go
type Handlers struct {
    // ... existing ...
    traceMgr    *trace.Manager    // Spec 2
    debugClient *debug.Client     // Spec 4
}
```

Constructor wiring в `NewHandlers(...)` — принимает оба.

### ServerResolver extraction

Оба пакета (`trace`, `debug`) нуждаются в резолвере `serverID → host:port`.
Extract в общий интерфейс (`internal/server.Resolver` или
`internal/api/resolver.go` — implementer выбирает) и пробросить через
DI.

## Error handling

| Сценарий | Client-facing |
|---|---|
| snapshot: uniset connection refused | 503 + "server unreachable"; frontend retries next poll |
| snapshot: uniset 404 | 404 "object not found"; Variables shows error banner, poll halts |
| snapshot: uniset 501 (no `/debug` on old uniset) | 501 + message; Variables graceful: "requires uniset with debug API" |
| snapshot: malformed JSON | 502 + log warning; poll continues (next cycle may succeed) |
| history: any error | inline in Trends chart: "no history for X"; live buffer continues |
| trace SSE drops | Spec 2 auto-backoff + enabled:false batch → banner "reconnecting" |
| trace enable/disable returned 403 | dialog "authentication required"; toggle disabled |
| force/unforce 403 | dialog "authentication required" |
| force/unforce 409 (already forced / race) | refresh snapshot; reopen dialog with fresh state |
| detail panel opened для несуществующего объекта | snapshot 404 → panel shows error + close button |
| CustomEvent listener crash | caught at top-level, logged, event ignored |

## Persistent panel state

Уже покрыто в `60-detail-state.js` section выше. Суть:

- Per-object localStorage key `uniset-panel:detail:<serverId>:<objectName>`.
- Debounced save (300ms) + flush at beforeunload.
- Load at tab open; fallback to defaults на version mismatch /
  quota / malformed JSON.
- Reuse pattern (и helpers если extracted) из `58-overview-state.js`.

## Testing strategy

### Backend — Go

**`internal/trace/*_test.go`** (Spec 2):
- См. Spec 2 design doc. Не дублирую.

**`internal/debug/client_test.go`:**
- Happy: fake uniset `/debug/snapshot` → Client.Snapshot returns envelope.
- 404 → ErrObjectNotFound.
- Malformed JSON → wrapped error.
- History happy path + depth clamping.

**`internal/api/handlers_debug_test.go`:**
- Snapshot handler: missing serverId → 400, 404 passthrough, 503 passthrough.
- History handler: missing var param → 400, depth clamp.

**`internal/api/handlers_trace_test.go`** (Spec 2):
- Per spec2-design.md.

### Frontend — Vitest (per existing infra)

**`tests/unit/detail-panel.test.js`:**
- openDetailPanel creates instance with correct key.
- Duplicate open → activate existing (no second instance).
- Close → cleanup (snapshotTimer cleared, trace unsubscribed).
- CustomEvent listener dispatches to openDetailPanel.

**`tests/unit/detail-variables.test.js`:**
- groupVars correctly categorizes in_/out_/plain/dotted names.
- renderVariables output includes forced indicator when sensor ID in
  forced list.
- flash class applied when value changes; removed after 500ms
  (using vi.useFakeTimers).
- postForce builds correct URL + body.

**`tests/unit/detail-trends.test.js`:**
- addToTrends fetches history for new variable.
- updateTrendsFromSnapshot appends points and prunes by window.
- Export CSV produces correct format.

**`tests/unit/detail-messagelog.test.js`:**
- onTraceBatch appends records respecting pause state.
- Overflow banner shown when batch.overflow=true.
- Filter function matches substring across type/name/supplier.
- Hard cap at 5000 records respected.

**`tests/unit/detail-state.test.js`:**
- Save / load round-trip (все поля schema).
- Version mismatch → defaults.
- Malformed JSON → defaults + console.warn.
- Quota failure silent.
- Debounce (fake timers: save at 299ms → no write, 300ms → write).

### Playwright E2E

**`tests/single/detail-panel.spec.ts`:**
- Open System Overview → dblclick node → detail tab opens с правильным title.
- Variables tab renders с 4 sections для mock object.
- Click `in_*` row → Trends tab shows chart (switch inner tab, check canvas count).
- Right-click `in_*` row → context menu shows `Force value`.
- Right-click `local` row → context menu empty / disabled.
- Open Message Log tab → после Enable toggle, records appear.
- Close detail tab → trace unsubscribes (check SSE connection dropped).
- Reload page with detail tab state → state восстанавливается (selected trends, window).

### Mock server extensions

В `tests/mock-server/server.js`:

- `GET /api/servers/:id/objects/:name/snapshot` — returns fixture with:
  - 4-section vars (in_Temp, out_Speed, Counter, FB1.State)
  - sensor_map for in_/out_
  - forced: [101] (for in_Temp)
  - sm_object: "SharedMemory"
- `GET /api/servers/:id/objects/:name/history?var=X&depth=N` — returns
  synthetic sine wave of N points.
- `GET /api/trace/events?object=X&server=S` — SSE emits batches of
  fake records every 500ms (sensorInfo + timerInfo + sysCommand mix).
- `POST /api/trace/servers/:s/objects/:o/{enable,disable}` —
  stub что записывает state, используется следующими trace events.

## Backward compatibility

- Новые endpoints (snapshot / history / trace/*) — 404 before; no
  breaking.
- CustomEvent contract: `uniset:node-double-clicked` уже эмитится
  Spec 3; Spec 4 — добавляет listener, никаких changes на emit side.
- localStorage: новый namespace `uniset-panel:detail:*`; не
  конфликтует с overview (`uniset-panel:overview:*`).
- Если uniset не поддерживает `/debug/snapshot` (старая version) —
  501 response; detail panel graceful degrade.

## Implementation order (для плана)

Phase 0 — Verification against Spec 1 (uniset-2.x branch with
`fc6a0718 UObject debug dispatch-trace API`):

0a. Call uniset `/debug/snapshot` against a test UObject; confirm
    JSON envelope contains `vars`, `sensor_map`, `forced`, `sm_object`
    (or record what fields actually exist). Adjust `debug.Snapshot`
    Go struct if Spec 1 emits different field names.
0b. Call uniset `/debug/history?var=X&depth=N`; record the unit of
    the timestamp field (`t` in ms vs µs). If µs — divide by 1000 in
    adapter, or switch `HistoryPoint.T` to int64 µs and convert in
    frontend. Document choice in `client.go` comment + assert in
    `client_test.go`.
0c. Verify `traceMgr` and `debugClient` field placement target —
    currently `internal/api/handlers.go` holds the `Handlers` struct
    (per Spec 2 commitments). Add new fields there, not in a new
    file.

Phase 1 — Backend foundation:

1. `internal/debug/types.go` + `client.go` + unit tests (snapshot only).
2. `internal/api/handlers_debug.go` — HandleSnapshot + tests.
3. Wire snapshot route.
4. `internal/debug/client.go` — History method + tests.
5. `handlers_debug.go` — HandleHistory + tests.
6. Wire history route.

Phase 2 — Spec 2 trace backend (следует spec2-design.md):

7. `internal/trace/types.go` + `client.go` + tests.
8. `poller.go` single-subscriber + tests.
9. `poller.go` multi-subscriber + adaptive interval.
10. `manager.go` + tests.
11. SSE integration (`BroadcastTraceBatch`, traceOnly filter) + tests.
12. `handlers_trace.go` — SSE endpoint + tests.
13. `handlers_trace.go` — proxy endpoints + tests.
14. Integration test (end-to-end httptest fake uniset).

Phase 3 — Frontend detail panel shell:

15. `60-detail-panel.js` — listener + tab creation + inner-tab switch
    (без content pollers).
16. `60-detail-state.js` — localStorage persistence + tests.
17. Extract common state helpers if worth it (refactor
    58-overview-state.js).

Phase 4 — Variables tab:

18. `60-detail-variables.js` — snapshot poll + groupVars + render + tests.
19. Flash animation + forced indicator.
20. Context menu + force/unforce dialog + tests.

Phase 5 — Trends tab:

21. `60-detail-trends.js` — selectedTrends state + render shell.
22. History fetch на select + Chart.js integration.
23. Live update merge + window pruning.
24. Window selector + Clear + Export CSV + tests.

Phase 6 — Message Log tab:

25. `60-detail-messagelog.js` — trace subscribe/unsubscribe lifecycle.
26. Record rendering + virtualized list.
27. Enable/Disable toggle + Size selector + Pause + Clear.
28. Filter + Export CSV + tests.
29. Overflow banner + error states.

Phase 7 — Integration & polish:

30. Update mock server (snapshot / history / trace stubs).
31. Playwright E2E (`tests/single/detail-panel.spec.ts`).
32. Full E2E run (make js-tests).
33. Documentation (`docs/DocPages/UObject-debug-detail-panel.md`).

## Open risks

- **Uniset `/debug/snapshot` envelope fields** — Spec 1 commit
  `fc6a0718` не документирует публично field names. `debug.Snapshot`
  Go struct (vars/sensor_map/forced/sm_object) — design-time
  assumption. Phase 0a verifies fact; если разница — adjust struct +
  client adapter до Phase 1.

- **`sm_object` fallback** — если uniset не выдаёт это поле
  (старая version или оптимизация), panel использует hardcoded
  "SharedMemory" (типичное имя SM-объекта в uniset-проектах).
  Если в конкретном развёртывании SM имеет иное имя — panel config
  option добавляется как отдельный ticket.

- **History timestamp unit** — uniset `/debug/history` может
  возвращать `t` в миллисекундах или микросекундах (TraceRecord
  использует µs в `time_us`). Phase 0b проверяет фактический
  формат и закрепляет convention в code + comment. Несоответствие
  ms/µs между history backfill и live update (`Date.now()` в ms)
  создало бы split в x-оси Trends chart.

- **Sensor name resolution в Message Log** — если snapshot envelope
  не дает mapping sensor_id → имя, Message Log показывает только ID.
  Acceptable для MVP; full resolution (через IONotifyController)
  расширение scope.

- **Chart.js memory при long-running Trends** — 5m window × 500ms
  poll × many variables = много points. Если заметно lagging,
  decimation (drop every other point при > N) в render.

- **Virtualized list в Message Log** — ручная реализация проста, но
  может иметь edge cases при fast scroll. Fallback: pagination
  (50 rows per page) если virtualization glitchy.

- **State helpers extract vs duplicate** — reuse-vs-scope tradeoff.
  Если extract получается чистым (1 helper файл, 58-overview-state.js
  мигрируется без regression) — делаем; иначе duplicate, меньше риск.
  Решение implementer при старте Phase 3.

- **Spec 2 depends on Spec 1 (uniset C++)** — тест integration
  требует реального uniset с dispatch-trace API. Для mock server и
  unit tests — fake responses достаточно; full E2E против production
  uniset — только когда target production version включает Spec 1.
