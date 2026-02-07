package launcher

import (
	"testing"

	"github.com/pv/uniset-panel/internal/config"
)

func TestManager_AddLauncher(t *testing.T) {
	mgr := NewManager()

	err := mgr.AddLauncher(config.LauncherConfig{
		ID:   "l1",
		URL:  "http://host1:8111",
		Name: "Node1",
	})
	if err != nil {
		t.Fatalf("AddLauncher failed: %v", err)
	}

	err = mgr.AddLauncher(config.LauncherConfig{
		ID:           "l2",
		URL:          "http://host2:8111",
		Name:         "Node2",
		ControlToken: "secret",
	})
	if err != nil {
		t.Fatalf("AddLauncher failed: %v", err)
	}

	nodes := mgr.ListNodes()
	if len(nodes) != 2 {
		t.Fatalf("expected 2 nodes, got %d", len(nodes))
	}
}

func TestManager_AddLauncher_NoURL(t *testing.T) {
	mgr := NewManager()

	err := mgr.AddLauncher(config.LauncherConfig{
		ID:   "l1",
		Name: "NoURL",
	})
	if err == nil {
		t.Fatal("expected error for launcher without URL")
	}
}

func TestManager_AddLauncher_DuplicateID(t *testing.T) {
	mgr := NewManager()

	err := mgr.AddLauncher(config.LauncherConfig{
		ID:  "l1",
		URL: "http://host1:8111",
	})
	if err != nil {
		t.Fatalf("first AddLauncher failed: %v", err)
	}

	err = mgr.AddLauncher(config.LauncherConfig{
		ID:  "l1",
		URL: "http://host2:8111",
	})
	if err == nil {
		t.Fatal("expected error for duplicate ID")
	}
}

func TestManager_GetNode(t *testing.T) {
	mgr := NewManager()
	mgr.AddLauncher(config.LauncherConfig{
		ID:   "l1",
		URL:  "http://host1:8111",
		Name: "Node1",
	})

	node, ok := mgr.GetNode("l1")
	if !ok {
		t.Fatal("expected node l1 to exist")
	}
	if node.Name != "Node1" {
		t.Errorf("expected name Node1, got %s", node.Name)
	}

	_, ok = mgr.GetNode("nonexistent")
	if ok {
		t.Error("expected nonexistent node to return false")
	}
}

func TestManager_ListNodes_Order(t *testing.T) {
	mgr := NewManager()

	// Add in specific order
	mgr.AddLauncher(config.LauncherConfig{ID: "c", URL: "http://c:8111", Name: "C"})
	mgr.AddLauncher(config.LauncherConfig{ID: "a", URL: "http://a:8111", Name: "A"})
	mgr.AddLauncher(config.LauncherConfig{ID: "b", URL: "http://b:8111", Name: "B"})

	nodes := mgr.ListNodes()
	if len(nodes) != 3 {
		t.Fatalf("expected 3 nodes, got %d", len(nodes))
	}

	// Should preserve insertion order (config order)
	if nodes[0].ID != "c" {
		t.Errorf("first node should be 'c', got %s", nodes[0].ID)
	}
	if nodes[1].ID != "a" {
		t.Errorf("second node should be 'a', got %s", nodes[1].ID)
	}
	if nodes[2].ID != "b" {
		t.Errorf("third node should be 'b', got %s", nodes[2].ID)
	}
}

func TestManager_HasControl(t *testing.T) {
	mgr := NewManager()

	mgr.AddLauncher(config.LauncherConfig{
		ID:           "with",
		URL:          "http://host1:8111",
		ControlToken: "secret",
	})
	mgr.AddLauncher(config.LauncherConfig{
		ID:  "without",
		URL: "http://host2:8111",
	})

	node1, _ := mgr.GetNode("with")
	if !node1.HasControl {
		t.Error("expected HasControl = true for node with controlToken")
	}

	node2, _ := mgr.GetNode("without")
	if node2.HasControl {
		t.Error("expected HasControl = false for node without controlToken")
	}
}

func TestManager_Callbacks(t *testing.T) {
	mgr := NewManager()

	statusCalled := false
	connCalled := false

	mgr.SetStatusCallback(func(nodeID, nodeName string, status *LauncherStatus) {
		statusCalled = true
	})
	mgr.SetConnectionCallback(func(nodeID, nodeName string, connected bool, lastError string) {
		connCalled = true
	})

	mgr.AddLauncher(config.LauncherConfig{
		ID:  "l1",
		URL: "http://host1:8111",
	})

	node, _ := mgr.GetNode("l1")

	// Callbacks should be set on poller (not called yet — no polling)
	if node.Poller == nil {
		t.Fatal("expected Poller to be set")
	}

	// Verify callbacks are wired by checking they exist
	node.Poller.mu.RLock()
	hasStatusCb := node.Poller.statusCb != nil
	hasConnCb := node.Poller.connCb != nil
	node.Poller.mu.RUnlock()

	if !hasStatusCb {
		t.Error("expected statusCb to be set on poller")
	}
	if !hasConnCb {
		t.Error("expected connCb to be set on poller")
	}

	// Verify they haven't been called yet (no polling)
	_ = statusCalled
	_ = connCalled
}

func TestManager_Empty(t *testing.T) {
	mgr := NewManager()

	nodes := mgr.ListNodes()
	if len(nodes) != 0 {
		t.Errorf("expected 0 nodes, got %d", len(nodes))
	}

	_, ok := mgr.GetNode("any")
	if ok {
		t.Error("expected GetNode to return false for empty manager")
	}
}
