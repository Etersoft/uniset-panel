package recording

import (
	"path/filepath"
	"testing"
	"time"
)

func createTestManager(t *testing.T) (*Manager, func()) {
	t.Helper()

	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test_recording.db")
	backend := NewSQLiteBackend(dbPath)
	manager := NewManager(backend, 10000)

	cleanup := func() {
		manager.Stop()
	}

	return manager, cleanup
}

func TestManager_StartStop(t *testing.T) {
	manager, cleanup := createTestManager(t)
	defer cleanup()

	// Initially not recording
	if manager.IsRecording() {
		t.Error("expected IsRecording=false initially")
	}

	// Start recording
	if err := manager.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	if !manager.IsRecording() {
		t.Error("expected IsRecording=true after Start")
	}

	// Start again should be no-op
	if err := manager.Start(); err != nil {
		t.Fatalf("Start again failed: %v", err)
	}

	// Stop recording
	if err := manager.Stop(); err != nil {
		t.Fatalf("Stop failed: %v", err)
	}

	if manager.IsRecording() {
		t.Error("expected IsRecording=false after Stop")
	}

	// Stop again should be no-op
	if err := manager.Stop(); err != nil {
		t.Fatalf("Stop again failed: %v", err)
	}
}

func TestManager_Save(t *testing.T) {
	manager, cleanup := createTestManager(t)
	defer cleanup()

	now := time.Now().UTC()

	// Save without recording should be no-op
	if err := manager.Save("server1", "Object1", "var1", 42, now); err != nil {
		t.Fatalf("Save without recording failed: %v", err)
	}

	// Start recording
	if err := manager.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Save with recording
	if err := manager.Save("server1", "Object1", "var1", 42, now); err != nil {
		t.Fatalf("Save with recording failed: %v", err)
	}

	// Check stats
	stats, err := manager.GetStats()
	if err != nil {
		t.Fatalf("GetStats failed: %v", err)
	}

	if stats.RecordCount != 1 {
		t.Errorf("expected 1 record, got %d", stats.RecordCount)
	}

	if !stats.IsRecording {
		t.Error("expected IsRecording=true in stats")
	}
}

func TestManager_SaveBatch(t *testing.T) {
	manager, cleanup := createTestManager(t)
	defer cleanup()

	now := time.Now().UTC()

	// Start recording
	if err := manager.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Create batch
	records := make([]DataRecord, 50)
	for i := 0; i < 50; i++ {
		records[i] = DataRecord{
			ServerID:     "server1",
			ObjectName:   "Object1",
			VariableName: "var1",
			Value:        i,
			Timestamp:    now.Add(time.Duration(i) * time.Millisecond),
		}
	}

	// Save batch
	if err := manager.SaveBatch(records); err != nil {
		t.Fatalf("SaveBatch failed: %v", err)
	}

	// Check stats
	stats, err := manager.GetStats()
	if err != nil {
		t.Fatalf("GetStats failed: %v", err)
	}

	if stats.RecordCount != 50 {
		t.Errorf("expected 50 records, got %d", stats.RecordCount)
	}
}

func TestManager_SaveBatchNotRecording(t *testing.T) {
	manager, cleanup := createTestManager(t)
	defer cleanup()

	now := time.Now().UTC()

	// Create batch
	records := []DataRecord{
		{ServerID: "s1", ObjectName: "o1", VariableName: "v1", Value: 1, Timestamp: now},
	}

	// SaveBatch without recording should be no-op
	if err := manager.SaveBatch(records); err != nil {
		t.Fatalf("SaveBatch without recording failed: %v", err)
	}

	// Stats should show 0 records
	stats, err := manager.GetStats()
	if err != nil {
		t.Fatalf("GetStats failed: %v", err)
	}

	if stats.RecordCount != 0 {
		t.Errorf("expected 0 records, got %d", stats.RecordCount)
	}
}

func TestManager_GetStats(t *testing.T) {
	manager, cleanup := createTestManager(t)
	defer cleanup()

	// Stats before recording
	stats, err := manager.GetStats()
	if err != nil {
		t.Fatalf("GetStats failed: %v", err)
	}

	if stats.IsRecording {
		t.Error("expected IsRecording=false")
	}

	// Start recording and add data
	if err := manager.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	now := time.Now().UTC()
	for i := 0; i < 5; i++ {
		if err := manager.Save("server1", "Object1", "var1", i, now.Add(time.Duration(i)*time.Second)); err != nil {
			t.Fatalf("Save failed: %v", err)
		}
	}

	stats, err = manager.GetStats()
	if err != nil {
		t.Fatalf("GetStats failed: %v", err)
	}

	if !stats.IsRecording {
		t.Error("expected IsRecording=true")
	}

	if stats.RecordCount != 5 {
		t.Errorf("expected 5 records, got %d", stats.RecordCount)
	}
}

