# UObject Debug Spec 2 (uniset-panel backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в `uniset-panel` новый пакет `internal/trace/` (poller + manager + HTTP client) и SSE-эндпоинты (`/api/trace/events`, `/api/trace/.../enable|disable`), которые опрашивают trace-API uniset (Спек 1) и рассылают записи фронтенду.

**Architecture:** Shared `TracePoller` per `(serverID, objectName)`, hoсtится в `trace.Manager` (registry). Poller делает HTTP `GET /<Object>/dump?trace=1&since=<lastTimeUs>&limit=1024` с эффективным интервалом = min из запрошенных клиентами. Records как `json.RawMessage` (no schema duplication). SSE-событие типа `"trace"` рассылается через `SSEHub.BroadcastTraceBatch`, клиенты через `/api/trace/events` помечены `traceOnly=true` чтобы не смешиваться с `object_data`. Proxy endpoints для runtime enable/disable — тонкие обёртки над uniset HTTP API.

**Tech Stack:** Go 1.25 (module `github.com/pv/uniset-panel`), stdlib `net/http` + `httptest`, testing framework `testing` (go test), SSE контракт уже в `internal/api/sse.go`.

---

## File map

**Created:**
- `internal/trace/types.go` — envelope struct + TraceBatch.
- `internal/trace/client.go` — HTTP client к uniset, ServerResolver interface.
- `internal/trace/poller.go` — TracePoller (shared per server+object).
- `internal/trace/manager.go` — registry of pollers.
- `internal/trace/client_test.go`, `poller_test.go`, `manager_test.go` — unit.
- `internal/trace/integration_test.go` — end-to-end с httptest fake-uniset.
- `internal/api/handlers_trace.go` — SSE endpoint + proxy enable/disable.
- `internal/api/handlers_trace_test.go` — handler tests.
- `docs/DocPages/UObject-debug-trace-panel.md` — user-facing docs.

**Modified:**
- `internal/api/sse.go` — новое EventType `"trace"`, `BroadcastTraceBatch`, `traceOnly bool` на `sseClient`, фильтр в `Broadcast`.
- `internal/api/sse_test.go` — тест фильтра + broadcast.
- `internal/api/server.go` — routes.
- `internal/api/handlers.go` — field `traceMgr *trace.Manager` + wiring в `NewHandlers`.

---

## Task 1: Go types + envelope

**Files:**
- Create: `internal/trace/types.go`
- Test: (none — types только, проверяются через client_test и poller_test)

- [ ] **Step 1: Create `internal/trace/types.go`**

```go
// Package trace обеспечивает опрос UObject dispatch-trace API uniset и
// рассылку записей SSE-клиентам. Пакет не дублирует схему TraceRecord —
// она определена в Спеке 1 (uniset); records пересылаются как raw JSON.
package trace

import "encoding/json"

// dumpEnvelope отражает только те поля /dump?trace=1 ответа, которые
// backend использует для логики. Остальные (io, Timers, и т.д.) игнорируются.
type dumpEnvelope struct {
	Trace *traceSection `json:"trace,omitempty"`
}

type traceSection struct {
	Enabled    bool              `json:"enabled"`
	BufferSize int               `json:"buffer_size,omitempty"`
	Overflow   bool              `json:"overflow,omitempty"`
	Records    []json.RawMessage `json:"records,omitempty"`
}

// TraceBatch — payload SSE-события, полезная нагрузка отдаётся фронту как есть.
type TraceBatch struct {
	Enabled  bool              `json:"enabled"`
	Overflow bool              `json:"overflow"`
	Records  []json.RawMessage `json:"records"`
}

// recordTimeOnly — вспомогательный struct, парсится только для watermark.
type recordTimeOnly struct {
	TimeUs int64 `json:"time_us"`
}
```

- [ ] **Step 2: Verify compiles**

```bash
cd /home/pv/Projects/uniset-panel
go build ./internal/trace/...
```

Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add internal/trace/types.go
git commit -m "feat(trace): add types for trace pull API (envelope + SSE batch)"
```

---

## Task 2: HTTP client for uniset dump endpoint

**Files:**
- Create: `internal/trace/client.go`
- Test: `internal/trace/client_test.go`

- [ ] **Step 1: Write failing test (TDD)**

Create `internal/trace/client_test.go`:

```go
package trace

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type staticResolver struct{ url string }

func (s staticResolver) GetServerURL(id string) (string, error) {
	if s.url == "" {
		return "", errors.New("unknown")
	}
	return s.url, nil
}

func TestClientFetchOK(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/TestObj/dump") {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("trace") != "1" {
			t.Fatalf("expected trace=1, got %q", r.URL.Query().Get("trace"))
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"TestObj":{"trace":{"enabled":true,"buffer_size":1024,"overflow":false,"records":[{"time_us":1000,"type":"sensorInfo","id":5,"value":7}]}}}`))
	}))
	defer srv.Close()

	c := NewClient(staticResolver{url: srv.URL})
	env, err := c.Fetch(context.Background(), "srv-1", "TestObj", 0, 100)
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if env.Trace == nil {
		t.Fatal("trace section missing")
	}
	if !env.Trace.Enabled {
		t.Error("expected enabled=true")
	}
	if got := len(env.Trace.Records); got != 1 {
		t.Errorf("expected 1 record, got %d", got)
	}
}

func TestClientFetchObjectNotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"OtherObj":{"trace":{"enabled":false}}}`))
	}))
	defer srv.Close()

	c := NewClient(staticResolver{url: srv.URL})
	_, err := c.Fetch(context.Background(), "srv-1", "TestObj", 0, 100)
	if !errors.Is(err, ErrObjectNotFound) {
		t.Errorf("expected ErrObjectNotFound, got %v", err)
	}
}

func TestClientFetchHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := NewClient(staticResolver{url: srv.URL})
	_, err := c.Fetch(context.Background(), "srv-1", "TestObj", 0, 100)
	if err == nil {
		t.Fatal("expected error on 500")
	}
}

