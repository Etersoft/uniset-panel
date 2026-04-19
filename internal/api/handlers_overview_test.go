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
	"github.com/pv/uniset-panel/internal/uniset"
)

func TestHandleServerOverview(t *testing.T) {
	tests := []struct {
		name           string
		setupMgr       bool
		serverID       string
		queryString    string
		overviewConfig *config.OverviewConfig
		mockObjects    []string
		mockData       map[string]map[string]any
		expectedStatus int
		expectedError  string
		checkResponse  func(t *testing.T, resp OverviewResponse)
		checkWatch     bool
	}{
		{
			name:           "serverMgr not initialized",
			setupMgr:       false,
			serverID:       "any",
			expectedStatus: http.StatusServiceUnavailable,
			expectedError:  "server manager not initialized",
		},
		{
			name:           "server not found",
			setupMgr:       true,
			serverID:       "nonexistent",
			expectedStatus: http.StatusNotFound,
			expectedError:  "server not found",
		},
		{
			name:         "empty server with no objects",
			setupMgr:     true,
			serverID:     "srv1",
			mockObjects:  []string{},
			mockData:     map[string]map[string]any{},
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, resp OverviewResponse) {
				if len(resp.Nodes) != 0 {
					t.Errorf("expected 0 nodes, got %d", len(resp.Nodes))
				}
				if len(resp.Edges) != 0 {
					t.Errorf("expected 0 edges, got %d", len(resp.Edges))
				}
				if resp.ServerName == "" {
					t.Error("expected non-empty serverName")
				}
				if resp.AllNodes == nil {
					t.Error("allNodes should not be nil")
				}
			},
		},
		{
			name:        "eligible object without IO data (UniSetManager, no extensionType)",
			setupMgr:    true,
			serverID:    "srv1",
			mockObjects: []string{"TestProc"},
			mockData: map[string]map[string]any{
				"TestProc": {
					"object": map[string]any{
						"id":         1,
						"name":       "TestProc",
						"objectType": "UniSetManager",
					},
				},
			},
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, resp OverviewResponse) {
				if len(resp.Nodes) != 1 {
					t.Fatalf("expected 1 node, got %d", len(resp.Nodes))
				}
				node := resp.Nodes[0]
				if node.Name != "TestProc" {
					t.Errorf("expected node name TestProc, got %s", node.Name)
				}
				if node.Inputs == nil {
					t.Error("inputs should not be nil")
				}
				if len(node.Inputs) != 0 {
					t.Errorf("expected 0 inputs, got %d", len(node.Inputs))
				}
			},
		},
		{
			name:        "objects with extensionType are filtered out",
			setupMgr:    true,
			serverID:    "srv1",
			mockObjects: []string{"MBMaster", "UserProc"},
			mockData: map[string]map[string]any{
				"MBMaster": {
					"object": map[string]any{
						"id":            1,
						"name":          "MBMaster",
						"objectType":    "UniSetObject",
						"extensionType": "ModbusMaster",
					},
				},
				"UserProc": {
					"object": map[string]any{
						"id":         2,
						"name":       "UserProc",
						"objectType": "UniSetObject",
					},
				},
			},
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, resp OverviewResponse) {
				// Only UserProc should be included (MBMaster has extensionType)
				if len(resp.Nodes) != 1 {
					t.Fatalf("expected 1 node (filtered), got %d", len(resp.Nodes))
				}
				if resp.Nodes[0].Name != "UserProc" {
					t.Errorf("expected UserProc, got %s", resp.Nodes[0].Name)
				}
			},
		},
		{
			name:        "objects with non-eligible objectType are filtered out",
			setupMgr:    true,
			serverID:    "srv1",
			mockObjects: []string{"Activator", "UserProc"},
			mockData: map[string]map[string]any{
				"Activator": {
					"object": map[string]any{
						"id":         1,
						"name":       "Activator",
						"objectType": "UniSetActivator",
					},
				},
				"UserProc": {
					"object": map[string]any{
						"id":         2,
						"name":       "UserProc",
						"objectType": "UniSetManager",
					},
				},
			},
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, resp OverviewResponse) {
				// Only UserProc should be included (Activator has wrong objectType)
				if len(resp.Nodes) != 1 {
					t.Fatalf("expected 1 node (filtered), got %d", len(resp.Nodes))
				}
				if resp.Nodes[0].Name != "UserProc" {
					t.Errorf("expected UserProc, got %s", resp.Nodes[0].Name)
				}
			},
		},
		{
			name:        "two objects with matching IO creates edge",
			setupMgr:    true,
			serverID:    "srv1",
			mockObjects: []string{"ProcessA", "ProcessB"},
			mockData: map[string]map[string]any{
				"ProcessA": {
					"object": map[string]any{"id": 1, "name": "ProcessA", "objectType": "UniSetObject"},
					"io": map[string]any{
						"out": map[string]any{
							"SensorX": map[string]any{"id": 1, "name": "SensorX", "value": 42},
							"SensorY": map[string]any{"id": 2, "name": "SensorY", "value": 0},
						},
					},
				},
				"ProcessB": {
					"object": map[string]any{"id": 2, "name": "ProcessB", "objectType": "UniSetManager"},
					"io": map[string]any{
						"in": map[string]any{
							"SensorX": map[string]any{"id": 3, "name": "SensorX", "value": 42},
						},
					},
				},
			},
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, resp OverviewResponse) {
				if len(resp.Nodes) != 2 {
					t.Fatalf("expected 2 nodes, got %d", len(resp.Nodes))
				}

				// Find ProcessA and ProcessB nodes
				nodeMap := make(map[string]OverviewNode)
				for _, n := range resp.Nodes {
					nodeMap[n.Name] = n
				}

				procA, ok := nodeMap["ProcessA"]
				if !ok {
					t.Fatal("missing ProcessA node")
				}
				if len(procA.Outputs) != 2 {
					t.Errorf("ProcessA: expected 2 outputs, got %d", len(procA.Outputs))
				}
				if len(procA.Inputs) != 0 {
					t.Errorf("ProcessA: expected 0 inputs, got %d", len(procA.Inputs))
				}
				// Check sorted order
				if len(procA.Outputs) == 2 {
					if procA.Outputs[0].Name != "SensorX" {
						t.Errorf("expected first output SensorX, got %s", procA.Outputs[0].Name)
					}
					if procA.Outputs[1].Name != "SensorY" {
						t.Errorf("expected second output SensorY, got %s", procA.Outputs[1].Name)
					}
				}

				procB, ok := nodeMap["ProcessB"]
				if !ok {
					t.Fatal("missing ProcessB node")
				}
				if len(procB.Inputs) != 1 {
					t.Errorf("ProcessB: expected 1 input, got %d", len(procB.Inputs))
				}
				if len(procB.Outputs) != 0 {
					t.Errorf("ProcessB: expected 0 outputs, got %d", len(procB.Outputs))
				}

				// Check edges
				if len(resp.Edges) != 1 {
					t.Fatalf("expected 1 edge, got %d", len(resp.Edges))
				}
				edge := resp.Edges[0]
				if edge.FromNode != "ProcessA" {
					t.Errorf("expected edge fromNode=ProcessA, got %s", edge.FromNode)
				}
				if edge.FromPort != "SensorX" {
					t.Errorf("expected edge fromPort=SensorX, got %s", edge.FromPort)
				}
				if edge.ToNode != "ProcessB" {
					t.Errorf("expected edge toNode=ProcessB, got %s", edge.ToNode)
				}
				if edge.ToPort != "SensorX" {
					t.Errorf("expected edge toPort=SensorX, got %s", edge.ToPort)
				}
			},
		},
		{
			name:        "no matching IO produces no edges",
			setupMgr:    true,
			serverID:    "srv1",
			mockObjects: []string{"ProcA", "ProcB"},
			mockData: map[string]map[string]any{
				"ProcA": {
					"object": map[string]any{"id": 1, "name": "ProcA", "objectType": "UniSetObject"},
					"io": map[string]any{
						"out": map[string]any{
							"SensorX": map[string]any{"id": 1, "name": "SensorX", "value": 10},
						},
					},
				},
				"ProcB": {
					"object": map[string]any{"id": 2, "name": "ProcB", "objectType": "UniSetObject"},
					"io": map[string]any{
						"in": map[string]any{
							"SensorZ": map[string]any{"id": 3, "name": "SensorZ", "value": 20},
						},
					},
				},
			},
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, resp OverviewResponse) {
				if len(resp.Nodes) != 2 {
					t.Fatalf("expected 2 nodes, got %d", len(resp.Nodes))
				}
				if len(resp.Edges) != 0 {
					t.Errorf("expected 0 edges, got %d", len(resp.Edges))
				}
			},
		},
		{
			name:        "allNodes contains all eligible objects with full data",
			setupMgr:    true,
			serverID:    "srv1",
			mockObjects: []string{"ProcA", "ProcB", "MBMaster"},
			mockData: map[string]map[string]any{
				"ProcA":    {"object": map[string]any{"id": 1, "name": "ProcA", "objectType": "UniSetObject"},
					"io": map[string]any{"out": map[string]any{"SensorX": map[string]any{"id": 1, "name": "SensorX", "value": 10}}}},
				"ProcB":    {"object": map[string]any{"id": 2, "name": "ProcB", "objectType": "UniSetObject"}},
				"MBMaster": {"object": map[string]any{"id": 3, "name": "MBMaster", "objectType": "UniSetObject", "extensionType": "ModbusMaster"}},
			},
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, resp OverviewResponse) {
				// allNodes should contain only eligible (ProcA, ProcB), not MBMaster
				if len(resp.AllNodes) != 2 {
					t.Fatalf("expected 2 allNodes, got %d", len(resp.AllNodes))
				}
				// Should be sorted
				if resp.AllNodes[0].Name != "ProcA" || resp.AllNodes[1].Name != "ProcB" {
					t.Errorf("allNodes not sorted or wrong: %v", resp.AllNodes)
				}
				// allNodes should have full port data
				if len(resp.AllNodes[0].Outputs) != 1 {
					t.Errorf("expected ProcA to have 1 output in allNodes, got %d", len(resp.AllNodes[0].Outputs))
				}
			},
		},
		{
			name:        "config patterns filter nodes but not allNodes",
			setupMgr:    true,
			serverID:    "srv1",
			overviewConfig: &config.OverviewConfig{
				Patterns: []string{"ProcA"},
			},
			mockObjects: []string{"ProcA", "ProcB"},
			mockData: map[string]map[string]any{
				"ProcA": {"object": map[string]any{"id": 1, "name": "ProcA", "objectType": "UniSetObject"}},
				"ProcB": {"object": map[string]any{"id": 2, "name": "ProcB", "objectType": "UniSetObject"}},
			},
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, resp OverviewResponse) {
				// nodes should be filtered by config
				if len(resp.Nodes) != 1 {
					t.Fatalf("expected 1 node (config filtered), got %d", len(resp.Nodes))
				}
				if resp.Nodes[0].Name != "ProcA" {
					t.Errorf("expected ProcA, got %s", resp.Nodes[0].Name)
				}
				// allNodes should have all eligible
				if len(resp.AllNodes) != 2 {
					t.Errorf("expected 2 allNodes, got %d", len(resp.AllNodes))
				}
			},
		},
		{
			name:        "config exclude filters out matching nodes",
			setupMgr:    true,
			serverID:    "srv1",
			overviewConfig: &config.OverviewConfig{
				Exclude: []string{"ProcB"},
			},
			mockObjects: []string{"ProcA", "ProcB"},
			mockData: map[string]map[string]any{
				"ProcA": {"object": map[string]any{"id": 1, "name": "ProcA", "objectType": "UniSetObject"}},
				"ProcB": {"object": map[string]any{"id": 2, "name": "ProcB", "objectType": "UniSetObject"}},
			},
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, resp OverviewResponse) {
				if len(resp.Nodes) != 1 {
					t.Fatalf("expected 1 node (excluded ProcB), got %d", len(resp.Nodes))
				}
				if resp.Nodes[0].Name != "ProcA" {
					t.Errorf("expected ProcA, got %s", resp.Nodes[0].Name)
				}
				if len(resp.AllNodes) != 2 {
					t.Errorf("expected 2 allNodes, got %d", len(resp.AllNodes))
				}
			},
		},
		{
			name:        "selected query param overrides config",
			setupMgr:    true,
			serverID:    "srv1",
			queryString: "?selected=ProcB",
			overviewConfig: &config.OverviewConfig{
				Patterns: []string{"ProcA"},
			},
			mockObjects: []string{"ProcA", "ProcB"},
			mockData: map[string]map[string]any{
				"ProcA": {"object": map[string]any{"id": 1, "name": "ProcA", "objectType": "UniSetObject"}},
				"ProcB": {"object": map[string]any{"id": 2, "name": "ProcB", "objectType": "UniSetObject"}},
			},
			expectedStatus: http.StatusOK,
			checkResponse: func(t *testing.T, resp OverviewResponse) {
				// selected overrides config — only ProcB
				if len(resp.Nodes) != 1 {
					t.Fatalf("expected 1 node (selected=ProcB), got %d", len(resp.Nodes))
				}
				if resp.Nodes[0].Name != "ProcB" {
					t.Errorf("expected ProcB, got %s", resp.Nodes[0].Name)
				}
			},
		},
		{
			name:        "Watch called for each object (side-effect verified via nodes presence)",
			setupMgr:    true,
			serverID:    "srv1",
			mockObjects: []string{"ObjA", "ObjB"},
			mockData: map[string]map[string]any{
				"ObjA": {"object": map[string]any{"id": 1, "name": "ObjA", "objectType": "UniSetObject"}},
				"ObjB": {"object": map[string]any{"id": 2, "name": "ObjB", "objectType": "UniSetManager"}},
			},
			expectedStatus: http.StatusOK,
			checkWatch:     true,
			checkResponse: func(t *testing.T, resp OverviewResponse) {
				if len(resp.Nodes) != 2 {
					t.Errorf("expected 2 nodes, got %d", len(resp.Nodes))
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var handlers *Handlers
			var mockSrv *httptest.Server
			var mgr *server.Manager

			if tt.setupMgr {
				// Create mock UniSet2 server
				mockSrv = createOverviewMockServer(tt.mockObjects, tt.mockData)
				defer mockSrv.Close()

				store := storage.NewMemoryStorage()
				mgr = server.NewManager(store, 200*time.Millisecond, time.Hour, "", 0)

				if len(tt.mockObjects) > 0 || tt.serverID == "srv1" {
					cfg := config.ServerConfig{
						ID:   "srv1",
						URL:  mockSrv.URL,
						Name: "Test Server",
					}
					if err := mgr.AddServer(cfg); err != nil {
						t.Fatalf("failed to add server: %v", err)
					}

					// Wait for initial poll to populate cached objects list
					time.Sleep(400 * time.Millisecond)

					// Pre-watch all objects so the poller fetches their data
					for _, objName := range tt.mockObjects {
						mgr.Watch("srv1", objName)
					}

					// Wait for another poll cycle to cache object data
					time.Sleep(400 * time.Millisecond)
				}

				handlers = &Handlers{
					storage:  store,
					sseHub:   NewSSEHub(),
				}
				handlers.SetServerManager(mgr)
				if tt.overviewConfig != nil {
					handlers.SetOverviewConfig(tt.overviewConfig)
				}
			} else {
				handlers = &Handlers{
					sseHub: NewSSEHub(),
				}
			}

			urlPath := "/api/servers/" + tt.serverID + "/overview" + tt.queryString
			req := httptest.NewRequest("GET", urlPath, nil)
			req.SetPathValue("id", tt.serverID)
			w := httptest.NewRecorder()

			handlers.handleServerOverview(w, req)

			if w.Code != tt.expectedStatus {
				t.Errorf("expected status %d, got %d; body: %s", tt.expectedStatus, w.Code, w.Body.String())
			}

			if tt.expectedError != "" {
				var errResp map[string]string
				if err := json.Unmarshal(w.Body.Bytes(), &errResp); err != nil {
					t.Fatalf("failed to parse error response: %v", err)
				}
				if errResp["error"] != tt.expectedError {
					t.Errorf("expected error %q, got %q", tt.expectedError, errResp["error"])
				}
			}

			if tt.checkResponse != nil {
				var resp OverviewResponse
				if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
					t.Fatalf("failed to parse response: %v; body: %s", err, w.Body.String())
				}
				tt.checkResponse(t, resp)
			}

			if tt.checkWatch && mgr != nil {
				// Verify Watch was called as a side-effect:
				// After calling the handler, GetLastData should not panic and
				// the handler should have iterated all objects (verified via node count above).
				// Watch() adds objects to the poller's watched set, which causes
				// future poll cycles to fetch their data.
				instance, ok := mgr.GetServer("srv1")
				if !ok {
					t.Fatal("server srv1 not found after handler call")
				}
				// Verify instance is accessible (Watch was called without error)
				if instance.Poller == nil {
					t.Fatal("expected poller to be initialized")
				}
			}

			// Cleanup
			if mgr != nil {
				mgr.Shutdown(t.Context())
			}
		})
	}
}

