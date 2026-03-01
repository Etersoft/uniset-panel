package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pv/uniset-panel/internal/poller"
	"github.com/pv/uniset-panel/internal/storage"
	"github.com/pv/uniset-panel/internal/uniset"
)

// mockUnisetServerFull creates a test server that handles modbus and opcua endpoints
// in addition to the base endpoints from mockUnisetServer.
func mockUnisetServerFull() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		path := normalizeAPIPath(r.URL.Path)

		switch {
		// Base endpoints
		case path == "/list":
			json.NewEncoder(w).Encode([]string{"TestProc"})

		// Modbus: status
		case path == "/TestProc/status":
			json.NewEncoder(w).Encode(map[string]interface{}{
				"result": "OK",
				"status": map[string]interface{}{"activated": true},
			})

		// Modbus/OPCUA: getparam
		case path == "/TestProc/getparam":
			json.NewEncoder(w).Encode(map[string]interface{}{
				"result": "OK",
				"params": map[string]interface{}{"polltime": 200},
			})

		// Modbus/OPCUA: setparam
		case path == "/TestProc/setparam":
			json.NewEncoder(w).Encode(map[string]interface{}{
				"result":  "OK",
				"updated": map[string]interface{}{"polltime": 300},
			})

		// Modbus: registers
		case path == "/TestProc/registers":
			json.NewEncoder(w).Encode(map[string]interface{}{
				"result":    "OK",
				"registers": []map[string]interface{}{{"id": 1, "name": "AI70_S"}},
				"total":     1,
			})

		// Modbus: get (register values) and OPCUA: get (sensor values)
		case path == "/TestProc/get":
			json.NewEncoder(w).Encode(map[string]interface{}{
				"result":  "OK",
				"sensors": []map[string]interface{}{{"id": 1, "name": "AI70_S", "value": 42}},
			})

		// Modbus: devices
		case path == "/TestProc/devices":
			json.NewEncoder(w).Encode(map[string]interface{}{
				"result":  "OK",
				"devices": []map[string]interface{}{{"addr": 1, "respond": true}},
				"count":   1,
			})

		// Modbus: mode (get and set and supported)
		case path == "/TestProc/mode":
			q := r.URL.RawQuery
			if strings.Contains(q, "supported") {
				json.NewEncoder(w).Encode(map[string]interface{}{
					"result":    "OK",
					"supported": []string{"Normal", "Diagnostics"},
				})
			} else if strings.Contains(q, "set=") {
				json.NewEncoder(w).Encode(map[string]interface{}{
					"result": "OK",
					"mode":   "Normal",
				})
			} else {
				json.NewEncoder(w).Encode(map[string]interface{}{
					"result": "OK",
					"mode":   "Normal",
				})
			}

		// Modbus/OPCUA: takeControl
		case path == "/TestProc/takeControl":
			json.NewEncoder(w).Encode(map[string]interface{}{
				"result":            "OK",
				"httpControlActive": 1,
			})

		// Modbus/OPCUA: releaseControl
		case path == "/TestProc/releaseControl":
			json.NewEncoder(w).Encode(map[string]interface{}{
				"result":            "OK",
				"httpControlActive": 0,
			})

		// OPCUA: sensors (list)
		case path == "/TestProc/sensors":
			json.NewEncoder(w).Encode(map[string]interface{}{
				"result":  "OK",
				"sensors": []map[string]interface{}{{"id": 10, "name": "Temperature"}},
				"total":   1,
			})

		// OPCUA: sensor (detail)
		case path == "/TestProc/sensor":
			json.NewEncoder(w).Encode(map[string]interface{}{
				"result": "OK",
				"sensor": map[string]interface{}{"id": 10, "name": "Temperature", "value": 25},
			})

		// OPCUA: diagnostics
		case path == "/TestProc/diagnostics":
			json.NewEncoder(w).Encode(map[string]interface{}{
				"result":  "OK",
				"summary": map[string]interface{}{"total_errors": 0},
			})

		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
}