func TestClientFetchDisabledTrace(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"TestObj":{"trace":{"enabled":false}}}`))
	}))
	defer srv.Close()

	c := NewClient(staticResolver{url: srv.URL})
	env, err := c.Fetch(context.Background(), "srv-1", "TestObj", 0, 100)
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if env.Trace == nil || env.Trace.Enabled {
		t.Errorf("expected trace.enabled=false, got %+v", env.Trace)
	}
}

func TestClientFetchUnknownServer(t *testing.T) {
	c := NewClient(staticResolver{url: ""})
	_, err := c.Fetch(context.Background(), "srv-1", "TestObj", 0, 100)
	if err == nil {
		t.Fatal("expected error on unknown server")
	}
}

// Ensure sinceTimeUs is passed as query param.
func TestClientFetchSinceParam(t *testing.T) {
	var gotSince string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotSince = r.URL.Query().Get("since")
		w.Write([]byte(`{"TestObj":{"trace":{"enabled":true,"records":[]}}}`))
	}))
	defer srv.Close()

	c := NewClient(staticResolver{url: srv.URL})
	_, err := c.Fetch(context.Background(), "srv-1", "TestObj", 12345, 100)
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if gotSince != "12345" {
		t.Errorf("expected since=12345, got %q", gotSince)
	}
}

// ensure we don't force struct import (for future compile check)
var _ = json.RawMessage{}
```

- [ ] **Step 2: Run test — must fail (NewClient etc. not defined)**

```bash
cd /home/pv/Projects/uniset-panel
go test ./internal/trace/...
```

Expected: FAIL (compile error: NewClient undefined).

- [ ] **Step 3: Create `internal/trace/client.go`**

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
	"strconv"
	"strings"
	"time"
)

// ErrObjectNotFound возвращается если в JSON-ответе uniset нет ключа objectName.
var ErrObjectNotFound = errors.New("trace: object not found in uniset response")

// ServerResolver резолвит serverID → базовый URL (http://host:port).
type ServerResolver interface {
	GetServerURL(serverID string) (string, error)
}

type Client struct {
	resolver ServerResolver
	http     *http.Client
}

func NewClient(resolver ServerResolver) *Client {
	return &Client{
		resolver: resolver,
		http:     &http.Client{Timeout: 5 * time.Second},
	}
}

// Fetch запрашивает у uniset /<objectName>/dump?trace=1&since=<us>&limit=<n>
// и возвращает envelope. Записи внутри — raw JSON, не парсятся.
func (c *Client) Fetch(ctx context.Context, serverID, objectName string,
	sinceTimeUs int64, limit int) (dumpEnvelope, error) {

	baseURL, err := c.resolver.GetServerURL(serverID)
	if err != nil {
		return dumpEnvelope{}, fmt.Errorf("resolve server %s: %w", serverID, err)
	}

	u, err := url.Parse(strings.TrimRight(baseURL, "/") + "/" + objectName + "/dump")
	if err != nil {
		return dumpEnvelope{}, fmt.Errorf("build URL: %w", err)
	}
	q := u.Query()
	q.Set("trace", "1")
	q.Set("since", strconv.FormatInt(sinceTimeUs, 10))
	if limit > 0 {
		q.Set("limit", strconv.Itoa(limit))
	}
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return dumpEnvelope{}, fmt.Errorf("build request: %w", err)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return dumpEnvelope{}, fmt.Errorf("http GET: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return dumpEnvelope{}, fmt.Errorf("uniset returned %d: %s", resp.StatusCode, string(body))
	}

	// Верхний уровень — { "<objectName>": { ... } }.
	var top map[string]json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&top); err != nil {
		return dumpEnvelope{}, fmt.Errorf("decode top-level: %w", err)
	}

	raw, ok := top[objectName]
	if !ok {
		return dumpEnvelope{}, ErrObjectNotFound
	}

	var env dumpEnvelope
	if err := json.Unmarshal(raw, &env); err != nil {
		return dumpEnvelope{}, fmt.Errorf("decode envelope: %w", err)
	}
	return env, nil
}
```

- [ ] **Step 4: Run test — must PASS**

```bash
cd /home/pv/Projects/uniset-panel
go test -v -run TestClient ./internal/trace/...
```

Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add internal/trace/client.go internal/trace/client_test.go
git commit -m "feat(trace): HTTP client for uniset /dump?trace=1 endpoint"
```

---

## Task 3: TracePoller — single-subscriber basic loop

**Files:**
- Create: `internal/trace/poller.go`
- Test: `internal/trace/poller_test.go`

- [ ] **Step 1: Write failing test**

Create `internal/trace/poller_test.go`:

```go
package trace

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"
)

// fakeFetcher — заменитель client.Fetch для тестов.
type fakeFetcher struct {
	mu    sync.Mutex
	calls int
	recs  []json.RawMessage
	err   error
}

func (f *fakeFetcher) Fetch(ctx context.Context, serverID, objectName string,
	since int64, limit int) (dumpEnvelope, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if f.err != nil {
		return dumpEnvelope{}, f.err
	}
	return dumpEnvelope{Trace: &traceSection{
		Enabled: true,
		Records: f.recs,
	}}, nil
}

type fakeSSE struct {
	mu     sync.Mutex
	events []TraceBatch
}

func (s *fakeSSE) BroadcastTraceBatch(serverID, serverName, objectName string, b TraceBatch) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = append(s.events, b)
}

func (s *fakeSSE) received() []TraceBatch {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]TraceBatch(nil), s.events...)
}

func rec(timeUs int64) json.RawMessage {
	b, _ := json.Marshal(map[string]any{
		"time_us": timeUs, "type": "sensorInfo", "id": 1, "value": 0,
	})
	return b
}

func TestPollerSingleSubscriber(t *testing.T) {
	fetcher := &fakeFetcher{recs: []json.RawMessage{rec(1000), rec(2000)}}
	sse := &fakeSSE{}

	p := newTracePoller("srv-1", "srv1", "TestObj", fetcher, sse)
	p.AddSubscriber("s1", 50)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go p.run(ctx)
	time.Sleep(200 * time.Millisecond)
	cancel()
	p.wait() // ждём завершения run()

	if fetcher.calls < 2 {
		t.Errorf("expected >=2 fetches, got %d", fetcher.calls)
	}
	events := sse.received()
	if len(events) < 1 {
		t.Fatalf("expected >=1 SSE event, got %d", len(events))
	}
	if !events[0].Enabled {
		t.Error("expected enabled=true in event")
	}
}

func TestPollerNoSubscribers_Exits(t *testing.T) {
	fetcher := &fakeFetcher{}
	sse := &fakeSSE{}
	p := newTracePoller("srv-1", "srv1", "TestObj", fetcher, sse)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan struct{})
	go func() {
		p.run(ctx)
		close(done)
	}()

	select {
	case <-done:
		// OK — poller сам вышел т.к. нет подписчиков
	case <-time.After(200 * time.Millisecond):
		t.Fatal("poller should have exited with zero subscribers")
	}
}

func TestPollerFetchErrorBackoff(t *testing.T) {
	fetcher := &fakeFetcher{err: errors.New("uniset down")}
	sse := &fakeSSE{}

	p := newTracePoller("srv-1", "srv1", "TestObj", fetcher, sse)
	p.backoffStart = 10 * time.Millisecond // ускоряем для теста
	p.backoffMax = 40 * time.Millisecond
	p.AddSubscriber("s1", 50)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go p.run(ctx)
	time.Sleep(150 * time.Millisecond)
	cancel()
	p.wait()

	events := sse.received()
	if len(events) == 0 {
		t.Fatal("expected error-state SSE events")
	}
	for _, ev := range events {
		if ev.Enabled {
			t.Error("all events should have enabled=false on fetch error")
		}
	}
}

func TestPollerWatermarkUpdate(t *testing.T) {
	fetcher := &fakeFetcher{recs: []json.RawMessage{rec(1000), rec(2000)}}
	sse := &fakeSSE{}
	p := newTracePoller("srv-1", "srv1", "TestObj", fetcher, sse)
	p.AddSubscriber("s1", 50)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go p.run(ctx)
	time.Sleep(150 * time.Millisecond)
	cancel()
	p.wait()

	if got := p.getLastTimeUs(); got != 2000 {
		t.Errorf("expected lastTimeUs=2000, got %d", got)
	}
}
```

