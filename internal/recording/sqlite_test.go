package recording

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func createTestBackend(t *testing.T) (*SQLiteBackend, func()) {
	t.Helper()

	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test_recording.db")
	backend := NewSQLiteBackend(dbPath)

	if err := backend.Open(); err != nil {
		t.Fatalf("failed to open backend: %v", err)
	}

	cleanup := func() {
		backend.Close()
	}

	return backend, cleanup
}

func TestSQLiteBackend_SaveAndGetHistory(t *testing.T) {
	backend, cleanup := createTestBackend(t)
	defer cleanup()

	now := time.Now().UTC()

	// Save single record
	record := DataRecord{
		ServerID:     "server1",
		ObjectName:   "Object1",
		VariableName: "ionc:Sensor1",
		Value:        42,
		Timestamp:    now,
	}

	if err := backend.Save(record); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	// Get history
	records, err := backend.GetHistory(ExportFilter{})
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}

	if len(records) != 1 {
		t.Fatalf("expected 1 record, got %d", len(records))
	}

	if records[0].ServerID != "server1" {
		t.Errorf("expected ServerID=server1, got %s", records[0].ServerID)
	}
	if records[0].ObjectName != "Object1" {
		t.Errorf("expected ObjectName=Object1, got %s", records[0].ObjectName)
	}
	if records[0].VariableName != "ionc:Sensor1" {
		t.Errorf("expected VariableName=ionc:Sensor1, got %s", records[0].VariableName)
	}
	// Value is stored as JSON, so it comes back as float64
	if val, ok := records[0].Value.(float64); !ok || val != 42 {
		t.Errorf("expected Value=42, got %v", records[0].Value)
	}
}

func TestSQLiteBackend_SaveBatch(t *testing.T) {
	backend, cleanup := createTestBackend(t)
	defer cleanup()

	now := time.Now().UTC()

	// Create batch of records
	records := make([]DataRecord, 100)
	for i := 0; i < 100; i++ {
		records[i] = DataRecord{
			ServerID:     "server1",
			ObjectName:   "Object1",
			VariableName: "ionc:Sensor" + string(rune('A'+i%26)),
			Value:        i * 10,
			Timestamp:    now.Add(time.Duration(i) * time.Millisecond),
		}
	}

	// Save batch
	if err := backend.SaveBatch(records); err != nil {
		t.Fatalf("SaveBatch failed: %v", err)
	}

	// Verify count
	stats, err := backend.GetStats()
	if err != nil {
		t.Fatalf("GetStats failed: %v", err)
	}

	if stats.RecordCount != 100 {
		t.Errorf("expected 100 records, got %d", stats.RecordCount)
	}
}

func TestSQLiteBackend_SaveBatchEmpty(t *testing.T) {
	backend, cleanup := createTestBackend(t)
	defer cleanup()

	// Empty batch should not fail
	if err := backend.SaveBatch(nil); err != nil {
		t.Errorf("SaveBatch with nil should not fail: %v", err)
	}

	if err := backend.SaveBatch([]DataRecord{}); err != nil {
		t.Errorf("SaveBatch with empty slice should not fail: %v", err)
	}
}

func TestSQLiteBackend_GetStats(t *testing.T) {
	backend, cleanup := createTestBackend(t)
	defer cleanup()

	// Empty database
	stats, err := backend.GetStats()
	if err != nil {
		t.Fatalf("GetStats failed: %v", err)
	}

	if stats.RecordCount != 0 {
		t.Errorf("expected 0 records, got %d", stats.RecordCount)
	}

	// Add records
	now := time.Now().UTC()
	for i := 0; i < 10; i++ {
		record := DataRecord{
			ServerID:     "server1",
			ObjectName:   "Object1",
			VariableName: "var1",
			Value:        i,
			Timestamp:    now.Add(time.Duration(i) * time.Second),
		}
		if err := backend.Save(record); err != nil {
			t.Fatalf("Save failed: %v", err)
		}
	}

	stats, err = backend.GetStats()
	if err != nil {
		t.Fatalf("GetStats failed: %v", err)
	}

	if stats.RecordCount != 10 {
		t.Errorf("expected 10 records, got %d", stats.RecordCount)
	}

	if stats.SizeBytes == 0 {
		t.Error("expected non-zero SizeBytes")
	}

	// Check time bounds
	if stats.OldestRecord.IsZero() {
		t.Error("expected non-zero OldestRecord")
	}
	if stats.NewestRecord.IsZero() {
		t.Error("expected non-zero NewestRecord")
	}
	if !stats.NewestRecord.After(stats.OldestRecord) && !stats.NewestRecord.Equal(stats.OldestRecord) {
		t.Error("NewestRecord should be >= OldestRecord")
	}
}

