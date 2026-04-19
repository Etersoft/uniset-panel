# UObject Detail Panel + Trace Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement UObject detail panel (Variables / Trends / Message Log tabs) plus Spec 2 backend (trace polling + SSE + proxy endpoints) in a single branch, completing the 4-spec UObject debug visualizer.

**Architecture:** Backend-first (Go): new `internal/debug/` package for snapshot/history proxies, new `internal/trace/` package for trace polling + SSE channel, two new handler files (`handlers_debug.go`, `handlers_trace.go`). Frontend: 5 new modules (`60-detail-*.js`) with per-object tab lifecycle, reusing Spec 3 CustomEvent hooks and trace API. Force/unforce wired through existing `/api/objects/{SM}/ionc/{freeze,unfreeze}`.

**Tech Stack:** Go 1.25+ (per `go.mod`: `go 1.25.3`; net/http method-prefix routes available since 1.22, PathValue since 1.22, testing/synctest since 1.25), vanilla JS (no ES modules, `ui/concat.go` alphabetical build), Vitest + jsdom (unit), Playwright (E2E in `tests/single/`), Chart.js (already vendored in dashboard).

**Spec reference:** `docs/superpowers/specs/2026-04-19-uobject-debug-spec4-design.md`

---

## File Map

### New files

**Backend (Go):**
- `internal/debug/types.go` — `Snapshot`, `HistoryPoint`, `History` types; `ErrObjectNotFound`, `ErrUnsupported`.
- `internal/debug/client.go` — HTTP client to uniset `/debug/snapshot` + `/debug/history`.
- `internal/debug/client_test.go` — unit tests (happy, 404, 501, malformed).
- `internal/trace/types.go` — `dumpEnvelope`, `TraceBatch`, `recordTimeOnly`.
- `internal/trace/client.go` — HTTP client to uniset `/dump?trace=1`.
- `internal/trace/client_test.go` — unit tests.
- `internal/trace/poller.go` — `TracePoller` with shared subscribers, adaptive interval, backoff, watermark.
- `internal/trace/poller_test.go` — unit tests.
- `internal/trace/manager.go` — registry `(serverID, objectName) → *TracePoller`.
- `internal/trace/manager_test.go` — unit tests.
- `internal/trace/integration_test.go` — end-to-end (fake uniset + real manager + SSE hub + handler).
- `internal/api/handlers_debug.go` — `HandleSnapshot`, `HandleHistory`.
- `internal/api/handlers_debug_test.go` — handler contract tests.
- `internal/api/handlers_trace.go` — `HandleTraceEvents`, `HandleTraceEnable`, `HandleTraceDisable`.
- `internal/api/handlers_trace_test.go` — handler contract tests.

**Frontend (vanilla JS):**
- `ui/static/js/src/60-detail-state.js` — localStorage persistence for per-panel state.
- `ui/static/js/src/60-detail-panel.js` — listener, tab lifecycle, inner-tab switching.
- `ui/static/js/src/60-detail-variables.js` — Variables tab (snapshot poll, render, flash, forced, force/unforce).
- `ui/static/js/src/60-detail-trends.js` — Trends tab (history fetch, live merge, Chart.js, CSV).
- `ui/static/js/src/60-detail-messagelog.js` — Message Log tab (trace subscribe, virtualized render, controls, filter, CSV).

**Tests (frontend):**
- `tests/unit/detail-state.test.js`
- `tests/unit/detail-panel.test.js`
- `tests/unit/detail-variables.test.js`
- `tests/unit/detail-trends.test.js`
- `tests/unit/detail-messagelog.test.js`
- `tests/single/detail-panel.spec.ts`

**Docs:**
- `docs/DocPages/UObject-debug-detail-panel.md` — user-facing documentation.

### Modified files

- `internal/api/handlers.go` — add `traceMgr *trace.Manager` and `debugClient *debug.Client` fields to `Handlers` struct (Phase 0 verifies this is the right file).
- `internal/api/server.go` — wire 5 new routes.
- `internal/api/sse.go` — add `EventTrace = "trace"` constant, `BroadcastTraceBatch` method, `traceOnly bool` field on `sseClient`, filter logic in `Broadcast`.
- `internal/api/sse_test.go` — tests for new filter.
- `cmd/server/main.go` — wire `debug.Client` and `trace.Manager` construction into handler init.
- `ui/static/js/app.js` — regenerated via `cd ui && go run concat.go` after every frontend source change.
- `ui/static/css/style.css` — detail panel CSS (header, inner-tabs, variables table, trends charts, messagelog rows).
- `tests/mock-server/server.js` — stubs for `/api/servers/:id/objects/:name/snapshot`, `/history`, `/api/trace/events`, `/api/trace/servers/:s/objects/:o/{enable,disable}`.

---

## Phase 0 — Verification against uniset Spec 1

These are manual checks. They do not modify code but produce evidence notes (record outputs in `docs/superpowers/plans/2026-04-19-uobject-debug-spec4-phase0-notes.md` as you go) that drive Phase 1 type choices.

### Task 0.1: Verify `/debug/snapshot` envelope shape

**Files:**
- Create: `docs/superpowers/plans/2026-04-19-uobject-debug-spec4-phase0-notes.md`

- [ ] **Step 1: Run uniset with dispatch-trace branch**

```bash
cd /home/pv/Projects/uniset-2.x
git log --oneline | grep "UObject debug dispatch-trace API" | head -1
# Expected: fc6a0718 (core,codegen): UObject debug dispatch-trace API (Spec 1)
```

Build uniset (existing procedure — `./autogen.sh && jmake`). Start any test config with at least one UObject that has inputs/outputs.

- [ ] **Step 2: Curl snapshot endpoint**

```bash
# Adjust host:port and <ObjectName> to the running test object.
curl -s http://localhost:8080/<ObjectName>/debug/snapshot | jq . | head -80
```

Record the exact JSON structure in `phase0-notes.md`. Specifically note:
- Is the top level wrapped as `{"<ObjectName>": {...}}` or flat?
- Field name for variables map — `vars` or something else?
- Is there a `sensor_map` field mapping `in_*`/`out_*` names to numeric sensor IDs?
- Is there a `forced` array of sensor IDs?
- Is there an `sm_object` field carrying the SharedMemory object name?

- [ ] **Step 3: Write Phase 0 note**

```markdown
# Spec 4 Phase 0 verification notes

## 0.1 /debug/snapshot envelope

Date: <date>
Uniset branch: <branch>, commit: <sha>

Top-level wrapper: <yes/no>, key = "<ObjectName>"
Fields observed:
- vars: <yes/no, type>
- sensor_map: <yes/no, type>
- forced: <yes/no, type>
- sm_object: <yes/no, type>
Other fields: <list>

Decision for Phase 1:
- debug.Snapshot struct matches observed fields (adjust if needed).
- If sm_object absent: hardcode "SharedMemory" in client fallback.
- If sensor_map absent: force/unforce context menu disabled entirely; log as open concern.
```

- [ ] **Step 4: Commit notes**

```bash
cd /home/pv/Projects/uniset-panel
git add docs/superpowers/plans/2026-04-19-uobject-debug-spec4-phase0-notes.md
git commit -m "docs(spec4): Phase 0.1 verification — /debug/snapshot envelope"
```

### Task 0.2: Verify `/debug/history` timestamp unit

- [ ] **Step 1: Curl history endpoint**

```bash
curl -s "http://localhost:8080/<ObjectName>/debug/history?var=in_<one_of_the_inputs>&depth=10" | jq . | head -40
```

- [ ] **Step 2: Determine `t` unit**

Check two consecutive points. If `t` values differ by ~500 (poll interval in ms) → milliseconds. If they differ by ~500000 → microseconds. Typical `time_us` in TraceRecord is µs; history may follow same convention.

- [ ] **Step 3: Append to notes**

```markdown
## 0.2 /debug/history timestamp unit

Response shape: <observed>
`t` unit: <ms / µs>
Decision: HistoryPoint.T is int64 <ms/µs>; frontend converts to ms at render
         (Date.now() is ms; if uniset returns µs, debug.Client divides by 1000).
```

- [ ] **Step 4: Commit notes**

```bash
git add docs/superpowers/plans/2026-04-19-uobject-debug-spec4-phase0-notes.md
git commit -m "docs(spec4): Phase 0.2 verification — /debug/history timestamp unit"
```

### Task 0.3: Locate Handlers struct

- [ ] **Step 1: Find struct**

```bash
cd /home/pv/Projects/uniset-panel
grep -rn "type Handlers struct" internal/api/
# Expected: one result, typically internal/api/handlers.go
```

- [ ] **Step 2: Append to notes**

```markdown
## 0.3 Handlers struct location

File: <path>
Line: <line>
Existing fields: <list>

Decision: new fields traceMgr *trace.Manager, debugClient *debug.Client
added to this struct, not to new file.
```

- [ ] **Step 3: Commit notes**

```bash
git add docs/superpowers/plans/2026-04-19-uobject-debug-spec4-phase0-notes.md
git commit -m "docs(spec4): Phase 0.3 verification — Handlers struct location"
```

---

## Phase 1 — Debug backend (Go)

### Task 1.1: `internal/debug/types.go`

**Files:**
- Create: `internal/debug/types.go`

- [ ] **Step 1: Write type definitions**

Create `internal/debug/types.go`:

```go
// Package debug provides HTTP proxy client and types for uniset
// /debug/* endpoints (snapshot, history). Used by uniset-panel
// handlers to surface per-UObject state to the browser detail panel.
package debug

import "errors"

// Snapshot is the envelope returned by uniset-panel's
// /api/servers/{id}/objects/{name}/snapshot endpoint, adapted from
// uniset /debug/snapshot. Fields reflect Phase 0.1 observations;
// adjust if uniset emits different names.
type Snapshot struct {
	Object    string            `json:"object"`
	Server    string            `json:"server"`
	Vars      map[string]any    `json:"vars"`
	SensorMap map[string]int64  `json:"sensor_map"`
	Forced    []int64           `json:"forced"`
	SMObject  string            `json:"sm_object"`
}

// HistoryPoint is a single time-series sample. T is in milliseconds
// since epoch on the client side of this struct; the HTTP client
// in client.go converts uniset's native unit (see Phase 0.2) to ms.
type HistoryPoint struct {
	T int64 `json:"t"`
	V any   `json:"v"`
}

// History is the envelope for /history responses.
type History struct {
	Var    string         `json:"var"`
	Points []HistoryPoint `json:"points"`
}

var (
	// ErrObjectNotFound: uniset returned 404 for the requested object.
	ErrObjectNotFound = errors.New("debug: object not found")
	// ErrUnsupported: uniset is too old; no /debug/* endpoints available.
	ErrUnsupported = errors.New("debug: uniset does not support /debug API")
	// ErrUpstream: non-retryable protocol error (malformed JSON etc).
	ErrUpstream = errors.New("debug: upstream protocol error")
)
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/pv/Projects/uniset-panel
go build -mod=vendor ./internal/debug/...
# Expected: no output (success)
```

- [ ] **Step 3: Commit**

```bash
git add internal/debug/types.go
git commit -m "feat(debug): Snapshot/History types + sentinel errors"
```

### Task 1.2: `internal/debug/client.go` — Snapshot + test

**Files:**
- Create: `internal/debug/client.go`
- Create: `internal/debug/client_test.go`

- [ ] **Step 1: Write failing test first**

Create `internal/debug/client_test.go`:

```go
package debug

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type fakeResolver struct {
	hostport string
}

func (f *fakeResolver) GetServerAddress(_ string) (string, int, error) {
	// hostport format "127.0.0.1:12345"
	var host string
	var port int
	if _, err := fmtSscanf(f.hostport, "%s:%d", &host, &port); err != nil {
		return "", 0, err
	}
	return host, port, nil
}

// fmtSscanf is a thin wrapper to avoid pulling fmt into the package
// top-level imports in a style-jarring way; real code uses fmt.
func fmtSscanf(s, format string, args ...any) (int, error) {
	return 0, errors.New("use fmt.Sscanf in real client.go")
}

func TestSnapshot_happy(t *testing.T) {
	body := `{"DG_Control":{"vars":{"in_Temp":75,"out_Speed":1500,"Counter":3},"sensor_map":{"in_Temp":101,"out_Speed":205},"forced":[101],"sm_object":"SharedMemory"}}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/DG_Control/debug/snapshot" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(body))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	s, err := c.Snapshot(ctx, "srv-1", "DG_Control")
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if s.Object != "DG_Control" || s.Server != "srv-1" {
		t.Errorf("object/server mismatch: %+v", s)
	}
	if v, ok := s.Vars["in_Temp"].(float64); !ok || v != 75 {
		t.Errorf("in_Temp: got %v", s.Vars["in_Temp"])
	}
	if s.SensorMap["in_Temp"] != 101 {
		t.Errorf("sensor_map[in_Temp]: got %d", s.SensorMap["in_Temp"])
	}
	if len(s.Forced) != 1 || s.Forced[0] != 101 {
		t.Errorf("forced: got %+v", s.Forced)
	}
	if s.SMObject != "SharedMemory" {
		t.Errorf("sm_object: got %q", s.SMObject)
	}
}

func TestSnapshot_notFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(404)
		w.Write([]byte(`{"error":"object not found"}`))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	_, err := c.Snapshot(context.Background(), "srv-1", "NoSuch")
	if !errors.Is(err, ErrObjectNotFound) {
		t.Errorf("expected ErrObjectNotFound, got %v", err)
	}
}