- [ ] **Step 2: Run test — must fail**

```bash
cd /home/pv/Projects/uniset-panel
go test -v -run TestPoller ./internal/trace/...
```

Expected: FAIL (newTracePoller, AddSubscriber etc. undefined).

- [ ] **Step 3: Create `internal/trace/poller.go`**

```go
package trace

import (
	"context"
	"encoding/json"
	"sync"
	"time"
)

// Fetcher — минимальный интерфейс, который нужен поллеру. Реальный
// Client удовлетворяет ему. Позволяет подставлять fake в тестах.
type Fetcher interface {
	Fetch(ctx context.Context, serverID, objectName string,
		sinceTimeUs int64, limit int) (dumpEnvelope, error)
}

// SSEBroadcaster — минимальный интерфейс публикации trace событий.
type SSEBroadcaster interface {
	BroadcastTraceBatch(serverID, serverName, objectName string, b TraceBatch)
}

type TracePoller struct {
	serverID   string
	serverName string
	objectName string
	fetcher    Fetcher
	sse        SSEBroadcaster

	mu          sync.Mutex
	subscribers map[string]time.Duration // subscriberID → interval
	lastTimeUs  int64

	backoffStart time.Duration
	backoffMax   time.Duration

	wg sync.WaitGroup
}

func newTracePoller(serverID, serverName, objectName string,
	f Fetcher, sse SSEBroadcaster) *TracePoller {
	return &TracePoller{
		serverID:     serverID,
		serverName:   serverName,
		objectName:   objectName,
		fetcher:      f,
		sse:          sse,
		subscribers:  make(map[string]time.Duration),
		backoffStart: 1 * time.Second,
		backoffMax:   30 * time.Second,
	}
}

func (p *TracePoller) AddSubscriber(id string, intervalMS int64) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.subscribers[id] = time.Duration(intervalMS) * time.Millisecond
}

// RemoveSubscriber returns remaining count.
func (p *TracePoller) RemoveSubscriber(id string) int {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.subscribers, id)
	return len(p.subscribers)
}

func (p *TracePoller) SubscribersCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.subscribers)
}

func (p *TracePoller) effectiveInterval() time.Duration {
	p.mu.Lock()
	defer p.mu.Unlock()
	var min time.Duration
	for _, d := range p.subscribers {
		if min == 0 || d < min {
			min = d
		}
	}
	if min == 0 {
		return 500 * time.Millisecond
	}
	return min
}

func (p *TracePoller) getLastTimeUs() int64 {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.lastTimeUs
}

// run — основная горутина. Выходит когда ctx отменён ИЛИ когда subscribers==0.
func (p *TracePoller) run(ctx context.Context) {
	p.wg.Add(1)
	defer p.wg.Done()

	backoff := p.backoffStart

	for {
		if p.SubscribersCount() == 0 {
			return
		}
		select {
		case <-ctx.Done():
			return
		default:
		}

		p.mu.Lock()
		since := p.lastTimeUs
		p.mu.Unlock()

		env, err := p.fetcher.Fetch(ctx, p.serverID, p.objectName, since, 1024)

		if err != nil {
			p.sse.BroadcastTraceBatch(p.serverID, p.serverName, p.objectName,
				TraceBatch{Enabled: false})
			if backoff > p.backoffMax {
				backoff = p.backoffMax
			}
			p.waitOrDone(ctx, backoff)
			backoff *= 2
			continue
		}

		backoff = p.backoffStart

		if env.Trace == nil || !env.Trace.Enabled {
			p.sse.BroadcastTraceBatch(p.serverID, p.serverName, p.objectName,
				TraceBatch{Enabled: false})
		} else {
			p.updateWatermark(env.Trace.Records)
			p.sse.BroadcastTraceBatch(p.serverID, p.serverName, p.objectName,
				TraceBatch{
					Enabled:  true,
					Overflow: env.Trace.Overflow,
					Records:  env.Trace.Records,
				})
		}

		p.waitOrDone(ctx, p.effectiveInterval())
	}
}

func (p *TracePoller) waitOrDone(ctx context.Context, d time.Duration) {
	select {
	case <-ctx.Done():
	case <-time.After(d):
	}
}

func (p *TracePoller) updateWatermark(recs []json.RawMessage) {
	if len(recs) == 0 {
		return
	}
	var last recordTimeOnly
	if err := json.Unmarshal(recs[len(recs)-1], &last); err != nil {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if last.TimeUs > p.lastTimeUs {
		p.lastTimeUs = last.TimeUs
	}
}

func (p *TracePoller) wait() {
	p.wg.Wait()
}
```

- [ ] **Step 4: Run test — must PASS**

```bash
cd /home/pv/Projects/uniset-panel
go test -v -run TestPoller ./internal/trace/...
```

Expected: all 4 PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add internal/trace/poller.go internal/trace/poller_test.go
git commit -m "feat(trace): TracePoller — shared per server+object with backoff"
```

---

## Task 4: Multi-subscriber adaptive interval

**Files:**
- Modify: `internal/trace/poller_test.go` (add 2 cases)

- [ ] **Step 1: Add failing tests**

Append to `internal/trace/poller_test.go`:

```go
func TestPollerAdaptiveInterval(t *testing.T) {
	p := newTracePoller("srv-1", "srv1", "TestObj", nil, nil)
	p.AddSubscriber("a", 500)
	p.AddSubscriber("b", 100)
	if got := p.effectiveInterval(); got != 100*time.Millisecond {
		t.Errorf("expected 100ms, got %v", got)
	}

	p.RemoveSubscriber("b")
	if got := p.effectiveInterval(); got != 500*time.Millisecond {
		t.Errorf("after remove b, expected 500ms, got %v", got)
	}
}