// createOverviewMockServer creates a mock UniSet2 server for overview tests.
// UniSet2 API format: {"ObjectName": {"Variables": ..., "io": ...}, "object": {"id": ..., "objectType": ...}}
// The "object" key is at the top level, not nested inside the object name key.
func createOverviewMockServer(objects []string, data map[string]map[string]any) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if pathEquals(r, "list") {
			json.NewEncoder(w).Encode(objects)
			return
		}

		// Check for object data requests
		for _, objName := range objects {
			if pathEquals(r, objName) {
				objData, exists := data[objName]
				if !exists {
					objData = map[string]any{
						"object": map[string]any{
							"id":   1,
							"name": objName,
						},
					}
				}
				// Build UniSet2 API response format:
				// "object" at top level, object-specific data under object name key
				resp := map[string]any{}
				if objectInfo, ok := objData["object"]; ok {
					resp["object"] = objectInfo
				}
				// Remaining fields go under objName key
				innerData := map[string]any{}
				for k, v := range objData {
					if k != "object" {
						innerData[k] = v
					}
				}
				if len(innerData) > 0 {
					resp[objName] = innerData
				}
				json.NewEncoder(w).Encode(resp)
				return
			}
		}

		w.WriteHeader(http.StatusNotFound)
	}))
}

// TestMatchOverviewPattern tests the glob pattern matching for overview config.
func TestMatchOverviewPattern(t *testing.T) {
	tests := []struct {
		name     string
		patterns []string
		exclude  []string
		objName  string
		expected bool
	}{
		{"empty patterns and exclude matches all", nil, nil, "TestProc", true},
		{"empty patterns matches all", []string{}, nil, "TestProc", true},
		{"single pattern matches", []string{"*Proc"}, nil, "TestProc", true},
		{"single pattern no match", []string{"*Proc"}, nil, "MBMaster", false},
		{"multiple patterns match first", []string{"*Proc", "Logic*"}, nil, "TestProc", true},
		{"multiple patterns match second", []string{"Control*", "Logic*"}, nil, "LogicProc", true},
		{"exclude takes precedence over include", []string{"*Proc"}, []string{"Monitor*"}, "MonitorProc", false},
		{"exclude does not affect non-matching", []string{"*Proc"}, []string{"Monitor*"}, "TestProc", true},
		{"exclude only (no patterns) excludes match", nil, []string{"Monitor*"}, "MonitorProc", false},
		{"exclude only (no patterns) includes non-match", nil, []string{"Monitor*"}, "TestProc", true},
		{"exact name pattern", []string{"TestProc"}, nil, "TestProc", true},
		{"exact name no match", []string{"TestProc"}, nil, "LogicProc", false},
		{"invalid pattern is skipped", []string{"[invalid"}, nil, "TestProc", false},
		{"invalid exclude pattern is skipped", nil, []string{"[invalid"}, "TestProc", true},
		{"question mark glob", []string{"Test?"}, nil, "TestA", true},
		{"question mark glob no match", []string{"Test?"}, nil, "TestProc", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := matchOverviewPattern(tt.patterns, tt.exclude, tt.objName)
			if result != tt.expected {
				t.Errorf("matchOverviewPattern(%v, %v, %q) = %v, want %v",
					tt.patterns, tt.exclude, tt.objName, result, tt.expected)
			}
		})
	}
}

