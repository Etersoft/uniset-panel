package recording

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"io"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// --- ExportCSV package function tests ---

func TestExportCSV_Empty(t *testing.T) {
	var buf bytes.Buffer
	if err := ExportCSV(&buf, nil); err != nil {
		t.Fatalf("ExportCSV failed: %v", err)
	}

	// Should have header only
	reader := csv.NewReader(strings.NewReader(buf.String()))
	records, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("failed to parse CSV: %v", err)
	}

	if len(records) != 1 {
		t.Fatalf("expected 1 row (header), got %d", len(records))
	}

	expectedHeader := []string{"timestamp", "server_id", "object_name", "variable_name", "value"}
	for i, h := range expectedHeader {
		if records[0][i] != h {
			t.Errorf("header[%d]: expected %q, got %q", i, h, records[0][i])
		}
	}
}

func TestExportCSV_WithRecords(t *testing.T) {
	now := time.Date(2025, 6, 15, 10, 30, 0, 0, time.UTC)
	records := []DataRecord{
		{
			ServerID:     "server1",
			ObjectName:   "MBSlave1",
			VariableName: "Temperature_S",
			Value:        42.5,
			Timestamp:    now,
		},
		{
			ServerID:     "server2",
			ObjectName:   "IOControl",
			VariableName: "Pressure_S",
			Value:        100,
			Timestamp:    now.Add(time.Second),
		},
	}

	var buf bytes.Buffer
	if err := ExportCSV(&buf, records); err != nil {
		t.Fatalf("ExportCSV failed: %v", err)
	}

	reader := csv.NewReader(strings.NewReader(buf.String()))
	rows, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("failed to parse CSV: %v", err)
	}

	// Header + 2 data rows
	if len(rows) != 3 {
		t.Fatalf("expected 3 rows, got %d", len(rows))
	}

	// Check first data row
	row1 := rows[1]
	if row1[0] != now.Format(time.RFC3339Nano) {
		t.Errorf("row1 timestamp: expected %s, got %s", now.Format(time.RFC3339Nano), row1[0])
	}
	if row1[1] != "server1" {
		t.Errorf("row1 server_id: expected server1, got %s", row1[1])
	}
	if row1[2] != "MBSlave1" {
		t.Errorf("row1 object_name: expected MBSlave1, got %s", row1[2])
	}
	if row1[3] != "Temperature_S" {
		t.Errorf("row1 variable_name: expected Temperature_S, got %s", row1[3])
	}
	if row1[4] != "42.5" {
		t.Errorf("row1 value: expected 42.5, got %s", row1[4])
	}

	// Check second data row
	row2 := rows[2]
	if row2[1] != "server2" {
		t.Errorf("row2 server_id: expected server2, got %s", row2[1])
	}
	if row2[4] != "100" {
		t.Errorf("row2 value: expected 100, got %s", row2[4])
	}
}

func TestExportCSV_ValueFormats(t *testing.T) {
	now := time.Now().UTC()
	records := []DataRecord{
		{ServerID: "s1", ObjectName: "o1", VariableName: "intVal", Value: 42, Timestamp: now},
		{ServerID: "s1", ObjectName: "o1", VariableName: "floatVal", Value: 3.14, Timestamp: now},
		{ServerID: "s1", ObjectName: "o1", VariableName: "strVal", Value: "hello", Timestamp: now},
	}

	var buf bytes.Buffer
	if err := ExportCSV(&buf, records); err != nil {
		t.Fatalf("ExportCSV failed: %v", err)
	}

	reader := csv.NewReader(strings.NewReader(buf.String()))
	rows, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("failed to parse CSV: %v", err)
	}

	if len(rows) != 4 {
		t.Fatalf("expected 4 rows, got %d", len(rows))
	}

	if rows[1][4] != "42" {
		t.Errorf("int value: expected 42, got %s", rows[1][4])
	}
	if rows[2][4] != "3.14" {
		t.Errorf("float value: expected 3.14, got %s", rows[2][4])
	}
	if rows[3][4] != "hello" {
		t.Errorf("string value: expected hello, got %s", rows[3][4])
	}
}

// --- ExportJSON package function tests ---

