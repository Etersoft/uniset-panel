package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pv/uniset-panel/internal/ionc"
	"github.com/pv/uniset-panel/internal/modbus"
	"github.com/pv/uniset-panel/internal/opcua"
	"github.com/pv/uniset-panel/internal/poller"
	"github.com/pv/uniset-panel/internal/storage"
	"github.com/pv/uniset-panel/internal/uniset"
)

// setupTestHandlersWithPollers creates handlers with IONC, Modbus, and OPCUA pollers.
func setupTestHandlersWithPollers(unisetServer *httptest.Server) *Handlers {
	client := uniset.NewClient(unisetServer.URL)
	store := storage.NewMemoryStorage()
	p := poller.New(client, store, 5*time.Second, time.Hour)
	handlers := NewHandlers(client, store, p, nil, 5*time.Second)

	ioncPoller := ionc.NewPoller(client, time.Second, 0, nil)
	handlers.SetIONCPoller(ioncPoller)

	modbusPoller := modbus.NewPoller(client, time.Second, 0, nil)
	handlers.SetModbusPoller(modbusPoller)

	opcuaPoller := opcua.NewPoller(client, time.Second, 0, nil)
	handlers.SetOPCUAPoller(opcuaPoller)

	return handlers
}

// === IONC UnsubscribeIONCSensors Tests ===