func setupProxyTestHandlers(unisetServer *httptest.Server) *Handlers {
	client := uniset.NewClient(unisetServer.URL)
	store := storage.NewMemoryStorage()
	p := poller.New(client, store, 5*time.Second, time.Hour)
	return NewHandlers(client, store, p, nil, 5*time.Second)
}

// --- Modbus proxy handler tests ---

func TestProxyMBSimpleGetHandlers(t *testing.T) {
	unisetServer := mockUnisetServerFull()
	defer unisetServer.Close()
	handlers := setupProxyTestHandlers(unisetServer)

	tests := []struct {
		name       string
		method     string
		url        string
		handler    func(http.ResponseWriter, *http.Request)
		wantStatus int
		wantKey    string // key to check in response JSON
	}{
		{
			name:       "GetMBStatus 200",
			method:     "GET",
			url:        "/api/objects/TestProc/modbus/status",
			handler:    handlers.GetMBStatus,
			wantStatus: http.StatusOK,
			wantKey:    "status",
		},
		{
			name:       "GetMBDevices 200",
			method:     "GET",
			url:        "/api/objects/TestProc/modbus/devices",
			handler:    handlers.GetMBDevices,
			wantStatus: http.StatusOK,
			wantKey:    "devices",
		},
		{
			name:       "GetMBMode 200",
			method:     "GET",
			url:        "/api/objects/TestProc/modbus/mode",
			handler:    handlers.GetMBMode,
			wantStatus: http.StatusOK,
			wantKey:    "mode",
		},
		{
			name:       "GetMBModeSupported 200",
			method:     "GET",
			url:        "/api/objects/TestProc/modbus/mode/supported",
			handler:    handlers.GetMBModeSupported,
			wantStatus: http.StatusOK,
			wantKey:    "supported",
		},
		{
			name:       "GetMBRegisters 200",
			method:     "GET",
			url:        "/api/objects/TestProc/modbus/registers",
			handler:    handlers.GetMBRegisters,
			wantStatus: http.StatusOK,
			wantKey:    "registers",
		},
		{
			name:       "GetMBRegisterValues 200",
			method:     "GET",
			url:        "/api/objects/TestProc/modbus/get?filter=1,2,3",
			handler:    handlers.GetMBRegisterValues,
			wantStatus: http.StatusOK,
			wantKey:    "sensors",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.url, nil)
			req.SetPathValue("name", "TestProc")
			w := httptest.NewRecorder()

			tt.handler(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d: %s", tt.wantStatus, w.Code, w.Body.String())
			}

			var resp map[string]interface{}
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("failed to parse response: %v", err)
			}
			if _, ok := resp[tt.wantKey]; !ok {
				t.Errorf("expected key %q in response, got: %v", tt.wantKey, resp)
			}
		})
	}
}

