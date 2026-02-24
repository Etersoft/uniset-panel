package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/pv/uniset-panel/internal/config"
	"github.com/pv/uniset-panel/internal/launcher"
)

// mockLauncherServer создаёт HTTP-сервер, эмулирующий Launcher API v2.
// Возвращает сервер и функцию для получения списка вызванных stop/start действий.
func mockLauncherServer(processes []launcher.Process) (*httptest.Server, func() []string) {
	var mu sync.Mutex
	var actions []string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.Method == "GET" && r.URL.Path == "/api/v2/launcher/processes" {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"count":     len(processes),
				"processes": processes,
			})
			return
		}

		if r.Method == "GET" && r.URL.Path == "/api/v2/launcher/health" {
			json.NewEncoder(w).Encode(map[string]interface{}{"status": "healthy"})
			return
		}

		// POST /api/v2/launcher/process/{name}/{action}
		if r.Method == "POST" && strings.HasPrefix(r.URL.Path, "/api/v2/launcher/process/") {
			parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/v2/launcher/process/"), "/")
			if len(parts) == 2 {
				mu.Lock()
				actions = append(actions, parts[1]+":"+parts[0]) // "stop:Normal1"
				mu.Unlock()
				json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
				return
			}
		}

		w.WriteHeader(404)
	}))

	return srv, func() []string {
		mu.Lock()
		defer mu.Unlock()
		result := make([]string, len(actions))
		copy(result, actions)
		return result
	}
}

func setupLauncherHandler(serverURL string) *Handlers {
	mgr := launcher.NewManager()
	mgr.AddLauncher(config.LauncherConfig{
		ID:           "test",
		Name:         "TestNode",
		URL:          serverURL,
		ControlToken: "test-token",
	})

	h := &Handlers{
		launcherMgr: mgr,
	}
	return h
}

func TestStopAll_SkipsManualOneshotSkip(t *testing.T) {
	processes := []launcher.Process{
		{Name: "Normal1", State: "running"},
		{Name: "Normal2", State: "running"},
		{Name: "ManualProc", State: "running", Manual: true},
		{Name: "OneshotProc", State: "running", Oneshot: true},
		{Name: "SkipProc", State: "running", Skip: true},
		{Name: "StoppedProc", State: "stopped"},
	}

	srv, getActions := mockLauncherServer(processes)
	defer srv.Close()

	h := setupLauncherHandler(srv.URL)

	req := httptest.NewRequest("POST", "/api/launchers/test/stop-all", nil)
	req.SetPathValue("id", "test")
	w := httptest.NewRecorder()

	h.StopAllLauncherProcesses(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	actions := getActions()
	// Должны быть остановлены только Normal1 и Normal2
	if len(actions) != 2 {
		t.Fatalf("expected 2 stop actions, got %d: %v", len(actions), actions)
	}

	for _, a := range actions {
		if !strings.HasPrefix(a, "stop:Normal") {
			t.Errorf("unexpected action: %s (manual/oneshot/skip should be skipped)", a)
		}
	}
}

func TestStartAll_SkipsManualOneshotSkip(t *testing.T) {
	processes := []launcher.Process{
		{Name: "Stopped1", State: "stopped"},
		{Name: "Failed1", State: "failed"},
		{Name: "Completed1", State: "completed"},
		{Name: "ManualStopped", State: "stopped", Manual: true},
		{Name: "OneshotDone", State: "completed", Oneshot: true},
		{Name: "SkipStopped", State: "stopped", Skip: true},
		{Name: "RunningProc", State: "running"},
	}

	srv, getActions := mockLauncherServer(processes)
	defer srv.Close()

	h := setupLauncherHandler(srv.URL)

	req := httptest.NewRequest("POST", "/api/launchers/test/start-all", nil)
	req.SetPathValue("id", "test")
	w := httptest.NewRecorder()

	h.StartAllLauncherProcesses(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	actions := getActions()
	// Должны быть запущены Stopped1, Failed1, Completed1 (все не-running, кроме manual/oneshot/skip)
	if len(actions) != 3 {
		t.Fatalf("expected 3 start actions, got %d: %v", len(actions), actions)
	}

	expected := map[string]bool{"start:Stopped1": true, "start:Failed1": true, "start:Completed1": true}
	for _, a := range actions {
		if !expected[a] {
			t.Errorf("unexpected action: %s (manual/oneshot/skip/running should be skipped)", a)
		}
	}
}

func TestStopAll_NoEligibleProcesses(t *testing.T) {
	processes := []launcher.Process{
		{Name: "StoppedProc", State: "stopped"},
		{Name: "ManualRunning", State: "running", Manual: true},
	}

	srv, getActions := mockLauncherServer(processes)
	defer srv.Close()

	h := setupLauncherHandler(srv.URL)

	req := httptest.NewRequest("POST", "/api/launchers/test/stop-all", nil)
	req.SetPathValue("id", "test")
	w := httptest.NewRecorder()

	h.StopAllLauncherProcesses(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	actions := getActions()
	if len(actions) != 0 {
		t.Errorf("expected 0 actions when no eligible processes, got %d: %v", len(actions), actions)
	}

	var resp map[string]string
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["detail"] != "no running processes" {
		t.Errorf("expected 'no running processes' detail, got %q", resp["detail"])
	}
}

func TestStartAll_NoEligibleProcesses(t *testing.T) {
	processes := []launcher.Process{
		{Name: "RunningProc", State: "running"},
		{Name: "SkipStopped", State: "stopped", Skip: true},
	}

	srv, getActions := mockLauncherServer(processes)
	defer srv.Close()

	h := setupLauncherHandler(srv.URL)

	req := httptest.NewRequest("POST", "/api/launchers/test/start-all", nil)
	req.SetPathValue("id", "test")
	w := httptest.NewRecorder()

	h.StartAllLauncherProcesses(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	actions := getActions()
	if len(actions) != 0 {
		t.Errorf("expected 0 actions when no eligible processes, got %d: %v", len(actions), actions)
	}

	var resp map[string]string
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["detail"] != "all processes running" {
		t.Errorf("expected 'all processes running' detail, got %q", resp["detail"])
	}
}