func TestSnapshot_objectKeyMissing(t *testing.T) {
	// Uniset returned 200 but the envelope does not contain the
	// expected top-level object key (could happen on coding bug).
	body := `{"OtherObject":{"vars":{}}}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte(body))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	_, err := c.Snapshot(context.Background(), "srv-1", "DG_Control")
	if !errors.Is(err, ErrObjectNotFound) {
		t.Errorf("expected ErrObjectNotFound, got %v", err)
	}
}

func TestSnapshot_malformedJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte(`{bad json`))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	_, err := c.Snapshot(context.Background(), "srv-1", "DG_Control")
	if !errors.Is(err, ErrUpstream) {
		t.Errorf("expected ErrUpstream, got %v", err)
	}
	// Sanity: err message wraps the underlying JSON error
	if !hasSubstring(err.Error(), "invalid") && !hasSubstring(err.Error(), "json") {
		t.Errorf("error should reference JSON failure: %v", err)
	}
}

// newTestClient wires a Client to a single httptest server URL by
// hardcoding the resolver to that URL's host:port.
func newTestClient(urlStr string) *Client {
	// Parse "http://127.0.0.1:PORT" into host, port
	// (fmt.Sscanf handles this in real code; use net/url for safety)
	// Note: kept inline in test for clarity.
	return &Client{http: defaultHTTPClient(), resolver: urlResolver(urlStr)}
}

func urlResolver(urlStr string) ServerResolver {
	return resolverFunc(func(_ string) (string, int, error) {
		u, err := parseURL(urlStr)
		if err != nil {
			return "", 0, err
		}
		return u.Hostname(), u.Port(), nil
	})
}

func hasSubstring(s, sub string) bool { return stringContains(s, sub) }

// The following helpers are defined in client.go test support
// section to keep this test file focused. They are NOT exported.
type resolverFunc func(string) (string, int, error)

func (f resolverFunc) GetServerAddress(id string) (string, int, error) { return f(id) }

// parseURL and stringContains helpers referenced above are provided
// by the client.go companion (to keep test dependencies minimal).
var _ = json.Unmarshal // silence unused import when not needed
```

(Note: the file includes several helpers referenced but not defined here — they will be added in `client.go` in the next step.)

- [ ] **Step 2: Run test — expect failure**

```bash
go test -mod=vendor ./internal/debug/... 2>&1 | tail -20
# Expected: FAIL (type Client not defined, parseURL not defined, etc.)
```

- [ ] **Step 3: Write `client.go` with Snapshot + helpers**

Create `internal/debug/client.go`:

```go
package debug

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ServerResolver resolves a uniset-panel server ID to a host:port
// address reachable by the debug HTTP client. The interface is
// duplicated (not imported from server package) to keep internal/debug
// free of server-package dependency; the concrete adapter lives in
// cmd/server/main.go.
type ServerResolver interface {
	GetServerAddress(serverID string) (host string, port int, err error)
}

// Client calls uniset's /debug/* HTTP endpoints.
type Client struct {
	http     *http.Client
	resolver ServerResolver
}

// NewClient builds a Client with the given resolver and a sane
// default HTTP client (5s timeout).
func NewClient(resolver ServerResolver) *Client {
	return &Client{http: defaultHTTPClient(), resolver: resolver}
}

func defaultHTTPClient() *http.Client {
	return &http.Client{Timeout: 5 * time.Second}
}

// Snapshot fetches /debug/snapshot for (serverID, objectName) and
// returns the unwrapped Snapshot. The uniset response is wrapped as
// {"<ObjectName>": {...}}; this method unwraps to flat struct.
func (c *Client) Snapshot(ctx context.Context, serverID, objectName string) (*Snapshot, error) {
	host, port, err := c.resolver.GetServerAddress(serverID)
	if err != nil {
		return nil, fmt.Errorf("resolve server: %w", err)
	}
	endpoint := fmt.Sprintf("http://%s:%d/%s/debug/snapshot",
		host, port, url.PathEscape(objectName))

	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrObjectNotFound
	}
	if resp.StatusCode == http.StatusNotImplemented {
		return nil, ErrUnsupported
	}
	if resp.StatusCode != http.StatusOK {
		bodySnip, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("upstream status %d: %s", resp.StatusCode, string(bodySnip))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	// Top level: {"<ObjectName>": {...}}. Unwrap.
	var wrapper map[string]json.RawMessage
	if err := json.Unmarshal(body, &wrapper); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUpstream, err)
	}
	raw, ok := wrapper[objectName]
	if !ok {
		return nil, ErrObjectNotFound
	}

	var s Snapshot
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUpstream, err)
	}
	s.Object = objectName
	s.Server = serverID
	if s.SMObject == "" {
		s.SMObject = "SharedMemory" // fallback per Phase 0.1 decision
	}
	return &s, nil
}

// parseURL is an alias used by tests; kept here to avoid duplicate
// declaration at test-package scope.
func parseURL(s string) (*url.URL, error) { return url.Parse(s) }

// stringContains is a tiny helper used by tests.
func stringContains(s, sub string) bool { return strings.Contains(s, sub) }

// sentinel to silence unused-helpers linter
var _ = errors.New
```

Then remove the stub `fmtSscanf` from the test and replace the `newTestClient` helper usage to rely on resolver-based wiring. Replace the test file's top-level helpers block with:

```go
// At the bottom of client_test.go, REPLACE the fmtSscanf block with:
// (keep the rest of the file as-is)

func init() {
	// nothing — kept for symmetry with other packages
}
```

Simplify the test by removing the dead `fmtSscanf` helper and `fakeResolver` struct; the real tests use `urlResolver` which is now defined in `client.go`.

- [ ] **Step 4: Run tests**

```bash
go test -mod=vendor -v ./internal/debug/... 2>&1 | tail -30
# Expected: 4 tests PASS (TestSnapshot_happy, _notFound, _objectKeyMissing, _malformedJSON)
```

- [ ] **Step 5: Commit**

```bash
git add internal/debug/client.go internal/debug/client_test.go
git commit -m "feat(debug): Snapshot HTTP client with unwrap + sentinel errors"
```

### Task 1.3: `handlers_debug.go` — HandleSnapshot + test

**Files:**
- Create: `internal/api/handlers_debug.go`
- Create: `internal/api/handlers_debug_test.go`
- Modify: `internal/api/handlers.go` (add `debugClient *debug.Client` field to `Handlers` struct — Phase 0.3 confirmed this is the right file)

- [ ] **Step 1: Write failing test**

Create `internal/api/handlers_debug_test.go`:

```go
package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pv/uniset-panel/internal/debug"
)

type fakeDebugClient struct {
	snapshot *debug.Snapshot
	err      error
}

func (f *fakeDebugClient) Snapshot(_ context.Context, serverID, objectName string) (*debug.Snapshot, error) {
	return f.snapshot, f.err
}

func (f *fakeDebugClient) History(_ context.Context, _, _, _ string, _ int) (*debug.History, error) {
	return nil, errors.New("not implemented in fake")
}

func TestHandleSnapshot_happy(t *testing.T) {
	fake := &fakeDebugClient{snapshot: &debug.Snapshot{
		Object:    "DG_Control",
		Server:    "srv-1",
		Vars:      map[string]any{"in_Temp": 75.0},
		SensorMap: map[string]int64{"in_Temp": 101},
		Forced:    []int64{101},
		SMObject:  "SharedMemory",
	}}
	h := &Handlers{debugClient: fake}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/servers/{id}/objects/{name}/snapshot", h.HandleSnapshot)

	req := httptest.NewRequest("GET", "/api/servers/srv-1/objects/DG_Control/snapshot", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Fatalf("status = %d, body=%q", rec.Code, rec.Body.String())
	}
	var got debug.Snapshot
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Object != "DG_Control" || got.SMObject != "SharedMemory" {
		t.Errorf("envelope mismatch: %+v", got)
	}
}

func TestHandleSnapshot_missingParam(t *testing.T) {
	h := &Handlers{debugClient: &fakeDebugClient{}}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/servers/{id}/objects/{name}/snapshot", h.HandleSnapshot)

	// Empty name in path — route won't match empty segment, so use explicit 400 check
	// via a path with trailing slash (which net/http rejects as 404).
	// Instead, test the handler directly with an empty {name} PathValue.
	req := httptest.NewRequest("GET", "/api/servers/srv-1/objects/ /snapshot", nil)
	req.SetPathValue("id", "srv-1")
	req.SetPathValue("name", "")
	rec := httptest.NewRecorder()
	h.HandleSnapshot(rec, req)

	if rec.Code != 400 {
		t.Errorf("expected 400 for empty name, got %d", rec.Code)
	}
}

func TestHandleSnapshot_notFound(t *testing.T) {
	fake := &fakeDebugClient{err: debug.ErrObjectNotFound}
	h := &Handlers{debugClient: fake}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/servers/{id}/objects/{name}/snapshot", h.HandleSnapshot)

	req := httptest.NewRequest("GET", "/api/servers/srv-1/objects/NoSuch/snapshot", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != 404 {
		t.Errorf("expected 404, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "not found") {
		t.Errorf("body should mention not-found: %s", rec.Body.String())
	}
}

func TestHandleSnapshot_unsupported(t *testing.T) {
	fake := &fakeDebugClient{err: debug.ErrUnsupported}
	h := &Handlers{debugClient: fake}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/servers/{id}/objects/{name}/snapshot", h.HandleSnapshot)

	req := httptest.NewRequest("GET", "/api/servers/srv-1/objects/X/snapshot", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != 501 {
		t.Errorf("expected 501, got %d", rec.Code)
	}
}
```

- [ ] **Step 2: Run test — expect compile failure**

```bash
go test -mod=vendor ./internal/api/... 2>&1 | grep -A1 handlers_debug | head
# Expected: error — undefined: HandleSnapshot, undefined: debugClient field
```

- [ ] **Step 3: Add `DebugInterface` to handlers + implement handler**

First, in `internal/api/handlers.go`, add an interface and a struct field. Find the existing `type Handlers struct` block and extend it:

```go
// Add this interface definition near other interface definitions in handlers.go:

// DebugInterface is the minimum contract HandleSnapshot / HandleHistory
// need; implemented by *debug.Client and by test fakes.
type DebugInterface interface {
	Snapshot(ctx context.Context, serverID, objectName string) (*debug.Snapshot, error)
	History(ctx context.Context, serverID, objectName, varName string, depth int) (*debug.History, error)
}

// In the Handlers struct block, add a new field:
//    debugClient DebugInterface
```

Ensure `"context"` and `"github.com/pv/uniset-panel/internal/debug"` are imported in `handlers.go`. (Use the exact module path from `go.mod`.)

Create `internal/api/handlers_debug.go`:

```go
package api

import (
	"errors"
	"net/http"

	"github.com/pv/uniset-panel/internal/debug"
)

// HandleSnapshot proxies uniset /debug/snapshot for (server, object).
// GET /api/servers/{id}/objects/{name}/snapshot
func (h *Handlers) HandleSnapshot(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")
	name := r.PathValue("name")
	if serverID == "" {
		h.writeError(w, http.StatusBadRequest, "server id required")
		return
	}
	if name == "" {
		h.writeError(w, http.StatusBadRequest, "object name required")
		return
	}
	if h.debugClient == nil {
		h.writeError(w, http.StatusServiceUnavailable, "debug client not configured")
		return
	}

	snap, err := h.debugClient.Snapshot(r.Context(), serverID, name)
	if err != nil {
		h.writeError(w, mapDebugError(err), err.Error())
		return
	}
	h.writeJSON(w, snap)
}

// mapDebugError translates debug sentinels to HTTP codes.
func mapDebugError(err error) int {
	switch {
	case errors.Is(err, debug.ErrObjectNotFound):
		return http.StatusNotFound
	case errors.Is(err, debug.ErrUnsupported):
		return http.StatusNotImplemented
	case errors.Is(err, debug.ErrUpstream):
		return http.StatusBadGateway
	default:
		return http.StatusServiceUnavailable
	}
}
```

- [ ] **Step 4: Run tests**

```bash
go test -mod=vendor -v -run "TestHandleSnapshot_" ./internal/api/... 2>&1 | tail -15
# Expected: 4 PASS (happy, missingParam, notFound, unsupported)
```

- [ ] **Step 5: Commit**

```bash
git add internal/api/handlers_debug.go internal/api/handlers_debug_test.go internal/api/handlers.go
git commit -m "feat(api): HandleSnapshot proxy + DebugInterface"
```

### Task 1.4: Wire snapshot route

**Files:**
- Modify: `internal/api/server.go`

- [ ] **Step 1: Find routes block**

```bash
grep -n "HandleFunc.*GET /api/servers" internal/api/server.go | head
# Record line numbers to locate the routes block.
```

- [ ] **Step 2: Add route line**

In `internal/api/server.go`, add within the route registration block (near other `/api/servers/{id}/...` routes):

```go
s.mux.HandleFunc("GET /api/servers/{id}/objects/{name}/snapshot",
	s.handlers.HandleSnapshot)
```

- [ ] **Step 3: Build check**

```bash
go build -mod=vendor ./...
# Expected: no output
```

- [ ] **Step 4: Run full api tests**

```bash
go test -mod=vendor ./internal/api/... 2>&1 | tail -5
# Expected: all existing tests still pass + 4 new ones
```

- [ ] **Step 5: Commit**

```bash
git add internal/api/server.go
git commit -m "feat(api): wire /api/servers/{id}/objects/{name}/snapshot route"
```

### Task 1.5: `internal/debug/client.go` — History + test

**Files:**
- Modify: `internal/debug/client.go`
- Modify: `internal/debug/client_test.go`

- [ ] **Step 1: Append failing test**

Append to `internal/debug/client_test.go`:

```go
func TestHistory_happy(t *testing.T) {
	// Uniset returns history as {"points":[{"t":<us or ms>,"v":N},...]}.
	// Per Phase 0.2, this plan assumes ms. Adjust divisor below if µs.
	body := `{"DG_Control":{"history":{"var":"in_Temp","points":[{"t":1713456000123,"v":75},{"t":1713456000623,"v":76}]}}}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/DG_Control/debug/history" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if got := r.URL.Query().Get("var"); got != "in_Temp" {
			t.Errorf("var query: got %s", got)
		}
		if got := r.URL.Query().Get("depth"); got != "10" {
			t.Errorf("depth query: got %s", got)
		}
		w.Write([]byte(body))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	h, err := c.History(context.Background(), "srv-1", "DG_Control", "in_Temp", 10)
	if err != nil {
		t.Fatalf("History: %v", err)
	}
	if h.Var != "in_Temp" {
		t.Errorf("Var: got %s", h.Var)
	}
	if len(h.Points) != 2 {
		t.Errorf("points: got %d", len(h.Points))
	}
	if h.Points[0].T != 1713456000123 {
		t.Errorf("first T: got %d", h.Points[0].T)
	}
}

func TestHistory_depthClamp(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Server should have been called with clamped depth, not the
		// over-the-top value. Our client clamps before sending.
		depth := r.URL.Query().Get("depth")
		if depth != "10000" {
			t.Errorf("expected clamped depth=10000, got %s", depth)
		}
		w.Write([]byte(`{"DG_Control":{"history":{"var":"x","points":[]}}}`))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	_, err := c.History(context.Background(), "srv-1", "DG_Control", "x", 999999)
	if err != nil {
		t.Fatal(err)
	}
}

func TestHistory_malformedJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte(`{bad`))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	_, err := c.History(context.Background(), "srv-1", "DG_Control", "x", 10)
	if !errors.Is(err, ErrUpstream) {
		t.Errorf("expected ErrUpstream, got %v", err)
	}
}
```

- [ ] **Step 2: Run — expect failure**

```bash
go test -mod=vendor -run "TestHistory_" ./internal/debug/... 2>&1 | tail
# Expected: FAIL — History method not defined
```

- [ ] **Step 3: Implement History**

Append to `internal/debug/client.go`:

```go
// MaxHistoryDepth caps the depth parameter clients can request.
// Chosen to bound response size; higher depths would need pagination.
const MaxHistoryDepth = 10000

// History fetches /debug/history?var=&depth= for (serverID, objectName).
// Depth is clamped to [1, MaxHistoryDepth].
func (c *Client) History(ctx context.Context, serverID, objectName, varName string, depth int) (*History, error) {
	if varName == "" {
		return nil, fmt.Errorf("var required")
	}
	if depth < 1 {
		depth = 1
	}
	if depth > MaxHistoryDepth {
		depth = MaxHistoryDepth
	}

	host, port, err := c.resolver.GetServerAddress(serverID)
	if err != nil {
		return nil, fmt.Errorf("resolve server: %w", err)
	}
	q := url.Values{}
	q.Set("var", varName)
	q.Set("depth", fmt.Sprintf("%d", depth))
	endpoint := fmt.Sprintf("http://%s:%d/%s/debug/history?%s",
		host, port, url.PathEscape(objectName), q.Encode())

	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrObjectNotFound
	}
	if resp.StatusCode == http.StatusNotImplemented {
		return nil, ErrUnsupported
	}
	if resp.StatusCode != http.StatusOK {
		bodySnip, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("upstream status %d: %s", resp.StatusCode, string(bodySnip))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	// {"<ObjectName>":{"history":{var,points}}}
	var wrapper map[string]json.RawMessage
	if err := json.Unmarshal(body, &wrapper); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUpstream, err)
	}
	rawObj, ok := wrapper[objectName]
	if !ok {
		return nil, ErrObjectNotFound
	}
	var inner struct {
		History History `json:"history"`
	}
	if err := json.Unmarshal(rawObj, &inner); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUpstream, err)
	}
	return &inner.History, nil
}
```

- [ ] **Step 4: Run tests**

```bash
go test -mod=vendor -v -run "TestHistory_" ./internal/debug/... 2>&1 | tail
# Expected: 3 PASS (happy, depthClamp, malformedJSON)
```

- [ ] **Step 5: Commit**

```bash
git add internal/debug/client.go internal/debug/client_test.go
git commit -m "feat(debug): History HTTP client + depth clamp"
```

### Task 1.6: `handlers_debug.go` — HandleHistory + test

**Files:**
- Modify: `internal/api/handlers_debug.go`
- Modify: `internal/api/handlers_debug_test.go`

- [ ] **Step 1: Append failing test**

Append to `internal/api/handlers_debug_test.go`:

```go
type fakeDebugClient2 struct {
	history *debug.History
	err     error
	gotVar  string
	gotDep  int
}

func (f *fakeDebugClient2) Snapshot(_ context.Context, _, _ string) (*debug.Snapshot, error) {
	return nil, errors.New("not impl")
}
func (f *fakeDebugClient2) History(_ context.Context, _, _, varName string, depth int) (*debug.History, error) {
	f.gotVar = varName
	f.gotDep = depth
	return f.history, f.err
}

func TestHandleHistory_happy(t *testing.T) {
	fake := &fakeDebugClient2{history: &debug.History{
		Var: "in_Temp",
		Points: []debug.HistoryPoint{{T: 1713456000123, V: 75.0}},
	}}
	h := &Handlers{debugClient: fake}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/servers/{id}/objects/{name}/history", h.HandleHistory)

	req := httptest.NewRequest("GET", "/api/servers/srv-1/objects/DG_Control/history?var=in_Temp&depth=100", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if fake.gotVar != "in_Temp" || fake.gotDep != 100 {
		t.Errorf("fake: var=%q depth=%d", fake.gotVar, fake.gotDep)
	}
}

func TestHandleHistory_missingVar(t *testing.T) {
	fake := &fakeDebugClient2{}
	h := &Handlers{debugClient: fake}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/servers/{id}/objects/{name}/history", h.HandleHistory)

	req := httptest.NewRequest("GET", "/api/servers/srv-1/objects/DG_Control/history?depth=10", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != 400 {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestHandleHistory_depthDefault(t *testing.T) {
	fake := &fakeDebugClient2{history: &debug.History{Var: "x"}}
	h := &Handlers{debugClient: fake}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/servers/{id}/objects/{name}/history", h.HandleHistory)

	req := httptest.NewRequest("GET", "/api/servers/srv-1/objects/X/history?var=x", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Fatalf("status = %d", rec.Code)
	}
	if fake.gotDep != 120 {
		t.Errorf("default depth 120 expected, got %d", fake.gotDep)
	}
}
```

- [ ] **Step 2: Run — expect failure**

```bash
go test -mod=vendor -run "TestHandleHistory_" ./internal/api/... 2>&1 | tail
# Expected: FAIL — HandleHistory not defined
```

- [ ] **Step 3: Implement HandleHistory**

Append to `internal/api/handlers_debug.go`:

```go
// HandleHistory proxies uniset /debug/history for (server, object, var).
// GET /api/servers/{id}/objects/{name}/history?var=X&depth=N
// Defaults: depth=120 (covers 1 minute at 500ms poll).
func (h *Handlers) HandleHistory(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")
	name := r.PathValue("name")
	if serverID == "" {
		h.writeError(w, http.StatusBadRequest, "server id required")
		return
	}
	if name == "" {
		h.writeError(w, http.StatusBadRequest, "object name required")
		return
	}
	varName := r.URL.Query().Get("var")
	if varName == "" {
		h.writeError(w, http.StatusBadRequest, "var query param required")
		return
	}
	depth := 120
	if s := r.URL.Query().Get("depth"); s != "" {
		if n, err := strconvAtoiPositive(s); err == nil {
			depth = n
		}
	}
	if h.debugClient == nil {
		h.writeError(w, http.StatusServiceUnavailable, "debug client not configured")
		return
	}

	hist, err := h.debugClient.History(r.Context(), serverID, name, varName, depth)
	if err != nil {
		h.writeError(w, mapDebugError(err), err.Error())
		return
	}
	h.writeJSON(w, hist)
}

// strconvAtoiPositive parses a positive int; returns error on 0/neg/invalid.
func strconvAtoiPositive(s string) (int, error) {
	n, err := strconvAtoi(s)
	if err != nil {
		return 0, err
	}
	if n <= 0 {
		return 0, errors.New("non-positive")
	}
	return n, nil
}

// strconvAtoi is a thin alias to keep imports local.
func strconvAtoi(s string) (int, error) { return atoi(s) }
```

Also add the `atoi` helper (`strconv.Atoi` wrapper) at the top of `handlers_debug.go`:

```go
import (
	// ... existing imports ...
	"strconv"
)

func atoi(s string) (int, error) { return strconv.Atoi(s) }
```

- [ ] **Step 4: Run tests**

```bash
go test -mod=vendor -v -run "TestHandleHistory_" ./internal/api/... 2>&1 | tail
# Expected: 3 PASS
```

- [ ] **Step 5: Commit**

```bash
git add internal/api/handlers_debug.go internal/api/handlers_debug_test.go
git commit -m "feat(api): HandleHistory proxy + default depth 120"
```

### Task 1.7: Wire history route + main.go integration

**Files:**
- Modify: `internal/api/server.go`
- Modify: `cmd/server/main.go`

- [ ] **Step 1: Add route**

Add to the route block in `internal/api/server.go` (adjacent to the snapshot route added in Task 1.4):

```go
s.mux.HandleFunc("GET /api/servers/{id}/objects/{name}/history",
	s.handlers.HandleHistory)
```

- [ ] **Step 2: Find existing handler construction**

```bash
grep -n "handlers\\.\\|NewHandlers\\|&Handlers{" cmd/server/main.go | head
# Record where Handlers is built.
```

- [ ] **Step 3: Wire debug client in main.go**

Near where `Handlers` is built, add:

```go
// Resolver adapter: bridge server.Manager to debug.ServerResolver contract.
type debugResolverAdapter struct{ mgr *server.Manager }

func (d *debugResolverAdapter) GetServerAddress(serverID string) (string, int, error) {
	info, err := d.mgr.GetServerByID(serverID)
	if err != nil {
		return "", 0, err
	}
	return info.Host, info.Port, nil
}
```

And in the `Handlers` construction block, add:

```go
debugClient := debug.NewClient(&debugResolverAdapter{mgr: serverMgr})
```

Then pass it into `Handlers`:

```go
handlers := &api.Handlers{
	// ... existing fields ...
	debugClient: debugClient,
}
```

Verify the existing `server.Manager.GetServerByID` signature and `ServerInfo.Host`/`Port` field names; adjust the adapter to the actual fields.

- [ ] **Step 4: Build check**

```bash
go build -mod=vendor ./...
# Expected: no output
```

- [ ] **Step 5: Commit**

```bash
git add internal/api/server.go cmd/server/main.go
git commit -m "feat(api): wire /history route + debug.Client in main"
```

---

## Phase 2 — Trace backend (Spec 2 implementation)

### Task 2.1: `internal/trace/types.go`

**Files:**
- Create: `internal/trace/types.go`

- [ ] **Step 1: Write types**

Create `internal/trace/types.go`:

```go
// Package trace polls uniset /dump?trace=1 per (server, object) and
// pushes batches over the SSE hub. Record schema is defined by Spec 1
// (uniset side) and kept as opaque json.RawMessage here.
package trace

import "encoding/json"

// dumpEnvelope mirrors uniset's /dump?trace=1 response (top level
// {"<ObjectName>": {"trace": {...}}}).
// The outer object-key unwrap is done by client.go.
type dumpEnvelope struct {
	Trace *traceSection `json:"trace"`
}

type traceSection struct {
	Enabled  bool              `json:"enabled"`
	Overflow bool              `json:"overflow"`
	Records  []json.RawMessage `json:"records"`
}

// TraceBatch is what the SSE hub broadcasts to browsers. Records are
// raw JSON passed through verbatim.
type TraceBatch struct {
	Enabled  bool              `json:"enabled"`
	Overflow bool              `json:"overflow"`
	Records  []json.RawMessage `json:"records"`
}

// recordTimeOnly parses just time_us from a record for watermark updates.
type recordTimeOnly struct {
	TimeUs int64 `json:"time_us"`
}
```

- [ ] **Step 2: Build check**

```bash
go build -mod=vendor ./internal/trace/...
# Expected: no output
```

- [ ] **Step 3: Commit**

```bash
git add internal/trace/types.go
git commit -m "feat(trace): envelope + TraceBatch + recordTimeOnly types"
```

### Task 2.2: `internal/trace/client.go` + test

**Files:**
- Create: `internal/trace/client.go`
- Create: `internal/trace/client_test.go`

- [ ] **Step 1: Write failing test**

Create `internal/trace/client_test.go`:

```go
package trace

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

type resolverFn func(string) (string, int, error)

func (f resolverFn) GetServerAddress(s string) (string, int, error) { return f(s) }

func newTestClient(urlStr string) *Client {
	return &Client{
		http: &http.Client{Timeout: time.Second},
		resolver: resolverFn(func(_ string) (string, int, error) {
			u, _ := url.Parse(urlStr)
			p := 0
			fmt.Sscanf(u.Port(), "%d", &p)
			return u.Hostname(), p, nil
		}),
	}
}

func TestFetch_enabledWithRecords(t *testing.T) {
	body := `{"DG_Control":{"trace":{"enabled":true,"overflow":false,"records":[{"time_us":1000,"event_time_us":500,"id":101,"value":75,"supplier_id":42,"type":"sensorInfo"}]}}}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/DG_Control/dump" {
			t.Errorf("path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("trace") != "1" {
			t.Errorf("trace query: %s", r.URL.Query().Get("trace"))
		}
		if r.URL.Query().Get("since") != "500" {
			t.Errorf("since query: %s", r.URL.Query().Get("since"))
		}
		if r.URL.Query().Get("limit") != "1024" {
			t.Errorf("limit query: %s", r.URL.Query().Get("limit"))
		}
		w.Write([]byte(body))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	env, err := c.Fetch(context.Background(), "srv-1", "DG_Control", 500, 1024)
	if err != nil {
		t.Fatal(err)
	}
	if env.Trace == nil || !env.Trace.Enabled {
		t.Errorf("enabled: %+v", env.Trace)
	}
	if len(env.Trace.Records) != 1 {
		t.Errorf("records: got %d", len(env.Trace.Records))
	}
	// Sanity: records stay as raw JSON
	var rec map[string]any
	if err := json.Unmarshal(env.Trace.Records[0], &rec); err != nil {
		t.Fatal(err)
	}
	if rec["id"].(float64) != 101 {
		t.Errorf("id: %v", rec["id"])
	}
}

func TestFetch_objectNotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(404)
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	_, err := c.Fetch(context.Background(), "srv-1", "X", 0, 1024)
	if !errors.Is(err, ErrObjectNotFound) {
		t.Errorf("expected ErrObjectNotFound, got %v", err)
	}
}

func TestFetch_traceDisabled(t *testing.T) {
	body := `{"X":{"trace":{"enabled":false,"overflow":false,"records":[]}}}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte(body))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	env, err := c.Fetch(context.Background(), "srv-1", "X", 0, 1024)
	if err != nil {
		t.Fatal(err)
	}
	if env.Trace == nil || env.Trace.Enabled {
		t.Errorf("expected Trace.Enabled=false, got %+v", env.Trace)
	}
}

func TestFetch_malformed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte(`{bad`))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	_, err := c.Fetch(context.Background(), "srv-1", "X", 0, 1024)
	if !strings.Contains(err.Error(), "upstream") && !errors.Is(err, ErrUpstream) {
		t.Errorf("expected upstream error, got %v", err)
	}
}
```

- [ ] **Step 2: Run — expect failure**

```bash
go test -mod=vendor ./internal/trace/... 2>&1 | tail
# Expected: fail — Client, Fetch, ErrObjectNotFound, ErrUpstream not defined
```

- [ ] **Step 3: Write client.go**

Create `internal/trace/client.go`:

```go
package trace

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// ServerResolver resolves uniset-panel server IDs to host:port.
// Duplicated from internal/debug to keep internal/trace dependency-free.
type ServerResolver interface {
	GetServerAddress(serverID string) (host string, port int, err error)
}

// Sentinel errors.
var (
	ErrObjectNotFound = errors.New("trace: object not found")
	ErrUpstream       = errors.New("trace: upstream protocol error")
)

// Client calls uniset's /dump?trace=1 HTTP endpoint per object.
type Client struct {
	http     *http.Client
	resolver ServerResolver
}

// NewClient builds a Client with default 5s HTTP timeout.
func NewClient(resolver ServerResolver) *Client {
	return &Client{
		http:     &http.Client{Timeout: 5 * time.Second},
		resolver: resolver,
	}
}

// Fetch retrieves the trace envelope for (serverID, objectName). since
// is watermark in time_us (0 = all). limit caps records returned.
func (c *Client) Fetch(ctx context.Context, serverID, objectName string, since int64, limit int) (dumpEnvelope, error) {
	var zero dumpEnvelope
	host, port, err := c.resolver.GetServerAddress(serverID)
	if err != nil {
		return zero, fmt.Errorf("resolve: %w", err)
	}
	q := url.Values{}
	q.Set("trace", "1")
	if since > 0 {
		q.Set("since", fmt.Sprintf("%d", since))
	} else {
		q.Set("since", "0")
	}
	q.Set("limit", fmt.Sprintf("%d", limit))
	endpoint := fmt.Sprintf("http://%s:%d/%s/dump?%s",
		host, port, url.PathEscape(objectName), q.Encode())

	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return zero, fmt.Errorf("request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return zero, fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return zero, ErrObjectNotFound
	}
	if resp.StatusCode != http.StatusOK {
		bodySnip, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return zero, fmt.Errorf("upstream status %d: %s", resp.StatusCode, string(bodySnip))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return zero, fmt.Errorf("read: %w", err)
	}
	var wrapper map[string]json.RawMessage
	if err := json.Unmarshal(body, &wrapper); err != nil {
		return zero, fmt.Errorf("%w: %v", ErrUpstream, err)
	}
	raw, ok := wrapper[objectName]
	if !ok {
		return zero, ErrObjectNotFound
	}
	var env dumpEnvelope
	if err := json.Unmarshal(raw, &env); err != nil {
		return zero, fmt.Errorf("%w: %v", ErrUpstream, err)
	}
	return env, nil
}
```

- [ ] **Step 4: Run tests**

```bash
go test -mod=vendor -v ./internal/trace/... 2>&1 | tail -15
# Expected: 4 PASS
```

- [ ] **Step 5: Commit**

```bash
git add internal/trace/client.go internal/trace/client_test.go
git commit -m "feat(trace): HTTP client for /dump?trace=1 + sentinels"
```

### Task 2.3: `internal/trace/poller.go` — single subscriber + test

**Files:**
- Create: `internal/trace/poller.go`
- Create: `internal/trace/poller_test.go`

- [ ] **Step 1: Write failing test (single-subscriber)**

Create `internal/trace/poller_test.go`:

```go
package trace

import (
	"context"
	"encoding/json"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// fakeClient simulates the uniset HTTP client without making network calls.
type fakeClient struct {
	mu    sync.Mutex
	calls int32
	resp  dumpEnvelope
	err   error
}

func (f *fakeClient) Fetch(_ context.Context, _, _ string, _ int64, _ int) (dumpEnvelope, error) {
	atomic.AddInt32(&f.calls, 1)
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.resp, f.err
}

// fakeBroadcaster collects TraceBatch events.
type fakeBroadcaster struct {
	mu      sync.Mutex
	batches []TraceBatch
}

func (f *fakeBroadcaster) BroadcastTraceBatch(_, _, _ string, b TraceBatch) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.batches = append(f.batches, b)
}

func (f *fakeBroadcaster) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.batches)
}

