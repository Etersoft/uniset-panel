package api

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pv/uniset2-viewer-go/internal/poller"
	"github.com/pv/uniset2-viewer-go/internal/storage"
	"github.com/pv/uniset2-viewer-go/internal/uniset"
)

// ============================================================================
// SSEHub Tests
// ============================================================================

func TestSSEHubNewSSEHub(t *testing.T) {
	hub := NewSSEHub()
	if hub == nil {
		t.Fatal("NewSSEHub returned nil")
	}
	if hub.clients == nil {
		t.Error("clients map is nil")
	}
	if hub.ClientCount() != 0 {
		t.Errorf("expected 0 clients, got %d", hub.ClientCount())
	}
}

func TestSSEHubAddRemoveClient(t *testing.T) {
	hub := NewSSEHub()

	// Добавляем клиента
	client1 := hub.AddClient("")
	if client1 == nil {
		t.Fatal("AddClient returned nil")
	}
	if hub.ClientCount() != 1 {
		t.Errorf("expected 1 client, got %d", hub.ClientCount())
	}

	// Добавляем второго клиента с фильтром по объекту
	client2 := hub.AddClient("TestProc")
	if client2.objectName != "TestProc" {
		t.Errorf("expected objectName=TestProc, got %s", client2.objectName)
	}
	if hub.ClientCount() != 2 {
		t.Errorf("expected 2 clients, got %d", hub.ClientCount())
	}

	// Удаляем первого клиента
	hub.RemoveClient(client1)
	if hub.ClientCount() != 1 {
		t.Errorf("expected 1 client after removal, got %d", hub.ClientCount())
	}

	// Удаляем второго клиента
	hub.RemoveClient(client2)
	if hub.ClientCount() != 0 {
		t.Errorf("expected 0 clients after removal, got %d", hub.ClientCount())
	}
}

func TestSSEHubBroadcast(t *testing.T) {
	hub := NewSSEHub()

	// Клиент подписанный на все объекты
	client1 := hub.AddClient("")
	// Клиент подписанный только на TestProc
	client2 := hub.AddClient("TestProc")
	// Клиент подписанный только на AnotherObj
	client3 := hub.AddClient("AnotherObj")

	defer hub.RemoveClient(client1)
	defer hub.RemoveClient(client2)
	defer hub.RemoveClient(client3)

	// Отправляем событие для TestProc
	event := SSEEvent{
		Type:       "object_data",
		ObjectName: "TestProc",
		Data:       map[string]string{"test": "value"},
		Timestamp:  time.Now(),
	}
	hub.Broadcast(event)

	// Проверяем что client1 получил событие (подписан на все)
	select {
	case received := <-client1.events:
		if received.ObjectName != "TestProc" {
			t.Errorf("client1: expected ObjectName=TestProc, got %s", received.ObjectName)
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("client1: did not receive event")
	}

	// Проверяем что client2 получил событие (подписан на TestProc)
	select {
	case received := <-client2.events:
		if received.ObjectName != "TestProc" {
			t.Errorf("client2: expected ObjectName=TestProc, got %s", received.ObjectName)
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("client2: did not receive event")
	}

	// Проверяем что client3 НЕ получил событие (подписан на AnotherObj)
	select {
	case <-client3.events:
		t.Error("client3: should not receive event for TestProc")
	case <-time.After(50 * time.Millisecond):
		// OK - не получил, как и ожидалось
	}
}

func TestSSEHubBroadcastObjectData(t *testing.T) {
	hub := NewSSEHub()
	client := hub.AddClient("")
	defer hub.RemoveClient(client)

	data := &uniset.ObjectData{
		Name: "TestProc",
		Variables: map[string]interface{}{
			"var1": 100,
		},
	}

	hub.BroadcastObjectData("TestProc", data)

	select {
	case event := <-client.events:
		if event.Type != "object_data" {
			t.Errorf("expected type=object_data, got %s", event.Type)
		}
		if event.ObjectName != "TestProc" {
			t.Errorf("expected ObjectName=TestProc, got %s", event.ObjectName)
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("did not receive event")
	}
}

func TestSSEHubConcurrentAccess(t *testing.T) {
	hub := NewSSEHub()
	var wg sync.WaitGroup

	// Параллельно добавляем и удаляем клиентов
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			client := hub.AddClient("")
			time.Sleep(time.Millisecond)
			hub.RemoveClient(client)
		}()
	}

	// Параллельно отправляем события
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			hub.Broadcast(SSEEvent{
				Type:       "test",
				ObjectName: "TestProc",
				Timestamp:  time.Now(),
			})
		}(i)
	}

	wg.Wait()

	// После всех операций должно быть 0 клиентов
	if hub.ClientCount() != 0 {
		t.Errorf("expected 0 clients after concurrent operations, got %d", hub.ClientCount())
	}
}

