package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pv/uniset-panel/internal/config"
	"github.com/pv/uniset-panel/internal/storage"
)

// mockUnisetServer creates a test server simulating UniSet2 API
func mockUnisetServer() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch r.URL.Path {
		case "/api/v2/list":
			json.NewEncoder(w).Encode([]string{"TestProc", "AnotherObj"})
		case "/api/v2/TestProc":
			json.NewEncoder(w).Encode(map[string]interface{}{
				"TestProc": map[string]interface{}{
					"Variables": map[string]interface{}{
						"var1": "100",
					},
				},
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
}

// mockUnavailableServer creates a server that always returns errors
func mockUnavailableServer() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
}

func TestNewInstance(t *testing.T) {
	server := mockUnisetServer()
	defer server.Close()

	cfg := config.ServerConfig{
		ID:   "test-server",
		URL:  server.URL,
		Name: "Test Server",
	}

	store := storage.NewMemoryStorage()
	instance := NewInstance(AppConfig{
		Server: cfg, Storage: store,
		PollInterval: time.Second, HistoryTTL: time.Hour,
		Supplier: "TestSupplier",
	})

	if instance == nil {
		t.Fatal("NewInstance returned nil")
	}

	if instance.Config.ID != "test-server" {
		t.Errorf("expected ID=test-server, got %s", instance.Config.ID)
	}

	if instance.Client == nil {
		t.Error("Client is nil")
	}

	if instance.Poller == nil {
		t.Error("Poller is nil")
	}

	if instance.IONCPoller == nil {
		t.Error("IONCPoller is nil")
	}
}

func TestInstanceGetStatus(t *testing.T) {
	server := mockUnisetServer()
	defer server.Close()

	cfg := config.ServerConfig{
		ID:   "test-server",
		URL:  server.URL,
		Name: "Test Server",
	}

	store := storage.NewMemoryStorage()
	instance := NewInstance(AppConfig{
		Server: cfg, Storage: store,
		PollInterval: time.Second, HistoryTTL: time.Hour,
	})

	status := instance.GetStatus()

	if status.ID != "test-server" {
		t.Errorf("expected ID=test-server, got %s", status.ID)
	}

	if status.Name != "Test Server" {
		t.Errorf("expected Name=Test Server, got %s", status.Name)
	}

	if status.URL != server.URL {
		t.Errorf("expected URL=%s, got %s", server.URL, status.URL)
	}

	if status.Connected {
		t.Error("expected Connected=false for new instance")
	}
}

func TestInstanceGetStatusWithEmptyName(t *testing.T) {
	server := mockUnisetServer()
	defer server.Close()

	cfg := config.ServerConfig{
		ID:  "test-server",
		URL: server.URL,
		// Name is empty
	}

	store := storage.NewMemoryStorage()
	instance := NewInstance(AppConfig{
		Server: cfg, Storage: store,
		PollInterval: time.Second, HistoryTTL: time.Hour,
	})

	status := instance.GetStatus()

	// When name is empty, should use URL
	if status.Name != server.URL {
		t.Errorf("expected Name=%s (URL), got %s", server.URL, status.Name)
	}
}

func TestInstanceUpdateStatus(t *testing.T) {
	server := mockUnisetServer()
	defer server.Close()

	cfg := config.ServerConfig{
		ID:   "test-server",
		URL:  server.URL,
		Name: "Test Server",
	}

	store := storage.NewMemoryStorage()

	var statusCallbackCalled bool
	var callbackConnected bool
	var mu sync.Mutex

	statusCallback := func(serverID, serverName string, connected bool, lastError string) {
		mu.Lock()
		statusCallbackCalled = true
		callbackConnected = connected
		mu.Unlock()
	}

	instance := NewInstance(AppConfig{
		Server: cfg, Storage: store,
		PollInterval: time.Second, HistoryTTL: time.Hour,
		StatusCallback: statusCallback,
	})

	// Update status to connected
	instance.UpdateStatus(true, nil)

	mu.Lock()
	if !statusCallbackCalled {
		t.Error("status callback was not called")
	}
	if !callbackConnected {
		t.Error("expected callback connected=true")
	}
	mu.Unlock()

	status := instance.GetStatus()
	if !status.Connected {
		t.Error("expected Connected=true after UpdateStatus")
	}

	if status.LastError != "" {
		t.Errorf("expected empty LastError, got %s", status.LastError)
	}
}

func TestInstanceUpdateStatusWithError(t *testing.T) {
	server := mockUnisetServer()
	defer server.Close()

	cfg := config.ServerConfig{
		ID:   "test-server",
		URL:  server.URL,
		Name: "Test Server",
	}

	store := storage.NewMemoryStorage()
	instance := NewInstance(AppConfig{
		Server: cfg, Storage: store,
		PollInterval: time.Second, HistoryTTL: time.Hour,
	})

	// First set connected
	instance.UpdateStatus(true, nil)

	// Then update with error
	testErr := &testError{"connection failed"}
	instance.UpdateStatus(false, testErr)

	status := instance.GetStatus()
	if status.Connected {
		t.Error("expected Connected=false after error")
	}

	if status.LastError != "connection failed" {
		t.Errorf("expected LastError='connection failed', got %s", status.LastError)
	}
}

func TestInstanceSetHealthInterval(t *testing.T) {
	server := mockUnisetServer()
	defer server.Close()

	cfg := config.ServerConfig{
		ID:   "test-server",
		URL:  server.URL,
		Name: "Test Server",
	}

	store := storage.NewMemoryStorage()
	instance := NewInstance(AppConfig{
		Server: cfg, Storage: store,
		PollInterval: time.Second, HistoryTTL: time.Hour,
	})

	// Change health interval
	instance.SetHealthInterval(5 * time.Second)

	// Verify interval was changed
	instance.mu.RLock()
	interval := instance.healthInterval
	instance.mu.RUnlock()

	if interval != 5*time.Second {
		t.Errorf("expected healthInterval=5s, got %v", interval)
	}
}

func TestInstanceSetObjectCount(t *testing.T) {
	server := mockUnisetServer()
	defer server.Close()

	cfg := config.ServerConfig{
		ID:   "test-server",
		URL:  server.URL,
		Name: "Test Server",
	}

	store := storage.NewMemoryStorage()
	instance := NewInstance(AppConfig{
		Server: cfg, Storage: store,
		PollInterval: time.Second, HistoryTTL: time.Hour,
	})

	instance.SetObjectCount(42)

	status := instance.GetStatus()
	if status.ObjectCount != 42 {
		t.Errorf("expected ObjectCount=42, got %d", status.ObjectCount)
	}
}

func TestInstanceGetObjects(t *testing.T) {
	server := mockUnisetServer()
	defer server.Close()

	cfg := config.ServerConfig{
		ID:   "test-server",
		URL:  server.URL,
		Name: "Test Server",
	}

	store := storage.NewMemoryStorage()
	instance := NewInstance(AppConfig{
		Server: cfg, Storage: store,
		PollInterval: time.Second, HistoryTTL: time.Hour,
	})

	objects, err := instance.GetObjects()
	if err != nil {
		t.Fatalf("GetObjects failed: %v", err)
	}

	if len(objects) != 2 {
		t.Errorf("expected 2 objects, got %d", len(objects))
	}

	// GetObjects не должен менять статус подключения — за это отвечает checkHealth
	// Но ObjectCount должен обновиться
	status := instance.GetStatus()
	if status.ObjectCount != 2 {
		t.Errorf("expected ObjectCount=2, got %d", status.ObjectCount)
	}
}

func TestInstanceGetObjectsError(t *testing.T) {
	server := mockUnavailableServer()
	defer server.Close()

	cfg := config.ServerConfig{
		ID:   "test-server",
		URL:  server.URL,
		Name: "Test Server",
	}

	store := storage.NewMemoryStorage()
	instance := NewInstance(AppConfig{
		Server: cfg, Storage: store,
		PollInterval: time.Second, HistoryTTL: time.Hour,
	})

	// First mark as connected
	instance.UpdateStatus(true, nil)

	_, err := instance.GetObjects()
	if err == nil {
		t.Fatal("expected error from unavailable server")
	}

	// GetObjects не должен менять статус подключения — за это отвечает checkHealth
	status := instance.GetStatus()
	if !status.Connected {
		t.Error("expected Connected to remain true after failed GetObjects (status managed by checkHealth)")
	}
}

func TestInstanceGetObjectData(t *testing.T) {
	server := mockUnisetServer()
	defer server.Close()

	cfg := config.ServerConfig{
		ID:   "test-server",
		URL:  server.URL,
		Name: "Test Server",
	}

	store := storage.NewMemoryStorage()
	instance := NewInstance(AppConfig{
		Server: cfg, Storage: store,
		PollInterval: time.Second, HistoryTTL: time.Hour,
	})

	data, err := instance.GetObjectData("TestProc")
	if err != nil {
		t.Fatalf("GetObjectData failed: %v", err)
	}

	if data == nil {
		t.Fatal("GetObjectData returned nil")
	}

	if data.Name != "TestProc" {
		t.Errorf("expected Name=TestProc, got %s", data.Name)
	}

	// GetObjectData не должен менять статус подключения — за это отвечает checkHealth
}

func TestInstanceWatchUnwatch(t *testing.T) {
	server := mockUnisetServer()
	defer server.Close()

	cfg := config.ServerConfig{
		ID:   "test-server",
		URL:  server.URL,
		Name: "Test Server",
	}

	store := storage.NewMemoryStorage()
	instance := NewInstance(AppConfig{
		Server: cfg, Storage: store,
		PollInterval: time.Second, HistoryTTL: time.Hour,
	})

	// Watch should not panic
	instance.Watch("TestProc")

	// Unwatch should not panic
	instance.Unwatch("TestProc")
}

func TestInstanceStartStop(t *testing.T) {
	server := mockUnisetServer()
	defer server.Close()

	cfg := config.ServerConfig{
		ID:   "test-server",
		URL:  server.URL,
		Name: "Test Server",
	}

	store := storage.NewMemoryStorage()
	instance := NewInstance(AppConfig{
		Server: cfg, Storage: store,
		PollInterval: 100 * time.Millisecond, HistoryTTL: time.Hour,
	})

	// Start should not panic
	instance.Start()

	// Give health check time to run
	time.Sleep(150 * time.Millisecond)

	// Stop should not panic and should complete
	done := make(chan struct{})
	go func() {
		instance.Stop()
		close(done)
	}()

	select {
	case <-done:
		// OK
	case <-time.After(2 * time.Second):
		t.Error("Stop did not complete in time")
	}
}

func TestInstanceHealthCheckUpdatesStatus(t *testing.T) {
	server := mockUnisetServer()
	defer server.Close()

	cfg := config.ServerConfig{
		ID:   "test-server",
		URL:  server.URL,
		Name: "Test Server",
	}

	store := storage.NewMemoryStorage()

	var statusChanges []bool
	var mu sync.Mutex

	statusCallback := func(serverID, serverName string, connected bool, lastError string) {
		mu.Lock()
		statusChanges = append(statusChanges, connected)
		mu.Unlock()
	}

	instance := NewInstance(AppConfig{
		Server: cfg, Storage: store,
		PollInterval: 50 * time.Millisecond, HistoryTTL: time.Hour,
		StatusCallback: statusCallback,
	})

	// Start instance to run health check
	instance.Start()

	// Wait for health check to run and update status
	time.Sleep(100 * time.Millisecond)

	// Stop instance
	instance.Stop()

	mu.Lock()
	defer mu.Unlock()

	if len(statusChanges) == 0 {
		t.Error("status callback was not called during health check")
	}

	// First change should be to connected (server is available)
	if len(statusChanges) > 0 && !statusChanges[0] {
		t.Error("expected first status change to be connected=true")
	}
}

func TestInstanceObjectsCallbackOnReconnect(t *testing.T) {
	server := mockUnisetServer()
	defer server.Close()

	cfg := config.ServerConfig{
		ID:   "test-server",
		URL:  server.URL,
		Name: "Test Server",
	}

	store := storage.NewMemoryStorage()

	var objectsCallbackCalled bool
	var receivedObjects []string
	var mu sync.Mutex

	objectsCallback := func(serverID, serverName string, objects []string) {
		mu.Lock()
		objectsCallbackCalled = true
		receivedObjects = objects
		mu.Unlock()
	}

	instance := NewInstance(AppConfig{
		Server: cfg, Storage: store,
		PollInterval: 50 * time.Millisecond, HistoryTTL: time.Hour,
		ObjectsCallback: objectsCallback,
	})

	// Start instance - this triggers health check which should call objectsCallback on first connect
	instance.Start()

	// Wait for health check
	time.Sleep(100 * time.Millisecond)

	instance.Stop()

	mu.Lock()
	defer mu.Unlock()

	if !objectsCallbackCalled {
		t.Error("objects callback was not called on initial connect")
	}

	if len(receivedObjects) != 2 {
		t.Errorf("expected 2 objects in callback, got %d", len(receivedObjects))
	}
}

func TestInstanceStatusCallbackOnlyOnChange(t *testing.T) {
	server := mockUnisetServer()
	defer server.Close()

	cfg := config.ServerConfig{
		ID:   "test-server",
		URL:  server.URL,
		Name: "Test Server",
	}

	store := storage.NewMemoryStorage()

	var callCount int
	var mu sync.Mutex

	statusCallback := func(serverID, serverName string, connected bool, lastError string) {
		mu.Lock()
		callCount++
		mu.Unlock()
	}

	instance := NewInstance(AppConfig{
		Server: cfg, Storage: store,
		PollInterval: time.Second, HistoryTTL: time.Hour,
		StatusCallback: statusCallback,
	})

	// Update status multiple times with same value
	instance.UpdateStatus(true, nil)
	instance.UpdateStatus(true, nil) // Should not trigger callback
	instance.UpdateStatus(true, nil) // Should not trigger callback

	mu.Lock()
	count := callCount
	mu.Unlock()

	if count != 1 {
		t.Errorf("expected status callback to be called 1 time, got %d", count)
	}

	// Now change status
	instance.UpdateStatus(false, nil)

	mu.Lock()
	count = callCount
	mu.Unlock()

	if count != 2 {
		t.Errorf("expected status callback to be called 2 times after status change, got %d", count)
	}
}

// mockSwitchableServer создаёт сервер с переключаемым состоянием (доступен/недоступен).
// При simulateDown=1 возвращает 503 на все запросы.
func mockSwitchableServer(simulateDown *atomic.Int32) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if simulateDown.Load() != 0 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v2/list":
			json.NewEncoder(w).Encode([]string{"TestProc", "AnotherObj"})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
}