func TestSQLiteBackend_GetHistoryWithFilter(t *testing.T) {
	backend, cleanup := createTestBackend(t)
	defer cleanup()

	now := time.Now().UTC()

	// Add records from different servers and objects
	records := []DataRecord{
		{ServerID: "server1", ObjectName: "Object1", VariableName: "var1", Value: 1, Timestamp: now},
		{ServerID: "server1", ObjectName: "Object2", VariableName: "var2", Value: 2, Timestamp: now.Add(time.Second)},
		{ServerID: "server2", ObjectName: "Object1", VariableName: "var3", Value: 3, Timestamp: now.Add(2 * time.Second)},
		{ServerID: "server2", ObjectName: "Object2", VariableName: "var4", Value: 4, Timestamp: now.Add(3 * time.Second)},
	}

	if err := backend.SaveBatch(records); err != nil {
		t.Fatalf("SaveBatch failed: %v", err)
	}

	// Filter by server
	result, err := backend.GetHistory(ExportFilter{ServerID: "server1"})
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if len(result) != 2 {
		t.Errorf("expected 2 records for server1, got %d", len(result))
	}

	// Filter by object
	result, err = backend.GetHistory(ExportFilter{ObjectName: "Object1"})
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if len(result) != 2 {
		t.Errorf("expected 2 records for Object1, got %d", len(result))
	}

	// Filter by time range - get all records from start
	from := now.Add(-time.Second) // before first record
	result, err = backend.GetHistory(ExportFilter{From: &from})
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if len(result) != 4 {
		t.Errorf("expected 4 records from start, got %d", len(result))
	}

	// Filter by time range - get records up to certain time
	to := now.Add(2*time.Second + time.Millisecond) // includes first 3 records
	result, err = backend.GetHistory(ExportFilter{To: &to})
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if len(result) != 3 {
		t.Errorf("expected 3 records up to time, got %d", len(result))
	}

	// Combined filter
	result, err = backend.GetHistory(ExportFilter{ServerID: "server1", ObjectName: "Object1"})
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if len(result) != 1 {
		t.Errorf("expected 1 record for server1+Object1, got %d", len(result))
	}
}

func TestSQLiteBackend_Cleanup(t *testing.T) {
	backend, cleanup := createTestBackend(t)
	defer cleanup()

	now := time.Now().UTC()

	// Add 100 records
	for i := 0; i < 100; i++ {
		record := DataRecord{
			ServerID:     "server1",
			ObjectName:   "Object1",
			VariableName: "var1",
			Value:        i,
			Timestamp:    now.Add(time.Duration(i) * time.Millisecond),
		}
		if err := backend.Save(record); err != nil {
			t.Fatalf("Save failed: %v", err)
		}
	}

	// Cleanup to keep only 50 records
	if err := backend.Cleanup(50); err != nil {
		t.Fatalf("Cleanup failed: %v", err)
	}

	stats, err := backend.GetStats()
	if err != nil {
		t.Fatalf("GetStats failed: %v", err)
	}

	// Should have around 50 records (cleanup removes oldest 10% when over threshold)
	if stats.RecordCount > 60 {
		t.Errorf("expected <= 60 records after cleanup, got %d", stats.RecordCount)
	}
}

func TestSQLiteBackend_Clear(t *testing.T) {
	backend, cleanup := createTestBackend(t)
	defer cleanup()

	now := time.Now().UTC()

	// Add records
	for i := 0; i < 10; i++ {
		record := DataRecord{
			ServerID:     "server1",
			ObjectName:   "Object1",
			VariableName: "var1",
			Value:        i,
			Timestamp:    now.Add(time.Duration(i) * time.Second),
		}
		if err := backend.Save(record); err != nil {
			t.Fatalf("Save failed: %v", err)
		}
	}

	// Clear all
	if err := backend.Clear(); err != nil {
		t.Fatalf("Clear failed: %v", err)
	}

	stats, err := backend.GetStats()
	if err != nil {
		t.Fatalf("GetStats failed: %v", err)
	}

	if stats.RecordCount != 0 {
		t.Errorf("expected 0 records after clear, got %d", stats.RecordCount)
	}
}