func TestManager_GetHistory(t *testing.T) {
	manager, cleanup := createTestManager(t)
	defer cleanup()

	// Start recording and add data
	if err := manager.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	now := time.Now().UTC()
	for i := 0; i < 10; i++ {
		if err := manager.Save("server1", "Object1", "var1", i, now.Add(time.Duration(i)*time.Second)); err != nil {
			t.Fatalf("Save failed: %v", err)
		}
	}

	// Get all history
	records, err := manager.GetHistory(ExportFilter{})
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}

	if len(records) != 10 {
		t.Errorf("expected 10 records, got %d", len(records))
	}

	// Get filtered history
	records, err = manager.GetHistory(ExportFilter{ServerID: "server1"})
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}

	if len(records) != 10 {
		t.Errorf("expected 10 records for server1, got %d", len(records))
	}
}

func TestManager_GetHistoryNotRecording(t *testing.T) {
	manager, cleanup := createTestManager(t)
	defer cleanup()

	// Start, add data, stop
	if err := manager.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	now := time.Now().UTC()
	for i := 0; i < 5; i++ {
		if err := manager.Save("server1", "Object1", "var1", i, now.Add(time.Duration(i)*time.Second)); err != nil {
			t.Fatalf("Save failed: %v", err)
		}
	}

	if err := manager.Stop(); err != nil {
		t.Fatalf("Stop failed: %v", err)
	}

	// Get history while not recording - should still work
	records, err := manager.GetHistory(ExportFilter{})
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}

	if len(records) != 5 {
		t.Errorf("expected 5 records, got %d", len(records))
	}
}

func TestManager_Clear(t *testing.T) {
	manager, cleanup := createTestManager(t)
	defer cleanup()

	// Start recording and add data
	if err := manager.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	now := time.Now().UTC()
	for i := 0; i < 10; i++ {
		if err := manager.Save("server1", "Object1", "var1", i, now.Add(time.Duration(i)*time.Second)); err != nil {
			t.Fatalf("Save failed: %v", err)
		}
	}

	// Clear
	if err := manager.Clear(); err != nil {
		t.Fatalf("Clear failed: %v", err)
	}

	// Check stats
	stats, err := manager.GetStats()
	if err != nil {
		t.Fatalf("GetStats failed: %v", err)
	}

	if stats.RecordCount != 0 {
		t.Errorf("expected 0 records after clear, got %d", stats.RecordCount)
	}
}

func TestManager_ClearNotRecording(t *testing.T) {
	manager, cleanup := createTestManager(t)
	defer cleanup()

	// Start, add data, stop
	if err := manager.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	now := time.Now().UTC()
	if err := manager.Save("server1", "Object1", "var1", 42, now); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	if err := manager.Stop(); err != nil {
		t.Fatalf("Stop failed: %v", err)
	}

	// Clear while not recording
	if err := manager.Clear(); err != nil {
		t.Fatalf("Clear failed: %v", err)
	}

	// Verify cleared
	stats, err := manager.GetStats()
	if err != nil {
		t.Fatalf("GetStats failed: %v", err)
	}

	if stats.RecordCount != 0 {
		t.Errorf("expected 0 records, got %d", stats.RecordCount)
	}
}

func TestManager_Backend(t *testing.T) {
	manager, cleanup := createTestManager(t)
	defer cleanup()

	backend := manager.Backend()
	if backend == nil {
		t.Error("expected non-nil Backend")
	}

	// Should be SQLiteBackend
	if _, ok := backend.(*SQLiteBackend); !ok {
		t.Error("expected SQLiteBackend")
	}
}

func TestManager_PeriodicCleanup(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test_recording.db")
	backend := NewSQLiteBackend(dbPath)

	// Small maxRecords to trigger cleanup
	manager := NewManager(backend, 100)
	defer manager.Stop()

	if err := manager.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	now := time.Now().UTC()

	// Add more than maxRecords
	for i := 0; i < 150; i++ {
		if err := manager.Save("server1", "Object1", "var1", i, now.Add(time.Duration(i)*time.Millisecond)); err != nil {
			t.Fatalf("Save failed: %v", err)
		}
	}

	// Note: Cleanup is triggered on Save when time since last cleanup > 1 minute
	// So in this test it won't actually clean up unless we mock time
	// Just verify that Save doesn't fail with many records
	stats, err := manager.GetStats()
	if err != nil {
		t.Fatalf("GetStats failed: %v", err)
	}

	if stats.RecordCount != 150 {
		t.Errorf("expected 150 records, got %d", stats.RecordCount)
	}
}

func TestManager_ExportRaw(t *testing.T) {
	manager, cleanup := createTestManager(t)
	defer cleanup()

	// Start recording and add data
	if err := manager.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	now := time.Now().UTC()
	for i := 0; i < 5; i++ {
		if err := manager.Save("server1", "Object1", "var1", i, now.Add(time.Duration(i)*time.Second)); err != nil {
			t.Fatalf("Save failed: %v", err)
		}
	}

	// Export
	tmpFile := filepath.Join(t.TempDir(), "export.db")
	f, err := createFile(tmpFile)
	if err != nil {
		t.Fatalf("failed to create file: %v", err)
	}
	defer f.Close()

	if err := manager.ExportRaw(f); err != nil {
		t.Fatalf("ExportRaw failed: %v", err)
	}

	// Verify file exists and is not empty
	info, err := f.Stat()
	if err != nil {
		t.Fatalf("failed to stat file: %v", err)
	}

	if info.Size() == 0 {
		t.Error("exported file is empty")
	}
}