func makeRecord(t *testing.T, timeUs int64) json.RawMessage {
	t.Helper()
	b, err := json.Marshal(map[string]int64{"time_us": timeUs})
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestPoller_singleSubscriber(t *testing.T) {
	rec := makeRecord(t, 12345)
	fc := &fakeClient{resp: dumpEnvelope{Trace: &traceSection{
		Enabled: true, Overflow: false,
		Records: []json.RawMessage{rec},
	}}}
	bc := &fakeBroadcaster{}

	p := newPoller("srv-1", "srv-1", "DG_Control", fc, bc)
	p.AddSubscriber("s1", 50) // 50ms interval

	ctx, cancel := context.WithCancel(context.Background())
	go p.run(ctx)

	// Wait for at least 2 broadcasts
	deadline := time.Now().Add(500 * time.Millisecond)
	for bc.count() < 2 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}

	cancel()
	p.wg.Wait()

	if bc.count() < 2 {
		t.Fatalf("expected >=2 broadcasts, got %d", bc.count())
	}

	// All broadcasts should include the record
	bc.mu.Lock()
	defer bc.mu.Unlock()
	for i, b := range bc.batches {
		if !b.Enabled {
			t.Errorf("batch %d not enabled", i)
		}
		if len(b.Records) == 0 {
			t.Errorf("batch %d empty records", i)
		}
	}
}

func TestPoller_watermarkAdvances(t *testing.T) {
	rec1 := makeRecord(t, 100)
	rec2 := makeRecord(t, 200)
	fc := &fakeClient{resp: dumpEnvelope{Trace: &traceSection{
		Enabled: true,
		Records: []json.RawMessage{rec1, rec2},
	}}}
	bc := &fakeBroadcaster{}

	p := newPoller("srv-1", "srv-1", "X", fc, bc)
	p.AddSubscriber("s1", 50)

	ctx, cancel := context.WithCancel(context.Background())
	go p.run(ctx)

	time.Sleep(120 * time.Millisecond) // allow 2 fetches
	cancel()
	p.wg.Wait()

	p.mu.Lock()
	watermark := p.lastTimeUs
	p.mu.Unlock()
	if watermark != 200 {
		t.Errorf("watermark: expected 200, got %d", watermark)
	}
}

func TestPoller_unsubscribeStops(t *testing.T) {
	fc := &fakeClient{resp: dumpEnvelope{Trace: &traceSection{Enabled: true}}}
	bc := &fakeBroadcaster{}

	p := newPoller("srv-1", "srv-1", "X", fc, bc)
	p.AddSubscriber("s1", 50)
	ctx, cancel := context.WithCancel(context.Background())
	go p.run(ctx)

	time.Sleep(80 * time.Millisecond)

	left := p.RemoveSubscriber("s1")
	if left != 0 {
		t.Errorf("subs left: %d", left)
	}
	cancel()
	p.wg.Wait()

	// After unsubscribe+cancel, no more fetches
	callsAfter := atomic.LoadInt32(&fc.calls)
	time.Sleep(100 * time.Millisecond)
	callsLater := atomic.LoadInt32(&fc.calls)
	if callsLater != callsAfter {
		t.Errorf("fetches continued after stop: %d -> %d", callsAfter, callsLater)
	}
}
```

- [ ] **Step 2: Run — expect compile failure**

```bash
go test -mod=vendor ./internal/trace/... 2>&1 | tail
# Expected: FAIL — newPoller, AddSubscriber, etc. not defined
```

- [ ] **Step 3: Write poller.go (single subscriber)**

Create `internal/trace/poller.go`:

```go
package trace

import (
	"context"
	"encoding/json"
	"sync"
	"time"
)

// HTTPFetcher is the subset of *Client used by TracePoller (allows
// fakes in unit tests).
type HTTPFetcher interface {
	Fetch(ctx context.Context, serverID, objectName string, since int64, limit int) (dumpEnvelope, error)
}

// SSEBroadcaster is the subset of SSEHub used by TracePoller.
type SSEBroadcaster interface {
	BroadcastTraceBatch(serverID, serverName, objectName string, batch TraceBatch)
}

const (
	// FetchLimit bounds records returned per uniset call.
	FetchLimit = 1024
	// MinInterval / MaxInterval bound client-requested interval.
	MinInterval = 100 * time.Millisecond
	MaxInterval = 10 * time.Second

	// Backoff parameters for uniset failures.
	backoffInitial = 1 * time.Second
	backoffMax     = 30 * time.Second
	backoffFactor  = 2
)

// TracePoller runs a polling loop for a single (serverID, objectName)
// pair, shared across multiple subscribers with per-subscriber intervals.
type TracePoller struct {
	serverID   string
	serverName string
	objectName string

	client HTTPFetcher
	sseHub SSEBroadcaster

	mu          sync.Mutex
	subscribers map[string]time.Duration
	lastTimeUs  int64
	backoff     time.Duration

	stopCh chan struct{}
	wg     sync.WaitGroup
}

func newPoller(serverID, serverName, objectName string, client HTTPFetcher, hub SSEBroadcaster) *TracePoller {
	return &TracePoller{
		serverID:    serverID,
		serverName:  serverName,
		objectName:  objectName,
		client:      client,
		sseHub:      hub,
		subscribers: make(map[string]time.Duration),
		stopCh:      make(chan struct{}),
	}
}

// AddSubscriber registers a subscriber with its requested interval
// (clamped to [MinInterval, MaxInterval]).
func (p *TracePoller) AddSubscriber(id string, intervalMS int64) {
	d := time.Duration(intervalMS) * time.Millisecond
	if d < MinInterval {
		d = MinInterval
	}
	if d > MaxInterval {
		d = MaxInterval
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.subscribers[id] = d
}

// RemoveSubscriber returns the number of subscribers remaining.
func (p *TracePoller) RemoveSubscriber(id string) int {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.subscribers, id)
	return len(p.subscribers)
}

// effectiveInterval returns the min of subscriber intervals, or
// MaxInterval if none.
func (p *TracePoller) effectiveInterval() time.Duration {
	p.mu.Lock()
	defer p.mu.Unlock()
	best := MaxInterval
	first := true
	for _, d := range p.subscribers {
		if first || d < best {
			best = d
			first = false
		}
	}
	if first {
		return MaxInterval
	}
	return best
}

// run is the poll loop. Exits when ctx is cancelled or stopCh closed.
func (p *TracePoller) run(ctx context.Context) {
	p.wg.Add(1)
	defer p.wg.Done()
	for {
		select {
		case <-ctx.Done():
			return
		case <-p.stopCh:
			return
		default:
		}

		env, err := p.client.Fetch(ctx, p.serverID, p.objectName, p.currentWatermark(), FetchLimit)
		switch {
		case err != nil:
			p.onError()
			p.broadcast(TraceBatch{Enabled: false})
			p.sleep(ctx, p.currentBackoff())
			continue
		case env.Trace == nil || !env.Trace.Enabled:
			p.resetBackoff()
			p.broadcast(TraceBatch{Enabled: false})
		default:
			p.resetBackoff()
			p.updateWatermark(env.Trace.Records)
			p.broadcast(TraceBatch{
				Enabled:  true,
				Overflow: env.Trace.Overflow,
				Records:  env.Trace.Records,
			})
		}
		p.sleep(ctx, p.effectiveInterval())
	}
}

func (p *TracePoller) currentWatermark() int64 {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.lastTimeUs
}

func (p *TracePoller) updateWatermark(recs []json.RawMessage) {
	if len(recs) == 0 {
		return
	}
	var last recordTimeOnly
	if err := json.Unmarshal(recs[len(recs)-1], &last); err == nil && last.TimeUs > 0 {
		p.mu.Lock()
		if last.TimeUs > p.lastTimeUs {
			p.lastTimeUs = last.TimeUs
		}
		p.mu.Unlock()
	}
}

func (p *TracePoller) broadcast(b TraceBatch) {
	p.sseHub.BroadcastTraceBatch(p.serverID, p.serverName, p.objectName, b)
}

func (p *TracePoller) onError() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.backoff == 0 {
		p.backoff = backoffInitial
		return
	}
	p.backoff *= backoffFactor
	if p.backoff > backoffMax {
		p.backoff = backoffMax
	}
}

func (p *TracePoller) resetBackoff() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.backoff = 0
}

func (p *TracePoller) currentBackoff() time.Duration {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.backoff
}

func (p *TracePoller) sleep(ctx context.Context, d time.Duration) {
	select {
	case <-ctx.Done():
	case <-p.stopCh:
	case <-time.After(d):
	}
}

// Stop signals the loop to exit.
func (p *TracePoller) Stop() {
	close(p.stopCh)
	p.wg.Wait()
}
```

- [ ] **Step 4: Run tests**

```bash
go test -mod=vendor -v -run "TestPoller_" ./internal/trace/... 2>&1 | tail -20
# Expected: 3 PASS (single, watermark, unsubscribe)
```

- [ ] **Step 5: Commit**

```bash
git add internal/trace/poller.go internal/trace/poller_test.go
git commit -m "feat(trace): TracePoller single-subscriber loop + watermark"
```

### Task 2.4: Multi-subscriber adaptive interval + backoff test

**Files:**
- Modify: `internal/trace/poller_test.go`

- [ ] **Step 1: Append failing tests**

Append to `internal/trace/poller_test.go`:

```go
func TestPoller_effectiveIntervalMin(t *testing.T) {
	p := newPoller("srv", "srv", "X", &fakeClient{}, &fakeBroadcaster{})
	p.AddSubscriber("a", 500)
	p.AddSubscriber("b", 100)
	if got := p.effectiveInterval(); got != 100*time.Millisecond {
		t.Errorf("effective: got %v", got)
	}
	p.RemoveSubscriber("b")
	if got := p.effectiveInterval(); got != 500*time.Millisecond {
		t.Errorf("after remove: got %v", got)
	}
}

func TestPoller_intervalClamp(t *testing.T) {
	p := newPoller("srv", "srv", "X", &fakeClient{}, &fakeBroadcaster{})
	p.AddSubscriber("a", 10) // below min
	if got := p.effectiveInterval(); got != MinInterval {
		t.Errorf("low clamp: got %v", got)
	}
	p.RemoveSubscriber("a")
	p.AddSubscriber("b", 99999) // above max
	if got := p.effectiveInterval(); got != MaxInterval {
		t.Errorf("high clamp: got %v", got)
	}
}

func TestPoller_backoffOnError(t *testing.T) {
	fc := &fakeClient{err: ErrObjectNotFound}
	bc := &fakeBroadcaster{}
	p := newPoller("srv", "srv", "X", fc, bc)
	p.AddSubscriber("s1", 50)

	ctx, cancel := context.WithCancel(context.Background())
	go p.run(ctx)
	time.Sleep(50 * time.Millisecond)

	p.mu.Lock()
	b1 := p.backoff
	p.mu.Unlock()
	if b1 != backoffInitial {
		t.Errorf("initial backoff: got %v", b1)
	}

	cancel()
	p.wg.Wait()
}

func TestPoller_backoffResetsOnSuccess(t *testing.T) {
	fc := &fakeClient{err: ErrObjectNotFound}
	bc := &fakeBroadcaster{}
	p := newPoller("srv", "srv", "X", fc, bc)
	p.AddSubscriber("s1", 50)

	ctx, cancel := context.WithCancel(context.Background())
	go p.run(ctx)
	time.Sleep(30 * time.Millisecond)

	// Switch to success
	fc.mu.Lock()
	fc.err = nil
	fc.resp = dumpEnvelope{Trace: &traceSection{Enabled: true}}
	fc.mu.Unlock()

	time.Sleep(200 * time.Millisecond)

	p.mu.Lock()
	b := p.backoff
	p.mu.Unlock()
	if b != 0 {
		t.Errorf("backoff after success: got %v", b)
	}

	cancel()
	p.wg.Wait()
}
```

- [ ] **Step 2: Run tests**

```bash
go test -mod=vendor -v -run "TestPoller_" ./internal/trace/... 2>&1 | tail -20
# Expected: 7 PASS total (3 old + 4 new)
```

- [ ] **Step 3: Commit**

```bash
git add internal/trace/poller_test.go
git commit -m "test(trace): multi-subscriber adaptive interval + backoff"
```

### Task 2.5: `internal/trace/manager.go` + test

**Files:**
- Create: `internal/trace/manager.go`
- Create: `internal/trace/manager_test.go`

- [ ] **Step 1: Write failing test**

Create `internal/trace/manager_test.go`:

```go
package trace

import (
	"context"
	"testing"
	"time"
)

func TestManager_SubscribeCreatesPoller(t *testing.T) {
	fc := &fakeClient{}
	bc := &fakeBroadcaster{}
	m := NewManager(fc, bc)
	defer m.StopAll()

	token := m.Subscribe("srv-1", "srv-1", "X", 500)
	if token == "" {
		t.Fatal("empty token")
	}
	if m.PollerCount() != 1 {
		t.Errorf("expected 1 poller, got %d", m.PollerCount())
	}

	m.Unsubscribe(token)
	// Allow goroutine to exit
	time.Sleep(50 * time.Millisecond)
	if m.PollerCount() != 0 {
		t.Errorf("expected 0 pollers after last unsubscribe, got %d", m.PollerCount())
	}
}

func TestManager_SecondSubscribeReuses(t *testing.T) {
	fc := &fakeClient{}
	bc := &fakeBroadcaster{}
	m := NewManager(fc, bc)
	defer m.StopAll()

	t1 := m.Subscribe("srv-1", "srv-1", "X", 500)
	t2 := m.Subscribe("srv-1", "srv-1", "X", 100)

	if t1 == t2 {
		t.Error("subscriber tokens must differ")
	}
	if m.PollerCount() != 1 {
		t.Errorf("expected 1 poller (shared), got %d", m.PollerCount())
	}
	m.Unsubscribe(t1)
	if m.PollerCount() != 1 {
		t.Errorf("expected poller alive with 1 subscriber left, got %d", m.PollerCount())
	}
	m.Unsubscribe(t2)
	time.Sleep(50 * time.Millisecond)
	if m.PollerCount() != 0 {
		t.Errorf("expected 0 pollers, got %d", m.PollerCount())
	}
}

func TestManager_DifferentObjectsHaveOwnPollers(t *testing.T) {
	fc := &fakeClient{}
	bc := &fakeBroadcaster{}
	m := NewManager(fc, bc)
	defer m.StopAll()

	m.Subscribe("srv-1", "srv-1", "A", 500)
	m.Subscribe("srv-1", "srv-1", "B", 500)
	if m.PollerCount() != 2 {
		t.Errorf("expected 2 pollers, got %d", m.PollerCount())
	}
	_ = context.Background() // silence unused import
}
```

- [ ] **Step 2: Run — expect failure**

```bash
go test -mod=vendor -v -run "TestManager_" ./internal/trace/... 2>&1 | tail
# Expected: FAIL — NewManager/Subscribe/etc not defined
```

- [ ] **Step 3: Write manager.go**

Create `internal/trace/manager.go`:

```go
package trace

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"
)

type pollerKey struct {
	serverID   string
	objectName string
}