func TestPollerRemoveLastSubscriberExits(t *testing.T) {
	fetcher := &fakeFetcher{recs: []json.RawMessage{rec(1000)}}
	sse := &fakeSSE{}
	p := newTracePoller("srv-1", "srv1", "TestObj", fetcher, sse)
	p.AddSubscriber("s1", 50)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan struct{})
	go func() {
		p.run(ctx)
		close(done)
	}()

	// Дождёмся первого опроса.
	time.Sleep(100 * time.Millisecond)
	p.RemoveSubscriber("s1")

	select {
	case <-done:
		// OK
	case <-time.After(500 * time.Millisecond):
		t.Fatal("poller did not exit after last subscriber left")
	}
}
```

- [ ] **Step 2: Run test — must PASS (existing code already handles these cases)**

```bash
cd /home/pv/Projects/uniset-panel
go test -v -run TestPollerAdaptive ./internal/trace/...
go test -v -run TestPollerRemoveLastSubscriber ./internal/trace/...
```

Expected: both PASS (logic already implemented in Task 3). If tests fail — implementation bug; fix before commit.

- [ ] **Step 3: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add internal/trace/poller_test.go
git commit -m "test(trace): cover adaptive interval + exit on last unsubscribe"
```

---

## Task 5: Manager (registry of pollers)

**Files:**
- Create: `internal/trace/manager.go`
- Test: `internal/trace/manager_test.go`

- [ ] **Step 1: Write failing tests**

Create `internal/trace/manager_test.go`:

```go
package trace

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"
)

func TestManagerFirstSubscribeCreatesPoller(t *testing.T) {
	m := NewManager(&fakeFetcher{recs: []json.RawMessage{rec(1000)}}, &fakeSSE{})
	id := m.Subscribe(context.Background(), "srv-1", "srv1", "TestObj", 100)
	if id == "" {
		t.Fatal("expected non-empty subscriberID")
	}
	if m.PollerCount() != 1 {
		t.Errorf("expected 1 poller, got %d", m.PollerCount())
	}
	m.Unsubscribe(id)
}

func TestManagerSecondSubscribeReusesPoller(t *testing.T) {
	m := NewManager(&fakeFetcher{recs: []json.RawMessage{rec(1000)}}, &fakeSSE{})
	id1 := m.Subscribe(context.Background(), "srv-1", "srv1", "TestObj", 100)
	id2 := m.Subscribe(context.Background(), "srv-1", "srv1", "TestObj", 200)

	if m.PollerCount() != 1 {
		t.Errorf("expected 1 poller shared between subscribers, got %d", m.PollerCount())
	}
	m.Unsubscribe(id1)
	m.Unsubscribe(id2)
}

func TestManagerDifferentObjectsDifferentPollers(t *testing.T) {
	m := NewManager(&fakeFetcher{}, &fakeSSE{})
	id1 := m.Subscribe(context.Background(), "srv-1", "srv1", "ObjA", 100)
	id2 := m.Subscribe(context.Background(), "srv-1", "srv1", "ObjB", 100)
	if m.PollerCount() != 2 {
		t.Errorf("expected 2 pollers, got %d", m.PollerCount())
	}
	m.Unsubscribe(id1)
	m.Unsubscribe(id2)
}

func TestManagerLastUnsubscribeRemovesPoller(t *testing.T) {
	m := NewManager(&fakeFetcher{recs: []json.RawMessage{rec(1000)}}, &fakeSSE{})
	id := m.Subscribe(context.Background(), "srv-1", "srv1", "TestObj", 50)

	// Дождёмся создания poller'а
	time.Sleep(50 * time.Millisecond)
	if m.PollerCount() != 1 {
		t.Fatalf("expected 1 poller, got %d", m.PollerCount())
	}

	m.Unsubscribe(id)

	// Poller должен уйти из registry после остановки goroutine.
	deadline := time.Now().Add(500 * time.Millisecond)
	for m.PollerCount() > 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if m.PollerCount() != 0 {
		t.Errorf("expected 0 pollers after last unsubscribe, got %d", m.PollerCount())
	}
}

// Race tolerance test.
func TestManagerConcurrentSubscribeUnsubscribe(t *testing.T) {
	m := NewManager(&fakeFetcher{}, &fakeSSE{})
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				id := m.Subscribe(context.Background(), "srv-1", "srv1", "Obj", 100)
				m.Unsubscribe(id)
			}
		}(i)
	}
	wg.Wait()
	// После всех отписок должно быть 0.
	deadline := time.Now().Add(500 * time.Millisecond)
	for m.PollerCount() > 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if m.PollerCount() != 0 {
		t.Errorf("expected 0 pollers, got %d", m.PollerCount())
	}
}
```

- [ ] **Step 2: Run — must fail (NewManager undefined)**

```bash
cd /home/pv/Projects/uniset-panel
go test -v -run TestManager ./internal/trace/...
```

Expected: compile error.

- [ ] **Step 3: Create `internal/trace/manager.go`**

```go
package trace

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"
)

type pollerKey struct {
	serverID, objectName string
}

type pollerEntry struct {
	poller *TracePoller
	cancel context.CancelFunc
}

type Manager struct {
	fetcher Fetcher
	sse     SSEBroadcaster

	mu            sync.Mutex
	pollers       map[pollerKey]*pollerEntry
	subscriberMap map[string]pollerKey // subscriberID → key (для Unsubscribe)
}

func NewManager(fetcher Fetcher, sse SSEBroadcaster) *Manager {
	return &Manager{
		fetcher:       fetcher,
		sse:           sse,
		pollers:       make(map[pollerKey]*pollerEntry),
		subscriberMap: make(map[string]pollerKey),
	}
}

func (m *Manager) Subscribe(ctx context.Context, serverID, serverName,
	objectName string, intervalMS int64) string {

	key := pollerKey{serverID: serverID, objectName: objectName}
	subID := randomID()

	m.mu.Lock()
	entry, ok := m.pollers[key]
	if !ok {
		p := newTracePoller(serverID, serverName, objectName, m.fetcher, m.sse)
		pctx, cancel := context.WithCancel(context.Background())
		entry = &pollerEntry{poller: p, cancel: cancel}
		m.pollers[key] = entry
		go func() {
			p.run(pctx)
			// После завершения run — убрать из registry (если нет новых подписчиков).
			m.mu.Lock()
			if p.SubscribersCount() == 0 {
				delete(m.pollers, key)
			}
			m.mu.Unlock()
		}()
	}
	entry.poller.AddSubscriber(subID, intervalMS)
	m.subscriberMap[subID] = key
	m.mu.Unlock()

	return subID
}

func (m *Manager) Unsubscribe(subscriberID string) {
	m.mu.Lock()
	key, ok := m.subscriberMap[subscriberID]
	if !ok {
		m.mu.Unlock()
		return
	}
	delete(m.subscriberMap, subscriberID)
	entry := m.pollers[key]
	m.mu.Unlock()

	if entry == nil {
		return
	}
	remaining := entry.poller.RemoveSubscriber(subscriberID)
	if remaining == 0 {
		entry.cancel()
	}
}

func (m *Manager) PollerCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.pollers)
}

func randomID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
```