func TestManager_ConcurrentOperations(t *testing.T) {
	manager, cleanup := createTestManager(t)
	defer cleanup()

	if err := manager.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	now := time.Now().UTC()
	done := make(chan bool)
	errCh := make(chan error, 20)

	// Start multiple goroutines doing different operations
	for i := 0; i < 5; i++ {
		go func(id int) {
			for j := 0; j < 20; j++ {
				if err := manager.Save("server1", "Object1", "var1", id*20+j, now.Add(time.Duration(id*20+j)*time.Millisecond)); err != nil {
					errCh <- err
					return
				}
			}
			done <- true
		}(i)
	}

	// GetStats concurrently
	for i := 0; i < 5; i++ {
		go func() {
			for j := 0; j < 10; j++ {
				if _, err := manager.GetStats(); err != nil {
					errCh <- err
					return
				}
			}
			done <- true
		}()
	}

	// Wait for all
	for i := 0; i < 10; i++ {
		select {
		case <-done:
		case err := <-errCh:
			t.Fatalf("concurrent operation failed: %v", err)
		case <-time.After(10 * time.Second):
			t.Fatal("timeout waiting for concurrent operations")
		}
	}

	// Verify data integrity
	stats, err := manager.GetStats()
	if err != nil {
		t.Fatalf("GetStats failed: %v", err)
	}

	if stats.RecordCount != 100 {
		t.Errorf("expected 100 records, got %d", stats.RecordCount)
	}
}

func TestManager_SaveServer(t *testing.T) {
	manager, cleanup := createTestManager(t)
	defer cleanup()

	// SaveServer while recording
	if err := manager.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	info := ServerInfo{
		ServerID: "server1",
		Name:     "Test Server",
		URL:      "http://localhost:9090",
	}

	if err := manager.SaveServer(info); err != nil {
		t.Fatalf("SaveServer failed: %v", err)
	}

	// GetServers
	servers, err := manager.GetServers()
	if err != nil {
		t.Fatalf("GetServers failed: %v", err)
	}

	if len(servers) != 1 {
		t.Fatalf("expected 1 server, got %d", len(servers))
	}

	if servers[0].ServerID != "server1" {
		t.Errorf("expected ServerID=server1, got %s", servers[0].ServerID)
	}
}

func TestManager_SaveServerNotRecording(t *testing.T) {
	manager, cleanup := createTestManager(t)
	defer cleanup()

	// SaveServer while NOT recording (should open backend temporarily)
	info := ServerInfo{
		ServerID: "server1",
		Name:     "Test Server",
		URL:      "http://localhost:9090",
	}

	if err := manager.SaveServer(info); err != nil {
		t.Fatalf("SaveServer (not recording) failed: %v", err)
	}

	// GetServers while NOT recording
	servers, err := manager.GetServers()
	if err != nil {
		t.Fatalf("GetServers (not recording) failed: %v", err)
	}

	if len(servers) != 1 {
		t.Fatalf("expected 1 server, got %d", len(servers))
	}
}

func TestManager_GetServersMultiple(t *testing.T) {
	manager, cleanup := createTestManager(t)
	defer cleanup()

	if err := manager.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Save multiple servers
	servers := []ServerInfo{
		{ServerID: "s1", Name: "Alpha", URL: "http://localhost:9090"},
		{ServerID: "s2", Name: "Beta", URL: "http://localhost:9191"},
		{ServerID: "s3", Name: "Gamma", URL: "http://localhost:9292"},
	}

	for _, info := range servers {
		if err := manager.SaveServer(info); err != nil {
			t.Fatalf("SaveServer failed: %v", err)
		}
	}

	// Get servers
	result, err := manager.GetServers()
	if err != nil {
		t.Fatalf("GetServers failed: %v", err)
	}

	if len(result) != 3 {
		t.Fatalf("expected 3 servers, got %d", len(result))
	}
}

// Helper function to create a file
func createFile(path string) (*testFile, error) {
	return &testFile{path: path, data: make([]byte, 0)}, nil
}

// testFile is a simple in-memory file implementation for testing
type testFile struct {
	path string
	data []byte
}

func (f *testFile) Write(p []byte) (n int, err error) {
	f.data = append(f.data, p...)
	return len(p), nil
}

func (f *testFile) Close() error {
	return nil
}

func (f *testFile) Stat() (interface{ Size() int64 }, error) {
	return fileInfo{size: int64(len(f.data))}, nil
}

type fileInfo struct {
	size int64
}

func (fi fileInfo) Size() int64 {
	return fi.size
}