// statusEvent хранит одно событие изменения статуса
type statusEvent struct {
	connected bool
	lastError string
}

// TestInstanceDisconnectReconnectEvents проверяет полный цикл:
// 1. Сервер доступен → health check шлёт connected=true
// 2. Сервер падает → health check шлёт connected=false
// 3. Сервер восстанавливается → health check шлёт connected=true
func TestInstanceDisconnectReconnectEvents(t *testing.T) {
	var simulateDown atomic.Int32
	server := mockSwitchableServer(&simulateDown)
	defer server.Close()

	cfg := config.ServerConfig{
		ID:   "test-server",
		URL:  server.URL,
		Name: "Test Server",
	}

	store := storage.NewMemoryStorage()

	events := make(chan statusEvent, 10)

	statusCallback := func(serverID, serverName string, connected bool, lastError string) {
		events <- statusEvent{connected: connected, lastError: lastError}
	}

	healthInterval := 50 * time.Millisecond
	instance := NewInstance(AppConfig{
		Server: cfg, Storage: store,
		PollInterval: healthInterval, HistoryTTL: time.Hour,
		StatusCallback: statusCallback,
	})

	instance.Start()
	defer instance.Stop()

	// Фаза 1: ждём событие connected=true (сервер доступен)
	waitForEvent(t, events, true, 2*time.Second,"initial connect")

	// Фаза 2: имитируем падение сервера
	simulateDown.Store(1)

	// Ждём событие connected=false
	waitForEvent(t, events, false, 2*time.Second,"disconnect")

	// Фаза 3: восстанавливаем сервер
	simulateDown.Store(0)

	// Ждём событие connected=true
	waitForEvent(t, events, true, 2*time.Second,"reconnect")
}