func TestSQLiteBackend_ExportRaw(t *testing.T) {
	backend, cleanup := createTestBackend(t)
	defer cleanup()

	now := time.Now().UTC()

	// Add some records
	for i := 0; i < 5; i++ {
		record := DataRecord{
			ServerID:     "server1",
			ObjectName:   "Object1",
			VariableName: "var1",
			Value:        i,
			Timestamp:    now.Add(time.Duration(i) * time.Second),
		}
		if err := backend.Save(record); err != nil {
			t.Fatalf("Save failed: %v", err)
		}
	}

	// Export to temp file
	tmpFile, err := os.CreateTemp("", "export_test_*.db")
	if err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}
	defer os.Remove(tmpFile.Name())
	defer tmpFile.Close()

	if err := backend.ExportRaw(tmpFile); err != nil {
		t.Fatalf("ExportRaw failed: %v", err)
	}

	// Verify exported file is valid SQLite
	info, err := tmpFile.Stat()
	if err != nil {
		t.Fatalf("failed to stat temp file: %v", err)
	}

	if info.Size() == 0 {
		t.Error("exported file is empty")
	}
}

func TestSQLiteBackend_DBPath(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	backend := NewSQLiteBackend(dbPath)

	if backend.DBPath() != dbPath {
		t.Errorf("expected DBPath=%s, got %s", dbPath, backend.DBPath())
	}
}

func TestSQLiteBackend_ValueTypes(t *testing.T) {
	backend, cleanup := createTestBackend(t)
	defer cleanup()

	now := time.Now().UTC()

	// Test different value types
	testCases := []struct {
		name  string
		value interface{}
	}{
		{"int", 42},
		{"float", 3.14},
		{"string", "hello"},
		{"bool", true},
		{"nil", nil},
		{"int64", int64(123456789)},
		{"float64", float64(1.23456789)},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			record := DataRecord{
				ServerID:     "server1",
				ObjectName:   "Object1",
				VariableName: "var_" + tc.name,
				Value:        tc.value,
				Timestamp:    now,
			}

			if err := backend.Save(record); err != nil {
				t.Fatalf("Save failed for %s: %v", tc.name, err)
			}
		})
	}

	// Verify all records saved
	stats, err := backend.GetStats()
	if err != nil {
		t.Fatalf("GetStats failed: %v", err)
	}

	if stats.RecordCount != int64(len(testCases)) {
		t.Errorf("expected %d records, got %d", len(testCases), stats.RecordCount)
	}
}

func TestSQLiteBackend_ConcurrentSave(t *testing.T) {
	backend, cleanup := createTestBackend(t)
	defer cleanup()

	now := time.Now().UTC()
	done := make(chan bool)
	errCh := make(chan error, 10)

	// Start 10 goroutines saving records concurrently
	for i := 0; i < 10; i++ {
		go func(id int) {
			for j := 0; j < 10; j++ {
				record := DataRecord{
					ServerID:     "server1",
					ObjectName:   "Object1",
					VariableName: "var1",
					Value:        id*10 + j,
					Timestamp:    now.Add(time.Duration(id*10+j) * time.Millisecond),
				}
				if err := backend.Save(record); err != nil {
					errCh <- err
					return
				}
			}
			done <- true
		}(i)
	}

	// Wait for all goroutines
	for i := 0; i < 10; i++ {
		select {
		case <-done:
		case err := <-errCh:
			t.Fatalf("concurrent Save failed: %v", err)
		}
	}

	// Verify all records saved
	stats, err := backend.GetStats()
	if err != nil {
		t.Fatalf("GetStats failed: %v", err)
	}

	if stats.RecordCount != 100 {
		t.Errorf("expected 100 records, got %d", stats.RecordCount)
	}
}

func BenchmarkSQLiteBackend_Save(b *testing.B) {
	tmpDir := b.TempDir()
	dbPath := filepath.Join(tmpDir, "bench.db")
	backend := NewSQLiteBackend(dbPath)

	if err := backend.Open(); err != nil {
		b.Fatalf("failed to open backend: %v", err)
	}
	defer backend.Close()

	now := time.Now().UTC()
	record := DataRecord{
		ServerID:     "server1",
		ObjectName:   "Object1",
		VariableName: "var1",
		Value:        42,
		Timestamp:    now,
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		record.Timestamp = now.Add(time.Duration(i) * time.Microsecond)
		if err := backend.Save(record); err != nil {
			b.Fatalf("Save failed: %v", err)
		}
	}
}

