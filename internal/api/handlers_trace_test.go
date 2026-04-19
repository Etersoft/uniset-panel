package api

import (
	"context"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

// fakeTraceMgr implements TraceManagerInterface for tests.
type fakeTraceMgr struct {
	mu           sync.Mutex
	lastServer   string
	lastObj      string
	lastInterval int64
	subscribeN   int
	unsubscribeN int
}

func (f *fakeTraceMgr) Subscribe(serverID, serverName, objectName string, intervalMS int64) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.subscribeN++
	f.lastServer = serverID
	f.lastObj = objectName
	f.lastInterval = intervalMS
	return "tok-" + serverID + "-" + objectName
}

func (f *fakeTraceMgr) Unsubscribe(_ string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.unsubscribeN++
}

func (f *fakeTraceMgr) PollerCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.subscribeN - f.unsubscribeN
}

func (f *fakeTraceMgr) StopAll() {}

func (f *fakeTraceMgr) snapshot() (subN, unsubN int, lastInterval int64) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.subscribeN, f.unsubscribeN, f.lastInterval
}

func TestHandleTraceEvents_missingRequired(t *testing.T) {
	h := &Handlers{traceMgr: &fakeTraceMgr{}, sseHub: NewSSEHub()}

	// missing object
	req := httptest.NewRequest("GET", "/api/trace/events?server=srv-1", nil)
	rec := httptest.NewRecorder()
	h.HandleTraceEvents(rec, req)
	if rec.Code != 400 {
		t.Errorf("missing object: expected 400, got %d", rec.Code)
	}

	// missing server
	req = httptest.NewRequest("GET", "/api/trace/events?object=X", nil)
	rec = httptest.NewRecorder()
	h.HandleTraceEvents(rec, req)
	if rec.Code != 400 {
		t.Errorf("missing server: expected 400, got %d", rec.Code)
	}
}

func TestHandleTraceEvents_noManager(t *testing.T) {
	h := &Handlers{traceMgr: nil, sseHub: NewSSEHub()}
	req := httptest.NewRequest("GET", "/api/trace/events?object=X&server=S", nil)
	rec := httptest.NewRecorder()
	h.HandleTraceEvents(rec, req)
	if rec.Code != 503 {
		t.Errorf("expected 503, got %d", rec.Code)
	}
}

func TestHandleTraceEvents_noSSEHub(t *testing.T) {
	h := &Handlers{traceMgr: &fakeTraceMgr{}, sseHub: nil}
	req := httptest.NewRequest("GET", "/api/trace/events?object=X&server=S", nil)
	rec := httptest.NewRecorder()
	h.HandleTraceEvents(rec, req)
	if rec.Code != 503 {
		t.Errorf("expected 503 (no sse hub), got %d", rec.Code)
	}
}

func TestHandleTraceEvents_intervalClampLow(t *testing.T) {
	mgr := &fakeTraceMgr{}
	hub := NewSSEHub()
	h := &Handlers{traceMgr: mgr, sseHub: hub}

	req := httptest.NewRequest("GET", "/api/trace/events?object=X&server=srv-1&interval=10", nil)
	ctx, cancel := context.WithCancel(req.Context())
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		h.HandleTraceEvents(rec, req)
		close(done)
	}()

	// Give handler time to subscribe, then cancel.
	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		subN, _, _ := mgr.snapshot()
		if subN == 1 {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	cancel()

	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("handler did not return after context cancel")
	}

	subN, unsubN, interval := mgr.snapshot()
	if interval != 100 {
		t.Errorf("interval clamp low: expected 100, got %d", interval)
	}
	if subN != 1 {
		t.Errorf("Subscribe should be called once, got %d", subN)
	}
	if unsubN != 1 {
		t.Errorf("Unsubscribe should be called once, got %d", unsubN)
	}
	if mgr.lastServer != "srv-1" || mgr.lastObj != "X" {
		t.Errorf("unexpected Subscribe args: server=%q obj=%q", mgr.lastServer, mgr.lastObj)
	}
}

func TestHandleTraceEvents_intervalClampHigh(t *testing.T) {
	mgr := &fakeTraceMgr{}
	hub := NewSSEHub()
	h := &Handlers{traceMgr: mgr, sseHub: hub}

	req := httptest.NewRequest("GET", "/api/trace/events?object=Y&server=srv-2&interval=99999", nil)
	ctx, cancel := context.WithCancel(req.Context())
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		h.HandleTraceEvents(rec, req)
		close(done)
	}()

	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		subN, _, _ := mgr.snapshot()
		if subN == 1 {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	cancel()

	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("handler did not return after context cancel")
	}

	_, _, interval := mgr.snapshot()
	if interval != 10000 {
		t.Errorf("interval clamp high: expected 10000, got %d", interval)
	}
}

func TestHandleTraceEvents_intervalDefault(t *testing.T) {
	mgr := &fakeTraceMgr{}
	hub := NewSSEHub()
	h := &Handlers{traceMgr: mgr, sseHub: hub}

	// No interval param → default 500.
	req := httptest.NewRequest("GET", "/api/trace/events?object=Z&server=srv-3", nil)
	ctx, cancel := context.WithCancel(req.Context())
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		h.HandleTraceEvents(rec, req)
		close(done)
	}()

	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		subN, _, _ := mgr.snapshot()
		if subN == 1 {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	cancel()

	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("handler did not return after context cancel")
	}

	_, _, interval := mgr.snapshot()
	if interval != 500 {
		t.Errorf("default interval: expected 500, got %d", interval)
	}
}

func TestHandleTraceEvents_forwardsTraceEvent(t *testing.T) {
	mgr := &fakeTraceMgr{}
	hub := NewSSEHub()
	h := &Handlers{traceMgr: mgr, sseHub: hub}

	req := httptest.NewRequest("GET", "/api/trace/events?object=OBJ&server=srv-1", nil)
	ctx, cancel := context.WithCancel(req.Context())
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		h.HandleTraceEvents(rec, req)
		close(done)
	}()

	// Wait for subscription to be registered.
	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		subN, _, _ := mgr.snapshot()
		if subN == 1 {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}

	// Directly push a synthetic SSE event into all trace clients' channels
	// by calling hub.Broadcast with EventTrace + matching object.
	// Wait briefly so client is registered in hub before broadcasting.
	time.Sleep(20 * time.Millisecond)
	hub.Broadcast(SSEEvent{
		Type:       EventTrace,
		ObjectName: "OBJ",
		ServerID:   "srv-1",
		Timestamp:  time.Now(),
		Data:       map[string]string{"hello": "world"},
	})

	// Give the handler time to write the event.
	time.Sleep(40 * time.Millisecond)
	cancel()

	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("handler did not return after context cancel")
	}

	body := rec.Body.String()
	if body == "" {
		t.Fatal("expected SSE body, got empty")
	}
	if !containsAll(body, "event: trace", `"objectName":"OBJ"`) {
		t.Errorf("expected trace event in body, got:\n%s", body)
	}
}

func containsAll(s string, needles ...string) bool {
	for _, n := range needles {
		if !indexContains(s, n) {
			return false
		}
	}
	return true
}

func indexContains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
