// Package recording provides history recording functionality with pluggable backends
package recording

import (
	"io"
	"time"
)

// Backend defines the interface for recording storage backends.
// This allows different database implementations (SQLite, PostgreSQL, ClickHouse, etc.)
type Backend interface {
	// Open initializes the backend connection
	Open() error

	// Close closes the backend connection
	Close() error

	// Save stores a single data record
	Save(record DataRecord) error

	// SaveBatch stores multiple records in a single transaction
	SaveBatch(records []DataRecord) error

	// GetHistory retrieves records matching the filter
	GetHistory(filter ExportFilter) ([]DataRecord, error)

	// GetStats returns storage statistics
	GetStats() (Stats, error)

	// Cleanup removes oldest records to maintain maxRecords limit
	Cleanup(maxRecords int64) error

	// Clear removes all records
	Clear() error

	// ExportRaw writes raw database content (for SQLite - the db file itself)
	// Returns ErrExportNotSupported if backend doesn't support raw export
	ExportRaw(w io.Writer) error

	// SaveServer saves or updates server metadata
	SaveServer(info ServerInfo) error

	// GetServers returns all server metadata
	GetServers() ([]ServerInfo, error)
}

// ServerInfo contains server metadata for reference
type ServerInfo struct {
	ServerID  string `json:"serverId"`
	Name      string `json:"name"`
	URL       string `json:"url"`
	UpdatedAt string `json:"updatedAt,omitempty"`
}

// DataRecord represents a single recorded data point
type DataRecord struct {
	ServerID     string      `json:"serverId"`
	ObjectName   string      `json:"objectName"`
	VariableName string      `json:"variableName"`
	Value        interface{} `json:"value"`
	Timestamp    time.Time   `json:"timestamp"`
}

// ExportFilter defines criteria for filtering records during export
type ExportFilter struct {
	From       *time.Time // nil = no lower bound
	To         *time.Time // nil = no upper bound
	ServerID   string     // empty = all servers
	ObjectName string     // empty = all objects
}

// Stats contains storage statistics
type Stats struct {
	RecordCount  int64     `json:"recordCount"`
	SizeBytes    int64     `json:"sizeBytes"`
	OldestRecord time.Time `json:"oldestRecord,omitempty"`
	NewestRecord time.Time `json:"newestRecord,omitempty"`
	IsRecording  bool      `json:"isRecording"`
}

// ErrExportNotSupported is returned when backend doesn't support raw export
type ErrExportNotSupported struct{}

func (e ErrExportNotSupported) Error() string {
	return "raw export not supported by this backend"
}