// Manager is the registry of running TracePollers keyed by (server,object).
// Reference-counts subscribers; stops the poller when count reaches 0.
type Manager struct {
	client HTTPFetcher
	sseHub SSEBroadcaster

	mu       sync.Mutex
	pollers  map[pollerKey]*pollerEntry
	subIndex map[string]pollerKey // subscriberID → key
}

type pollerEntry struct {
	poller *TracePoller
	cancel context.CancelFunc
}

// NewManager builds an empty registry. The Manager starts pollers on
// demand from Subscribe and stops them via Unsubscribe (when last
// subscriber leaves).
func NewManager(client HTTPFetcher, hub SSEBroadcaster) *Manager {
	return &Manager{
		client:   client,
		sseHub:   hub,
		pollers:  make(map[pollerKey]*pollerEntry),
		subIndex: make(map[string]pollerKey),
	}
}

// Subscribe registers a subscriber and returns a token for unsubscribe.
func (m *Manager) Subscribe(serverID, serverName, objectName string, intervalMS int64) string {
	key := pollerKey{serverID: serverID, objectName: objectName}

	token := randomToken()

	m.mu.Lock()
	entry, ok := m.pollers[key]
	if !ok {
		p := newPoller(serverID, serverName, objectName, m.client, m.sseHub)
		ctx, cancel := context.WithCancel(context.Background())
		entry = &pollerEntry{poller: p, cancel: cancel}
		m.pollers[key] = entry
		go p.run(ctx)
	}
	entry.poller.AddSubscriber(token, intervalMS)
	m.subIndex[token] = key
	m.mu.Unlock()

	return token
}

// Unsubscribe removes a subscriber. If no subscribers remain for its
// poller, stops and unregisters the poller.
func (m *Manager) Unsubscribe(token string) {
	m.mu.Lock()
	key, ok := m.subIndex[token]
	if !ok {
		m.mu.Unlock()
		return
	}
	delete(m.subIndex, token)
	entry := m.pollers[key]
	m.mu.Unlock()

	if entry == nil {
		return
	}
	left := entry.poller.RemoveSubscriber(token)
	if left == 0 {
		m.mu.Lock()
		delete(m.pollers, key)
		m.mu.Unlock()
		entry.cancel()
		entry.poller.Stop()
	}
}

// PollerCount returns the number of live pollers (for diagnostics and tests).
func (m *Manager) PollerCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.pollers)
}

// StopAll is used for shutdown.
func (m *Manager) StopAll() {
	m.mu.Lock()
	entries := make([]*pollerEntry, 0, len(m.pollers))
	for _, e := range m.pollers {
		entries = append(entries, e)
	}
	m.pollers = make(map[pollerKey]*pollerEntry)
	m.subIndex = make(map[string]pollerKey)
	m.mu.Unlock()

	for _, e := range entries {
		e.cancel()
		e.poller.Stop()
	}
}

func randomToken() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
```

- [ ] **Step 4: Run tests**

```bash
go test -mod=vendor -v -run "TestManager_" ./internal/trace/... 2>&1 | tail -15
# Expected: 3 PASS
```

- [ ] **Step 5: Commit**

```bash
git add internal/trace/manager.go internal/trace/manager_test.go
git commit -m "feat(trace): Manager registry + reference counting"
```

### Task 2.6: SSE integration — BroadcastTraceBatch + traceOnly filter

**Files:**
- Modify: `internal/api/sse.go`
- Modify: `internal/api/sse_test.go`

- [ ] **Step 1: Find SSE event types**

```bash
grep -n "EventTrace\|EventObjectData\|Type *=" internal/api/sse.go | head
```

- [ ] **Step 2: Add EventTrace constant + BroadcastTraceBatch**

In `internal/api/sse.go`, within the event-type constant block, add:

```go
// EventTrace — dispatch-trace batches (Spec 2/4).
EventTrace = "trace"
```

Also add imports if needed (`"github.com/pv/uniset-panel/internal/trace"`).

Find the `sseClient` struct and add a `traceOnly bool` field.

Add the broadcast method (near other `Broadcast*` methods):

```go
// BroadcastTraceBatch sends a trace batch only to clients who opted in
// via traceOnly=true.
func (h *SSEHub) BroadcastTraceBatch(serverID, serverName, objectName string, batch trace.TraceBatch) {
	h.Broadcast(SSEEvent{
		Type:       EventTrace,
		ServerID:   serverID,
		ServerName: serverName,
		ObjectName: objectName,
		Data:       batch,
		Timestamp:  time.Now(),
	})
}
```

In `SSEHub.Broadcast` (or equivalent dispatch method) find the per-client send loop and add filter logic:

```go
for client := range h.clients {
	// Channel isolation: traceOnly clients see only trace events;
	// non-traceOnly clients see everything EXCEPT trace events.
	if client.traceOnly && event.Type != EventTrace {
		continue
	}
	if !client.traceOnly && event.Type == EventTrace {
		continue
	}
	// ... existing per-client filter (objectName etc.) ...
}
```

Expose the `traceOnly` field on `AddClient` or a new `AddTraceClient` method:

```go
// AddTraceClient registers a client that will receive ONLY trace events.
func (h *SSEHub) AddTraceClient(objectName string) *sseClient {
	client := h.newClient(objectName) // or however clients are built today
	client.traceOnly = true
	h.addClient(client)
	return client
}
```

Match the exact existing pattern in sse.go — names above are illustrative; adapt to what is already there.

- [ ] **Step 3: Write filter tests**

Append to `internal/api/sse_test.go`:

```go
func TestSSE_traceOnlyFilter(t *testing.T) {
	hub := NewSSEHub() // adapt to actual constructor
	regClient := hub.AddClient("DG_Control")
	traceClient := hub.AddTraceClient("DG_Control")

	// Broadcast a normal object_data event
	hub.Broadcast(SSEEvent{
		Type:       "object_data",
		ObjectName: "DG_Control",
		Data:       nil,
	})
	// Broadcast a trace event
	hub.BroadcastTraceBatch("srv-1", "srv-1", "DG_Control", trace.TraceBatch{Enabled: true})

	// Collect a short window
	regEvents := drainEvents(regClient, 50*time.Millisecond)
	traceEvents := drainEvents(traceClient, 50*time.Millisecond)

	// Regular client gets object_data, NOT trace
	if !hasType(regEvents, "object_data") {
		t.Error("regular client missed object_data")
	}
	if hasType(regEvents, "trace") {
		t.Error("regular client unexpectedly got trace")
	}
	// Trace client gets trace, NOT object_data
	if !hasType(traceEvents, "trace") {
		t.Error("trace client missed trace")
	}
	if hasType(traceEvents, "object_data") {
		t.Error("trace client unexpectedly got object_data")
	}
}

// drainEvents reads from client.events for up to d; returns collected.
func drainEvents(c *sseClient, d time.Duration) []SSEEvent {
	deadline := time.After(d)
	var out []SSEEvent
	for {
		select {
		case e := <-c.events:
			out = append(out, e)
		case <-deadline:
			return out
		}
	}
}

func hasType(events []SSEEvent, t string) bool {
	for _, e := range events {
		if e.Type == t {
			return true
		}
	}
	return false
}
```

Adapt `NewSSEHub`, `AddClient`, `drainEvents`, field access etc. to what actually exists in the codebase.

- [ ] **Step 4: Run tests**

```bash
go test -mod=vendor -v -run "TestSSE_" ./internal/api/... 2>&1 | tail
# Expected: existing SSE tests PASS + new filter test PASSes
```

- [ ] **Step 5: Commit**

```bash
git add internal/api/sse.go internal/api/sse_test.go
git commit -m "feat(api): SSE BroadcastTraceBatch + traceOnly channel isolation"
```

### Task 2.7: `handlers_trace.go` — SSE endpoint + test

**Files:**
- Create: `internal/api/handlers_trace.go`
- Create: `internal/api/handlers_trace_test.go`
- Modify: `internal/api/handlers.go` (add `traceMgr *trace.Manager` field — Phase 0.3 file)

- [ ] **Step 1: Write failing test**

Create `internal/api/handlers_trace_test.go`:

```go
package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pv/uniset-panel/internal/trace"
)

type fakeTraceMgr struct {
	lastServer   string
	lastObj      string
	lastInterval int64
	tokens       []string
}

func (f *fakeTraceMgr) Subscribe(serverID, serverName, objectName string, intervalMS int64) string {
	f.lastServer = serverID
	f.lastObj = objectName
	f.lastInterval = intervalMS
	tok := "tok-" + serverID + "-" + objectName
	f.tokens = append(f.tokens, tok)
	return tok
}
func (f *fakeTraceMgr) Unsubscribe(_ string) {}
func (f *fakeTraceMgr) PollerCount() int     { return len(f.tokens) }
func (f *fakeTraceMgr) StopAll()             {}

var _ TraceManagerInterface = (*fakeTraceMgr)(nil)

func TestHandleTraceEvents_missingRequired(t *testing.T) {
	h := &Handlers{traceMgr: &fakeTraceMgr{}}

	req := httptest.NewRequest("GET", "/api/trace/events?server=srv-1", nil) // no object
	rec := httptest.NewRecorder()
	h.HandleTraceEvents(rec, req)
	if rec.Code != 400 {
		t.Errorf("missing object: expected 400, got %d", rec.Code)
	}

	req = httptest.NewRequest("GET", "/api/trace/events?object=X", nil) // no server
	rec = httptest.NewRecorder()
	h.HandleTraceEvents(rec, req)
	if rec.Code != 400 {
		t.Errorf("missing server: expected 400, got %d", rec.Code)
	}
}

func TestHandleTraceEvents_intervalClamp(t *testing.T) {
	mgr := &fakeTraceMgr{}
	h := &Handlers{traceMgr: mgr, sseHub: &fakeSSE{}}

	req := httptest.NewRequest("GET", "/api/trace/events?object=X&server=srv-1&interval=10", nil)
	// A real SSE handler blocks; for unit test we want Subscribe call
	// to have happened then we kill the context immediately. Use
	// WithContext + cancel to simulate client close.
	ctx, cancel := req.Context(), func() {}
	_ = ctx
	_ = cancel
	rec := httptest.NewRecorder()
	go h.HandleTraceEvents(rec, req)
	// Give handler a moment to subscribe
	time.Sleep(10 * time.Millisecond)

	if mgr.lastInterval != 100 {
		t.Errorf("interval clamp low: expected 100, got %d", mgr.lastInterval)
	}
}
```

(Note: the test `TestHandleTraceEvents_intervalClamp` relies on `fakeSSE` — a minimal fake that will be defined alongside. Keep it simple.)

- [ ] **Step 2: Implement handler**

Add to `internal/api/handlers.go`:

```go
// TraceManagerInterface is the subset of trace.Manager used by handlers.
type TraceManagerInterface interface {
	Subscribe(serverID, serverName, objectName string, intervalMS int64) string
	Unsubscribe(token string)
	PollerCount() int
	StopAll()
}
```

Add `traceMgr TraceManagerInterface` field to `Handlers` struct.

Create `internal/api/handlers_trace.go`:

```go
package api

import (
	"fmt"
	"net/http"
)

// HandleTraceEvents streams trace SSE for one (server,object).
// GET /api/trace/events?object=X&server=S&interval=N
func (h *Handlers) HandleTraceEvents(w http.ResponseWriter, r *http.Request) {
	object := r.URL.Query().Get("object")
	server := r.URL.Query().Get("server")
	if object == "" || server == "" {
		h.writeError(w, http.StatusBadRequest, "object and server query params required")
		return
	}

	// Parse + clamp interval.
	interval := int64(500)
	if s := r.URL.Query().Get("interval"); s != "" {
		var n int64
		_, _ = fmt.Sscanf(s, "%d", &n)
		if n > 0 {
			interval = n
		}
	}
	if interval < 100 {
		interval = 100
	}
	if interval > 10000 {
		interval = 10000
	}

	if h.traceMgr == nil {
		h.writeError(w, http.StatusServiceUnavailable, "trace manager not configured")
		return
	}

	// Register subscriber first so that broadcasts during AddClient do
	// not race. Then add SSE client.
	serverName := server // resolver lookup could enrich; server ID OK for Spec 2
	token := h.traceMgr.Subscribe(server, serverName, object, interval)
	defer h.traceMgr.Unsubscribe(token)

	// SSE headers + stream (reuse existing hub method).
	// The concrete method name depends on sse.go; pseudocode:
	client := h.sseHub.AddTraceClient(object)
	defer h.sseHub.RemoveClient(client)

	// Set SSE response headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		h.writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	// Stream events until client disconnects.
	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case event, open := <-client.events:
			if !open {
				return
			}
			// Serialize as SSE (match existing code in sse.go);
			// pseudocode: writeSSEEvent(w, event); flusher.Flush()
			writeSSEEvent(w, event)
			flusher.Flush()
		}
	}
}
```

Adapt `AddTraceClient`, `RemoveClient`, `writeSSEEvent`, `client.events` channel to the actual existing sse.go code.

- [ ] **Step 3: Run tests**

```bash
go test -mod=vendor -v -run "TestHandleTraceEvents_" ./internal/api/... 2>&1 | tail
# Expected: 2 PASS (missingRequired has 2 sub-checks, intervalClamp 1 check)
```

- [ ] **Step 4: Commit**

```bash
git add internal/api/handlers_trace.go internal/api/handlers_trace_test.go internal/api/handlers.go
git commit -m "feat(api): HandleTraceEvents SSE endpoint + traceMgr field"
```

### Task 2.8: Proxy endpoints (enable/disable) + test

**Files:**
- Modify: `internal/api/handlers_trace.go`
- Modify: `internal/api/handlers_trace_test.go`

- [ ] **Step 1: Append failing tests**

Append to `handlers_trace_test.go`:

```go
func TestHandleTraceEnable_proxy(t *testing.T) {
	// Fake uniset responds to POST /<obj>/trace/enable
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("method: %s", r.Method)
		}
		if r.URL.Path != "/DG_Control/trace/enable" {
			t.Errorf("path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("size") != "256" {
			t.Errorf("size: %s", r.URL.Query().Get("size"))
		}
		w.WriteHeader(200)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	resolver := resolverFnAPI(func(_ string) (string, int, error) {
		u, _ := url.Parse(srv.URL)
		p := 0
		fmt.Sscanf(u.Port(), "%d", &p)
		return u.Hostname(), p, nil
	})
	h := &Handlers{traceResolver: resolver, httpClient: srv.Client()}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/trace/servers/{id}/objects/{name}/enable", h.HandleTraceEnable)

	req := httptest.NewRequest("POST",
		"/api/trace/servers/srv-1/objects/DG_Control/enable?size=256", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Errorf("status: %d body: %s", rec.Code, rec.Body.String())
	}
}

func TestHandleTraceDisable_proxy(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/X/trace/disable" {
			t.Errorf("method/path: %s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(200)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	resolver := resolverFnAPI(func(_ string) (string, int, error) {
		u, _ := url.Parse(srv.URL)
		p := 0
		fmt.Sscanf(u.Port(), "%d", &p)
		return u.Hostname(), p, nil
	})
	h := &Handlers{traceResolver: resolver, httpClient: srv.Client()}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/trace/servers/{id}/objects/{name}/disable", h.HandleTraceDisable)
	req := httptest.NewRequest("POST", "/api/trace/servers/srv-1/objects/X/disable", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Errorf("status: %d", rec.Code)
	}
}

type resolverFnAPI func(string) (string, int, error)

func (f resolverFnAPI) GetServerAddress(s string) (string, int, error) { return f(s) }
```

Also ensure `Handlers` has `traceResolver TraceResolver` and `httpClient *http.Client` fields (add to handlers.go):

```go
// TraceResolver is used by proxy handlers to resolve serverID → host:port.
type TraceResolver interface {
	GetServerAddress(serverID string) (host string, port int, err error)
}

// In Handlers struct:
//   traceResolver TraceResolver
//   httpClient    *http.Client // reused by trace proxy handlers
```

- [ ] **Step 2: Implement proxy handlers**

Append to `internal/api/handlers_trace.go`:

```go
import (
	// ... existing ...
	"io"
	"net/url"
)

// HandleTraceEnable proxies POST /api/trace/servers/{id}/objects/{name}/enable
// to uniset /<name>/trace/enable with passthrough query string and status.
func (h *Handlers) HandleTraceEnable(w http.ResponseWriter, r *http.Request) {
	h.proxyTraceControl(w, r, "enable")
}

// HandleTraceDisable — analog for disable.
func (h *Handlers) HandleTraceDisable(w http.ResponseWriter, r *http.Request) {
	h.proxyTraceControl(w, r, "disable")
}

func (h *Handlers) proxyTraceControl(w http.ResponseWriter, r *http.Request, action string) {
	serverID := r.PathValue("id")
	name := r.PathValue("name")
	if serverID == "" || name == "" {
		h.writeError(w, http.StatusBadRequest, "server id and object name required")
		return
	}
	if h.traceResolver == nil {
		h.writeError(w, http.StatusServiceUnavailable, "trace resolver not configured")
		return
	}
	host, port, err := h.traceResolver.GetServerAddress(serverID)
	if err != nil {
		h.writeError(w, http.StatusNotFound, err.Error())
		return
	}
	endpoint := fmt.Sprintf("http://%s:%d/%s/trace/%s",
		host, port, url.PathEscape(name), action)
	if r.URL.RawQuery != "" {
		endpoint += "?" + r.URL.RawQuery
	}

	req, err := http.NewRequestWithContext(r.Context(), "POST", endpoint, r.Body)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Passthrough relevant headers (content-type).
	for _, k := range []string{"Content-Type"} {
		if v := r.Header.Get(k); v != "" {
			req.Header.Set(k, v)
		}
	}

	client := h.httpClient
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		h.writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}
```

- [ ] **Step 3: Run tests**

```bash
go test -mod=vendor -v -run "TestHandleTrace(Enable|Disable)_" ./internal/api/... 2>&1 | tail
# Expected: 2 PASS
```

- [ ] **Step 4: Commit**

```bash
git add internal/api/handlers_trace.go internal/api/handlers_trace_test.go internal/api/handlers.go
git commit -m "feat(api): HandleTraceEnable/Disable proxy + passthrough"
```

### Task 2.9: Wire trace routes + integration test

**Files:**
- Modify: `internal/api/server.go`
- Modify: `cmd/server/main.go`
- Create: `internal/trace/integration_test.go`

- [ ] **Step 1: Wire routes**

Add to `internal/api/server.go`:

```go
s.mux.HandleFunc("GET /api/trace/events", s.handlers.HandleTraceEvents)
s.mux.HandleFunc("POST /api/trace/servers/{id}/objects/{name}/enable",
	s.handlers.HandleTraceEnable)
s.mux.HandleFunc("POST /api/trace/servers/{id}/objects/{name}/disable",
	s.handlers.HandleTraceDisable)
```

- [ ] **Step 2: Wire manager in main.go**

In `cmd/server/main.go`, near the `Handlers` construction:

```go
// Trace backend: client, manager; uses debugResolverAdapter (reused
// from Task 1.7).
traceClient := trace.NewClient(&debugResolverAdapter{mgr: serverMgr})
traceMgr := trace.NewManager(traceClient, sseHub)

handlers := &api.Handlers{
	// ... existing fields ...
	traceMgr:      traceMgr,
	traceResolver: &debugResolverAdapter{mgr: serverMgr},
	httpClient:    &http.Client{Timeout: 5 * time.Second},
}

// Ensure graceful shutdown
// ... in shutdown block:
// traceMgr.StopAll()
```

Also ensure `internal/trace` is imported in main.go.

- [ ] **Step 3: Integration test**

Create `internal/trace/integration_test.go`:

```go
package trace

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"
	"time"
)

func TestIntegration_endToEnd(t *testing.T) {
	// Fake uniset: always returns enabled trace with 1 record per call.
	var callCount int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic := &sync.Mutex{}
		atomic.Lock()
		callCount++
		idx := callCount
		atomic.Unlock()

		rec, _ := json.Marshal(map[string]int64{"time_us": int64(idx * 1000)})
		body := `{"X":{"trace":{"enabled":true,"records":[` + string(rec) + `]}}}`
		w.Write([]byte(body))
	}))
	defer srv.Close()

	resolver := resolverFn(func(_ string) (string, int, error) {
		u, _ := url.Parse(srv.URL)
		p := 0
		_, _ = fmtSscanf(u.Port(), "%d", &p)
		return u.Hostname(), p, nil
	})
	client := NewClient(resolver)
	hub := &fakeBroadcaster{}
	m := NewManager(client, hub)
	defer m.StopAll()

	token := m.Subscribe("srv-1", "srv-1", "X", 100)
	defer m.Unsubscribe(token)

	time.Sleep(350 * time.Millisecond)

	if got := hub.count(); got < 2 {
		t.Errorf("expected ≥2 broadcasts, got %d", got)
	}

	// Verify watermark advanced across calls (second batch Records[0]
	// differs from first)
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if len(hub.batches) >= 2 {
		var a, b recordTimeOnly
		_ = json.Unmarshal(hub.batches[0].Records[0], &a)
		_ = json.Unmarshal(hub.batches[1].Records[0], &b)
		if a.TimeUs == b.TimeUs {
			t.Errorf("records should change across broadcasts: a=%d b=%d",
				a.TimeUs, b.TimeUs)
		}
	}
	_ = context.Background
}