// TestInstanceDisconnectEventContainsError проверяет, что событие disconnect содержит описание ошибки
func TestInstanceDisconnectEventContainsError(t *testing.T) {
	var simulateDown atomic.Int32
	server := mockSwitchableServer(&simulateDown)
	defer server.Close()

	cfg := config.ServerConfig{
		ID:   "test-server",
		URL:  server.URL,
		Name: "Test Server",
	}

	store := storage.NewMemoryStorage()
	events := make(chan statusEvent, 10)

	statusCallback := func(serverID, serverName string, connected bool, lastError string) {
		events <- statusEvent{connected: connected, lastError: lastError}
	}

	instance := NewInstance(AppConfig{
		Server: cfg, Storage: store,
		PollInterval: 50 * time.Millisecond, HistoryTTL: time.Hour,
		StatusCallback: statusCallback,
	})

	instance.Start()
	defer instance.Stop()

	// Ждём подключения
	waitForEvent(t, events, true, 2*time.Second,"initial connect")

	// Имитируем падение
	simulateDown.Store(1)

	// Ждём disconnect с непустой ошибкой
	ev := waitForEventRaw(t, events, false, 2*time.Second, "disconnect with error")
	if ev.lastError == "" {
		t.Error("ожидалось непустое lastError в событии disconnect")
	}
}

