package recording

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"time"
)

// ExportCSV writes records to CSV format
func ExportCSV(w io.Writer, records []DataRecord) error {
	writer := csv.NewWriter(w)
	defer writer.Flush()

	// Write header
	if err := writer.Write([]string{"timestamp", "server_id", "object_name", "variable_name", "value"}); err != nil {
		return fmt.Errorf("write header: %w", err)
	}

	// Write records
	for _, record := range records {
		valueStr := fmt.Sprintf("%v", record.Value)
		row := []string{
			record.Timestamp.Format(time.RFC3339Nano),
			record.ServerID,
			record.ObjectName,
			record.VariableName,
			valueStr,
		}
		if err := writer.Write(row); err != nil {
			return fmt.Errorf("write row: %w", err)
		}
	}

	return nil
}

// ExportJSON writes records to JSON format
func ExportJSON(w io.Writer, records []DataRecord) error {
	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")

	export := struct {
		ExportedAt time.Time    `json:"exportedAt"`
		Count      int          `json:"count"`
		Records    []DataRecord `json:"records"`
	}{
		ExportedAt: time.Now().UTC(),
		Count:      len(records),
		Records:    records,
	}

	if err := encoder.Encode(export); err != nil {
		return fmt.Errorf("encode json: %w", err)
	}

	return nil
}

// ExportManager provides export methods for Manager
type ExportManager struct {
	manager *Manager
}

// NewExportManager creates export manager wrapper
func NewExportManager(m *Manager) *ExportManager {
	return &ExportManager{manager: m}
}

// ToCSV exports filtered records to CSV
func (e *ExportManager) ToCSV(w io.Writer, filter ExportFilter) error {
	records, err := e.manager.GetHistory(filter)
	if err != nil {
		return fmt.Errorf("get history: %w", err)
	}

	return ExportCSV(w, records)
}

// ToJSON exports filtered records to JSON
func (e *ExportManager) ToJSON(w io.Writer, filter ExportFilter) error {
	records, err := e.manager.GetHistory(filter)
	if err != nil {
		return fmt.Errorf("get history: %w", err)
	}

	return ExportJSON(w, records)
}

// ToRaw exports the raw database file
func (e *ExportManager) ToRaw(w io.Writer) error {
	return e.manager.ExportRaw(w)
}