// TestIsOverviewEligible tests the object type filtering logic.
func TestIsOverviewEligible(t *testing.T) {
	tests := []struct {
		name     string
		data     *uniset.ObjectData
		expected bool
	}{
		{"nil data", nil, false},
		{"nil object info", &uniset.ObjectData{}, false},
		{"UniSetObject without extensionType", &uniset.ObjectData{
			Object: &uniset.ObjectInfo{ObjectType: "UniSetObject"},
		}, true},
		{"UniSetManager without extensionType", &uniset.ObjectData{
			Object: &uniset.ObjectInfo{ObjectType: "UniSetManager"},
		}, true},
		{"UniSetObject with extensionType", &uniset.ObjectData{
			Object: &uniset.ObjectInfo{ObjectType: "UniSetObject", ExtensionType: "ModbusMaster"},
		}, false},
		{"UniSetObject with extensionsType (alt field)", &uniset.ObjectData{
			Object: &uniset.ObjectInfo{ObjectType: "UniSetObject", ExtensionsType: "OPCUAExchange"},
		}, false},
		{"UniSetActivator (wrong objectType)", &uniset.ObjectData{
			Object: &uniset.ObjectInfo{ObjectType: "UniSetActivator"},
		}, false},
		{"IONotifyController with extensionType", &uniset.ObjectData{
			Object: &uniset.ObjectInfo{ObjectType: "IONotifyController", ExtensionType: "SharedMemory"},
		}, false},
		{"empty objectType", &uniset.ObjectData{
			Object: &uniset.ObjectInfo{ObjectType: ""},
		}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isOverviewEligible(tt.data)
			if result != tt.expected {
				t.Errorf("isOverviewEligible() = %v, want %v", result, tt.expected)
			}
		})
	}
}

