package launcher

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClient_GetStatus(t *testing.T) {
	status := LauncherStatus{
		AllRunning:        true,
		AnyCriticalFailed: false,
		Processes: []Process{
			{Name: "SharedMemory", State: "RUNNING", PID: 1234, Group: "core"},
			{Name: "IOController", State: "RUNNING", PID: 1235, Group: "io"},
		},
		Groups: []ProcessGroup{
			{Name: "core", Order: 1, Processes: []string{"SharedMemory"}},
			{Name: "io", Order: 2, Processes: []string{"IOController"}},
		},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2/launcher" {
			t.Errorf("unexpected path: %s", r.URL.Path)
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet {
			t.Errorf("expected GET, got %s", r.Method)
		}
		json.NewEncoder(w).Encode(status)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, "", "")
	got, err := client.GetStatus(context.Background())
	if err != nil {
		t.Fatalf("GetStatus failed: %v", err)
	}

	if !got.AllRunning {
		t.Error("expected AllRunning = true")
	}
	if len(got.Processes) != 2 {
		t.Errorf("expected 2 processes, got %d", len(got.Processes))
	}
	if got.Processes[0].Name != "SharedMemory" {
		t.Errorf("expected first process SharedMemory, got %s", got.Processes[0].Name)
	}
	if len(got.Groups) != 2 {
		t.Errorf("expected 2 groups, got %d", len(got.Groups))
	}
}

func TestClient_GetProcesses(t *testing.T) {
	processes := []Process{
		{Name: "Proc1", State: "RUNNING", PID: 100},
		{Name: "Proc2", State: "STOPPED"},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2/launcher/processes" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		json.NewEncoder(w).Encode(processes)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, "", "")
	got, err := client.GetProcesses(context.Background())
	if err != nil {
		t.Fatalf("GetProcesses failed: %v", err)
	}

	if len(got) != 2 {
		t.Fatalf("expected 2 processes, got %d", len(got))
	}
	if got[0].State != "RUNNING" {
		t.Errorf("expected RUNNING, got %s", got[0].State)
	}
	if got[1].State != "STOPPED" {
		t.Errorf("expected STOPPED, got %s", got[1].State)
	}
}

func TestClient_GetGroups(t *testing.T) {
	groups := []ProcessGroup{
		{Name: "core", Order: 1, Processes: []string{"SM"}},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2/launcher/groups" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		json.NewEncoder(w).Encode(groups)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, "", "")
	got, err := client.GetGroups(context.Background())
	if err != nil {
		t.Fatalf("GetGroups failed: %v", err)
	}

	if len(got) != 1 {
		t.Fatalf("expected 1 group, got %d", len(got))
	}
	if got[0].Name != "core" {
		t.Errorf("expected core, got %s", got[0].Name)
	}
}

func TestClient_Health(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2/launcher/health" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		json.NewEncoder(w).Encode(HealthStatus{
			Status:     "healthy",
			AllRunning: true,
		})
	}))
	defer srv.Close()

	client := NewClient(srv.URL, "", "")
	got, err := client.Health(context.Background())
	if err != nil {
		t.Fatalf("Health failed: %v", err)
	}
	if got.Status != "healthy" {
		t.Errorf("expected healthy, got %s", got.Status)
	}
	if !got.AllRunning {
		t.Error("expected AllRunning = true")
	}
}

func TestClient_ReadToken(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		json.NewEncoder(w).Encode(LauncherStatus{})
	}))
	defer srv.Close()

	client := NewClient(srv.URL, "mytoken", "")
	_, err := client.GetStatus(context.Background())
	if err != nil {
		t.Fatalf("GetStatus failed: %v", err)
	}

	if gotAuth != "Bearer mytoken" {
		t.Errorf("expected Authorization 'Bearer mytoken', got %q", gotAuth)
	}
}

func TestClient_ControlToken(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}))
	defer srv.Close()

	client := NewClient(srv.URL, "", "secret123")
	err := client.RestartProcess(context.Background(), "SharedMemory")
	if err != nil {
		t.Fatalf("RestartProcess failed: %v", err)
	}

	if gotAuth != "Bearer secret123" {
		t.Errorf("expected Authorization 'Bearer secret123', got %q", gotAuth)
	}
}

func TestClient_NoTokens(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		json.NewEncoder(w).Encode(LauncherStatus{})
	}))
	defer srv.Close()

	client := NewClient(srv.URL, "", "")
	_, err := client.GetStatus(context.Background())
	if err != nil {
		t.Fatalf("GetStatus failed: %v", err)
	}

	if gotAuth != "" {
		t.Errorf("expected no Authorization header, got %q", gotAuth)
	}
}

func TestClient_PostPaths(t *testing.T) {
	tests := []struct {
		name     string
		action   func(c *Client) error
		wantPath string
		wantPost bool
	}{
		{
			name:     "RestartProcess",
			action:   func(c *Client) error { return c.RestartProcess(context.Background(), "SM") },
			wantPath: "/api/v2/launcher/process/SM/restart",
			wantPost: true,
		},
		{
			name:     "StopProcess",
			action:   func(c *Client) error { return c.StopProcess(context.Background(), "SM") },
			wantPath: "/api/v2/launcher/process/SM/stop",
			wantPost: true,
		},
		{
			name:     "StartProcess",
			action:   func(c *Client) error { return c.StartProcess(context.Background(), "SM") },
			wantPath: "/api/v2/launcher/process/SM/start",
			wantPost: true,
		},
		{
			name:     "RestartAll",
			action:   func(c *Client) error { return c.RestartAll(context.Background()) },
			wantPath: "/api/v2/launcher/restart-all",
			wantPost: true,
		},
		{
			name:     "ReloadAll",
			action:   func(c *Client) error { return c.ReloadAll(context.Background()) },
			wantPath: "/api/v2/launcher/reload-all",
			wantPost: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var gotPath, gotMethod string
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotPath = r.URL.Path
				gotMethod = r.Method
				w.WriteHeader(http.StatusOK)
			}))
			defer srv.Close()

			client := NewClient(srv.URL, "", "")
			err := tt.action(client)
			if err != nil {
				t.Fatalf("action failed: %v", err)
			}
			if gotPath != tt.wantPath {
				t.Errorf("path = %q, want %q", gotPath, tt.wantPath)
			}
			if tt.wantPost && gotMethod != http.MethodPost {
				t.Errorf("method = %s, want POST", gotMethod)
			}
		})
	}
}

func TestClient_HTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"error":"unauthorized"}`))
	}))
	defer srv.Close()

	client := NewClient(srv.URL, "", "")

	// GET error
	_, err := client.GetStatus(context.Background())
	if err == nil {
		t.Fatal("expected error for 401 response")
	}

	// POST error
	err = client.RestartProcess(context.Background(), "SM")
	if err == nil {
		t.Fatal("expected error for 401 response")
	}
}

func TestClient_ConnectionError(t *testing.T) {
	client := NewClient("http://localhost:1", "", "")

	_, err := client.GetStatus(context.Background())
	if err == nil {
		t.Fatal("expected connection error")
	}
}