// ============================================================================
// HandleSSE Tests
// ============================================================================

func TestHandleSSEConnection(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	handlers := setupTestHandlers(unisetServer)

	// Создаём запрос с контекстом который можно отменить
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	req := httptest.NewRequest("GET", "/api/events", nil).WithContext(ctx)
	w := httptest.NewRecorder()

	// Запускаем в горутине т.к. HandleSSE блокирующий
	done := make(chan struct{})
	go func() {
		handlers.HandleSSE(w, req)
		close(done)
	}()

	// Ждём завершения или таймаута
	select {
	case <-done:
		// OK
	case <-time.After(time.Second):
		t.Error("HandleSSE did not complete after context cancellation")
	}

	// Проверяем заголовки SSE
	if ct := w.Header().Get("Content-Type"); ct != "text/event-stream" {
		t.Errorf("expected Content-Type=text/event-stream, got %s", ct)
	}
	if cc := w.Header().Get("Cache-Control"); cc != "no-cache" {
		t.Errorf("expected Cache-Control=no-cache, got %s", cc)
	}

	// Проверяем что было отправлено событие connected
	body := w.Body.String()
	if !strings.Contains(body, "event: connected") {
		t.Error("response should contain 'event: connected'")
	}
	if !strings.Contains(body, "pollInterval") {
		t.Error("response should contain pollInterval")
	}
}

func TestHandleSSEWithObjectFilter(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	handlers := setupTestHandlers(unisetServer)

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	// Запрос с фильтром по объекту
	req := httptest.NewRequest("GET", "/api/events?object=TestProc", nil).WithContext(ctx)
	w := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		handlers.HandleSSE(w, req)
		close(done)
	}()

	<-done

	// Проверяем что SSE клиент был добавлен с правильным фильтром
	// (это происходит внутри HandleSSE, мы можем проверить только что обработчик отработал)
	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestHandleSSEReceivesEvents(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	handlers := setupTestHandlers(unisetServer)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	req := httptest.NewRequest("GET", "/api/events", nil).WithContext(ctx)
	w := httptest.NewRecorder()

	// Запускаем обработчик
	go handlers.HandleSSE(w, req)

	// Даём время на установку соединения
	time.Sleep(50 * time.Millisecond)

	// Отправляем событие через hub
	hub := handlers.GetSSEHub()
	hub.BroadcastObjectData("TestProc", &uniset.ObjectData{
		Name:      "TestProc",
		Variables: map[string]interface{}{"var1": 42},
	})

	// Даём время на обработку события
	time.Sleep(100 * time.Millisecond)

	// Отменяем контекст
	cancel()
	time.Sleep(50 * time.Millisecond)

	// Проверяем что событие object_data было отправлено
	body := w.Body.String()
	if !strings.Contains(body, "event: object_data") {
		t.Error("response should contain 'event: object_data'")
	}
	if !strings.Contains(body, "TestProc") {
		t.Error("response should contain 'TestProc'")
	}
}

// ============================================================================
// SSEEvent Tests
// ============================================================================