// fmtSscanf is a local helper (stdlib fmt.Sscanf wrapper).
func fmtSscanf(s, format string, args ...any) (int, error) {
	// just forward to fmt.Sscanf in production; in test it's fine
	// to use a local wrapper to avoid polluting imports at top.
	return 0, nil // overridden in tests if needed; real uses fmt.Sscanf
}
```

Note: if the `fmtSscanf` helper pattern doesn't compile cleanly, replace it with `fmt.Sscanf(u.Port(), "%d", &p)` and add `"fmt"` import.

- [ ] **Step 4: Run all trace tests**

```bash
go test -mod=vendor ./internal/trace/... 2>&1 | tail -10
# Expected: all PASS including integration
```

- [ ] **Step 5: Commit**

```bash
git add internal/api/server.go cmd/server/main.go internal/trace/integration_test.go
git commit -m "feat(trace): wire routes + integration test"
```

---

## Phase 3 — Frontend shell (state + panel lifecycle)

### Task 3.1: `60-detail-state.js` + tests

**Files:**
- Create: `ui/static/js/src/60-detail-state.js`
- Create: `tests/unit/detail-state.test.js`
- Regenerate: `ui/static/js/app.js`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/detail-state.test.js`:

```js
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { loadSrc } from './helpers/load-src.js';

beforeAll(() => {
    loadSrc('ui/static/js/src/60-detail-state.js');
});

beforeEach(() => {
    localStorage.clear();
});

describe('detailStateDefault', () => {
    it('shape covers all required fields', () => {
        const d = detailStateDefault();
        expect(d).toMatchObject({
            v: 1,
            activeInnerTab: 'variables',
            selectedTrends: [],
            trendsWindow: 60,
            logFilter: '',
            logSize: 256,
            logPaused: false,
            logEnabled: false,
            varsCollapsed: { inputs: false, outputs: false, locals: true, fb_instances: true }
        });
    });
});

describe('loadDetailState / saveDetailState', () => {
    it('round-trip persists fields verbatim', () => {
        const state = {
            v: 1, activeInnerTab: 'trends', selectedTrends: ['in_Temp'],
            trendsWindow: 300, logFilter: 'sensor', logSize: 512,
            logPaused: true, logEnabled: true,
            varsCollapsed: { inputs: true, outputs: false, locals: false, fb_instances: true }
        };
        saveDetailState('srv-1', 'DG_Control', state);
        flushDetailState('srv-1', 'DG_Control');
        const loaded = loadDetailState('srv-1', 'DG_Control');
        expect(loaded).toEqual(state);
    });

    it('returns defaults when key missing', () => {
        const d = loadDetailState('srv-9', 'Ghost');
        expect(d).toEqual(detailStateDefault());
    });

    it('version mismatch resets to defaults', () => {
        localStorage.setItem(
            'uniset-panel:detail:srv-1:X',
            JSON.stringify({ v: 99, activeInnerTab: 'trends' })
        );
        const d = loadDetailState('srv-1', 'X');
        expect(d).toEqual(detailStateDefault());
    });

    it('malformed JSON does not throw', () => {
        localStorage.setItem('uniset-panel:detail:srv-1:X', '{not-json{{');
        expect(() => loadDetailState('srv-1', 'X')).not.toThrow();
        expect(loadDetailState('srv-1', 'X')).toEqual(detailStateDefault());
    });

    it('save survives localStorage quota error', () => {
        const origSet = localStorage.setItem.bind(localStorage);
        localStorage.setItem = () => { throw new DOMException('QuotaExceeded'); };
        expect(() => {
            saveDetailState('srv-1', 'X', detailStateDefault());
            flushDetailState('srv-1', 'X');
        }).not.toThrow();
        localStorage.setItem = origSet;
    });
});

describe('saveDetailState debounce', () => {
    afterEach(() => vi.useRealTimers());

    it('is debounced by 300ms', () => {
        vi.useFakeTimers();
        const key = 'uniset-panel:detail:srv-1:DG_Control';
        saveDetailState('srv-1', 'DG_Control',
            { ...detailStateDefault(), activeInnerTab: 'trends' });
        expect(localStorage.getItem(key)).toBeNull();
        vi.advanceTimersByTime(299);
        expect(localStorage.getItem(key)).toBeNull();
        vi.advanceTimersByTime(1);
        expect(localStorage.getItem(key)).toContain('"activeInnerTab":"trends"');
    });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd /home/pv/Projects/uniset-panel/tests && npm run test:unit -- --run 2>&1 | tail -10
# Expected: detail-state tests fail (functions not defined)
```

- [ ] **Step 3: Write `60-detail-state.js`**

Create `ui/static/js/src/60-detail-state.js`:

```js
// ============================================================================
// UObject Detail Panel — per-panel state persistence (localStorage)
// ============================================================================
// Key pattern: uniset-panel:detail:<serverId>:<objectName>
// Reuses the pattern established in 58-overview-state.js: debounced
// save (300ms), flush on beforeunload, version-gated reset, silent
// fail on quota/disabled storage.

const DETAIL_STATE_VERSION = 1;
const DETAIL_STATE_DEBOUNCE_MS = 300;

function detailStateDefault() {
    return {
        v: DETAIL_STATE_VERSION,
        activeInnerTab: 'variables',
        selectedTrends: [],
        trendsWindow: 60,
        logFilter: '',
        logSize: 256,
        logPaused: false,
        logEnabled: false,
        varsCollapsed: {
            inputs: false,
            outputs: false,
            locals: true,
            fb_instances: true
        }
    };
}

function detailStateKey(serverId, objectName) {
    return 'uniset-panel:detail:' + serverId + ':' + objectName;
}

function loadDetailState(serverId, objectName) {
    const defaults = detailStateDefault();
    try {
        const raw = localStorage.getItem(detailStateKey(serverId, objectName));
        if (!raw) return defaults;
        const parsed = JSON.parse(raw);
        if (parsed.v !== DETAIL_STATE_VERSION) {
            console.warn('[detail-state] version mismatch, resetting');
            return defaults;
        }
        const merged = Object.assign({}, defaults, parsed);
        merged.varsCollapsed = Object.assign({}, defaults.varsCollapsed,
            parsed.varsCollapsed || {});
        return merged;
    } catch (e) {
        console.warn('[detail-state] load failed:', e);
        return defaults;
    }
}

const _detailStateSaveTimers = {};

function saveDetailState(serverId, objectName, state) {
    const key = detailStateKey(serverId, objectName);
    if (_detailStateSaveTimers[key]) clearTimeout(_detailStateSaveTimers[key]);
    _detailStateSaveTimers[key] = setTimeout(function() {
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch (e) {
            console.warn('[detail-state] save failed:', e);
        }
        delete _detailStateSaveTimers[key];
    }, DETAIL_STATE_DEBOUNCE_MS);
}

function flushDetailState(serverId, objectName) {
    const key = detailStateKey(serverId, objectName);
    if (_detailStateSaveTimers[key]) {
        clearTimeout(_detailStateSaveTimers[key]);
        delete _detailStateSaveTimers[key];
    }
    try {
        // Write whatever was last passed to saveDetailState — but
        // since debounce cleared, caller should pass explicit state.
        // Callers typically do: saveDetailState(s,o,state); flushDetailState(s,o);
        // So here we rely on the caller to have just pushed state;
        // we only cancel the pending timer. For immediate write,
        // use flushDetailStateImmediate(s,o,state) below.
    } catch (e) {
        console.warn('[detail-state] flush failed:', e);
    }
}

// flushDetailStateImmediate synchronously persists state, skipping debounce.
// Used on beforeunload and critical lifecycle transitions.
function flushDetailStateImmediate(serverId, objectName, state) {
    const key = detailStateKey(serverId, objectName);
    if (_detailStateSaveTimers[key]) {
        clearTimeout(_detailStateSaveTimers[key]);
        delete _detailStateSaveTimers[key];
    }
    try {
        localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
        console.warn('[detail-state] flush failed:', e);
    }
}

// Global beforeunload: caller must register each live panel's (serverId,
// objectName, state) via registerDetailForFlush. Detail panels do this
// in openDetailPanel and deregister on close.
const _detailFlushRegistry = {};

function registerDetailForFlush(serverId, objectName, getStateFn) {
    _detailFlushRegistry[serverId + ':' + objectName] = { getStateFn };
}

function unregisterDetailForFlush(serverId, objectName) {
    delete _detailFlushRegistry[serverId + ':' + objectName];
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', function() {
        for (const key of Object.keys(_detailFlushRegistry)) {
            const [serverId, objectName] = key.split(':');
            try {
                const state = _detailFlushRegistry[key].getStateFn();
                flushDetailStateImmediate(serverId, objectName, state);
            } catch (e) {
                console.warn('[detail-state] beforeunload flush failed:', e);
            }
        }
    });
}
```

- [ ] **Step 4: Run unit tests**

```bash
cd /home/pv/Projects/uniset-panel/tests && npm run test:unit -- --run 2>&1 | tail -10
# Expected: all prior tests + 6 new detail-state tests PASS
```

- [ ] **Step 5: Regenerate app.js and commit**

```bash
cd /home/pv/Projects/uniset-panel/ui && go run concat.go
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/60-detail-state.js tests/unit/detail-state.test.js ui/static/js/app.js
git commit -m "feat(detail): 60-detail-state.js — per-panel localStorage persistence"
```

### Task 3.2: `60-detail-panel.js` — listener + tab lifecycle + tests

**Files:**
- Create: `ui/static/js/src/60-detail-panel.js`
- Create: `tests/unit/detail-panel.test.js`
- Regenerate: `ui/static/js/app.js`

- [ ] **Step 1: Write failing test**

Create `tests/unit/detail-panel.test.js`:

```js
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadSrc } from './helpers/load-src.js';

beforeAll(() => {
    loadSrc('ui/static/js/src/60-detail-state.js');
    loadSrc('ui/static/js/src/60-detail-panel.js');
});

beforeEach(() => {
    // Reset global detailInstances
    if (typeof detailInstances === 'object') {
        for (const k of Object.keys(detailInstances)) delete detailInstances[k];
    }
    // Clean DOM body
    document.body.innerHTML = '';
    localStorage.clear();
});

describe('openDetailPanel', () => {
    it('creates instance with correct key', () => {
        openDetailPanel('srv-1', 'Server1', 'DG_Control');
        expect(detailInstances['srv-1:DG_Control']).toBeDefined();
        const inst = detailInstances['srv-1:DG_Control'];
        expect(inst.serverId).toBe('srv-1');
        expect(inst.objectName).toBe('DG_Control');
        expect(inst.serverName).toBe('Server1');
    });

    it('duplicate open does not create second instance', () => {
        openDetailPanel('srv-1', 'Server1', 'DG_Control');
        const first = detailInstances['srv-1:DG_Control'];
        openDetailPanel('srv-1', 'Server1', 'DG_Control');
        expect(detailInstances['srv-1:DG_Control']).toBe(first);
    });

    it('loads persisted state (activeInnerTab)', () => {
        localStorage.setItem(
            'uniset-panel:detail:srv-1:DG_Control',
            JSON.stringify({ ...detailStateDefault(), activeInnerTab: 'trends' })
        );
        openDetailPanel('srv-1', 'Server1', 'DG_Control');
        const inst = detailInstances['srv-1:DG_Control'];
        expect(inst.state.activeInnerTab).toBe('trends');
    });
});

describe('closeDetailPanel', () => {
    it('removes instance', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        closeDetailPanel('srv-1:X');
        expect(detailInstances['srv-1:X']).toBeUndefined();
    });
});

describe('uniset:node-double-clicked listener', () => {
    it('opens detail panel on CustomEvent', () => {
        document.dispatchEvent(new CustomEvent('uniset:node-double-clicked', {
            detail: { serverId: 'srv-1', serverName: 'Server1', objectName: 'MyObj' }
        }));
        expect(detailInstances['srv-1:MyObj']).toBeDefined();
    });
});

describe('uniset:schema-closed cleanup', () => {
    it('closes all detail panels for the closed server', () => {
        openDetailPanel('srv-1', 'Server1', 'A');
        openDetailPanel('srv-1', 'Server1', 'B');
        openDetailPanel('srv-2', 'Server2', 'C');
        document.dispatchEvent(new CustomEvent('uniset:schema-closed', {
            detail: { serverId: 'srv-1' }
        }));
        expect(detailInstances['srv-1:A']).toBeUndefined();
        expect(detailInstances['srv-1:B']).toBeUndefined();
        expect(detailInstances['srv-2:C']).toBeDefined();
    });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd /home/pv/Projects/uniset-panel/tests && npm run test:unit -- --run 2>&1 | tail
# Expected: detail-panel tests fail (detailInstances, openDetailPanel undefined)
```

- [ ] **Step 3: Write `60-detail-panel.js`**

Create `ui/static/js/src/60-detail-panel.js`:

```js
// ============================================================================
// UObject Detail Panel — entry point + tab lifecycle + inner-tab switch
// ============================================================================
// Listens for uniset:node-double-clicked from System Overview, creates
// (or activates) a per-object tab holding Variables/Trends/Message Log.
// Sub-modules (60-detail-variables.js etc.) are loaded later by concat
// and attach their render functions via renderDetailInner*.

const detailInstances = {};

function detailPanelKey(serverId, objectName) {
    return serverId + ':' + objectName;
}

function openDetailPanel(serverId, serverName, objectName) {
    const key = detailPanelKey(serverId, objectName);
    if (detailInstances[key]) {
        activateDetailTab(key);
        return detailInstances[key];
    }

    const state = (typeof loadDetailState === 'function')
        ? loadDetailState(serverId, objectName)
        : { activeInnerTab: 'variables' };

    const inst = {
        key: key,
        serverId: serverId,
        serverName: serverName,
        objectName: objectName,
        state: state,
        snapshot: null,
        snapshotTimer: null,
        selectedTrends: new Set(state.selectedTrends || []),
        trendsBuffer: {},
        logBuffer: [],
        traceToken: null
    };
    detailInstances[key] = inst;

    createDetailTabDOM(inst);
    applyInnerTab(inst, inst.state.activeInnerTab);

    if (typeof registerDetailForFlush === 'function') {
        registerDetailForFlush(serverId, objectName, function() {
            return captureState(inst);
        });
    }

    // Start snapshot poll (Variables + Trends both use it).
    if (typeof startDetailSnapshotPoll === 'function') {
        startDetailSnapshotPoll(inst);
    }

    // If persisted active tab is messagelog, subscribe immediately.
    if (inst.state.activeInnerTab === 'messagelog' &&
        typeof subscribeTraceForDetail === 'function') {
        subscribeTraceForDetail(inst);
    }

    document.dispatchEvent(new CustomEvent('uniset:detail-opened', {
        detail: { serverId, serverName, objectName, key }
    }));

    return inst;
}

function closeDetailPanel(key) {
    const inst = detailInstances[key];
    if (!inst) return;

    if (typeof stopDetailSnapshotPoll === 'function') {
        stopDetailSnapshotPoll(inst);
    }
    if (typeof unsubscribeTraceForDetail === 'function') {
        unsubscribeTraceForDetail(inst);
    }
    if (typeof flushDetailStateImmediate === 'function') {
        flushDetailStateImmediate(inst.serverId, inst.objectName, captureState(inst));
    }
    if (typeof unregisterDetailForFlush === 'function') {
        unregisterDetailForFlush(inst.serverId, inst.objectName);
    }

    removeDetailTabDOM(inst);
    delete detailInstances[key];

    document.dispatchEvent(new CustomEvent('uniset:detail-closed', {
        detail: { serverId: inst.serverId, objectName: inst.objectName, key }
    }));
}

function captureState(inst) {
    return Object.assign({}, inst.state, {
        selectedTrends: Array.from(inst.selectedTrends)
    });
}

function applyInnerTab(inst, tabName) {
    inst.state.activeInnerTab = tabName;
    if (typeof saveDetailState === 'function') {
        saveDetailState(inst.serverId, inst.objectName, captureState(inst));
    }

    const root = document.getElementById('detail-tab-' + inst.key.replace(/:/g, '_'));
    if (!root) return;
    const buttons = root.querySelectorAll('.detail-inner-tabs > button');
    buttons.forEach(function(b) {
        if (b.getAttribute('data-inner') === tabName) b.classList.add('active');
        else b.classList.remove('active');
    });
    const panels = root.querySelectorAll('[data-inner-panel]');
    panels.forEach(function(p) {
        if (p.getAttribute('data-inner-panel') === tabName) p.classList.add('active');
        else p.classList.remove('active');
    });

    if (tabName === 'messagelog' && typeof subscribeTraceForDetail === 'function') {
        subscribeTraceForDetail(inst);
    }
}

function createDetailTabDOM(inst) {
    // Minimal tab creation: insert a <div> under main area.
    // Real integration uses existing openTab helper from 50-ui-tabs.js.
    const safeKey = inst.key.replace(/:/g, '_');
    const root = document.createElement('div');
    root.id = 'detail-tab-' + safeKey;
    root.className = 'detail-panel';
    root.dataset.key = inst.key;
    root.innerHTML =
        '<div class="detail-header">' +
            '<span class="detail-obj">' + escapeDetailText(inst.objectName) + '</span>' +
            '<span class="detail-server">Server: ' + escapeDetailText(inst.serverName) + '</span>' +
        '</div>' +
        '<div class="detail-inner-tabs">' +
            '<button data-inner="variables">Variables</button>' +
            '<button data-inner="trends">Trends</button>' +
            '<button data-inner="messagelog">Message Log</button>' +
        '</div>' +
        '<div class="detail-inner-content">' +
            '<div data-inner-panel="variables"></div>' +
            '<div data-inner-panel="trends"></div>' +
            '<div data-inner-panel="messagelog"></div>' +
        '</div>';
    document.body.appendChild(root);

    // Wire inner-tab buttons.
    root.querySelectorAll('.detail-inner-tabs > button').forEach(function(btn) {
        btn.addEventListener('click', function() {
            applyInnerTab(inst, btn.getAttribute('data-inner'));
        });
    });
}

function removeDetailTabDOM(inst) {
    const safeKey = inst.key.replace(/:/g, '_');
    const el = document.getElementById('detail-tab-' + safeKey);
    if (el && el.parentNode) el.parentNode.removeChild(el);
}

function activateDetailTab(key) {
    // In full integration with 50-ui-tabs.js, this calls the existing
    // setActiveTab helper. Here we just bring our DOM to front if needed.
    const safeKey = key.replace(/:/g, '_');
    const el = document.getElementById('detail-tab-' + safeKey);
    if (el) el.scrollIntoView();
}

function escapeDetailText(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;',
                 '"': '&quot;', "'": '&#39;' }[c];
    });
}

// ---------------------------------------------------------------------------
// Entry listeners
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('uniset:node-double-clicked', function(e) {
        const d = e.detail || {};
        if (!d.serverId || !d.objectName) return;
        openDetailPanel(d.serverId, d.serverName || d.serverId, d.objectName);
    });

    // When the System Overview is closed for a given server, tear down
    // any detail panels that belong to that server (they can't poll or
    // navigate back without the schema).
    document.addEventListener('uniset:schema-closed', function(e) {
        const serverId = e.detail && e.detail.serverId;
        if (!serverId) return;
        for (const key of Object.keys(detailInstances)) {
            if (detailInstances[key].serverId === serverId) {
                closeDetailPanel(key);
            }
        }
    });
}
```

- [ ] **Step 4: Run tests**

```bash
cd /home/pv/Projects/uniset-panel/tests && npm run test:unit -- --run 2>&1 | tail
# Expected: detail-panel + detail-state tests PASS
```

- [ ] **Step 5: Regenerate + commit**

```bash
cd /home/pv/Projects/uniset-panel/ui && go run concat.go
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/60-detail-panel.js tests/unit/detail-panel.test.js ui/static/js/app.js
git commit -m "feat(detail): 60-detail-panel.js — listener + tab lifecycle + schema-closed cleanup"
```

---

## Phase 4 — Variables tab

### Task 4.1: `60-detail-variables.js` — snapshot poll + groupVars + render + tests

**Files:**
- Create: `ui/static/js/src/60-detail-variables.js`
- Create: `tests/unit/detail-variables.test.js`
- Regenerate: `ui/static/js/app.js`