func TestExportJSON_Empty(t *testing.T) {
	var buf bytes.Buffer
	if err := ExportJSON(&buf, nil); err != nil {
		t.Fatalf("ExportJSON failed: %v", err)
	}

	var result struct {
		ExportedAt time.Time    `json:"exportedAt"`
		Count      int          `json:"count"`
		Records    []DataRecord `json:"records"`
	}
	if err := json.Unmarshal(buf.Bytes(), &result); err != nil {
		t.Fatalf("failed to parse JSON: %v", err)
	}

	if result.Count != 0 {
		t.Errorf("expected count=0, got %d", result.Count)
	}
	if result.ExportedAt.IsZero() {
		t.Error("expected non-zero exportedAt")
	}
}

func TestExportJSON_WithRecords(t *testing.T) {
	now := time.Date(2025, 6, 15, 10, 30, 0, 0, time.UTC)
	records := []DataRecord{
		{
			ServerID:     "server1",
			ObjectName:   "MBSlave1",
			VariableName: "Temperature_S",
			Value:        42.5,
			Timestamp:    now,
		},
		{
			ServerID:     "server2",
			ObjectName:   "IOControl",
			VariableName: "Pressure_S",
			Value:        100,
			Timestamp:    now.Add(time.Second),
		},
	}

	var buf bytes.Buffer
	if err := ExportJSON(&buf, records); err != nil {
		t.Fatalf("ExportJSON failed: %v", err)
	}

	var result struct {
		ExportedAt time.Time    `json:"exportedAt"`
		Count      int          `json:"count"`
		Records    []DataRecord `json:"records"`
	}
	if err := json.Unmarshal(buf.Bytes(), &result); err != nil {
		t.Fatalf("failed to parse JSON: %v", err)
	}

	if result.Count != 2 {
		t.Errorf("expected count=2, got %d", result.Count)
	}
	if len(result.Records) != 2 {
		t.Fatalf("expected 2 records, got %d", len(result.Records))
	}

	if result.Records[0].ServerID != "server1" {
		t.Errorf("record[0] serverId: expected server1, got %s", result.Records[0].ServerID)
	}
	if result.Records[0].ObjectName != "MBSlave1" {
		t.Errorf("record[0] objectName: expected MBSlave1, got %s", result.Records[0].ObjectName)
	}
	if result.Records[0].VariableName != "Temperature_S" {
		t.Errorf("record[0] variableName: expected Temperature_S, got %s", result.Records[0].VariableName)
	}
	if !result.Records[0].Timestamp.Equal(now) {
		t.Errorf("record[0] timestamp: expected %v, got %v", now, result.Records[0].Timestamp)
	}
	if result.Records[1].ServerID != "server2" {
		t.Errorf("record[1] serverId: expected server2, got %s", result.Records[1].ServerID)
	}
}

func TestExportJSON_IsValidJSON(t *testing.T) {
	records := []DataRecord{
		{ServerID: "s1", ObjectName: "o1", VariableName: "v1", Value: 1, Timestamp: time.Now().UTC()},
	}

	var buf bytes.Buffer
	if err := ExportJSON(&buf, records); err != nil {
		t.Fatalf("ExportJSON failed: %v", err)
	}

	if !json.Valid(buf.Bytes()) {
		t.Error("output is not valid JSON")
	}
}

func TestExportJSON_IndentedOutput(t *testing.T) {
	records := []DataRecord{
		{ServerID: "s1", ObjectName: "o1", VariableName: "v1", Value: 1, Timestamp: time.Now().UTC()},
	}

	var buf bytes.Buffer
	if err := ExportJSON(&buf, records); err != nil {
		t.Fatalf("ExportJSON failed: %v", err)
	}

	// Should contain indentation (SetIndent("", "  "))
	if !strings.Contains(buf.String(), "  ") {
		t.Error("expected indented JSON output")
	}
}

// --- ExportManager tests (with real SQLite backend) ---

func createTestManagerForExport(t *testing.T) (*Manager, func()) {
	t.Helper()

	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test_export.db")
	backend := NewSQLiteBackend(dbPath)
	manager := NewManager(backend, 10000)

	cleanup := func() {
		manager.Stop()
	}

	return manager, cleanup
}