// TestInstanceNoSpuriousEventsWhileStable проверяет, что при стабильном соединении
// callback вызывается только один раз (при первом подключении), а не на каждый health check
func TestInstanceNoSpuriousEventsWhileStable(t *testing.T) {
	server := mockUnisetServer()
	defer server.Close()

	cfg := config.ServerConfig{
		ID:   "test-server",
		URL:  server.URL,
		Name: "Test Server",
	}

	store := storage.NewMemoryStorage()

	var callCount atomic.Int32

	statusCallback := func(serverID, serverName string, connected bool, lastError string) {
		callCount.Add(1)
	}

	instance := NewInstance(AppConfig{
		Server: cfg, Storage: store,
		PollInterval: 50 * time.Millisecond, HistoryTTL: time.Hour,
		StatusCallback: statusCallback,
	})

	instance.Start()

	// Ждём несколько health check циклов
	time.Sleep(300 * time.Millisecond)

	instance.Stop()

	count := callCount.Load()
	if count != 1 {
		t.Errorf("ожидался ровно 1 вызов statusCallback (initial connect), получено %d", count)
	}
}

// waitForEvent ожидает событие с заданным connected в канале
func waitForEvent(t *testing.T, events chan statusEvent, wantConnected bool, timeout time.Duration, phase string) {
	t.Helper()
	waitForEventRaw(t, events, wantConnected, timeout, phase)
}

// waitForEventRaw ожидает событие с заданным connected и возвращает его
func waitForEventRaw(t *testing.T, events chan statusEvent, wantConnected bool, timeout time.Duration, phase string) statusEvent {
	t.Helper()
	deadline := time.After(timeout)
	for {
		select {
		case ev := <-events:
			if ev.connected == wantConnected {
				return ev
			}
			// Пропускаем события с другим статусом (могут быть промежуточные)
		case <-deadline:
			t.Fatalf("таймаут ожидания события connected=%v (фаза: %s)", wantConnected, phase)
			return statusEvent{}
		}
	}
}

// testError implements error interface for testing
type testError struct {
	msg string
}

func (e *testError) Error() string {
	return e.msg
}