- [ ] **Step 4: Run — must PASS**

```bash
cd /home/pv/Projects/uniset-panel
go test -v -run TestManager ./internal/trace/...
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add internal/trace/manager.go internal/trace/manager_test.go
git commit -m "feat(trace): Manager registry of shared pollers per (server, object)"
```

---

## Task 6: SSE BroadcastTraceBatch + traceOnly filter

**Files:**
- Modify: `internal/api/sse.go`
- Modify: `internal/api/sse_test.go`

- [ ] **Step 1: Write failing tests — append to `internal/api/sse_test.go`**

```go
func TestSSEHubBroadcastTraceBatchDeliversToTraceOnlyClient(t *testing.T) {
	hub := NewSSEHub()
	defer hub.Close()

	client := hub.AddClient("TestObj")
	client.traceOnly = true

	hub.BroadcastTraceBatch("srv-1", "srv1", "TestObj", trace.TraceBatch{
		Enabled: true,
		Records: nil,
	})

	select {
	case ev := <-client.events:
		if ev.Type != "trace" {
			t.Errorf("expected type=trace, got %s", ev.Type)
		}
		if ev.ObjectName != "TestObj" {
			t.Errorf("expected object=TestObj, got %s", ev.ObjectName)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("trace-only client did not receive trace event")
	}
}

func TestSSEHubTraceOnlyClientDoesNotReceiveObjectData(t *testing.T) {
	hub := NewSSEHub()
	defer hub.Close()
	client := hub.AddClient("TestObj")
	client.traceOnly = true

	hub.BroadcastObjectDataWithServer("srv-1", "srv1", "TestObj", nil)

	select {
	case ev := <-client.events:
		t.Fatalf("trace-only client got unexpected event %s", ev.Type)
	case <-time.After(100 * time.Millisecond):
		// OK — событие отфильтровано
	}
}

func TestSSEHubRegularClientDoesNotReceiveTraceEvents(t *testing.T) {
	hub := NewSSEHub()
	defer hub.Close()
	client := hub.AddClient("TestObj") // traceOnly=false по дефолту

	hub.BroadcastTraceBatch("srv-1", "srv1", "TestObj", trace.TraceBatch{Enabled: true})

	select {
	case ev := <-client.events:
		t.Fatalf("regular client got unexpected trace event %s", ev.Type)
	case <-time.After(100 * time.Millisecond):
		// OK
	}
}
```

Add to imports in `sse_test.go`: `"github.com/pv/uniset-panel/internal/trace"`.

- [ ] **Step 2: Run — must fail (BroadcastTraceBatch undefined, traceOnly field missing)**

```bash
cd /home/pv/Projects/uniset-panel
go test -v -run TestSSEHubBroadcastTrace ./internal/api/...
```

Expected: compile error.

- [ ] **Step 3: Modify `internal/api/sse.go`**

Add new event type constant to the existing block (around line 29):

```go
// Find the block:
const (
	EventObjectData         = "object_data"
	...
	EventJournalConnection  = "journal_connection"
	EventTraceBatch         = "trace"  // NEW
)
```

Add `traceOnly` field to `sseClient` struct (around line 55):

```go
type sseClient struct {
	objectName   string
	controlToken string
	connectedAt  time.Time
	events       chan SSEEvent
	done         chan struct{}
	traceOnly    bool  // NEW: client only receives type=trace events
}
```

Update `Broadcast` method filter (around line 148). Find:

```go
	for client := range h.clients {
		if isGlobalEvent || client.objectName == "" || client.objectName == event.ObjectName {
```

Replace with:

```go
	for client := range h.clients {
		// traceOnly clients получают только type=trace; обычные клиенты
		// — всё остальное (не trace).
		if client.traceOnly && event.Type != EventTraceBatch {
			continue
		}
		if !client.traceOnly && event.Type == EventTraceBatch {
			continue
		}
		if isGlobalEvent || client.objectName == "" || client.objectName == event.ObjectName {
```

Add `BroadcastTraceBatch` method at the end of the broadcast methods section (after `BroadcastUWSGateSensorBatchWithServer`):

```go
// BroadcastTraceBatch отправляет trace batch клиентам с traceOnly=true.
func (h *SSEHub) BroadcastTraceBatch(serverID, serverName, objectName string, batch trace.TraceBatch) {
	h.Broadcast(SSEEvent{
		Type:       EventTraceBatch,
		ServerID:   serverID,
		ServerName: serverName,
		ObjectName: objectName,
		Data:       batch,
		Timestamp:  time.Now(),
	})
}
```

Add import `"github.com/pv/uniset-panel/internal/trace"` to top of `internal/api/sse.go`.

- [ ] **Step 4: Run — must PASS**

```bash
cd /home/pv/Projects/uniset-panel
go test -v -run TestSSEHub ./internal/api/...
```

Expected: all existing SSE tests still pass + 3 new pass.

- [ ] **Step 5: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add internal/api/sse.go internal/api/sse_test.go
git commit -m "feat(sse): EventTraceBatch + traceOnly filter + BroadcastTraceBatch"
```

---

## Task 7: Handler GET `/api/trace/events` — SSE endpoint

**Files:**
- Create: `internal/api/handlers_trace.go`
- Create: `internal/api/handlers_trace_test.go`

- [ ] **Step 1: Write failing tests**

Create `internal/api/handlers_trace_test.go`:

```go
package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pv/uniset-panel/internal/trace"
)

type fakeResolver struct{ url string }

func (r fakeResolver) GetServerURL(id string) (string, error) {
	if r.url == "" {
		return "", nil
	}
	return r.url, nil
}

type fakeFetcherForHandler struct{}