func TestSQLiteBackend_SaveServer(t *testing.T) {
	backend, cleanup := createTestBackend(t)
	defer cleanup()

	// Save server
	info := ServerInfo{
		ServerID: "server1",
		Name:     "Test Server",
		URL:      "http://localhost:9090",
	}

	if err := backend.SaveServer(info); err != nil {
		t.Fatalf("SaveServer failed: %v", err)
	}

	// Get servers
	servers, err := backend.GetServers()
	if err != nil {
		t.Fatalf("GetServers failed: %v", err)
	}

	if len(servers) != 1 {
		t.Fatalf("expected 1 server, got %d", len(servers))
	}

	if servers[0].ServerID != "server1" {
		t.Errorf("expected ServerID=server1, got %s", servers[0].ServerID)
	}
	if servers[0].Name != "Test Server" {
		t.Errorf("expected Name='Test Server', got %s", servers[0].Name)
	}
	if servers[0].URL != "http://localhost:9090" {
		t.Errorf("expected URL='http://localhost:9090', got %s", servers[0].URL)
	}
	if servers[0].UpdatedAt == "" {
		t.Error("expected non-empty UpdatedAt")
	}
}

func TestSQLiteBackend_SaveServerUpdate(t *testing.T) {
	backend, cleanup := createTestBackend(t)
	defer cleanup()

	// Save server
	info := ServerInfo{
		ServerID: "server1",
		Name:     "Original Name",
		URL:      "http://localhost:9090",
	}

	if err := backend.SaveServer(info); err != nil {
		t.Fatalf("SaveServer failed: %v", err)
	}

	// Update server
	info.Name = "Updated Name"
	info.URL = "http://localhost:9191"

	if err := backend.SaveServer(info); err != nil {
		t.Fatalf("SaveServer update failed: %v", err)
	}

	// Get servers
	servers, err := backend.GetServers()
	if err != nil {
		t.Fatalf("GetServers failed: %v", err)
	}

	if len(servers) != 1 {
		t.Fatalf("expected 1 server after update, got %d", len(servers))
	}

	if servers[0].Name != "Updated Name" {
		t.Errorf("expected Name='Updated Name', got %s", servers[0].Name)
	}
	if servers[0].URL != "http://localhost:9191" {
		t.Errorf("expected URL='http://localhost:9191', got %s", servers[0].URL)
	}
}

func TestSQLiteBackend_GetServersMultiple(t *testing.T) {
	backend, cleanup := createTestBackend(t)
	defer cleanup()

	// Save multiple servers
	servers := []ServerInfo{
		{ServerID: "server1", Name: "Alpha Server", URL: "http://localhost:9090"},
		{ServerID: "server2", Name: "Beta Server", URL: "http://localhost:9191"},
		{ServerID: "server3", Name: "Gamma Server", URL: "http://localhost:9292"},
	}

	for _, info := range servers {
		if err := backend.SaveServer(info); err != nil {
			t.Fatalf("SaveServer failed: %v", err)
		}
	}

	// Get servers (should be sorted by name)
	result, err := backend.GetServers()
	if err != nil {
		t.Fatalf("GetServers failed: %v", err)
	}

	if len(result) != 3 {
		t.Fatalf("expected 3 servers, got %d", len(result))
	}

	// Check sorting by name
	expectedOrder := []string{"Alpha Server", "Beta Server", "Gamma Server"}
	for i, expected := range expectedOrder {
		if result[i].Name != expected {
			t.Errorf("expected server at position %d to be '%s', got '%s'", i, expected, result[i].Name)
		}
	}
}

func BenchmarkSQLiteBackend_SaveBatch(b *testing.B) {
	tmpDir := b.TempDir()
	dbPath := filepath.Join(tmpDir, "bench.db")
	backend := NewSQLiteBackend(dbPath)

	if err := backend.Open(); err != nil {
		b.Fatalf("failed to open backend: %v", err)
	}
	defer backend.Close()

	now := time.Now().UTC()

	// Create batch of 100 records
	records := make([]DataRecord, 100)
	for i := 0; i < 100; i++ {
		records[i] = DataRecord{
			ServerID:     "server1",
			ObjectName:   "Object1",
			VariableName: "var1",
			Value:        i,
			Timestamp:    now.Add(time.Duration(i) * time.Microsecond),
		}
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		// Update timestamps for each iteration
		for j := range records {
			records[j].Timestamp = now.Add(time.Duration(i*100+j) * time.Microsecond)
		}
		if err := backend.SaveBatch(records); err != nil {
			b.Fatalf("SaveBatch failed: %v", err)
		}
	}
}