func seedRecords(t *testing.T, manager *Manager) time.Time {
	t.Helper()

	if err := manager.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	now := time.Date(2025, 6, 15, 10, 0, 0, 0, time.UTC)

	testRecords := []struct {
		serverID     string
		objectName   string
		variableName string
		value        interface{}
		offset       time.Duration
	}{
		{"srv1", "MBSlave1", "Temperature_S", 25.5, 0},
		{"srv1", "MBSlave1", "Pressure_S", 101, time.Second},
		{"srv1", "IOControl", "Switch1_S", 1, 2 * time.Second},
		{"srv2", "OPCServer", "Voltage_S", 220.0, 3 * time.Second},
		{"srv2", "OPCServer", "Current_S", 5.5, 4 * time.Second},
	}

	for _, rec := range testRecords {
		if err := manager.Save(rec.serverID, rec.objectName, rec.variableName, rec.value, now.Add(rec.offset)); err != nil {
			t.Fatalf("Save failed: %v", err)
		}
	}

	return now
}

func TestExportManager_ToCSV(t *testing.T) {
	manager, cleanup := createTestManagerForExport(t)
	defer cleanup()

	seedRecords(t, manager)

	em := NewExportManager(manager)
	var buf bytes.Buffer

	if err := em.ToCSV(&buf, ExportFilter{}); err != nil {
		t.Fatalf("ToCSV failed: %v", err)
	}

	reader := csv.NewReader(strings.NewReader(buf.String()))
	rows, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("failed to parse CSV: %v", err)
	}

	// Header + 5 data rows
	if len(rows) != 6 {
		t.Errorf("expected 6 rows (header + 5 data), got %d", len(rows))
	}
}

func TestExportManager_ToCSV_FilterByServer(t *testing.T) {
	manager, cleanup := createTestManagerForExport(t)
	defer cleanup()

	seedRecords(t, manager)

	em := NewExportManager(manager)
	var buf bytes.Buffer

	if err := em.ToCSV(&buf, ExportFilter{ServerID: "srv1"}); err != nil {
		t.Fatalf("ToCSV failed: %v", err)
	}

	reader := csv.NewReader(strings.NewReader(buf.String()))
	rows, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("failed to parse CSV: %v", err)
	}

	// Header + 3 records for srv1
	if len(rows) != 4 {
		t.Errorf("expected 4 rows (header + 3 data for srv1), got %d", len(rows))
	}
}

func TestExportManager_ToJSON(t *testing.T) {
	manager, cleanup := createTestManagerForExport(t)
	defer cleanup()

	seedRecords(t, manager)

	em := NewExportManager(manager)
	var buf bytes.Buffer

	if err := em.ToJSON(&buf, ExportFilter{}); err != nil {
		t.Fatalf("ToJSON failed: %v", err)
	}

	var result struct {
		ExportedAt time.Time    `json:"exportedAt"`
		Count      int          `json:"count"`
		Records    []DataRecord `json:"records"`
	}
	if err := json.Unmarshal(buf.Bytes(), &result); err != nil {
		t.Fatalf("failed to parse JSON: %v", err)
	}

	if result.Count != 5 {
		t.Errorf("expected count=5, got %d", result.Count)
	}
	if len(result.Records) != 5 {
		t.Errorf("expected 5 records, got %d", len(result.Records))
	}
}

func TestExportManager_ToJSON_FilterByObject(t *testing.T) {
	manager, cleanup := createTestManagerForExport(t)
	defer cleanup()

	seedRecords(t, manager)

	em := NewExportManager(manager)
	var buf bytes.Buffer

	if err := em.ToJSON(&buf, ExportFilter{ObjectName: "OPCServer"}); err != nil {
		t.Fatalf("ToJSON failed: %v", err)
	}

	var result struct {
		Count   int          `json:"count"`
		Records []DataRecord `json:"records"`
	}
	if err := json.Unmarshal(buf.Bytes(), &result); err != nil {
		t.Fatalf("failed to parse JSON: %v", err)
	}

	if result.Count != 2 {
		t.Errorf("expected count=2 for OPCServer, got %d", result.Count)
	}
}

func TestExportManager_ToRaw(t *testing.T) {
	manager, cleanup := createTestManagerForExport(t)
	defer cleanup()

	seedRecords(t, manager)

	em := NewExportManager(manager)
	var buf bytes.Buffer

	if err := em.ToRaw(&buf); err != nil {
		t.Fatalf("ToRaw failed: %v", err)
	}

	if buf.Len() == 0 {
		t.Error("expected non-empty raw export")
	}

	// SQLite files start with "SQLite format 3\000"
	header := buf.String()[:16]
	if header != "SQLite format 3\000" {
		t.Errorf("expected SQLite header, got %q", header)
	}
}