func (fakeFetcherForHandler) Fetch(ctx context.Context, s, o string, since int64, l int) (dumpEnvelope, error) {
	return dumpEnvelope{}, nil
}

func TestHandleTraceEventsRejectsMissingObject(t *testing.T) {
	h := &Handlers{sseHub: NewSSEHub(), traceMgr: trace.NewManager(nil, nil)}
	defer h.sseHub.Close()

	req := httptest.NewRequest("GET", "/api/trace/events?server=srv-1", nil)
	rec := httptest.NewRecorder()
	h.HandleTraceEvents(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 on missing object, got %d", rec.Code)
	}
}

func TestHandleTraceEventsRejectsMissingServer(t *testing.T) {
	h := &Handlers{sseHub: NewSSEHub(), traceMgr: trace.NewManager(nil, nil)}
	defer h.sseHub.Close()

	req := httptest.NewRequest("GET", "/api/trace/events?object=X", nil)
	rec := httptest.NewRecorder()
	h.HandleTraceEvents(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 on missing server, got %d", rec.Code)
	}
}

func TestHandleTraceEventsClampInterval(t *testing.T) {
	if got := clampInterval(50); got != 100 {
		t.Errorf("expected 100 (min), got %d", got)
	}
	if got := clampInterval(20000); got != 10000 {
		t.Errorf("expected 10000 (max), got %d", got)
	}
	if got := clampInterval(-1); got != 500 {
		t.Errorf("expected 500 (default), got %d", got)
	}
	if got := clampInterval(250); got != 250 {
		t.Errorf("expected 250 passthrough, got %d", got)
	}
}

func TestHandleTraceEventsStartsStream(t *testing.T) {
	// Fake upstream: /TestObj/dump возвращает минимальный trace.
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"TestObj":{"trace":{"enabled":true,"records":[]}}}`))
	}))
	defer upstream.Close()

	mgr := trace.NewManager(trace.NewClient(fakeResolver{url: upstream.URL}), nil)
	hub := NewSSEHub()
	defer hub.Close()
	// Перепривязываем mgr.sse -> hub через тестовый конструктор (см. ниже).
	mgr = trace.NewManagerWithSSE(trace.NewClient(fakeResolver{url: upstream.URL}), hub)

	h := &Handlers{sseHub: hub, traceMgr: mgr}

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	req := httptest.NewRequest("GET", "/api/trace/events?object=TestObj&server=srv-1&interval=100", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	h.HandleTraceEvents(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Header().Get("Content-Type"), "text/event-stream") {
		t.Errorf("expected SSE content-type, got %s", rec.Header().Get("Content-Type"))
	}
	if !strings.Contains(rec.Body.String(), `"type":"trace"`) {
		t.Errorf("expected at least one trace event in body, got: %s", rec.Body.String())
	}
}
```

- [ ] **Step 2: Run — must fail (HandleTraceEvents, clampInterval, traceMgr, NewManagerWithSSE undefined)**

```bash
cd /home/pv/Projects/uniset-panel
go test -v -run TestHandleTrace ./internal/api/...
```

Expected: compile error.

- [ ] **Step 3: Extend Handlers struct in `internal/api/handlers.go`**

Find the `Handlers` struct declaration; add:

```go
type Handlers struct {
	// ... existing fields ...
	traceMgr *trace.Manager
}
```

And add import `"github.com/pv/uniset-panel/internal/trace"`.

- [ ] **Step 4: Add alternate Manager constructor that accepts SSE directly (for handler tests)**

In `internal/trace/manager.go`:

```go
// NewManagerWithSSE — тот же, что NewManager, но принимает SSEBroadcaster
// напрямую (удобно для тестирования handler'ов, где sseHub известен заранее).
func NewManagerWithSSE(fetcher Fetcher, sse SSEBroadcaster) *Manager {
	return NewManager(fetcher, sse)
}
```

(Если `NewManager` уже принимает SSE — constructor один. Эта функция — just alias для ясности.)

Actually `NewManager` уже принимает sse. Этот пункт — no-op, но добавим alias чтобы тест читался. Или просто уберём из теста — оба варианта ОК.

Simpler: в тесте вызывать `trace.NewManager(client, hub)` напрямую и убрать `NewManagerWithSSE` из спецификации. Упрощаю: удалить этот шаг, поправить тест в Step 1. Переходим к Step 5.

*correction:* обновить тест `TestHandleTraceEventsStartsStream` — заменить `trace.NewManagerWithSSE` на `trace.NewManager`, убрать лишние строчки:

```go
	mgr := trace.NewManager(trace.NewClient(fakeResolver{url: upstream.URL}), hub)
```

- [ ] **Step 5: Create `internal/api/handlers_trace.go`**

```go
package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

func clampInterval(ms int64) int64 {
	const minMS, maxMS, defaultMS = 100, 10000, 500
	if ms <= 0 {
		return defaultMS
	}
	if ms < minMS {
		return minMS
	}
	if ms > maxMS {
		return maxMS
	}
	return ms
}

// HandleTraceEvents GET /api/trace/events?object=X&server=S&interval=N[&token=T]
func (h *Handlers) HandleTraceEvents(w http.ResponseWriter, r *http.Request) {
	object := r.URL.Query().Get("object")
	server := r.URL.Query().Get("server")
	if object == "" || server == "" {
		http.Error(w, `query params "object" and "server" required`, http.StatusBadRequest)
		return
	}

	intervalStr := r.URL.Query().Get("interval")
	interval, _ := strconv.ParseInt(intervalStr, 10, 64)
	interval = clampInterval(interval)

	// Server name: можно попробовать резолвить через ServerManager, если он подключён.
	serverName := server

	// Подписка
	subID := h.traceMgr.Subscribe(r.Context(), server, serverName, object, interval)
	defer h.traceMgr.Unsubscribe(subID)

	// SSE client с флагом traceOnly
	client := h.sseHub.AddClient(object)
	client.traceOnly = true
	defer h.sseHub.RemoveClient(client)

	// Стандартные SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	flusher, ok := w.(http.Flusher)
	if !ok {
		return
	}
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-client.done:
			return
		case ev, ok := <-client.events:
			if !ok {
				return
			}
			payload, err := json.Marshal(ev)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Type, payload)
			flusher.Flush()
		}
	}

	_ = strings.Builder{} // suppress unused import warning in some builds; remove if not needed
}
```

Remove the trailing unused-import workaround; actually `strings` is used nowhere — remove the import.

- [ ] **Step 6: Run tests — must PASS**

```bash
cd /home/pv/Projects/uniset-panel
go test -v -run TestHandleTrace ./internal/api/...
```

