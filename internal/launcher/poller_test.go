package launcher

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestPoller_StatusChanged(t *testing.T) {
	p := &Poller{}

	// nil lastStatus → always changed
	status1 := &LauncherStatus{
		AllRunning: true,
		Processes:  []Process{{Name: "SM", State: "RUNNING", PID: 100}},
	}
	if !p.statusChanged(status1) {
		t.Error("expected statusChanged = true when lastStatus is nil")
	}

	// Set lastStatus
	p.lastStatus = status1

	// Same status → not changed
	status2 := &LauncherStatus{
		AllRunning: true,
		Processes:  []Process{{Name: "SM", State: "RUNNING", PID: 100}},
	}
	if p.statusChanged(status2) {
		t.Error("expected statusChanged = false for identical status")
	}

	// State changed
	status3 := &LauncherStatus{
		AllRunning: false,
		Processes:  []Process{{Name: "SM", State: "STOPPED", PID: 0}},
	}
	if !p.statusChanged(status3) {
		t.Error("expected statusChanged = true when state changed")
	}

	// PID changed
	p.lastStatus = status1
	status4 := &LauncherStatus{
		AllRunning: true,
		Processes:  []Process{{Name: "SM", State: "RUNNING", PID: 200}},
	}
	if !p.statusChanged(status4) {
		t.Error("expected statusChanged = true when PID changed")
	}

	// RestartCount changed
	p.lastStatus = status1
	status5 := &LauncherStatus{
		AllRunning: true,
		Processes:  []Process{{Name: "SM", State: "RUNNING", PID: 100, RestartCount: 1}},
	}
	if !p.statusChanged(status5) {
		t.Error("expected statusChanged = true when RestartCount changed")
	}

	// Process count changed
	p.lastStatus = status1
	status6 := &LauncherStatus{
		AllRunning: true,
		Processes: []Process{
			{Name: "SM", State: "RUNNING", PID: 100},
			{Name: "IO", State: "RUNNING", PID: 101},
		},
	}
	if !p.statusChanged(status6) {
		t.Error("expected statusChanged = true when process count changed")
	}

	// New process name
	p.lastStatus = status1
	status7 := &LauncherStatus{
		AllRunning: true,
		Processes:  []Process{{Name: "NewProc", State: "RUNNING", PID: 100}},
	}
	if !p.statusChanged(status7) {
		t.Error("expected statusChanged = true when process name changed")
	}

	// AnyCriticalFailed changed
	p.lastStatus = status1
	status8 := &LauncherStatus{
		AllRunning:        true,
		AnyCriticalFailed: true,
		Processes:         []Process{{Name: "SM", State: "RUNNING", PID: 100}},
	}
	if !p.statusChanged(status8) {
		t.Error("expected statusChanged = true when AnyCriticalFailed changed")
	}
}

func TestPoller_StartStop(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(LauncherStatus{
			AllRunning: true,
			Processes:  []Process{{Name: "SM", State: "RUNNING"}},
		})
	}))
	defer srv.Close()

	client := NewClient(srv.URL, "", "")
	poller := NewPoller(client, "test", "Test", 50*time.Millisecond)

	poller.Start()
	time.Sleep(100 * time.Millisecond)

	if !poller.IsConnected() {
		t.Error("expected poller to be connected")
	}

	status := poller.GetLastStatus()
	if status == nil {
		t.Fatal("expected last status to be set")
	}
	if !status.AllRunning {
		t.Error("expected AllRunning = true")
	}

	poller.Stop()
}

func TestPoller_ConnectionCallback(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(LauncherStatus{
			AllRunning: true,
			Processes:  []Process{{Name: "SM", State: "RUNNING"}},
		})
	}))
	defer srv.Close()

	client := NewClient(srv.URL, "", "")
	poller := NewPoller(client, "n1", "Node1", 50*time.Millisecond)

	var mu sync.Mutex
	var connEvents []bool

	poller.SetConnectionCallback(func(nodeID, nodeName string, connected bool, lastError string) {
		mu.Lock()
		connEvents = append(connEvents, connected)
		mu.Unlock()
	})

	poller.Start()
	time.Sleep(100 * time.Millisecond)
	poller.Stop()

	mu.Lock()
	defer mu.Unlock()

	if len(connEvents) == 0 {
		t.Fatal("expected at least one connection event")
	}
	if !connEvents[0] {
		t.Error("first connection event should be connected=true")
	}
}