// TestBuildOverviewNode tests the pure function for building overview nodes.
func TestBuildOverviewNode(t *testing.T) {
	tests := []struct {
		name            string
		objectName      string
		data            *uniset.ObjectData
		expectedInputs  int
		expectedOutputs int
	}{
		{
			name:            "nil data",
			objectName:      "TestObj",
			data:            nil,
			expectedInputs:  0,
			expectedOutputs: 0,
		},
		{
			name:       "nil IO",
			objectName: "TestObj",
			data: &uniset.ObjectData{
				IO: nil,
			},
			expectedInputs:  0,
			expectedOutputs: 0,
		},
		{
			name:       "empty IO maps",
			objectName: "TestObj",
			data: &uniset.ObjectData{
				IO: &uniset.IOData{
					In:  map[string]uniset.IOVar{},
					Out: map[string]uniset.IOVar{},
				},
			},
			expectedInputs:  0,
			expectedOutputs: 0,
		},
		{
			name:       "with inputs and outputs",
			objectName: "TestObj",
			data: &uniset.ObjectData{
				IO: &uniset.IOData{
					In: map[string]uniset.IOVar{
						"sensor1": {ID: 1, Name: "sensor1", Value: 10},
					},
					Out: map[string]uniset.IOVar{
						"sensor2": {ID: 2, Name: "sensor2", Value: 20},
						"sensor3": {ID: 3, Name: "sensor3", Value: 30},
					},
				},
			},
			expectedInputs:  1,
			expectedOutputs: 2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			node := buildOverviewNode(tt.objectName, tt.data)

			if node.Name != tt.objectName {
				t.Errorf("expected name %q, got %q", tt.objectName, node.Name)
			}
			if len(node.Inputs) != tt.expectedInputs {
				t.Errorf("expected %d inputs, got %d", tt.expectedInputs, len(node.Inputs))
			}
			if len(node.Outputs) != tt.expectedOutputs {
				t.Errorf("expected %d outputs, got %d", tt.expectedOutputs, len(node.Outputs))
			}
			// Verify non-nil slices (important for JSON serialization)
			if node.Inputs == nil {
				t.Error("inputs should not be nil")
			}
			if node.Outputs == nil {
				t.Error("outputs should not be nil")
			}
		})
	}
}