Expected: 4 PASS.

- [ ] **Step 7: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add internal/api/handlers_trace.go internal/api/handlers_trace_test.go internal/api/handlers.go
git commit -m "feat(api): HandleTraceEvents SSE endpoint + clampInterval helper"
```

---

## Task 8: Proxy endpoints enable/disable

**Files:**
- Modify: `internal/api/handlers_trace.go`
- Modify: `internal/api/handlers_trace_test.go`

- [ ] **Step 1: Add failing tests**

Append to `internal/api/handlers_trace_test.go`:

```go
func TestHandleTraceEnableProxies(t *testing.T) {
	var gotPath string
	var gotMethod string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path + "?" + r.URL.RawQuery
		gotMethod = r.Method
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"enabled":true,"buffer_size":1024}`))
	}))
	defer upstream.Close()

	h := &Handlers{resolver: fakeResolver{url: upstream.URL}}

	req := httptest.NewRequest("POST",
		"/api/trace/servers/srv-1/objects/TestObj/enable?size=1024", nil)
	req.SetPathValue("serverId", "srv-1")
	req.SetPathValue("objectName", "TestObj")

	rec := httptest.NewRecorder()
	h.HandleTraceEnable(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	if gotMethod != "POST" {
		t.Errorf("expected POST upstream, got %s", gotMethod)
	}
	if !strings.Contains(gotPath, "/TestObj/trace/enable?size=1024") {
		t.Errorf("expected path /TestObj/trace/enable with size, got %s", gotPath)
	}
}

func TestHandleTraceEnablePassesThrough403(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		w.Write([]byte(`{"error":"trace HTTP control is disabled","status":403}`))
	}))
	defer upstream.Close()

	h := &Handlers{resolver: fakeResolver{url: upstream.URL}}

	req := httptest.NewRequest("POST",
		"/api/trace/servers/srv-1/objects/TestObj/enable?size=1024", nil)
	req.SetPathValue("serverId", "srv-1")
	req.SetPathValue("objectName", "TestObj")

	rec := httptest.NewRecorder()
	h.HandleTraceEnable(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("expected passthrough 403, got %d", rec.Code)
	}
}

func TestHandleTraceDisableProxies(t *testing.T) {
	var gotPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Write([]byte(`{"enabled":false}`))
	}))
	defer upstream.Close()

	h := &Handlers{resolver: fakeResolver{url: upstream.URL}}

	req := httptest.NewRequest("POST",
		"/api/trace/servers/srv-1/objects/TestObj/disable", nil)
	req.SetPathValue("serverId", "srv-1")
	req.SetPathValue("objectName", "TestObj")

	rec := httptest.NewRecorder()
	h.HandleTraceDisable(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	if !strings.Contains(gotPath, "/TestObj/trace/disable") {
		t.Errorf("expected /TestObj/trace/disable, got %s", gotPath)
	}
}
```

- [ ] **Step 2: Add `resolver` field to Handlers**

In `internal/api/handlers.go`:

```go
type Handlers struct {
	// ... existing ...
	traceMgr *trace.Manager
	resolver trace.ServerResolver
}
```

- [ ] **Step 3: Add proxy handlers to `internal/api/handlers_trace.go`**

```go
// HandleTraceEnable POST /api/trace/servers/{serverId}/objects/{objectName}/enable?size=N
func (h *Handlers) HandleTraceEnable(w http.ResponseWriter, r *http.Request) {
	h.proxyTrace(w, r, "enable")
}

// HandleTraceDisable POST /api/trace/servers/{serverId}/objects/{objectName}/disable
func (h *Handlers) HandleTraceDisable(w http.ResponseWriter, r *http.Request) {
	h.proxyTrace(w, r, "disable")
}

func (h *Handlers) proxyTrace(w http.ResponseWriter, r *http.Request, action string) {
	serverID := r.PathValue("serverId")
	objectName := r.PathValue("objectName")
	if serverID == "" || objectName == "" {
		http.Error(w, "serverId and objectName required", http.StatusBadRequest)
		return
	}

	baseURL, err := h.resolver.GetServerURL(serverID)
	if err != nil {
		http.Error(w, "server not found", http.StatusNotFound)
		return
	}

	targetURL := strings.TrimRight(baseURL, "/") + "/" + objectName + "/trace/" + action
	if r.URL.RawQuery != "" {
		targetURL += "?" + r.URL.RawQuery
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, targetURL, r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	for k, vv := range r.Header {
		for _, v := range vv {
			req.Header.Add(k, v)
		}
	}

	httpClient := &http.Client{Timeout: 5 * time.Second}
	resp, err := httpClient.Do(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}
```

Add imports `"io"`, `"strings"`, `"time"` to the top of `handlers_trace.go`.

- [ ] **Step 4: Run — must PASS**

```bash
cd /home/pv/Projects/uniset-panel
go test -v -run TestHandleTraceEnable ./internal/api/...
go test -v -run TestHandleTraceDisable ./internal/api/...
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add internal/api/handlers_trace.go internal/api/handlers_trace_test.go internal/api/handlers.go
git commit -m "feat(api): trace/enable and trace/disable proxy endpoints"
```

---

## Task 9: Wiring + routes + docs + integration test

**Files:**
- Modify: `internal/api/server.go`
- Modify: `internal/api/handlers.go` (constructor)
- Create: `internal/trace/integration_test.go`
- Create: `docs/DocPages/UObject-debug-trace-panel.md`

- [ ] **Step 1: Add routes in `internal/api/server.go`**

Find the `s.mux.HandleFunc(...)` block and add:

```go
s.mux.HandleFunc("GET /api/trace/events", s.handlers.HandleTraceEvents)
s.mux.HandleFunc("POST /api/trace/servers/{serverId}/objects/{objectName}/enable",
	s.handlers.HandleTraceEnable)
s.mux.HandleFunc("POST /api/trace/servers/{serverId}/objects/{objectName}/disable",
	s.handlers.HandleTraceDisable)
```

- [ ] **Step 2: Wire Handlers constructor**

In `internal/api/handlers.go`, find `NewHandlers` or equivalent constructor. Add initialization:

```go
func NewHandlers(/* existing params */) *Handlers {
	h := &Handlers{ /* existing init */ }

	// ServerResolver — адаптер над Manager
	resolver := &serverManagerResolver{mgr: /* существующий ServerManager */}
	h.resolver = resolver
	h.traceMgr = trace.NewManager(trace.NewClient(resolver), h.sseHub)
	return h
}

// serverManagerResolver удовлетворяет trace.ServerResolver интерфейсу.
type serverManagerResolver struct {
	mgr *server.Manager
}

func (r *serverManagerResolver) GetServerURL(id string) (string, error) {
	inst, ok := r.mgr.GetServer(id)
	if !ok {
		return "", fmt.Errorf("server %s not found", id)
	}
	return inst.Config.URL, nil
}
```

