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

func TestGetObjectsByType_emptyType(t *testing.T) {
	store := storage.NewMemoryStorage()
	mgr := server.NewManager(store, 5*time.Second, time.Hour, "TestProc", 0)
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

func TestGetObjectsByType_routeRegistered(t *testing.T) {
	mock := startMockUnisetWithTypes(t, map[string]string{
		"SharedMemory": "IONotifyController",
	})
	defer mock.Close()

	store := storage.NewMemoryStorage()
	mgr := server.NewManager(store, 5*time.Second, time.Hour, "TestProc", 0)
	if err := mgr.AddServer(config.ServerConfig{ID: "srv1", URL: mock.URL, Name: "S1"}); err != nil {
		t.Fatalf("AddServer: %v", err)
	}
	defer mgr.RemoveServer("srv1")

	h := &Handlers{storage: store, sseHub: NewSSEHub(), pollInterval: 5 * time.Second}
	h.SetServerManager(mgr)

	srv := NewServer(h, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/objects-by-type?type=IONotifyController", nil)
	rr := httptest.NewRecorder()
	srv.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d (body: %s)", rr.Code, rr.Body.String())
	}
}

func TestGetObjectsByType_noMatches(t *testing.T) {
	mock := startMockUnisetWithTypes(t, map[string]string{
		"MBSlave1": "ModbusSlave",
	})
	defer mock.Close()

	store := storage.NewMemoryStorage()
	mgr := server.NewManager(store, 5*time.Second, time.Hour, "TestProc", 0)
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