func TestProxyMBMissingObjectName(t *testing.T) {
	unisetServer := mockUnisetServerFull()
	defer unisetServer.Close()
	handlers := setupProxyTestHandlers(unisetServer)

	getHandlers := []struct {
		name    string
		method  string
		url     string
		handler func(http.ResponseWriter, *http.Request)
	}{
		{"GetMBStatus", "GET", "/api/objects//modbus/status", handlers.GetMBStatus},
		{"GetMBParams", "GET", "/api/objects//modbus/params?name=polltime", handlers.GetMBParams},
		{"GetMBRegisters", "GET", "/api/objects//modbus/registers", handlers.GetMBRegisters},
		{"GetMBRegisterValues", "GET", "/api/objects//modbus/get?filter=1", handlers.GetMBRegisterValues},
		{"GetMBDevices", "GET", "/api/objects//modbus/devices", handlers.GetMBDevices},
		{"GetMBMode", "GET", "/api/objects//modbus/mode", handlers.GetMBMode},
		{"GetMBModeSupported", "GET", "/api/objects//modbus/mode/supported", handlers.GetMBModeSupported},
	}

	for _, tt := range getHandlers {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.url, nil)
			// Do NOT set PathValue "name" -> triggers requireObjectName error
			w := httptest.NewRecorder()

			tt.handler(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("expected status 400, got %d: %s", w.Code, w.Body.String())
			}
		})
	}

	postHandlers := []struct {
		name    string
		url     string
		body    string
		handler func(http.ResponseWriter, *http.Request)
	}{
		{"SetMBParams", "/api/objects//modbus/params", `{"polltime":100}`, handlers.SetMBParams},
		{"SetMBMode", "/api/objects//modbus/mode", `{"mode":"Normal"}`, handlers.SetMBMode},
		{"TakeMBControl", "/api/objects//modbus/control/take", "", handlers.TakeMBControl},
		{"ReleaseMBControl", "/api/objects//modbus/control/release", "", handlers.ReleaseMBControl},
	}

	for _, tt := range postHandlers {
		t.Run(tt.name, func(t *testing.T) {
			var body *strings.Reader
			if tt.body != "" {
				body = strings.NewReader(tt.body)
			} else {
				body = strings.NewReader("")
			}
			req := httptest.NewRequest("POST", tt.url, body)
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			tt.handler(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("expected status 400, got %d: %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestProxyGetMBParams(t *testing.T) {
	unisetServer := mockUnisetServerFull()
	defer unisetServer.Close()
	handlers := setupProxyTestHandlers(unisetServer)

	t.Run("happy path", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/objects/TestProc/modbus/params?name=polltime", nil)
		req.SetPathValue("name", "TestProc")
		w := httptest.NewRecorder()

		handlers.GetMBParams(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)
		if _, ok := resp["params"]; !ok {
			t.Error("expected 'params' key in response")
		}
	})

	t.Run("missing name parameter", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/objects/TestProc/modbus/params", nil)
		req.SetPathValue("name", "TestProc")
		w := httptest.NewRecorder()

		handlers.GetMBParams(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected status 400, got %d: %s", w.Code, w.Body.String())
		}
	})
}

func TestProxySetMBParams(t *testing.T) {
	unisetServer := mockUnisetServerFull()
	defer unisetServer.Close()
	handlers := setupProxyTestHandlers(unisetServer)

	t.Run("happy path", func(t *testing.T) {
		body := strings.NewReader(`{"polltime": 300}`)
		req := httptest.NewRequest("POST", "/api/objects/TestProc/modbus/params", body)
		req.SetPathValue("name", "TestProc")
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handlers.SetMBParams(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)
		if _, ok := resp["updated"]; !ok {
			t.Error("expected 'updated' key in response")
		}
	})

	t.Run("with params wrapper", func(t *testing.T) {
		body := strings.NewReader(`{"params": {"polltime": 300}}`)
		req := httptest.NewRequest("POST", "/api/objects/TestProc/modbus/params", body)
		req.SetPathValue("name", "TestProc")
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handlers.SetMBParams(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("empty body", func(t *testing.T) {
		body := strings.NewReader(`{}`)
		req := httptest.NewRequest("POST", "/api/objects/TestProc/modbus/params", body)
		req.SetPathValue("name", "TestProc")
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handlers.SetMBParams(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected status 400, got %d: %s", w.Code, w.Body.String())
		}
	})
}

func TestProxyGetMBRegisterValues_MissingFilter(t *testing.T) {
	unisetServer := mockUnisetServerFull()
	defer unisetServer.Close()
	handlers := setupProxyTestHandlers(unisetServer)

	req := httptest.NewRequest("GET", "/api/objects/TestProc/modbus/get", nil)
	req.SetPathValue("name", "TestProc")
	w := httptest.NewRecorder()

	handlers.GetMBRegisterValues(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestProxySetMBMode(t *testing.T) {
	unisetServer := mockUnisetServerFull()
	defer unisetServer.Close()
	handlers := setupProxyTestHandlers(unisetServer)

	t.Run("happy path", func(t *testing.T) {
		body := strings.NewReader(`{"mode": "Normal"}`)
		req := httptest.NewRequest("POST", "/api/objects/TestProc/modbus/mode", body)
		req.SetPathValue("name", "TestProc")
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handlers.SetMBMode(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["mode"] != "Normal" {
			t.Errorf("expected mode=Normal, got %v", resp["mode"])
		}
	})

	t.Run("empty mode", func(t *testing.T) {
		body := strings.NewReader(`{"mode": ""}`)
		req := httptest.NewRequest("POST", "/api/objects/TestProc/modbus/mode", body)
		req.SetPathValue("name", "TestProc")
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handlers.SetMBMode(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected status 400, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("missing mode field", func(t *testing.T) {
		body := strings.NewReader(`{}`)
		req := httptest.NewRequest("POST", "/api/objects/TestProc/modbus/mode", body)
		req.SetPathValue("name", "TestProc")
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handlers.SetMBMode(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected status 400, got %d: %s", w.Code, w.Body.String())
		}
	})
}

func TestProxyMBControlHandlers(t *testing.T) {
	unisetServer := mockUnisetServerFull()
	defer unisetServer.Close()
	handlers := setupProxyTestHandlers(unisetServer)

	tests := []struct {
		name       string
		url        string
		handler    func(http.ResponseWriter, *http.Request)
		wantStatus int
	}{
		{
			name:       "TakeMBControl 200",
			url:        "/api/objects/TestProc/modbus/control/take",
			handler:    handlers.TakeMBControl,
			wantStatus: http.StatusOK,
		},
		{
			name:       "ReleaseMBControl 200",
			url:        "/api/objects/TestProc/modbus/control/release",
			handler:    handlers.ReleaseMBControl,
			wantStatus: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", tt.url, nil)
			req.SetPathValue("name", "TestProc")
			w := httptest.NewRecorder()

			tt.handler(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d: %s", tt.wantStatus, w.Code, w.Body.String())
			}

			var resp map[string]interface{}
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("failed to parse response: %v", err)
			}
			if resp["result"] != "OK" {
				t.Errorf("expected result=OK, got %v", resp["result"])
			}
		})
	}
}

// --- OPCUA proxy handler tests ---

func TestProxyOPCUASimpleGetHandlers(t *testing.T) {
	unisetServer := mockUnisetServerFull()
	defer unisetServer.Close()
	handlers := setupProxyTestHandlers(unisetServer)

	tests := []struct {
		name       string
		method     string
		url        string
		handler    func(http.ResponseWriter, *http.Request)
		wantStatus int
		wantKey    string
	}{
		{
			name:       "GetOPCUAStatus 200",
			method:     "GET",
			url:        "/api/objects/TestProc/opcua/status",
			handler:    handlers.GetOPCUAStatus,
			wantStatus: http.StatusOK,
			wantKey:    "status",
		},
		{
			name:       "GetOPCUASensors 200",
			method:     "GET",
			url:        "/api/objects/TestProc/opcua/sensors",
			handler:    handlers.GetOPCUASensors,
			wantStatus: http.StatusOK,
			wantKey:    "sensors",
		},
		{
			name:       "GetOPCUASensorValues 200",
			method:     "GET",
			url:        "/api/objects/TestProc/opcua/get?filter=10,11",
			handler:    handlers.GetOPCUASensorValues,
			wantStatus: http.StatusOK,
			wantKey:    "sensors",
		},
		{
			name:       "GetOPCUADiagnostics 200",
			method:     "GET",
			url:        "/api/objects/TestProc/opcua/diagnostics",
			handler:    handlers.GetOPCUADiagnostics,
			wantStatus: http.StatusOK,
			wantKey:    "summary",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.url, nil)
			req.SetPathValue("name", "TestProc")
			w := httptest.NewRecorder()

			tt.handler(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d: %s", tt.wantStatus, w.Code, w.Body.String())
			}

			var resp map[string]interface{}
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("failed to parse response: %v", err)
			}
			if _, ok := resp[tt.wantKey]; !ok {
				t.Errorf("expected key %q in response, got: %v", tt.wantKey, resp)
			}
		})
	}
}

func TestProxyOPCUAMissingObjectName(t *testing.T) {
	unisetServer := mockUnisetServerFull()
	defer unisetServer.Close()
	handlers := setupProxyTestHandlers(unisetServer)

	getHandlers := []struct {
		name    string
		method  string
		url     string
		handler func(http.ResponseWriter, *http.Request)
	}{
		{"GetOPCUAStatus", "GET", "/api/objects//opcua/status", handlers.GetOPCUAStatus},
		{"GetOPCUAParams", "GET", "/api/objects//opcua/params?name=polltime", handlers.GetOPCUAParams},
		{"GetOPCUASensors", "GET", "/api/objects//opcua/sensors", handlers.GetOPCUASensors},
		{"GetOPCUASensorValues", "GET", "/api/objects//opcua/get?filter=10", handlers.GetOPCUASensorValues},
		{"GetOPCUADiagnostics", "GET", "/api/objects//opcua/diagnostics", handlers.GetOPCUADiagnostics},
	}

	for _, tt := range getHandlers {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.url, nil)
			w := httptest.NewRecorder()

			tt.handler(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("expected status 400, got %d: %s", w.Code, w.Body.String())
			}
		})
	}

	postHandlers := []struct {
		name    string
		url     string
		body    string
		handler func(http.ResponseWriter, *http.Request)
	}{
		{"SetOPCUAParams", "/api/objects//opcua/params", `{"polltime":100}`, handlers.SetOPCUAParams},
		{"TakeOPCUAControl", "/api/objects//opcua/control/take", "", handlers.TakeOPCUAControl},
		{"ReleaseOPCUAControl", "/api/objects//opcua/control/release", "", handlers.ReleaseOPCUAControl},
	}

	for _, tt := range postHandlers {
		t.Run(tt.name, func(t *testing.T) {
			var body *strings.Reader
			if tt.body != "" {
				body = strings.NewReader(tt.body)
			} else {
				body = strings.NewReader("")
			}
			req := httptest.NewRequest("POST", tt.url, body)
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			tt.handler(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("expected status 400, got %d: %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestProxyGetOPCUASensor(t *testing.T) {
	unisetServer := mockUnisetServerFull()
	defer unisetServer.Close()
	handlers := setupProxyTestHandlers(unisetServer)

	t.Run("happy path", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/objects/TestProc/opcua/sensors/10", nil)
		req.SetPathValue("name", "TestProc")
		req.SetPathValue("id", "10")
		w := httptest.NewRecorder()

		handlers.GetOPCUASensor(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)
		if _, ok := resp["sensor"]; !ok {
			t.Error("expected 'sensor' key in response")
		}
	})

	t.Run("missing object name", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/objects//opcua/sensors/10", nil)
		req.SetPathValue("id", "10")
		w := httptest.NewRecorder()

		handlers.GetOPCUASensor(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected status 400, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("missing sensor id", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/objects/TestProc/opcua/sensors/", nil)
		req.SetPathValue("name", "TestProc")
		// Do NOT set "id" path value
		w := httptest.NewRecorder()

		handlers.GetOPCUASensor(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected status 400, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("invalid sensor id", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/objects/TestProc/opcua/sensors/abc", nil)
		req.SetPathValue("name", "TestProc")
		req.SetPathValue("id", "abc")
		w := httptest.NewRecorder()

		handlers.GetOPCUASensor(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected status 400, got %d: %s", w.Code, w.Body.String())
		}
	})
}

func TestProxyGetOPCUAParams(t *testing.T) {
	unisetServer := mockUnisetServerFull()
	defer unisetServer.Close()
	handlers := setupProxyTestHandlers(unisetServer)

	t.Run("happy path", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/objects/TestProc/opcua/params?name=polltime", nil)
		req.SetPathValue("name", "TestProc")
		w := httptest.NewRecorder()

		handlers.GetOPCUAParams(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)
		if _, ok := resp["params"]; !ok {
			t.Error("expected 'params' key in response")
		}
	})

	t.Run("missing name parameter", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/objects/TestProc/opcua/params", nil)
		req.SetPathValue("name", "TestProc")
		w := httptest.NewRecorder()

		handlers.GetOPCUAParams(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected status 400, got %d: %s", w.Code, w.Body.String())
		}
	})
}

func TestProxySetOPCUAParams(t *testing.T) {
	unisetServer := mockUnisetServerFull()
	defer unisetServer.Close()
	handlers := setupProxyTestHandlers(unisetServer)

	t.Run("happy path", func(t *testing.T) {
		body := strings.NewReader(`{"polltime": 300}`)
		req := httptest.NewRequest("POST", "/api/objects/TestProc/opcua/params", body)
		req.SetPathValue("name", "TestProc")
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handlers.SetOPCUAParams(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &resp)
		if _, ok := resp["updated"]; !ok {
			t.Error("expected 'updated' key in response")
		}
	})

	t.Run("with params wrapper", func(t *testing.T) {
		body := strings.NewReader(`{"params": {"polltime": 300}}`)
		req := httptest.NewRequest("POST", "/api/objects/TestProc/opcua/params", body)
		req.SetPathValue("name", "TestProc")
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handlers.SetOPCUAParams(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("empty body", func(t *testing.T) {
		body := strings.NewReader(`{}`)
		req := httptest.NewRequest("POST", "/api/objects/TestProc/opcua/params", body)
		req.SetPathValue("name", "TestProc")
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		handlers.SetOPCUAParams(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected status 400, got %d: %s", w.Code, w.Body.String())
		}
	})
}

func TestProxyGetOPCUASensorValues_MissingFilter(t *testing.T) {
	unisetServer := mockUnisetServerFull()
	defer unisetServer.Close()
	handlers := setupProxyTestHandlers(unisetServer)

	req := httptest.NewRequest("GET", "/api/objects/TestProc/opcua/get", nil)
	req.SetPathValue("name", "TestProc")
	w := httptest.NewRecorder()

	handlers.GetOPCUASensorValues(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestProxyOPCUAControlHandlers(t *testing.T) {
	unisetServer := mockUnisetServerFull()
	defer unisetServer.Close()
	handlers := setupProxyTestHandlers(unisetServer)

	tests := []struct {
		name       string
		url        string
		handler    func(http.ResponseWriter, *http.Request)
		wantStatus int
	}{
		{
			name:       "TakeOPCUAControl 200",
			url:        "/api/objects/TestProc/opcua/control/take",
			handler:    handlers.TakeOPCUAControl,
			wantStatus: http.StatusOK,
		},
		{
			name:       "ReleaseOPCUAControl 200",
			url:        "/api/objects/TestProc/opcua/control/release",
			handler:    handlers.ReleaseOPCUAControl,
			wantStatus: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", tt.url, nil)
			req.SetPathValue("name", "TestProc")
			w := httptest.NewRecorder()

			tt.handler(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("expected status %d, got %d: %s", tt.wantStatus, w.Code, w.Body.String())
			}

			var resp map[string]interface{}
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("failed to parse response: %v", err)
			}
			if resp["result"] != "OK" {
				t.Errorf("expected result=OK, got %v", resp["result"])
			}
		})
	}
}

// --- Upstream error tests (mock server returns 404 for unknown objects) ---

func TestProxyMBUpstreamError(t *testing.T) {
	unisetServer := mockUnisetServerFull()
	defer unisetServer.Close()
	handlers := setupProxyTestHandlers(unisetServer)

	// Use an object name that the mock server does not handle -> 404 from upstream
	// The client.doGet will return an error, and the handler returns 502 Bad Gateway.
	tests := []struct {
		name    string
		method  string
		url     string
		handler func(http.ResponseWriter, *http.Request)
	}{
		{"GetMBStatus", "GET", "/api/objects/UnknownObj/modbus/status", handlers.GetMBStatus},
		{"GetMBDevices", "GET", "/api/objects/UnknownObj/modbus/devices", handlers.GetMBDevices},
		{"GetOPCUAStatus", "GET", "/api/objects/UnknownObj/opcua/status", handlers.GetOPCUAStatus},
		{"GetOPCUADiagnostics", "GET", "/api/objects/UnknownObj/opcua/diagnostics", handlers.GetOPCUADiagnostics},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.url, nil)
			req.SetPathValue("name", "UnknownObj")
			w := httptest.NewRecorder()

			tt.handler(w, req)

			if w.Code != http.StatusBadGateway {
				t.Errorf("expected status 502, got %d: %s", w.Code, w.Body.String())
			}
		})
	}
}
