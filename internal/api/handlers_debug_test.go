package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pv/uniset-panel/internal/debug"
)

type fakeDebugClient struct {
	snap *debug.Snapshot
	err  error
}

func (f *fakeDebugClient) Snapshot(_ context.Context, _, _ string) (*debug.Snapshot, error) {
	return f.snap, f.err
}

func TestHandleSnapshot_happy(t *testing.T) {
	fake := &fakeDebugClient{snap: &debug.Snapshot{
		Object: "DG_Control", Server: "srv-1",
		Inputs:  []debug.Port{{ID: 101, Name: "in_Temp", Value: 75.0}},
		Outputs: []debug.Port{{ID: 205, Name: "out_Speed", Value: 1500.0}},
		Variables:  map[string]any{"state_main": 2.0},
		Timers:     []debug.Timer{{ID: 7, Name: "T1", IntervalMS: 500}},
		Statistics: map[string]any{},
		SMObject:   "SharedMemory",
	}}
	h := &Handlers{debugClient: fake}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/servers/{id}/objects/{name}/snapshot", h.HandleSnapshot)

	req := httptest.NewRequest("GET",
		"/api/servers/srv-1/objects/DG_Control/snapshot", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	var got debug.Snapshot
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Object != "DG_Control" || got.SMObject != "SharedMemory" {
		t.Errorf("envelope: %+v", got)
	}
	if len(got.Inputs) != 1 || got.Inputs[0].ID != 101 {
		t.Errorf("inputs: %+v", got.Inputs)
	}
}

func TestHandleSnapshot_missingName(t *testing.T) {
	h := &Handlers{debugClient: &fakeDebugClient{}}
	req := httptest.NewRequest("GET", "/api/servers/srv-1/objects//snapshot", nil)
	req.SetPathValue("id", "srv-1")
	req.SetPathValue("name", "")
	rec := httptest.NewRecorder()
	h.HandleSnapshot(rec, req)
	if rec.Code != 400 {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestHandleSnapshot_notFound(t *testing.T) {
	fake := &fakeDebugClient{err: debug.ErrObjectNotFound}
	h := &Handlers{debugClient: fake}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/servers/{id}/objects/{name}/snapshot", h.HandleSnapshot)

	req := httptest.NewRequest("GET",
		"/api/servers/srv-1/objects/NoSuch/snapshot", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != 404 {
		t.Errorf("expected 404, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "not found") {
		t.Errorf("body: %s", rec.Body.String())
	}
}

func TestHandleSnapshot_networkError_maps_to_502(t *testing.T) {
	fake := &fakeDebugClient{err: fmt.Errorf("%w: dial tcp: connection refused", debug.ErrUpstream)}
	h := &Handlers{debugClient: fake}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/servers/{id}/objects/{name}/snapshot", h.HandleSnapshot)

	req := httptest.NewRequest("GET", "/api/servers/srv-1/objects/X/snapshot", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != 502 {
		t.Errorf("expected 502 Bad Gateway, got %d", rec.Code)
	}
}

func TestHandleSnapshot_noClient(t *testing.T) {
	h := &Handlers{debugClient: nil}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/servers/{id}/objects/{name}/snapshot", h.HandleSnapshot)

	req := httptest.NewRequest("GET",
		"/api/servers/srv-1/objects/X/snapshot", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != 503 {
		t.Errorf("expected 503 when debugClient nil, got %d", rec.Code)
	}
}