func TestPoller_StatusCallback(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(LauncherStatus{
			AllRunning: true,
			Processes:  []Process{{Name: "SM", State: "RUNNING", PID: 100}},
		})
	}))
	defer srv.Close()

	client := NewClient(srv.URL, "", "")
	poller := NewPoller(client, "n1", "Node1", 50*time.Millisecond)

	var mu sync.Mutex
	statusCount := 0

	poller.SetStatusCallback(func(nodeID, nodeName string, status *LauncherStatus) {
		mu.Lock()
		statusCount++
		mu.Unlock()
	})

	poller.Start()
	time.Sleep(100 * time.Millisecond)
	poller.Stop()

	mu.Lock()
	defer mu.Unlock()

	if statusCount == 0 {
		t.Error("expected at least one status callback")
	}
}

func TestPoller_Disconnection(t *testing.T) {
	var mu sync.Mutex
	serverUp := true

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		up := serverUp
		mu.Unlock()

		if !up {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(LauncherStatus{
			AllRunning: true,
			Processes:  []Process{{Name: "SM", State: "RUNNING"}},
		})
	}))
	defer srv.Close()

	client := NewClient(srv.URL, "", "")
	poller := NewPoller(client, "n1", "Node1", 50*time.Millisecond)

	var connMu sync.Mutex
	var connEvents []bool

	poller.SetConnectionCallback(func(nodeID, nodeName string, connected bool, lastError string) {
		connMu.Lock()
		connEvents = append(connEvents, connected)
		connMu.Unlock()
	})

	poller.Start()
	time.Sleep(80 * time.Millisecond)

	// Simulate server going down
	mu.Lock()
	serverUp = false
	mu.Unlock()

	time.Sleep(120 * time.Millisecond)
	poller.Stop()

	connMu.Lock()
	defer connMu.Unlock()

	// Should have connected then disconnected
	if len(connEvents) < 2 {
		t.Fatalf("expected at least 2 connection events, got %d", len(connEvents))
	}
	if !connEvents[0] {
		t.Error("first event should be connected=true")
	}

	// Find disconnect event
	hasDisconnect := false
	for _, ev := range connEvents[1:] {
		if !ev {
			hasDisconnect = true
			break
		}
	}
	if !hasDisconnect {
		t.Error("expected a disconnection event")
	}
}

func TestPoller_InitialState(t *testing.T) {
	client := NewClient("http://localhost:1", "", "")
	poller := NewPoller(client, "n1", "Node1", time.Second)

	if poller.IsConnected() {
		t.Error("new poller should not be connected")
	}
	if poller.GetLastStatus() != nil {
		t.Error("new poller should have nil last status")
	}
}

func TestPoller_CancelContext(t *testing.T) {
	// Test that Stop() cancels the context and stops the poll loop
	callCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		json.NewEncoder(w).Encode(LauncherStatus{})
	}))
	defer srv.Close()

	client := NewClient(srv.URL, "", "")
	poller := NewPoller(client, "n1", "Node1", time.Hour) // very long interval

	poller.Start()
	time.Sleep(50 * time.Millisecond) // Wait for first poll
	poller.Stop()

	countAfterStop := callCount
	time.Sleep(100 * time.Millisecond)

	// Should not have additional calls after stop
	if callCount != countAfterStop {
		t.Errorf("poller continued after stop: %d calls (expected %d)", callCount, countAfterStop)
	}
}

func TestNewPoller(t *testing.T) {
	client := NewClient("http://example.com", "", "")
	poller := NewPoller(client, "id1", "Name1", 5*time.Second)

	if poller.nodeID != "id1" {
		t.Errorf("nodeID = %q, want id1", poller.nodeID)
	}
	if poller.nodeName != "Name1" {
		t.Errorf("nodeName = %q, want Name1", poller.nodeName)
	}
	if poller.interval != 5*time.Second {
		t.Errorf("interval = %v, want 5s", poller.interval)
	}
}

func TestPoller_StopWithoutStart(t *testing.T) {
	client := NewClient("http://localhost:1", "", "")
	poller := NewPoller(client, "n1", "Node1", time.Second)

	// Stop without Start should not panic
	poller.Stop()
}

func TestPoller_DoPoll_ContextCancelled(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(LauncherStatus{})
	}))
	defer srv.Close()

	client := NewClient(srv.URL, "", "")
	poller := NewPoller(client, "n1", "Node1", time.Second)

	ctx, cancel := context.WithCancel(context.Background())
	poller.ctx = ctx
	cancel() // Cancel immediately

	// doPoll with cancelled context should not panic
	poller.doPoll()
}