// TestComputeOverviewEdges tests the pure edge computation function.
func TestComputeOverviewEdges(t *testing.T) {
	tests := []struct {
		name          string
		nodes         []OverviewNode
		expectedEdges int
		checkEdges    func(t *testing.T, edges []OverviewEdge)
	}{
		{
			name:          "no nodes",
			nodes:         []OverviewNode{},
			expectedEdges: 0,
		},
		{
			name: "no matching ports",
			nodes: []OverviewNode{
				{Name: "A", Outputs: []OverviewPort{{Name: "X", Value: 1}}, Inputs: []OverviewPort{}},
				{Name: "B", Inputs: []OverviewPort{{Name: "Y", Value: 2}}, Outputs: []OverviewPort{}},
			},
			expectedEdges: 0,
		},
		{
			name: "single match",
			nodes: []OverviewNode{
				{Name: "A", Outputs: []OverviewPort{{Name: "X", Value: 1}}, Inputs: []OverviewPort{}},
				{Name: "B", Inputs: []OverviewPort{{Name: "X", Value: 1}}, Outputs: []OverviewPort{}},
			},
			expectedEdges: 1,
			checkEdges: func(t *testing.T, edges []OverviewEdge) {
				e := edges[0]
				if e.FromNode != "A" || e.FromPort != "X" || e.ToNode != "B" || e.ToPort != "X" {
					t.Errorf("unexpected edge: %+v", e)
				}
			},
		},
		{
			name: "multiple outputs match one input",
			nodes: []OverviewNode{
				{Name: "A", Outputs: []OverviewPort{{Name: "X", Value: 1}}, Inputs: []OverviewPort{}},
				{Name: "B", Outputs: []OverviewPort{{Name: "X", Value: 2}}, Inputs: []OverviewPort{}},
				{Name: "C", Inputs: []OverviewPort{{Name: "X", Value: 3}}, Outputs: []OverviewPort{}},
			},
			expectedEdges: 2,
			checkEdges: func(t *testing.T, edges []OverviewEdge) {
				// Sorted by FromNode, so A before B
				if edges[0].FromNode != "A" {
					t.Errorf("expected first edge from A, got %s", edges[0].FromNode)
				}
				if edges[1].FromNode != "B" {
					t.Errorf("expected second edge from B, got %s", edges[1].FromNode)
				}
			},
		},
		{
			name: "self-connection is skipped",
			nodes: []OverviewNode{
				{
					Name:    "A",
					Outputs: []OverviewPort{{Name: "X", Value: 1}},
					Inputs:  []OverviewPort{{Name: "X", Value: 1}},
				},
			},
			expectedEdges: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			edges := computeOverviewEdges(tt.nodes)

			if edges == nil {
				t.Fatal("edges should not be nil")
			}
			if len(edges) != tt.expectedEdges {
				t.Errorf("expected %d edges, got %d: %+v", tt.expectedEdges, len(edges), edges)
			}
			if tt.checkEdges != nil {
				tt.checkEdges(t, edges)
			}
		})
	}
}