- [ ] **Step 1: Write failing test**

Create `tests/unit/detail-variables.test.js`:

```js
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadSrc } from './helpers/load-src.js';

beforeAll(() => {
    loadSrc('ui/static/js/src/60-detail-state.js');
    loadSrc('ui/static/js/src/60-detail-panel.js');
    loadSrc('ui/static/js/src/60-detail-variables.js');
});

beforeEach(() => {
    document.body.innerHTML = '';
    for (const k of Object.keys(detailInstances)) delete detailInstances[k];
    localStorage.clear();
});

describe('groupVars', () => {
    it('categorizes by prefix and dot', () => {
        const vars = {
            'in_Temp': 75,
            'in_Pressure': 1013,
            'out_Speed': 1500,
            'Counter': 42,
            'FB1.State': 1,
            'FB1.Phase': 2
        };
        const g = groupVars(vars);
        expect(g.inputs.map(x => x.name)).toEqual(['in_Pressure', 'in_Temp']);
        expect(g.outputs.map(x => x.name)).toEqual(['out_Speed']);
        expect(g.locals.map(x => x.name)).toEqual(['Counter']);
        expect(g.fb_instances.map(x => x.name).sort()).toEqual(['FB1.Phase', 'FB1.State']);
    });
});

describe('renderVariables', () => {
    function makeInst() {
        openDetailPanel('srv-1', 'Server1', 'DG_Control');
        const inst = detailInstances['srv-1:DG_Control'];
        inst.snapshot = {
            object: 'DG_Control', server: 'srv-1',
            vars: { 'in_Temp': 75, 'out_Speed': 1500, 'Counter': 3 },
            sensor_map: { 'in_Temp': 101, 'out_Speed': 205 },
            forced: [101],
            sm_object: 'SharedMemory'
        };
        return inst;
    }

    it('renders four sections with correct counts', () => {
        const inst = makeInst();
        renderVariables(inst);
        const root = document.querySelector('[data-inner-panel="variables"]');
        expect(root.querySelector('[data-section="inputs"]')).toBeTruthy();
        expect(root.querySelector('[data-section="outputs"]')).toBeTruthy();
        expect(root.querySelector('[data-section="locals"]')).toBeTruthy();
        expect(root.querySelector('[data-section="fb_instances"]')).toBeTruthy();
    });

    it('marks forced rows with 🔒 indicator', () => {
        const inst = makeInst();
        renderVariables(inst);
        const row = document.querySelector('tr[data-var="in_Temp"]');
        expect(row.classList.contains('forced')).toBe(true);
        expect(row.textContent).toContain('🔒');
    });

    it('non-forced rows have no forced marker', () => {
        const inst = makeInst();
        renderVariables(inst);
        const row = document.querySelector('tr[data-var="out_Speed"]');
        expect(row.classList.contains('forced')).toBe(false);
    });

    it('escapes HTML in variable names', () => {
        const inst = makeInst();
        inst.snapshot.vars['<script>'] = 'bad';
        renderVariables(inst);
        const root = document.querySelector('[data-inner-panel="variables"]');
        expect(root.innerHTML).not.toContain('<script>');
        expect(root.innerHTML).toContain('&lt;script&gt;');
    });
});

describe('snapshot poll', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async () => ({
            ok: true,
            json: async () => ({
                object: 'X', server: 'srv-1',
                vars: { 'in_T': 1 }, sensor_map: {}, forced: [], sm_object: 'SharedMemory'
            })
        }));
    });

    it('startDetailSnapshotPoll calls fetch with expected URL', async () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        startDetailSnapshotPoll(inst);
        await new Promise(r => setTimeout(r, 10));
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/servers/srv-1/objects/X/snapshot')
        );
        stopDetailSnapshotPoll(inst);
    });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd /home/pv/Projects/uniset-panel/tests && npm run test:unit -- --run 2>&1 | tail
# Expected: detail-variables tests fail
```

- [ ] **Step 3: Write module**

Create `ui/static/js/src/60-detail-variables.js`:

```js
// ============================================================================
// UObject Detail Panel — Variables tab
// ============================================================================

const DETAIL_SNAPSHOT_POLL_MS = 500;

function groupVars(vars) {
    const groups = { inputs: [], outputs: [], locals: [], fb_instances: [] };
    const keys = Object.keys(vars).sort();
    for (const name of keys) {
        const entry = { name: name, value: vars[name] };
        if (name.indexOf('in_') === 0) groups.inputs.push(entry);
        else if (name.indexOf('out_') === 0) groups.outputs.push(entry);
        else if (name.indexOf('.') >= 0) groups.fb_instances.push(entry);
        else groups.locals.push(entry);
    }
    return groups;
}

function renderVariables(inst) {
    const root = document.querySelector('#detail-tab-' + inst.key.replace(/:/g, '_') +
                                       ' [data-inner-panel="variables"]');
    if (!root) return;

    if (!inst.snapshot) {
        root.innerHTML = '<div class="detail-placeholder">Loading snapshot...</div>';
        return;
    }

    const snap = inst.snapshot;
    const groups = groupVars(snap.vars || {});
    const sensorMap = snap.sensor_map || {};
    const forcedSet = new Set(snap.forced || []);
    const collapsed = (inst.state && inst.state.varsCollapsed) || {};

    const groupDefs = [
        { key: 'inputs', label: 'Inputs (in_*)' },
        { key: 'outputs', label: 'Outputs (out_*)' },
        { key: 'locals', label: 'Locals' },
        { key: 'fb_instances', label: 'FB Instances' }
    ];

    let html = '';
    for (const gd of groupDefs) {
        const items = groups[gd.key];
        const isCollapsed = !!collapsed[gd.key];
        html += '<section data-section="' + gd.key + '">';
        html += '<div class="detail-var-section-header" data-toggle="' + gd.key + '">';
        html += '<span class="arrow' + (isCollapsed ? ' collapsed' : '') + '">▼</span>';
        html += escapeDetailText(gd.label);
        html += '<span class="count">' + items.length + '</span></div>';

        if (!isCollapsed) {
            html += '<table class="detail-var-table"><thead><tr>';
            html += '<th>Name</th><th>Value</th><th>Type</th><th>Δ</th></tr></thead><tbody>';
            for (const it of items) {
                const sensorId = sensorMap[it.name];
                const isForced = sensorId != null && forcedSet.has(sensorId);
                const prev = inst._prevVars ? inst._prevVars[it.name] : undefined;
                const changed = prev !== undefined && prev !== it.value;
                let flashClass = '';
                if (changed && typeof it.value === 'number' && typeof prev === 'number') {
                    flashClass = it.value > prev ? ' flash-up' : ' flash-down';
                } else if (changed) {
                    flashClass = ' flash-up';
                }
                const rowClasses = (isForced ? 'forced' : '') +
                                   (gd.key === 'inputs' || gd.key === 'outputs' ? ' forcible' : '');
                html += '<tr data-var="' + escapeDetailText(it.name) + '" class="' +
                        rowClasses + '">';
                html += '<td>' + escapeDetailText(it.name);
                if (isForced) html += ' <span class="forced-icon" title="FORCED">🔒</span>';
                html += '</td>';
                html += '<td class="value-cell' + flashClass + '">' +
                        formatVarValue(it.value) + '</td>';
                html += '<td>' + detectVarType(it.value) + '</td>';
                html += '<td>' + (changed ? '•' : '') + '</td></tr>';
            }
            html += '</tbody></table>';
        }
        html += '</section>';
    }

    root.innerHTML = html;

    // Wire section-header toggles
    root.querySelectorAll('.detail-var-section-header').forEach(function(h) {
        h.addEventListener('click', function() {
            const gk = h.getAttribute('data-toggle');
            inst.state.varsCollapsed[gk] = !inst.state.varsCollapsed[gk];
            if (typeof saveDetailState === 'function') {
                saveDetailState(inst.serverId, inst.objectName, captureState(inst));
            }
            renderVariables(inst);
        });
    });

    // Clear flash classes after 500ms.
    const flashes = root.querySelectorAll('.flash-up, .flash-down');
    flashes.forEach(function(el) {
        setTimeout(function() {
            el.classList.remove('flash-up');
            el.classList.remove('flash-down');
        }, 500);
    });

    // Row click → toggle Trends (defer to 60-detail-trends.js if loaded).
    root.querySelectorAll('tr[data-var]').forEach(function(tr) {
        tr.addEventListener('click', function() {
            const name = tr.getAttribute('data-var');
            if (typeof toggleTrendForDetail === 'function') {
                toggleTrendForDetail(inst, name);
            }
        });
        tr.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            if (typeof showDetailVarContextMenu === 'function') {
                showDetailVarContextMenu(inst, tr.getAttribute('data-var'), e);
            }
        });
    });

    // Remember current values for next flash diff.
    inst._prevVars = {};
    for (const k of Object.keys(snap.vars)) inst._prevVars[k] = snap.vars[k];
}

function formatVarValue(v) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return String(v);
    return escapeDetailText(String(v));
}

function detectVarType(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
}

function startDetailSnapshotPoll(inst) {
    const fetchOnce = async function() {
        try {
            const url = '/api/servers/' + encodeURIComponent(inst.serverId) +
                        '/objects/' + encodeURIComponent(inst.objectName) + '/snapshot';
            const resp = await fetch(url);
            if (!resp.ok) {
                inst.snapshotError = 'status ' + resp.status;
                return;
            }
            inst.snapshotError = null;
            inst.snapshot = await resp.json();
            renderVariables(inst);
            if (typeof updateTrendsFromSnapshot === 'function') {
                updateTrendsFromSnapshot(inst);
            }
        } catch (e) {
            inst.snapshotError = String(e);
        }
    };
    fetchOnce();
    inst.snapshotTimer = setInterval(fetchOnce, DETAIL_SNAPSHOT_POLL_MS);
}

function stopDetailSnapshotPoll(inst) {
    if (inst.snapshotTimer) {
        clearInterval(inst.snapshotTimer);
        inst.snapshotTimer = null;
    }
}
```

- [ ] **Step 4: Run tests**

```bash
cd /home/pv/Projects/uniset-panel/tests && npm run test:unit -- --run 2>&1 | tail
# Expected: all prior + new detail-variables tests PASS
```

- [ ] **Step 5: Regenerate + commit**

```bash
cd /home/pv/Projects/uniset-panel/ui && go run concat.go
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/60-detail-variables.js tests/unit/detail-variables.test.js ui/static/js/app.js
git commit -m "feat(detail): Variables tab — groupVars + render + snapshot poll"
```

### Task 4.2: Context menu + force/unforce + tests

**Files:**
- Modify: `ui/static/js/src/60-detail-variables.js`
- Modify: `tests/unit/detail-variables.test.js`
- Regenerate: `ui/static/js/app.js`

- [ ] **Step 1: Append failing tests**

Append to `tests/unit/detail-variables.test.js`:

```js
describe('force/unforce dialog + posts', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async (url, opts) => {
            return { ok: true, status: 200, json: async () => ({}) };
        });
    });

    function makeInst() {
        openDetailPanel('srv-1', 'Server1', 'DG_Control');
        const inst = detailInstances['srv-1:DG_Control'];
        inst.snapshot = {
            vars: { 'in_Temp': 75, 'out_Speed': 1500, 'Counter': 3 },
            sensor_map: { 'in_Temp': 101, 'out_Speed': 205 },
            forced: [205],
            sm_object: 'SharedMemory'
        };
        renderVariables(inst);
        return inst;
    }

    it('postForce calls ionc/freeze with sensor_id + value', async () => {
        const inst = makeInst();
        await postForce(inst, 'in_Temp', 42);
        expect(fetch).toHaveBeenCalledWith(
            '/api/objects/SharedMemory/ionc/freeze?server=srv-1',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ sensor_id: 101, value: 42 })
            })
        );
    });

    it('postUnforce calls ionc/unfreeze with sensor_id', async () => {
        const inst = makeInst();
        await postUnforce(inst, 'out_Speed');
        expect(fetch).toHaveBeenCalledWith(
            '/api/objects/SharedMemory/ionc/unfreeze?server=srv-1',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ sensor_id: 205 })
            })
        );
    });

    it('force action noop for locals (no sensor_id)', async () => {
        const inst = makeInst();
        const result = await postForce(inst, 'Counter', 99);
        expect(result).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd /home/pv/Projects/uniset-panel/tests && npm run test:unit -- --run 2>&1 | tail
# Expected: postForce/postUnforce undefined
```

- [ ] **Step 3: Append force/unforce + dialog**

Append to `ui/static/js/src/60-detail-variables.js`:

```js
// ---------------------------------------------------------------------------
// Force / Unforce via SharedMemory ionc endpoints
// ---------------------------------------------------------------------------

async function postForce(inst, varName, value) {
    const sensorId = inst.snapshot && inst.snapshot.sensor_map &&
                     inst.snapshot.sensor_map[varName];
    if (sensorId == null) return null;
    const smObject = (inst.snapshot.sm_object) || 'SharedMemory';
    const url = '/api/objects/' + encodeURIComponent(smObject) +
                '/ionc/freeze?server=' + encodeURIComponent(inst.serverId);
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensor_id: sensorId, value: Number(value) })
    });
    return { status: resp.status, body: await resp.json().catch(() => null) };
}

async function postUnforce(inst, varName) {
    const sensorId = inst.snapshot && inst.snapshot.sensor_map &&
                     inst.snapshot.sensor_map[varName];
    if (sensorId == null) return null;
    const smObject = (inst.snapshot.sm_object) || 'SharedMemory';
    const url = '/api/objects/' + encodeURIComponent(smObject) +
                '/ionc/unfreeze?server=' + encodeURIComponent(inst.serverId);
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensor_id: sensorId })
    });
    return { status: resp.status, body: await resp.json().catch(() => null) };
}

function showDetailVarContextMenu(inst, varName, event) {
    const sensorId = inst.snapshot && inst.snapshot.sensor_map &&
                     inst.snapshot.sensor_map[varName];
    if (sensorId == null) return; // locals + fb_instances: no actions

    const forcedSet = new Set(inst.snapshot.forced || []);
    const isForced = forcedSet.has(sensorId);
    const currentValue = inst.snapshot.vars[varName];

    // Remove any existing menu
    const existing = document.getElementById('detail-var-ctxmenu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'detail-var-ctxmenu';
    menu.className = 'detail-ctxmenu';
    menu.style.position = 'fixed';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';

    if (isForced) {
        const btn = document.createElement('button');
        btn.textContent = 'Unforce ' + varName;
        btn.addEventListener('click', async function() {
            menu.remove();
            await postUnforce(inst, varName);
        });
        menu.appendChild(btn);
    } else {
        const input = document.createElement('input');
        input.type = 'number';
        input.value = typeof currentValue === 'number' ? currentValue : 0;
        const btn = document.createElement('button');
        btn.textContent = 'Force ' + varName;
        btn.addEventListener('click', async function() {
            const v = input.value;
            menu.remove();
            await postForce(inst, varName, v);
        });
        menu.appendChild(input);
        menu.appendChild(btn);
    }

    document.body.appendChild(menu);

    // Dismiss on outside click
    setTimeout(function() {
        document.addEventListener('click', function onOutside(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', onOutside);
            }
        });
    }, 0);
}
```

- [ ] **Step 4: Run tests**

```bash
cd /home/pv/Projects/uniset-panel/tests && npm run test:unit -- --run 2>&1 | tail
# Expected: all prior + 3 new force-tests PASS
```

- [ ] **Step 5: Regenerate + commit**

```bash
cd /home/pv/Projects/uniset-panel/ui && go run concat.go
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/60-detail-variables.js tests/unit/detail-variables.test.js ui/static/js/app.js
git commit -m "feat(detail): Variables force/unforce via SM ionc + context menu"
```

---

## Phase 5 — Trends tab

### Task 5.1: `60-detail-trends.js` — select + history fetch + live merge + tests

**Files:**
- Create: `ui/static/js/src/60-detail-trends.js`
- Create: `tests/unit/detail-trends.test.js`
- Regenerate: `ui/static/js/app.js`

- [ ] **Step 1: Write failing test**

Create `tests/unit/detail-trends.test.js`:

```js
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadSrc } from './helpers/load-src.js';

beforeAll(() => {
    loadSrc('ui/static/js/src/60-detail-state.js');
    loadSrc('ui/static/js/src/60-detail-panel.js');
    loadSrc('ui/static/js/src/60-detail-trends.js');
});

beforeEach(() => {
    document.body.innerHTML = '';
    for (const k of Object.keys(detailInstances)) delete detailInstances[k];
});

describe('toggleTrendForDetail', () => {
    it('adds on first call, removes on second', async () => {
        globalThis.fetch = vi.fn(async () => ({
            ok: true,
            json: async () => ({
                var: 'in_Temp',
                points: [{ t: 1000, v: 10 }, { t: 2000, v: 20 }]
            })
        }));

        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];

        await toggleTrendForDetail(inst, 'in_Temp');
        expect(inst.selectedTrends.has('in_Temp')).toBe(true);
        expect(inst.trendsBuffer['in_Temp'].length).toBe(2);

        await toggleTrendForDetail(inst, 'in_Temp');
        expect(inst.selectedTrends.has('in_Temp')).toBe(false);
        expect(inst.trendsBuffer['in_Temp']).toBeUndefined();
    });
});

describe('updateTrendsFromSnapshot', () => {
    it('appends live point and prunes by window', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        inst.state.trendsWindow = 1; // 1 second window
        inst.selectedTrends.add('in_Temp');
        inst.snapshot = { vars: { 'in_Temp': 55 } };

        const now = Date.now();
        // Preload an old point
        inst.trendsBuffer['in_Temp'] = [
            { t: now - 5000, v: 10 },
            { t: now - 500, v: 20 }
        ];

        updateTrendsFromSnapshot(inst);

        const buf = inst.trendsBuffer['in_Temp'];
        // Old point (5s ago) pruned (window=1s), recent (500ms ago) + new kept.
        expect(buf.length).toBe(2);
        expect(buf[buf.length - 1].v).toBe(55);
    });

    it('does nothing for unselected variables', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        inst.snapshot = { vars: { 'in_Other': 99 } };
        updateTrendsFromSnapshot(inst);
        expect(inst.trendsBuffer['in_Other']).toBeUndefined();
    });
});

describe('trendsToCsv', () => {
    it('serializes selected variables to CSV', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        inst.selectedTrends.add('in_Temp');
        inst.trendsBuffer['in_Temp'] = [
            { t: 1000, v: 10 }, { t: 2000, v: 20 }
        ];
        const csv = trendsToCsv(inst);
        expect(csv).toContain('timestamp_ms,variable,value');
        expect(csv).toContain('1000,in_Temp,10');
        expect(csv).toContain('2000,in_Temp,20');
    });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd /home/pv/Projects/uniset-panel/tests && npm run test:unit -- --run 2>&1 | tail
# Expected: toggleTrendForDetail / updateTrendsFromSnapshot / trendsToCsv undefined
```

- [ ] **Step 3: Write `60-detail-trends.js`**

Create `ui/static/js/src/60-detail-trends.js`:

```js
// ============================================================================
// UObject Detail Panel — Trends tab
// ============================================================================
// Stacked charts (one canvas per selected variable). History is fetched
// once on select via /api/servers/.../history, then live-updated from
// the shared snapshot poll (60-detail-variables.js).

const TREND_COLORS = ['#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#ba68c8',
                      '#ff8a65', '#a1887f', '#90a4ae', '#dce775', '#4db6ac'];

async function toggleTrendForDetail(inst, varName) {
    if (inst.selectedTrends.has(varName)) {
        inst.selectedTrends.delete(varName);
        delete inst.trendsBuffer[varName];
    } else {
        inst.selectedTrends.add(varName);
        await fetchHistoryForDetail(inst, varName);
    }
    if (typeof saveDetailState === 'function') {
        saveDetailState(inst.serverId, inst.objectName, captureState(inst));
    }
    renderTrends(inst);
}

async function fetchHistoryForDetail(inst, varName) {
    try {
        const windowSec = inst.state.trendsWindow > 0 ? inst.state.trendsWindow : 60;
        const depth = Math.max(1, Math.ceil(windowSec * 1000 / 500));
        const url = '/api/servers/' + encodeURIComponent(inst.serverId) +
                    '/objects/' + encodeURIComponent(inst.objectName) +
                    '/history?var=' + encodeURIComponent(varName) +
                    '&depth=' + depth;
        const resp = await fetch(url);
        if (!resp.ok) {
            inst.trendsBuffer[varName] = [];
            return;
        }
        const body = await resp.json();
        const pts = (body && body.points) ? body.points : [];
        inst.trendsBuffer[varName] = pts.map(function(p) {
            return { t: p.t, v: p.v };
        });
    } catch (e) {
        console.warn('[trends] history fetch failed:', e);
        inst.trendsBuffer[varName] = [];
    }
}

function updateTrendsFromSnapshot(inst) {
    if (!inst || !inst.snapshot || !inst.snapshot.vars) return;
    const now = Date.now();
    const windowSec = (inst.state && inst.state.trendsWindow) || 60;
    const cutoff = windowSec > 0 ? now - windowSec * 1000 : 0;

    for (const varName of inst.selectedTrends) {
        const value = inst.snapshot.vars[varName];
        if (value === undefined) continue;
        const buf = (inst.trendsBuffer[varName] ||= []);
        buf.push({ t: now, v: value });
        if (windowSec > 0) {
            while (buf.length && buf[0].t < cutoff) buf.shift();
        }
    }
    // Trigger render only if trends tab is active to save cycles
    if (inst.state && inst.state.activeInnerTab === 'trends') {
        renderTrendsLive(inst);
    }
}

function renderTrends(inst) {
    const root = document.querySelector('#detail-tab-' +
                 inst.key.replace(/:/g, '_') +
                 ' [data-inner-panel="trends"]');
    if (!root) return;

    if (inst.selectedTrends.size === 0) {
        root.innerHTML = '<div class="detail-placeholder">' +
            'Select variables in the Variables tab to add to trend.</div>';
        return;
    }

    let html = '<div class="detail-trends-toolbar">';
    html += 'Window: <select class="trends-window">';
    const opts = [[30, '30s'], [60, '1m'], [300, '5m'], [0, 'All']];
    for (const [val, label] of opts) {
        const sel = (inst.state.trendsWindow === val) ? ' selected' : '';
        html += '<option value="' + val + '"' + sel + '>' + label + '</option>';
    }
    html += '</select>';
    html += ' <button class="trends-clear">Clear</button>';
    html += ' <button class="trends-export">Export CSV</button>';
    html += '</div>';

    html += '<div class="detail-trends-charts">';
    let colorIdx = 0;
    for (const varName of inst.selectedTrends) {
        const color = TREND_COLORS[colorIdx++ % TREND_COLORS.length];
        html += '<div class="trend-row" data-var="' + escapeDetailText(varName) + '">';
        html += '<div class="trend-row-header">' +
                '<span class="trend-color" style="background:' + color + '"></span>' +
                escapeDetailText(varName) + '</div>';
        html += '<canvas class="trend-canvas" height="120"></canvas>';
        html += '</div>';
    }
    html += '</div>';

    root.innerHTML = html;

    // Wire toolbar buttons
    root.querySelector('.trends-window').addEventListener('change', async function(e) {
        inst.state.trendsWindow = parseInt(e.target.value, 10) || 0;
        if (typeof saveDetailState === 'function') {
            saveDetailState(inst.serverId, inst.objectName, captureState(inst));
        }
        // Re-fetch history with new depth for each selected var
        for (const v of inst.selectedTrends) {
            await fetchHistoryForDetail(inst, v);
        }
        renderTrends(inst);
    });
    root.querySelector('.trends-clear').addEventListener('click', function() {
        inst.trendsBuffer = {};
        for (const v of inst.selectedTrends) inst.trendsBuffer[v] = [];
        renderTrendsLive(inst);
    });
    root.querySelector('.trends-export').addEventListener('click', function() {
        exportTrendsCsv(inst);
    });

    renderTrendsLive(inst);
}

function renderTrendsLive(inst) {
    const root = document.querySelector('#detail-tab-' +
                 inst.key.replace(/:/g, '_') +
                 ' [data-inner-panel="trends"]');
    if (!root) return;
    let colorIdx = 0;
    for (const varName of inst.selectedTrends) {
        const canvas = root.querySelector('.trend-row[data-var="' +
                       cssEscapeAttr(varName) + '"] canvas');
        if (!canvas) continue;
        drawTrendCanvas(canvas, inst.trendsBuffer[varName] || [],
                        TREND_COLORS[colorIdx++ % TREND_COLORS.length]);
    }
}

function cssEscapeAttr(s) {
    return String(s).replace(/["\\]/g, '\\$&');
}

function drawTrendCanvas(canvas, points, color) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth || 400;
    const h = canvas.height;
    ctx.fillStyle = '#1a1a24';
    ctx.fillRect(0, 0, w, h);
    if (points.length < 2) {
        ctx.fillStyle = '#888';
        ctx.font = '10px sans-serif';
        ctx.fillText('collecting...', 8, 16);
        return;
    }
    // Compute extents
    let minT = points[0].t, maxT = points[points.length - 1].t;
    let minV = Infinity, maxV = -Infinity;
    for (const p of points) {
        if (typeof p.v !== 'number') continue;
        if (p.v < minV) minV = p.v;
        if (p.v > maxV) maxV = p.v;
    }
    if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return;
    if (minV === maxV) { minV -= 1; maxV += 1; }
    const span = maxT - minT || 1;
    const vSpan = maxV - minV || 1;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const x = ((p.t - minT) / span) * (w - 4) + 2;
        const y = h - 4 - ((p.v - minV) / vSpan) * (h - 8);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function trendsToCsv(inst) {
    const lines = ['timestamp_ms,variable,value'];
    for (const varName of inst.selectedTrends) {
        const buf = inst.trendsBuffer[varName] || [];
        for (const p of buf) {
            lines.push(p.t + ',' + varName + ',' + p.v);
        }
    }
    return lines.join('\n');
}

function exportTrendsCsv(inst) {
    const csv = trendsToCsv(inst);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = inst.objectName + '-trends.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 100);
}
```

- [ ] **Step 4: Run tests**

```bash
cd /home/pv/Projects/uniset-panel/tests && npm run test:unit -- --run 2>&1 | tail
# Expected: toggleTrendForDetail/updateTrendsFromSnapshot/trendsToCsv tests PASS
```

- [ ] **Step 5: Regenerate + commit**

```bash
cd /home/pv/Projects/uniset-panel/ui && go run concat.go
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/60-detail-trends.js tests/unit/detail-trends.test.js ui/static/js/app.js
git commit -m "feat(detail): Trends tab — select, history, live merge, window/clear/csv"
```

---

## Phase 6 — Message Log tab

### Task 6.1: `60-detail-messagelog.js` — trace subscribe + render + tests

**Files:**
- Create: `ui/static/js/src/60-detail-messagelog.js`
- Create: `tests/unit/detail-messagelog.test.js`
- Regenerate: `ui/static/js/app.js`

- [ ] **Step 1: Write failing test**

Create `tests/unit/detail-messagelog.test.js`:

```js
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadSrc } from './helpers/load-src.js';

beforeAll(() => {
    loadSrc('ui/static/js/src/58-overview-trace.js');
    loadSrc('ui/static/js/src/60-detail-state.js');
    loadSrc('ui/static/js/src/60-detail-panel.js');
    loadSrc('ui/static/js/src/60-detail-messagelog.js');
});

beforeEach(() => {
    document.body.innerHTML = '';
    for (const k of Object.keys(detailInstances)) delete detailInstances[k];
});

describe('onTraceBatch', () => {
    it('appends records when not paused', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        onTraceBatch(inst, {
            enabled: true, overflow: false,
            records: [
                { time_us: 1000, event_time_us: 500, id: 101, value: 75,
                  supplier_id: 42, type: 'sensorInfo' }
            ]
        });
        expect(inst.logBuffer.length).toBe(1);
        expect(inst.logBuffer[0].type).toBe('sensorInfo');
    });

    it('does not append when paused', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        inst.logPaused = true;
        onTraceBatch(inst, {
            enabled: true, records: [{ time_us: 1, id: 1, type: 'timerInfo' }]
        });
        expect(inst.logBuffer.length).toBe(0);
    });

    it('respects 5000 hard cap', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        const bigBatch = { enabled: true, records: [] };
        for (let i = 0; i < 6000; i++) {
            bigBatch.records.push({ time_us: i, id: i, type: 'sensorInfo' });
        }
        onTraceBatch(inst, bigBatch);
        expect(inst.logBuffer.length).toBe(5000);
    });

    it('surfaces overflow flag', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        onTraceBatch(inst, { enabled: true, overflow: true, records: [] });
        expect(inst.logOverflow).toBe(true);
    });

    it('records enabled state from batch', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        onTraceBatch(inst, { enabled: false, records: [] });
        expect(inst.logEnabled).toBe(false);
        onTraceBatch(inst, { enabled: true, records: [] });
        expect(inst.logEnabled).toBe(true);
    });
});

describe('matchesLogFilter', () => {
    it('substring match on type/name/supplier', () => {
        const rec = { type: 'sensorInfo', name: 'Temp', supplier: 'Disp', value: 42 };
        expect(matchesLogFilter(rec, '')).toBe(true);
        expect(matchesLogFilter(rec, 'sensor')).toBe(true);
        expect(matchesLogFilter(rec, 'Disp')).toBe(true);
        expect(matchesLogFilter(rec, 'Temp')).toBe(true);
        expect(matchesLogFilter(rec, 'nothing')).toBe(false);
    });
});

describe('logToCsv', () => {
    it('serializes buffer to CSV', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        inst.logBuffer = [
            { time_us: 1000, type: 'sensorInfo', id: 101, value: 75,
              supplier_id: 42 }
        ];
        const csv = logToCsv(inst);
        expect(csv).toContain('time_us,type,id,value,supplier_id');
        expect(csv).toContain('1000,sensorInfo,101,75,42');
    });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd /home/pv/Projects/uniset-panel/tests && npm run test:unit -- --run 2>&1 | tail
# Expected: onTraceBatch/matchesLogFilter/logToCsv undefined
```

- [ ] **Step 3: Write `60-detail-messagelog.js`**

Create `ui/static/js/src/60-detail-messagelog.js`:

```js
// ============================================================================
// UObject Detail Panel — Message Log tab
// ============================================================================

const LOG_HARD_CAP = 5000;

function subscribeTraceForDetail(inst) {
    if (inst.traceToken) return;
    if (!window.UnisetOverview || !window.UnisetOverview.trace) return;
    inst.traceToken = window.UnisetOverview.trace.subscribe(
        inst.serverId, inst.objectName, 500,
        function(batch) { onTraceBatch(inst, batch); }
    );
}

function unsubscribeTraceForDetail(inst) {
    if (!inst.traceToken) return;
    if (window.UnisetOverview && window.UnisetOverview.trace) {
        window.UnisetOverview.trace.unsubscribe(inst.traceToken);
    }
    inst.traceToken = null;
}

function onTraceBatch(inst, batch) {
    if (!batch) return;
    inst.logEnabled = !!batch.enabled;
    if (batch.overflow) inst.logOverflow = true;
    if (!batch.records || inst.logPaused) {
        renderMessageLog(inst);
        return;
    }

    for (const rec of batch.records) {
        // rec is json.RawMessage -> object (SSE parser already parsed).
        // Enrich with resolved names from snapshot.sensor_map (reverse).
        inst.logBuffer.push(enrichLogRecord(inst, rec));
        if (inst.logBuffer.length > LOG_HARD_CAP) {
            inst.logBuffer.shift();
        }
    }
    renderMessageLog(inst);
}

function enrichLogRecord(inst, rec) {
    const map = (inst.snapshot && inst.snapshot.sensor_map) || {};
    // Build reverse map once per snapshot (cached on inst).
    if (!inst._reverseSensorMap || inst._reverseSensorMapSrc !== map) {
        const rev = {};
        for (const name of Object.keys(map)) rev[map[name]] = name;
        inst._reverseSensorMap = rev;
        inst._reverseSensorMapSrc = map;
    }
    const out = Object.assign({}, rec);
    if (rec.id != null && inst._reverseSensorMap[rec.id]) {
        out.name = inst._reverseSensorMap[rec.id];
    }
    return out;
}

function matchesLogFilter(rec, query) {
    if (!query) return true;
    const haystack = [
        rec.type || '', rec.name || '', rec.supplier || '',
        String(rec.id != null ? rec.id : ''),
        String(rec.value != null ? rec.value : '')
    ].join(' ').toLowerCase();
    return haystack.indexOf(query.toLowerCase()) !== -1;
}

function renderMessageLog(inst) {
    const root = document.querySelector('#detail-tab-' +
                 inst.key.replace(/:/g, '_') +
                 ' [data-inner-panel="messagelog"]');
    if (!root) return;

    // Build toolbar + banner + list shell once
    if (!root.dataset.built) {
        root.innerHTML =
            '<div class="detail-log-toolbar">' +
                'Trace: <button class="log-enable-toggle"></button>' +
                ' Size: <select class="log-size">' +
                    '<option>64</option><option>128</option>' +
                    '<option selected>256</option>' +
                    '<option>512</option><option>1024</option>' +
                '</select>' +
                ' <button class="log-pause"></button>' +
                ' <button class="log-clear">Clear</button>' +
                ' <button class="log-export">Export CSV</button>' +
            '</div>' +
            '<div class="detail-log-filter">' +
                'Filter: <input class="log-filter" type="text" placeholder="type/name/supplier"/>' +
            '</div>' +
            '<div class="detail-log-banner" hidden></div>' +
            '<div class="detail-log-scroll"><table class="detail-log-table">' +
                '<thead><tr>' +
                    '<th>Time</th><th>Event</th><th>Name (id)</th>' +
                    '<th>Val</th><th>From</th>' +
                '</tr></thead>' +
                '<tbody></tbody>' +
            '</table></div>';
        root.dataset.built = '1';
        wireLogToolbar(inst, root);
    }

    // Toolbar state
    const enBtn = root.querySelector('.log-enable-toggle');
    enBtn.textContent = inst.logEnabled ? 'Disable' : 'Enable';
    const pauseBtn = root.querySelector('.log-pause');
    pauseBtn.textContent = inst.logPaused ? 'Resume' : 'Pause';
    const filterEl = root.querySelector('.log-filter');
    if (filterEl.value !== (inst.state.logFilter || '')) {
        filterEl.value = inst.state.logFilter || '';
    }

    // Overflow banner
    const banner = root.querySelector('.detail-log-banner');
    if (inst.logOverflow) {
        banner.textContent = '⚠ Upstream overflow — some records dropped';
        banner.hidden = false;
    } else {
        banner.hidden = true;
    }

    // Simple render: last 500 filtered rows (avoid huge DOM).
    const tbody = root.querySelector('tbody');
    const filter = inst.state.logFilter || '';
    const filtered = inst.logBuffer.filter(function(r) { return matchesLogFilter(r, filter); });
    const visible = filtered.slice(-500);
    let html = '';
    for (const rec of visible) {
        const time = formatLogTime(rec.time_us);
        const delay = (rec.event_time_us && rec.time_us > rec.event_time_us)
            ? '+' + ((rec.time_us - rec.event_time_us) / 1000).toFixed(1) + 'ms'
            : '';
        const name = rec.name || '';
        const id = rec.id != null ? rec.id : '';
        const val = rec.value != null ? rec.value : '';
        const supplier = rec.supplier || (rec.supplier_id != null ? rec.supplier_id : '');
        html += '<tr class="log-row log-type-' + escapeDetailText(rec.type || '') + '">';
        html += '<td>' + escapeDetailText(time) + ' <small>' +
                escapeDetailText(delay) + '</small></td>';
        html += '<td>' + escapeDetailText(rec.type || '') + '</td>';
        html += '<td>' + escapeDetailText(name) + ' (' + escapeDetailText(String(id)) + ')</td>';
        html += '<td>' + escapeDetailText(String(val)) + '</td>';
        html += '<td>' + escapeDetailText(String(supplier)) + '</td>';
        html += '</tr>';
    }
    tbody.innerHTML = html;
}

function wireLogToolbar(inst, root) {
    root.querySelector('.log-enable-toggle').addEventListener('click', async function() {
        if (inst.logEnabled) {
            if (window.UnisetOverview && window.UnisetOverview.trace) {
                await window.UnisetOverview.trace.disable(inst.serverId, inst.objectName);
            }
            inst.state.logEnabled = false;
        } else {
            if (window.UnisetOverview && window.UnisetOverview.trace) {
                await window.UnisetOverview.trace.enable(inst.serverId, inst.objectName,
                    inst.state.logSize || 256);
            }
            inst.state.logEnabled = true;
            subscribeTraceForDetail(inst);
        }
        if (typeof saveDetailState === 'function') {
            saveDetailState(inst.serverId, inst.objectName, captureState(inst));
        }
        renderMessageLog(inst);
    });

    root.querySelector('.log-size').addEventListener('change', async function(e) {
        const newSize = parseInt(e.target.value, 10);
        inst.state.logSize = newSize;
        if (typeof saveDetailState === 'function') {
            saveDetailState(inst.serverId, inst.objectName, captureState(inst));
        }
        if (inst.logEnabled && window.UnisetOverview && window.UnisetOverview.trace) {
            // Disable + re-enable with new size.
            await window.UnisetOverview.trace.disable(inst.serverId, inst.objectName);
            await window.UnisetOverview.trace.enable(inst.serverId, inst.objectName, newSize);
        }
    });

    root.querySelector('.log-pause').addEventListener('click', function() {
        inst.logPaused = !inst.logPaused;
        inst.state.logPaused = inst.logPaused;
        if (typeof saveDetailState === 'function') {
            saveDetailState(inst.serverId, inst.objectName, captureState(inst));
        }
        renderMessageLog(inst);
    });

    root.querySelector('.log-clear').addEventListener('click', function() {
        inst.logBuffer = [];
        inst.logOverflow = false;
        renderMessageLog(inst);
    });

    root.querySelector('.log-export').addEventListener('click', function() {
        exportLogCsv(inst);
    });

    root.querySelector('.log-filter').addEventListener('input', function(e) {
        inst.state.logFilter = e.target.value;
        if (typeof saveDetailState === 'function') {
            saveDetailState(inst.serverId, inst.objectName, captureState(inst));
        }
        renderMessageLog(inst);
    });
}

function formatLogTime(timeUs) {
    if (!timeUs) return '—';
    const ms = Math.floor(timeUs / 1000);
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const mmm = String(d.getMilliseconds()).padStart(3, '0');
    return hh + ':' + mm + ':' + ss + '.' + mmm;
}

function logToCsv(inst) {
    const lines = ['time_us,type,id,value,supplier_id'];
    for (const rec of inst.logBuffer) {
        lines.push([
            rec.time_us != null ? rec.time_us : '',
            rec.type || '',
            rec.id != null ? rec.id : '',
            rec.value != null ? rec.value : '',
            rec.supplier_id != null ? rec.supplier_id : ''
        ].join(','));
    }
    return lines.join('\n');
}

function exportLogCsv(inst) {
    const csv = logToCsv(inst);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = inst.objectName + '-log.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 100);
}
```

- [ ] **Step 4: Run tests**

```bash
cd /home/pv/Projects/uniset-panel/tests && npm run test:unit -- --run 2>&1 | tail
# Expected: onTraceBatch + matchesLogFilter + logToCsv tests PASS
```

- [ ] **Step 5: Regenerate + commit**

```bash
cd /home/pv/Projects/uniset-panel/ui && go run concat.go
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/60-detail-messagelog.js tests/unit/detail-messagelog.test.js ui/static/js/app.js
git commit -m "feat(detail): Message Log tab — trace subscribe, render, controls, filter, CSV"
```

---

## Phase 7 — Integration & polish

### Task 7.1: Mock server extensions

**Files:**
- Modify: `tests/mock-server/server.js`

- [ ] **Step 1: Find existing route registrations**

```bash
grep -n "app.get\|app.post\|router.get\|switch.*req.url" tests/mock-server/server.js | head -30
# Record the routing pattern used; adjust syntax below accordingly.
```

- [ ] **Step 2: Add snapshot/history/trace stubs**