func TestSSEEventJSON(t *testing.T) {
	event := SSEEvent{
		Type:       "object_data",
		ObjectName: "TestProc",
		Data: map[string]interface{}{
			"var1": 100,
		},
		Timestamp: time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC),
	}

	data, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("failed to marshal SSEEvent: %v", err)
	}

	var decoded SSEEvent
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal SSEEvent: %v", err)
	}

	if decoded.Type != event.Type {
		t.Errorf("expected Type=%s, got %s", event.Type, decoded.Type)
	}
	if decoded.ObjectName != event.ObjectName {
		t.Errorf("expected ObjectName=%s, got %s", event.ObjectName, decoded.ObjectName)
	}
}

// ============================================================================
// Integration: Poller + SSE Tests
// ============================================================================

func TestPollerEventCallbackIntegration(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	client := uniset.NewClient(unisetServer.URL)
	store := storage.NewMemoryStorage()
	p := poller.New(client, store, 100*time.Millisecond, time.Hour)

	// Создаём SSE hub и устанавливаем callback
	hub := NewSSEHub()
	sseClient := hub.AddClient("")
	defer hub.RemoveClient(sseClient)

	var receivedEvents []SSEEvent
	var mu sync.Mutex

	p.SetEventCallback(func(objectName string, data *uniset.ObjectData) {
		hub.BroadcastObjectData(objectName, data)
	})

	// Добавляем объект в watch
	p.Watch("TestProc")

	// Слушаем события в отдельной горутине
	done := make(chan struct{})
	go func() {
		for {
			select {
			case event := <-sseClient.events:
				mu.Lock()
				receivedEvents = append(receivedEvents, event)
				mu.Unlock()
			case <-done:
				return
			}
		}
	}()

	// Запускаем poller на короткое время
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()

	go p.Run(ctx)

	// Ждём пока poller сделает несколько опросов
	<-ctx.Done()
	close(done)

	// Проверяем что получили хотя бы одно событие
	mu.Lock()
	eventCount := len(receivedEvents)
	mu.Unlock()

	if eventCount == 0 {
		t.Error("expected at least one SSE event from poller")
	}

	// Проверяем структуру первого события
	if eventCount > 0 {
		mu.Lock()
		firstEvent := receivedEvents[0]
		mu.Unlock()

		if firstEvent.Type != "object_data" {
			t.Errorf("expected event type=object_data, got %s", firstEvent.Type)
		}
		if firstEvent.ObjectName != "TestProc" {
			t.Errorf("expected ObjectName=TestProc, got %s", firstEvent.ObjectName)
		}
	}
}

// ============================================================================
// Helper: Parse SSE stream
// ============================================================================

func parseSSEEvents(body string) []map[string]string {
	var events []map[string]string
	scanner := bufio.NewScanner(strings.NewReader(body))

	currentEvent := make(map[string]string)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			if len(currentEvent) > 0 {
				events = append(events, currentEvent)
				currentEvent = make(map[string]string)
			}
			continue
		}
		if strings.HasPrefix(line, "event: ") {
			currentEvent["event"] = strings.TrimPrefix(line, "event: ")
		} else if strings.HasPrefix(line, "data: ") {
			currentEvent["data"] = strings.TrimPrefix(line, "data: ")
		}
	}
	if len(currentEvent) > 0 {
		events = append(events, currentEvent)
	}
	return events
}

func TestParseSSEEvents(t *testing.T) {
	body := `event: connected
data: {"type":"connected"}

event: object_data
data: {"objectName":"TestProc"}

`
	events := parseSSEEvents(body)
	if len(events) != 2 {
		t.Errorf("expected 2 events, got %d", len(events))
	}
	if events[0]["event"] != "connected" {
		t.Errorf("expected first event=connected, got %s", events[0]["event"])
	}
	if events[1]["event"] != "object_data" {
		t.Errorf("expected second event=object_data, got %s", events[1]["event"])
	}
}