Add imports if not already present: `"github.com/pv/uniset-panel/internal/server"`, `"github.com/pv/uniset-panel/internal/trace"`, `"fmt"`.

- [ ] **Step 3: Create integration test**

Create `internal/trace/integration_test.go`:

```go
package trace_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pv/uniset-panel/internal/trace"
)

// End-to-end: fake uniset → Client → Manager → recorder SSE → expected events.
type recordingSSE struct {
	count atomic.Int32
}

func (r *recordingSSE) BroadcastTraceBatch(s, sn, o string, b trace.TraceBatch) {
	r.count.Add(1)
}

type urlResolver struct{ url string }

func (u urlResolver) GetServerURL(string) (string, error) { return u.url, nil }

func TestIntegrationTraceFlow(t *testing.T) {
	calls := atomic.Int32{}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		resp := map[string]any{
			"TestObj": map[string]any{
				"trace": map[string]any{
					"enabled": true,
					"records": []any{
						map[string]any{
							"time_us": 1000 * calls.Load(),
							"type":    "sensorInfo",
							"id":      5,
							"value":   int(calls.Load()),
						},
					},
				},
			},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer upstream.Close()

	client := trace.NewClient(urlResolver{url: upstream.URL})
	rec := &recordingSSE{}
	mgr := trace.NewManager(client, rec)

	subID := mgr.Subscribe(context.Background(), "srv-1", "srv1", "TestObj", 100)
	time.Sleep(300 * time.Millisecond)
	mgr.Unsubscribe(subID)

	// Дождёмся cleanup'а.
	deadline := time.Now().Add(500 * time.Millisecond)
	for mgr.PollerCount() > 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}

	if got := rec.count.Load(); got < 2 {
		t.Errorf("expected >=2 trace batches, got %d", got)
	}
	if mgr.PollerCount() != 0 {
		t.Errorf("expected poller cleanup, count=%d", mgr.PollerCount())
	}
}
```

- [ ] **Step 4: Create docs `docs/DocPages/UObject-debug-trace-panel.md`**

```markdown
# Trace API (panel side)

Панель проксирует trace-API uniset (Спек 1) к фронтенду через SSE +
REST endpoints для runtime-управления.

## Endpoints

### GET `/api/trace/events`

SSE-стрим trace-событий для одного объекта.

**Query параметры:**

| Параметр | Обязательный | Описание |
|---|---|---|
| `object` | да | имя UObject (например `DG_Control`) |
| `server` | да | serverID (из ServerManager) |
| `interval` | нет | период опроса в мс; clamp [100, 10000]; default 500 |
| `token` | нет | токен сессии (резерв для будущего) |

**Формат события** (JSON):

```json
{
  "type": "trace",
  "serverId": "srv-1",
  "serverName": "site-A",
  "objectName": "DG_Control",
  "data": {
    "enabled": true,
    "overflow": false,
    "records": [ ... ]
  },
  "timestamp": "2026-04-18T12:34:56Z"
}
```

`records[]` — raw JSON, схема определена в Спеке 1 (uniset side). Клиент
принимает записи как есть без нормализации.

### POST `/api/trace/servers/{serverId}/objects/{objectName}/enable?size=N`

Прокси на uniset `POST /<objectName>/trace/enable?size=N`. Status и body
passthrough. Требует на uniset `--<prefix>trace-http-control 1`.

### POST `/api/trace/servers/{serverId}/objects/{objectName}/disable`

Прокси на uniset `POST /<objectName>/trace/disable`.

## Архитектура

- `trace.Manager` — registry shared `TracePoller` per `(serverID, objectName)`.
- Несколько клиентов на один объект → один poller; effective interval = min.
- Poller делает `GET /<object>/dump?trace=1&since=<us>&limit=1024` с backoff 1s→30s.
- SSE-клиент через `/api/trace/events` помечается `traceOnly=true`: получает
  ТОЛЬКО trace-события, не object_data.
```

- [ ] **Step 5: Run full test suite**

```bash
cd /home/pv/Projects/uniset-panel
go test ./...
```

Expected: all packages pass. No regressions in existing tests.

- [ ] **Step 6: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add internal/api/server.go internal/api/handlers.go \
        internal/trace/integration_test.go \
        docs/DocPages/UObject-debug-trace-panel.md
git commit -m "feat(api): wire trace routes + handlers; integration test + docs"
```

---

## Self-review notes

**Spec coverage:**
- ✅ `internal/trace/` package — Task 1-5.
- ✅ SSE `EventTraceBatch` + `traceOnly` filter — Task 6.
- ✅ `/api/trace/events` SSE endpoint — Task 7.
- ✅ `/api/trace/servers/.../enable|disable` proxy — Task 8.
- ✅ Unit tests per component + integration test — Tasks 2-9.
- ✅ Documentation — Task 9.
- ⚠️ `ServerResolver` adapter over existing `server.Manager` — Task 9 Step 2 gives a template; exact constructor location TBD at implementation time (will differ based on current `handlers.go` structure).

**Placeholder scan:** no "TBD"/"TODO" in code blocks. One section ("exact constructor location TBD") — documented as "verify at implementation time" which is honest limitation, not a plan hole.

**Type consistency:** `TraceBatch`, `Fetcher`, `SSEBroadcaster`, `Manager`, `TracePoller` — sigs consistent across tasks. `SubscriberID` is `string`. `intervalMS` as `int64` через API, converted to `time.Duration` внутри poller.

**Known unknowns:**
- Exact shape of existing `NewHandlers` constructor — Task 9 Step 2 assumes modification points; subagent should read the file first.
- Whether `server.Manager.GetServer` returns `*Instance` with `Config.URL` field — confirmed in brainstorming (verified from code).

---

## Dependencies

```
1 (types)
  ↓
2 (client) ───┐
  ↓           │
3 (poller single)
  ↓
4 (poller multi-sub)
  ↓
5 (manager) ──┤
              │
6 (SSE filter) ─┤
                │
7 (handler SSE) │
  ↓             │
8 (handler proxy)
  ↓
9 (wiring + integration + docs)
```

Задачи 1-5 строятся friend-less (trace package в изоляции). Задача 6 параллельна 5 (разные файлы). Задачи 7-9 последовательны.