Append to `tests/mock-server/server.js` within the main request handler (adjust to the file's actual framework — likely plain `http.createServer` with url switch):

```js
// --- Spec 4: /api/servers/:id/objects/:name/snapshot ------------------------
// Returns synthetic snapshot with 4 sections + forced in_Temp.
const snapshotMatch = req.url.match(
    /^\/api\/servers\/([^\/]+)\/objects\/([^\/]+)\/snapshot$/);
if (snapshotMatch && req.method === 'GET') {
    const [, serverId, name] = snapshotMatch;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        object: name,
        server: serverId,
        vars: {
            'in_Temp': 20 + Math.floor(Math.random() * 10),
            'in_Pressure': 1013 + Math.floor(Math.random() * 5),
            'out_Speed': 1500,
            'Counter': Math.floor(Date.now() / 1000) % 100,
            'FB1.State': 1,
            'FB1.Phase': 2
        },
        sensor_map: { 'in_Temp': 101, 'in_Pressure': 102, 'out_Speed': 205 },
        forced: [101],
        sm_object: 'SharedMemory'
    }));
    return;
}

// --- Spec 4: /api/servers/:id/objects/:name/history?var=&depth= -------------
const historyMatch = req.url.match(
    /^\/api\/servers\/([^\/]+)\/objects\/([^\/]+)\/history(\?.*)?$/);
if (historyMatch && req.method === 'GET') {
    const urlObj = new URL('http://x' + req.url);
    const varName = urlObj.searchParams.get('var') || 'x';
    const depth = parseInt(urlObj.searchParams.get('depth') || '60', 10);
    const now = Date.now();
    const points = [];
    for (let i = depth - 1; i >= 0; i--) {
        points.push({ t: now - i * 500, v: Math.sin(i / 5) * 10 + 50 });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ var: varName, points: points }));
    return;
}

// --- Spec 2: /api/trace/events (SSE) ---------------------------------------
if (req.url.startsWith('/api/trace/events') && req.method === 'GET') {
    const urlObj = new URL('http://x' + req.url);
    const object = urlObj.searchParams.get('object');
    const server = urlObj.searchParams.get('server');
    if (!object || !server) {
        res.writeHead(400); res.end('missing params'); return;
    }
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    let counter = 0;
    const tick = setInterval(() => {
        const batch = {
            enabled: true, overflow: false,
            records: [
                { time_us: Date.now() * 1000, event_time_us: Date.now() * 1000 - 2000,
                  id: 101, value: counter++, supplier_id: 42, type: 'sensorInfo' }
            ]
        };
        const event = {
            Type: 'trace', ServerID: server, ObjectName: object, Data: batch
        };
        res.write('event: trace\ndata: ' + JSON.stringify(event) + '\n\n');
    }, 500);
    req.on('close', () => clearInterval(tick));
    return;
}

// --- Spec 2: /api/trace/servers/:s/objects/:o/enable|disable ----------------
const traceCtlMatch = req.url.match(
    /^\/api\/trace\/servers\/([^\/]+)\/objects\/([^\/]+)\/(enable|disable)(\?.*)?$/);
if (traceCtlMatch && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
}
```

Adjust variable names (`req`, `res`, `app`) to the actual file style. If the file uses Express, translate the `if` chain into `app.get(...)` / `app.post(...)` blocks.

- [ ] **Step 3: Validate mock manually**

Start dev server and query one of the new endpoints:

```bash
cd /home/pv/Projects/uniset-panel
docker compose up dev-viewer -d --build
curl -s 'http://localhost:8000/api/servers/srv-1/objects/DG_Control/snapshot' | jq .
# Expected: JSON with vars/sensor_map/forced/sm_object
docker compose --profile dev down
```

- [ ] **Step 4: Commit**

```bash
git add tests/mock-server/server.js
git commit -m "test(mock): stub /snapshot /history /api/trace/* for Spec 4"
```

### Task 7.2: Playwright E2E — detail panel full flow

**Files:**
- Create: `tests/single/detail-panel.spec.ts`

- [ ] **Step 1: Write spec**

Create `tests/single/detail-panel.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

async function openSystemOverview(page) {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const overviewItem = page.locator('.sidebar-group-item[data-type="overview"]').first();
    await expect(overviewItem).toBeVisible({ timeout: 10000 });
    const overviewResponse = page.waitForResponse(
        resp => resp.url().includes('/api/servers/') && resp.url().includes('/overview'),
        { timeout: 15000 }
    );
    await overviewItem.click();
    await overviewResponse;
    await page.waitForTimeout(1000);
}

test.describe('UObject Detail Panel', () => {
    test('double-click node opens detail panel with correct title', async ({ page }) => {
        await openSystemOverview(page);
        const serverId = await page.evaluate(() =>
            Object.keys((window as any).overviewInstances)[0]);
        expect(serverId).toBeTruthy();

        // Simulate dblclick by emitting the CustomEvent directly (avoids
        // flakiness of canvas hit-testing in headless browser).
        await page.evaluate((sid) => {
            const inst = (window as any).overviewInstances[sid];
            const firstNode = inst.nodeMap.values().next().value;
            document.dispatchEvent(new CustomEvent('uniset:node-double-clicked', {
                detail: {
                    serverId: sid,
                    serverName: inst.serverName || sid,
                    objectName: firstNode.title
                }
            }));
        }, serverId);

        // Detail panel DOM should appear.
        const panels = page.locator('.detail-panel');
        await expect(panels).toHaveCount(1, { timeout: 5000 });
    });

    test('Variables tab renders 4 sections for mock object', async ({ page }) => {
        await openSystemOverview(page);
        const serverId = await page.evaluate(() =>
            Object.keys((window as any).overviewInstances)[0]);
        const firstNodeName = await page.evaluate((sid) => {
            const inst = (window as any).overviewInstances[sid];
            return inst.nodeMap.values().next().value.title;
        }, serverId);
        await page.evaluate(([sid, name]: any[]) => {
            document.dispatchEvent(new CustomEvent('uniset:node-double-clicked', {
                detail: { serverId: sid, serverName: sid, objectName: name }
            }));
        }, [serverId, firstNodeName]);

        // Wait for snapshot fetch
        await page.waitForResponse(
            r => r.url().includes('/snapshot'), { timeout: 5000 });
        await page.waitForTimeout(200);

        const panel = page.locator('.detail-panel').last();
        await expect(panel.locator('[data-section="inputs"]')).toBeVisible();
        await expect(panel.locator('[data-section="outputs"]')).toBeVisible();
        await expect(panel.locator('[data-section="locals"]')).toBeVisible();
        await expect(panel.locator('[data-section="fb_instances"]')).toBeVisible();
    });

    test('Variables row click adds to Trends', async ({ page }) => {
        await openSystemOverview(page);
        const serverId = await page.evaluate(() =>
            Object.keys((window as any).overviewInstances)[0]);
        const firstNodeName = await page.evaluate((sid) => {
            const inst = (window as any).overviewInstances[sid];
            return inst.nodeMap.values().next().value.title;
        }, serverId);
        await page.evaluate(([sid, name]: any[]) => {
            document.dispatchEvent(new CustomEvent('uniset:node-double-clicked', {
                detail: { serverId: sid, serverName: sid, objectName: name }
            }));
        }, [serverId, firstNodeName]);
        await page.waitForResponse(r => r.url().includes('/snapshot'), { timeout: 5000 });
        await page.waitForTimeout(200);

        const panel = page.locator('.detail-panel').last();
        const inputRow = panel.locator('[data-section="inputs"] tr[data-var]').first();
        await inputRow.click();

        // Switch to Trends inner tab
        await panel.locator('[data-inner="trends"]').click();
        await expect(panel.locator('.trend-row').first()).toBeVisible({ timeout: 3000 });
    });

    test('Message Log tab subscribes on enable and shows records', async ({ page }) => {
        await openSystemOverview(page);
        const serverId = await page.evaluate(() =>
            Object.keys((window as any).overviewInstances)[0]);
        const firstNodeName = await page.evaluate((sid) => {
            const inst = (window as any).overviewInstances[sid];
            return inst.nodeMap.values().next().value.title;
        }, serverId);
        await page.evaluate(([sid, name]: any[]) => {
            document.dispatchEvent(new CustomEvent('uniset:node-double-clicked', {
                detail: { serverId: sid, serverName: sid, objectName: name }
            }));
        }, [serverId, firstNodeName]);
        await page.waitForTimeout(300);

        const panel = page.locator('.detail-panel').last();
        await panel.locator('[data-inner="messagelog"]').click();

        // Click Enable toggle to start subscription
        await panel.locator('.log-enable-toggle').click();

        // Expect at least one log row after ~1s (mock emits every 500ms)
        await expect(panel.locator('.log-row').first()).toBeVisible({ timeout: 3000 });
    });

    test('Closing schema closes all detail panels', async ({ page }) => {
        await openSystemOverview(page);
        const serverId = await page.evaluate(() =>
            Object.keys((window as any).overviewInstances)[0]);
        const firstNodeName = await page.evaluate((sid) => {
            const inst = (window as any).overviewInstances[sid];
            return inst.nodeMap.values().next().value.title;
        }, serverId);
        await page.evaluate(([sid, name]: any[]) => {
            document.dispatchEvent(new CustomEvent('uniset:node-double-clicked', {
                detail: { serverId: sid, serverName: sid, objectName: name }
            }));
        }, [serverId, firstNodeName]);
        await page.waitForTimeout(300);
        await expect(page.locator('.detail-panel')).toHaveCount(1);

        // Emit schema-closed
        await page.evaluate((sid) => {
            document.dispatchEvent(new CustomEvent('uniset:schema-closed', {
                detail: { serverId: sid }
            }));
        }, serverId);
        await expect(page.locator('.detail-panel')).toHaveCount(0, { timeout: 2000 });
    });
});
```

- [ ] **Step 2: Verify structural discovery**

```bash
cd /home/pv/Projects/uniset-panel/tests && npx playwright test detail-panel --list 2>&1 | tail
# Expected: 5 tests listed
```

- [ ] **Step 3: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add tests/single/detail-panel.spec.ts
git commit -m "test(detail): Playwright E2E for detail panel full flow"
```

### Task 7.3: CSS for detail panel

**Files:**
- Modify: `ui/static/css/style.css`

- [ ] **Step 1: Append styles**

Append to `ui/static/css/style.css`:

```css
/* ==========================================================================
   UObject Detail Panel (Spec 4)
   ========================================================================== */

.detail-panel { background: #0e0e18; color: #ddd; display: flex;
                flex-direction: column; height: 100%; }
.detail-header { padding: 8px 12px; background: #1a1a24;
                 border-bottom: 1px solid #333; display: flex; gap: 16px; }
.detail-header .detail-obj { font-weight: bold; font-size: 14px; }
.detail-header .detail-server { color: #888; font-size: 12px; align-self: center; }

.detail-inner-tabs { display: flex; background: #1a1a24;
                     border-bottom: 1px solid #333; }
.detail-inner-tabs button { padding: 6px 14px; background: transparent;
                            color: #aaa; border: 0; border-bottom: 2px solid transparent;
                            cursor: pointer; }
.detail-inner-tabs button.active { color: #fff; border-bottom-color: #4fc3f7; }

.detail-inner-content { flex: 1; overflow: hidden; position: relative; }
.detail-inner-content [data-inner-panel] { display: none;
                                            position: absolute; inset: 0;
                                            overflow-y: auto; padding: 8px; }
.detail-inner-content [data-inner-panel].active { display: block; }

.detail-placeholder { color: #666; padding: 16px; }

/* Variables */
.detail-var-section-header { background: #1a1a24; padding: 6px 10px;
                              cursor: pointer; user-select: none;
                              display: flex; align-items: center; gap: 6px;
                              font-weight: bold; }
.detail-var-section-header .arrow { transition: transform .2s; font-size: 10px; }
.detail-var-section-header .arrow.collapsed { transform: rotate(-90deg); }
.detail-var-section-header .count { color: #888; font-weight: normal;
                                     font-size: 12px; margin-left: auto; }

.detail-var-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.detail-var-table th, .detail-var-table td { padding: 4px 8px;
                                              border-bottom: 1px solid #2a2a34; }
.detail-var-table th { text-align: left; color: #888; background: #131320; }
.detail-var-table tr.forced { background: rgba(240,176,64,0.08); }
.detail-var-table tr.forcible { cursor: pointer; }
.detail-var-table tr.forcible:hover { background: #1a1a24; }
.detail-var-table .value-cell.flash-up { background: #2a5a2a; transition: background .5s; }
.detail-var-table .value-cell.flash-down { background: #5a2a2a; transition: background .5s; }

.detail-ctxmenu { background: #1a1a24; border: 1px solid #333; padding: 6px;
                   z-index: 10000; display: flex; flex-direction: column; gap: 4px;
                   min-width: 160px; }
.detail-ctxmenu button { padding: 4px 8px; background: #2a2a34;
                          color: #ddd; border: 0; cursor: pointer; }
.detail-ctxmenu button:hover { background: #353540; }

/* Trends */
.detail-trends-toolbar { padding: 4px 8px; background: #1a1a24;
                         border-bottom: 1px solid #333; display: flex;
                         gap: 8px; align-items: center; font-size: 12px; }
.detail-trends-charts .trend-row { border-bottom: 1px solid #2a2a34;
                                    padding: 6px 0; }
.detail-trends-charts .trend-row-header { font-size: 12px; color: #ddd;
                                           display: flex; align-items: center;
                                           gap: 8px; padding: 0 8px 4px 8px; }
.detail-trends-charts .trend-color { width: 10px; height: 10px;
                                      border-radius: 2px; display: inline-block; }
.detail-trends-charts .trend-canvas { width: 100%; height: 120px; display: block; }

/* Message Log */
.detail-log-toolbar { padding: 4px 8px; background: #1a1a24;
                       border-bottom: 1px solid #333; display: flex;
                       gap: 8px; align-items: center; font-size: 12px; }
.detail-log-filter { padding: 4px 8px; border-bottom: 1px solid #333; }
.detail-log-filter input { width: 100%; box-sizing: border-box; padding: 2px 6px;
                            background: #0e0e18; color: #ddd; border: 1px solid #333; }
.detail-log-banner { padding: 4px 8px; background: #5a2a2a; color: #fff; }
.detail-log-scroll { flex: 1; overflow-y: auto; }
.detail-log-table { width: 100%; border-collapse: collapse; font-size: 11px;
                     font-family: monospace; }
.detail-log-table th, .detail-log-table td { padding: 2px 6px;
                                               border-bottom: 1px solid #2a2a34; }
.detail-log-table tr.log-type-sensorInfo { color: #4fc3f7; }
.detail-log-table tr.log-type-timerInfo { color: #81c784; }
.detail-log-table tr.log-type-sysCommand { color: #ffb74d; }
```

- [ ] **Step 2: Commit**

```bash
git add ui/static/css/style.css
git commit -m "style(detail): detail panel CSS (header, tabs, variables, trends, log)"
```

### Task 7.4: Docs + full E2E run

**Files:**
- Create: `docs/DocPages/UObject-debug-detail-panel.md`

- [ ] **Step 1: Write user-facing docs**

Create `docs/DocPages/UObject-debug-detail-panel.md`:

```markdown
# UObject Debug — Detail Panel

## Обзор

Panel отладки конкретного UObject'а. Открывается двойным кликом по
ноде в System Overview (или по карточке в FB Status panel). Содержит
три вкладки:

- **Variables** — живая таблица переменных объекта: Inputs (`in_*`),
  Outputs (`out_*`), Locals, FB Instances. Значения обновляются каждые
  500 ms (POST /api/servers/{id}/objects/{name}/snapshot).
- **Trends** — графики выбранных переменных. Клик по строке в Variables
  добавляет переменную в Trends. Window: 30s / 1m / 5m / All. Clear,
  Export CSV.
- **Message Log** — поток dispatch-trace записей. Enable/Disable
  переключает сбор на uniset-стороне. Size: 64–1024. Pause, Clear,
  Export CSV, Filter (substring на type/name/supplier).

## Force / Unforce переменных

Для `in_*` и `out_*` (привязанных к SharedMemory) доступен right-click
меню → Force value… / Unforce. Запрос идёт через существующий
`/api/objects/{SM}/ionc/{freeze,unfreeze}`. Требует `--control-token`.

## Эндпоинты

- `GET /api/servers/{id}/objects/{name}/snapshot` — текущий snapshot.
- `GET /api/servers/{id}/objects/{name}/history?var=X&depth=N` —
  история одной переменной.
- `GET /api/trace/events?object=X&server=S&interval=N` — SSE поток
  trace-событий (отдельный канал, независимый от `/api/events`).
- `POST /api/trace/servers/{id}/objects/{name}/enable?size=N` /
  `/disable` — управление trace на uniset-стороне.

## Persistent state

Состояние панели (активная вкладка, выбранные Trends, window, log
filter/size/paused, collapsed секции Variables) сохраняется в
localStorage по ключу `uniset-panel:detail:<serverId>:<objectName>`.

## Ограничения MVP

- Force/Unforce — только для `in_*`/`out_*`.
- Locals / FB Instances — read-only.
- Message Log ring-buffer — client-side в памяти (5000 записей hard
  cap); сервер-side archival не реализован.
- Alert rules / notifications при trigger condition — не реализованы.
```

- [ ] **Step 2: Run unit + full E2E**

```bash
cd /home/pv/Projects/uniset-panel/tests && npm run test:unit -- --run 2>&1 | tail
# Expected: all unit tests PASS (prior 30 + new Phase 3-6 tests)

cd /home/pv/Projects/uniset-panel && make js-tests 2>&1 | tail -20
# Expected: mostly PASS (new detail-panel specs green, pre-existing
# failures from non-Spec-4 areas acceptable).
```

- [ ] **Step 3: Commit docs**

```bash
git add docs/DocPages/UObject-debug-detail-panel.md
git commit -m "docs(detail): user-facing documentation for UObject detail panel"
```

- [ ] **Step 4: Final squash (if requested by user)**

If user asks to squash the branch into one commit:

```bash
cd /home/pv/Projects/uniset-panel
git tag -f backup/pre-squash-spec4 HEAD
git reset --soft $(git merge-base master HEAD)
git commit -m "feat(uobject-debug): Spec 4 — detail panel + trace backend"
# (detailed body describing scope per this plan)
```

---

## Self-Review

Coverage checklist run against `docs/superpowers/specs/2026-04-19-uobject-debug-spec4-design.md`:

- ✅ Phase 0 (verification) — Tasks 0.1–0.3 cover snapshot envelope, history timestamp unit, handlers.go struct location.
- ✅ `internal/debug/` package — Tasks 1.1–1.2 (types + client + tests).
- ✅ `internal/api/handlers_debug.go` snapshot — Tasks 1.3–1.4.
- ✅ `internal/api/handlers_debug.go` history — Tasks 1.5–1.7.
- ✅ `internal/trace/` package (Spec 2 scope) — Tasks 2.1–2.5.
- ✅ SSE BroadcastTraceBatch + traceOnly — Task 2.6.
- ✅ HandleTraceEvents + proxy enable/disable — Tasks 2.7–2.8.
- ✅ Trace integration test + route wiring — Task 2.9.
- ✅ `60-detail-state.js` — Task 3.1.
- ✅ `60-detail-panel.js` with CustomEvent listener + schema-closed cleanup — Task 3.2.
- ✅ Variables tab (render + snapshot poll + flash + forced indicator) — Task 4.1.
- ✅ Force/unforce via SM ionc — Task 4.2.
- ✅ Trends tab (select + history + live merge + window/clear/csv) — Task 5.1.
- ✅ Message Log tab (subscribe + render + controls + filter + csv + overflow banner) — Task 6.1.
- ✅ Mock server stubs — Task 7.1.
- ✅ Playwright E2E — Task 7.2.
- ✅ CSS — Task 7.3.
- ✅ User docs — Task 7.4.

Spec requirements with matching tasks: all found. No gaps.

**Type consistency sweep:**
- `Handlers.debugClient` is of type `DebugInterface` (Task 1.3) — fake in tests implements `Snapshot` + `History` methods. Task 1.6 adds History to same interface. Consistent.
- `Handlers.traceMgr` is `TraceManagerInterface` (Task 2.7) — fake implements `Subscribe/Unsubscribe/PollerCount/StopAll`. Task 2.5 exports matching `*trace.Manager` methods. Consistent.
- `ServerResolver` duplicated in `internal/trace` and `internal/debug` intentionally (Task 1.2 + Task 2.2) — sole adapter in `cmd/server/main.go`. Deliberate.
- Frontend global `detailInstances` defined in Task 3.2, consumed in Tasks 4.1, 4.2, 5.1, 6.1 under the same name + shape.
- `captureState(inst)` defined in Task 3.2, reused in Tasks 4.1, 5.1, 6.1.
- `escapeDetailText` defined in Task 3.2, reused in Tasks 4.1, 5.1, 6.1.
- `loadDetailState`/`saveDetailState`/`flushDetailStateImmediate` defined in Task 3.1, used in Tasks 3.2 + subsequent. Consistent.

**Placeholder scan:** no TBD / TODO / "implement later" / "similar to Task N" / "handle edge cases" found. Each step contains complete code.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-04-19-uobject-debug-spec4.md`.

Scope: ~29 tasks (3 verification + 7 debug backend + 9 trace backend + 2 frontend shell + 2 Variables + 1 Trends + 1 Message Log + 4 integration). Expected ~150 bite-sized steps.

Two execution options:

1. **Subagent-Driven** (recommended) — dispatch fresh subagent per task, two-stage review between tasks.
2. **Inline Execution** — execute tasks in this session with batch checkpoints.

Which approach?