func TestSubscribeUnsubscribeIONCSensors_All(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	handlers := setupTestHandlersWithPollers(unisetServer)

	// First subscribe some sensors
	body := `{"sensor_ids": [1, 2, 3]}`
	req := httptest.NewRequest("POST", "/api/objects/TestProc/ionc/subscribe", strings.NewReader(body))
	req.SetPathValue("name", "TestProc")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handlers.SubscribeIONCSensors(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("subscribe failed: expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	// Unsubscribe all (empty sensor_ids)
	body = `{"sensor_ids": []}`
	req = httptest.NewRequest("POST", "/api/objects/TestProc/ionc/unsubscribe", strings.NewReader(body))
	req.SetPathValue("name", "TestProc")
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()

	handlers.UnsubscribeIONCSensors(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if response["status"] != "unsubscribed" {
		t.Errorf("expected status=unsubscribed, got %v", response["status"])
	}
	if response["object"] != "TestProc" {
		t.Errorf("expected object=TestProc, got %v", response["object"])
	}

	// Verify subscriptions are empty
	req = httptest.NewRequest("GET", "/api/objects/TestProc/ionc/subscriptions", nil)
	req.SetPathValue("name", "TestProc")
	w = httptest.NewRecorder()
	handlers.GetIONCSubscriptions(w, req)

	var subsResp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &subsResp)
	sensorIDs := subsResp["sensor_ids"].([]interface{})
	if len(sensorIDs) != 0 {
		t.Errorf("expected 0 subscriptions after unsubscribe all, got %d", len(sensorIDs))
	}
}

func TestSubscribeUnsubscribeIONCSensors_Specific(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	handlers := setupTestHandlersWithPollers(unisetServer)

	// Subscribe sensors 1, 2, 3
	body := `{"sensor_ids": [1, 2, 3]}`
	req := httptest.NewRequest("POST", "/api/objects/TestProc/ionc/subscribe", strings.NewReader(body))
	req.SetPathValue("name", "TestProc")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handlers.SubscribeIONCSensors(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("subscribe failed: expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	// Unsubscribe only sensor 2
	body = `{"sensor_ids": [2]}`
	req = httptest.NewRequest("POST", "/api/objects/TestProc/ionc/unsubscribe", strings.NewReader(body))
	req.SetPathValue("name", "TestProc")
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()

	handlers.UnsubscribeIONCSensors(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)

	if response["status"] != "unsubscribed" {
		t.Errorf("expected status=unsubscribed, got %v", response["status"])
	}

	// Verify remaining subscriptions
	req = httptest.NewRequest("GET", "/api/objects/TestProc/ionc/subscriptions", nil)
	req.SetPathValue("name", "TestProc")
	w = httptest.NewRecorder()
	handlers.GetIONCSubscriptions(w, req)

	var subsResp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &subsResp)
	sensorIDs := subsResp["sensor_ids"].([]interface{})
	if len(sensorIDs) != 2 {
		t.Errorf("expected 2 remaining subscriptions, got %d", len(sensorIDs))
	}
}

// === IONC GetIONCSubscriptions Tests ===

func TestSubscribeGetIONCSubscriptions_NoPoller(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	// Create handlers WITHOUT pollers
	handlers := setupTestHandlers(unisetServer)

	req := httptest.NewRequest("GET", "/api/objects/TestProc/ionc/subscriptions", nil)
	req.SetPathValue("name", "TestProc")
	w := httptest.NewRecorder()

	handlers.GetIONCSubscriptions(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	sensorIDs := response["sensor_ids"].([]interface{})
	if len(sensorIDs) != 0 {
		t.Errorf("expected empty sensor_ids, got %d items", len(sensorIDs))
	}

	if response["enabled"] != false {
		t.Errorf("expected enabled=false, got %v", response["enabled"])
	}
}

func TestSubscribeGetIONCSubscriptions_WithPoller(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	handlers := setupTestHandlersWithPollers(unisetServer)

	// Subscribe first
	body := `{"sensor_ids": [10, 20, 30]}`
	req := httptest.NewRequest("POST", "/api/objects/TestProc/ionc/subscribe", strings.NewReader(body))
	req.SetPathValue("name", "TestProc")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handlers.SubscribeIONCSensors(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("subscribe failed: %d: %s", w.Code, w.Body.String())
	}

	// Get subscriptions
	req = httptest.NewRequest("GET", "/api/objects/TestProc/ionc/subscriptions", nil)
	req.SetPathValue("name", "TestProc")
	w = httptest.NewRecorder()

	handlers.GetIONCSubscriptions(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if response["enabled"] != true {
		t.Errorf("expected enabled=true, got %v", response["enabled"])
	}

	sensorIDs := response["sensor_ids"].([]interface{})
	if len(sensorIDs) != 3 {
		t.Errorf("expected 3 sensor_ids, got %d", len(sensorIDs))
	}
}

// === IONC SubscribeIONCSensorsQuery Tests ===

func TestSubscribeIONCSensorsQuery_Success(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	handlers := setupTestHandlersWithPollers(unisetServer)

	req := httptest.NewRequest("GET", "/api/objects/TestProc/ionc/subscribe?sensors=1,2,3", nil)
	req.SetPathValue("name", "TestProc")
	w := httptest.NewRecorder()

	handlers.SubscribeIONCSensorsQuery(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if response["status"] != "subscribed" {
		t.Errorf("expected status=subscribed, got %v", response["status"])
	}
	if response["object"] != "TestProc" {
		t.Errorf("expected object=TestProc, got %v", response["object"])
	}

	sensorIDs := response["sensor_ids"].([]interface{})
	if len(sensorIDs) != 3 {
		t.Errorf("expected 3 sensor_ids, got %d", len(sensorIDs))
	}
}

func TestSubscribeIONCSensorsQuery_MissingSensorsParam(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	handlers := setupTestHandlersWithPollers(unisetServer)

	req := httptest.NewRequest("GET", "/api/objects/TestProc/ionc/subscribe", nil)
	req.SetPathValue("name", "TestProc")
	w := httptest.NewRecorder()

	handlers.SubscribeIONCSensorsQuery(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d: %s", w.Code, w.Body.String())
	}

	var response map[string]string
	json.Unmarshal(w.Body.Bytes(), &response)
	if response["error"] != "sensors parameter required" {
		t.Errorf("expected error='sensors parameter required', got %s", response["error"])
	}
}

func TestSubscribeIONCSensorsQuery_InvalidIDs(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	handlers := setupTestHandlersWithPollers(unisetServer)

	// All IDs are non-numeric
	req := httptest.NewRequest("GET", "/api/objects/TestProc/ionc/subscribe?sensors=abc,def", nil)
	req.SetPathValue("name", "TestProc")
	w := httptest.NewRecorder()

	handlers.SubscribeIONCSensorsQuery(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400 for invalid IDs, got %d: %s", w.Code, w.Body.String())
	}

	var response map[string]string
	json.Unmarshal(w.Body.Bytes(), &response)
	if response["error"] != "no valid sensor IDs provided" {
		t.Errorf("expected error='no valid sensor IDs provided', got %s", response["error"])
	}
}

// === Modbus UnsubscribeModbusRegisters Tests ===

func TestSubscribeUnsubscribeModbusRegisters_All(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	handlers := setupTestHandlersWithPollers(unisetServer)

	// Subscribe first
	body := `{"register_ids": [100, 200, 300]}`
	req := httptest.NewRequest("POST", "/api/objects/TestProc/modbus/subscribe", strings.NewReader(body))
	req.SetPathValue("name", "TestProc")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handlers.SubscribeModbusRegisters(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("subscribe failed: %d: %s", w.Code, w.Body.String())
	}

	// Unsubscribe all (empty register_ids)
	body = `{"register_ids": []}`
	req = httptest.NewRequest("POST", "/api/objects/TestProc/modbus/unsubscribe", strings.NewReader(body))
	req.SetPathValue("name", "TestProc")
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()

	handlers.UnsubscribeModbusRegisters(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)

	if response["status"] != "unsubscribed" {
		t.Errorf("expected status=unsubscribed, got %v", response["status"])
	}
	if response["object"] != "TestProc" {
		t.Errorf("expected object=TestProc, got %v", response["object"])
	}

	// Verify subscriptions are empty
	req = httptest.NewRequest("GET", "/api/objects/TestProc/modbus/subscriptions", nil)
	req.SetPathValue("name", "TestProc")
	w = httptest.NewRecorder()
	handlers.GetModbusSubscriptions(w, req)

	var subsResp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &subsResp)
	registerIDs := subsResp["register_ids"].([]interface{})
	if len(registerIDs) != 0 {
		t.Errorf("expected 0 subscriptions after unsubscribe all, got %d", len(registerIDs))
	}
}

func TestSubscribeUnsubscribeModbusRegisters_Specific(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	handlers := setupTestHandlersWithPollers(unisetServer)

	// Subscribe registers 100, 200, 300
	body := `{"register_ids": [100, 200, 300]}`
	req := httptest.NewRequest("POST", "/api/objects/TestProc/modbus/subscribe", strings.NewReader(body))
	req.SetPathValue("name", "TestProc")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handlers.SubscribeModbusRegisters(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("subscribe failed: %d: %s", w.Code, w.Body.String())
	}

	// Unsubscribe only register 200
	body = `{"register_ids": [200]}`
	req = httptest.NewRequest("POST", "/api/objects/TestProc/modbus/unsubscribe", strings.NewReader(body))
	req.SetPathValue("name", "TestProc")
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()

	handlers.UnsubscribeModbusRegisters(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify remaining subscriptions
	req = httptest.NewRequest("GET", "/api/objects/TestProc/modbus/subscriptions", nil)
	req.SetPathValue("name", "TestProc")
	w = httptest.NewRecorder()
	handlers.GetModbusSubscriptions(w, req)

	var subsResp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &subsResp)
	registerIDs := subsResp["register_ids"].([]interface{})
	if len(registerIDs) != 2 {
		t.Errorf("expected 2 remaining subscriptions, got %d", len(registerIDs))
	}
}

// === Modbus GetModbusSubscriptions Tests ===

func TestSubscribeGetModbusSubscriptions_NoPoller(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	handlers := setupTestHandlers(unisetServer)

	req := httptest.NewRequest("GET", "/api/objects/TestProc/modbus/subscriptions", nil)
	req.SetPathValue("name", "TestProc")
	w := httptest.NewRecorder()

	handlers.GetModbusSubscriptions(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	registerIDs := response["register_ids"].([]interface{})
	if len(registerIDs) != 0 {
		t.Errorf("expected empty register_ids, got %d items", len(registerIDs))
	}

	if response["enabled"] != false {
		t.Errorf("expected enabled=false, got %v", response["enabled"])
	}
}

func TestSubscribeGetModbusSubscriptions_WithPoller(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	handlers := setupTestHandlersWithPollers(unisetServer)

	// Subscribe first
	body := `{"register_ids": [10, 20]}`
	req := httptest.NewRequest("POST", "/api/objects/TestProc/modbus/subscribe", strings.NewReader(body))
	req.SetPathValue("name", "TestProc")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handlers.SubscribeModbusRegisters(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("subscribe failed: %d: %s", w.Code, w.Body.String())
	}

	// Get subscriptions
	req = httptest.NewRequest("GET", "/api/objects/TestProc/modbus/subscriptions", nil)
	req.SetPathValue("name", "TestProc")
	w = httptest.NewRecorder()

	handlers.GetModbusSubscriptions(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if response["enabled"] != true {
		t.Errorf("expected enabled=true, got %v", response["enabled"])
	}

	registerIDs := response["register_ids"].([]interface{})
	if len(registerIDs) != 2 {
		t.Errorf("expected 2 register_ids, got %d", len(registerIDs))
	}
}

// === OPCUA UnsubscribeOPCUASensors Tests ===

func TestSubscribeUnsubscribeOPCUASensors_All(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	handlers := setupTestHandlersWithPollers(unisetServer)

	// Subscribe first
	body := `{"sensor_ids": [5, 6, 7]}`
	req := httptest.NewRequest("POST", "/api/objects/TestProc/opcua/subscribe", strings.NewReader(body))
	req.SetPathValue("name", "TestProc")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handlers.SubscribeOPCUASensors(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("subscribe failed: %d: %s", w.Code, w.Body.String())
	}

	// Unsubscribe all (empty sensor_ids)
	body = `{"sensor_ids": []}`
	req = httptest.NewRequest("POST", "/api/objects/TestProc/opcua/unsubscribe", strings.NewReader(body))
	req.SetPathValue("name", "TestProc")
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()

	handlers.UnsubscribeOPCUASensors(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)

	if response["status"] != "unsubscribed" {
		t.Errorf("expected status=unsubscribed, got %v", response["status"])
	}
	if response["object"] != "TestProc" {
		t.Errorf("expected object=TestProc, got %v", response["object"])
	}

	// Verify subscriptions are empty
	req = httptest.NewRequest("GET", "/api/objects/TestProc/opcua/subscriptions", nil)
	req.SetPathValue("name", "TestProc")
	w = httptest.NewRecorder()
	handlers.GetOPCUASubscriptions(w, req)

	var subsResp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &subsResp)
	sensorIDs := subsResp["sensor_ids"].([]interface{})
	if len(sensorIDs) != 0 {
		t.Errorf("expected 0 subscriptions after unsubscribe all, got %d", len(sensorIDs))
	}
}

func TestSubscribeUnsubscribeOPCUASensors_Specific(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	handlers := setupTestHandlersWithPollers(unisetServer)

	// Subscribe sensors 5, 6, 7
	body := `{"sensor_ids": [5, 6, 7]}`
	req := httptest.NewRequest("POST", "/api/objects/TestProc/opcua/subscribe", strings.NewReader(body))
	req.SetPathValue("name", "TestProc")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handlers.SubscribeOPCUASensors(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("subscribe failed: %d: %s", w.Code, w.Body.String())
	}

	// Unsubscribe only sensor 6
	body = `{"sensor_ids": [6]}`
	req = httptest.NewRequest("POST", "/api/objects/TestProc/opcua/unsubscribe", strings.NewReader(body))
	req.SetPathValue("name", "TestProc")
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()

	handlers.UnsubscribeOPCUASensors(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	// Verify remaining subscriptions
	req = httptest.NewRequest("GET", "/api/objects/TestProc/opcua/subscriptions", nil)
	req.SetPathValue("name", "TestProc")
	w = httptest.NewRecorder()
	handlers.GetOPCUASubscriptions(w, req)

	var subsResp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &subsResp)
	sensorIDs := subsResp["sensor_ids"].([]interface{})
	if len(sensorIDs) != 2 {
		t.Errorf("expected 2 remaining subscriptions, got %d", len(sensorIDs))
	}
}

// === OPCUA GetOPCUASubscriptions Tests ===

func TestSubscribeGetOPCUASubscriptions_NoPoller(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	handlers := setupTestHandlers(unisetServer)

	req := httptest.NewRequest("GET", "/api/objects/TestProc/opcua/subscriptions", nil)
	req.SetPathValue("name", "TestProc")
	w := httptest.NewRecorder()

	handlers.GetOPCUASubscriptions(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	sensorIDs := response["sensor_ids"].([]interface{})
	if len(sensorIDs) != 0 {
		t.Errorf("expected empty sensor_ids, got %d items", len(sensorIDs))
	}

	if response["enabled"] != false {
		t.Errorf("expected enabled=false, got %v", response["enabled"])
	}
}

func TestSubscribeGetOPCUASubscriptions_WithPoller(t *testing.T) {
	unisetServer := mockUnisetServer()
	defer unisetServer.Close()

	handlers := setupTestHandlersWithPollers(unisetServer)

	// Subscribe first
	body := `{"sensor_ids": [50, 60]}`
	req := httptest.NewRequest("POST", "/api/objects/TestProc/opcua/subscribe", strings.NewReader(body))
	req.SetPathValue("name", "TestProc")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handlers.SubscribeOPCUASensors(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("subscribe failed: %d: %s", w.Code, w.Body.String())
	}

	// Get subscriptions
	req = httptest.NewRequest("GET", "/api/objects/TestProc/opcua/subscriptions", nil)
	req.SetPathValue("name", "TestProc")
	w = httptest.NewRecorder()

	handlers.GetOPCUASubscriptions(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if response["enabled"] != true {
		t.Errorf("expected enabled=true, got %v", response["enabled"])
	}

	sensorIDs := response["sensor_ids"].([]interface{})
	if len(sensorIDs) != 2 {
		t.Errorf("expected 2 sensor_ids, got %d", len(sensorIDs))
	}
}