func TestExportManager_ToCSV_NotRecording(t *testing.T) {
	manager, cleanup := createTestManagerForExport(t)
	defer cleanup()

	seedRecords(t, manager)

	// Stop recording
	if err := manager.Stop(); err != nil {
		t.Fatalf("Stop failed: %v", err)
	}

	em := NewExportManager(manager)
	var buf bytes.Buffer

	// Should still work - opens backend temporarily
	if err := em.ToCSV(&buf, ExportFilter{}); err != nil {
		t.Fatalf("ToCSV (not recording) failed: %v", err)
	}

	reader := csv.NewReader(strings.NewReader(buf.String()))
	rows, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("failed to parse CSV: %v", err)
	}

	if len(rows) != 6 {
		t.Errorf("expected 6 rows, got %d", len(rows))
	}
}

func TestExportManager_ToJSON_NotRecording(t *testing.T) {
	manager, cleanup := createTestManagerForExport(t)
	defer cleanup()

	seedRecords(t, manager)

	if err := manager.Stop(); err != nil {
		t.Fatalf("Stop failed: %v", err)
	}

	em := NewExportManager(manager)
	var buf bytes.Buffer

	if err := em.ToJSON(&buf, ExportFilter{}); err != nil {
		t.Fatalf("ToJSON (not recording) failed: %v", err)
	}

	var result struct {
		Count int `json:"count"`
	}
	if err := json.Unmarshal(buf.Bytes(), &result); err != nil {
		t.Fatalf("failed to parse JSON: %v", err)
	}

	if result.Count != 5 {
		t.Errorf("expected count=5, got %d", result.Count)
	}
}

func TestExportManager_ToRaw_NotRecording(t *testing.T) {
	manager, cleanup := createTestManagerForExport(t)
	defer cleanup()

	seedRecords(t, manager)

	if err := manager.Stop(); err != nil {
		t.Fatalf("Stop failed: %v", err)
	}

	em := NewExportManager(manager)
	var buf bytes.Buffer

	if err := em.ToRaw(&buf); err != nil {
		t.Fatalf("ToRaw (not recording) failed: %v", err)
	}

	if buf.Len() == 0 {
		t.Error("expected non-empty raw export when not recording")
	}
}

func TestExportManager_ToCSV_FilterByTimeRange(t *testing.T) {
	manager, cleanup := createTestManagerForExport(t)
	defer cleanup()

	now := seedRecords(t, manager)

	em := NewExportManager(manager)
	var buf bytes.Buffer

	// Only records from 0s to 2s (inclusive range depends on implementation)
	from := now
	to := now.Add(2 * time.Second)
	filter := ExportFilter{
		From: &from,
		To:   &to,
	}

	if err := em.ToCSV(&buf, filter); err != nil {
		t.Fatalf("ToCSV with time filter failed: %v", err)
	}

	reader := csv.NewReader(strings.NewReader(buf.String()))
	rows, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("failed to parse CSV: %v", err)
	}

	// Header + records within [now, now+2s]
	dataRows := len(rows) - 1
	if dataRows < 1 || dataRows > 5 {
		t.Errorf("expected between 1 and 5 data rows for time filter, got %d", dataRows)
	}
	// At minimum, first 3 records (at 0s, 1s, 2s) should match
	if dataRows < 3 {
		t.Errorf("expected at least 3 data rows for time range [0s, 2s], got %d", dataRows)
	}
}

// Verify that ExportCSV output can be read back line by line
func TestExportCSV_StreamableOutput(t *testing.T) {
	now := time.Now().UTC()
	records := make([]DataRecord, 100)
	for i := 0; i < 100; i++ {
		records[i] = DataRecord{
			ServerID:     "srv1",
			ObjectName:   "Obj1",
			VariableName: "Var1",
			Value:        i,
			Timestamp:    now.Add(time.Duration(i) * time.Millisecond),
		}
	}

	var buf bytes.Buffer
	if err := ExportCSV(&buf, records); err != nil {
		t.Fatalf("ExportCSV failed: %v", err)
	}

	reader := csv.NewReader(strings.NewReader(buf.String()))
	lineCount := 0
	for {
		_, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("failed to read CSV line %d: %v", lineCount, err)
		}
		lineCount++
	}

	// 1 header + 100 data rows
	if lineCount != 101 {
		t.Errorf("expected 101 lines, got %d", lineCount)
	}
}
