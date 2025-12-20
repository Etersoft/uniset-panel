package recording

import (
	"fmt"
	"io"
	"sync"
	"time"
)

// Manager manages recording through a backend
type Manager struct {
	mu          sync.RWMutex
	enabled     bool
	backendOpen bool
	backend     Backend
	maxRecords  int64
	lastCleanup time.Time
}

// NewManager creates a new recording manager
func NewManager(backend Backend, maxRecords int64) *Manager {
	return &Manager{
		backend:    backend,
		maxRecords: maxRecords,
	}
}

// Start begins recording
func (m *Manager) Start() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.enabled {
		return nil // Already recording
	}

	if err := m.backend.Open(); err != nil {
		return fmt.Errorf("open backend: %w", err)
	}

	m.enabled = true
	m.backendOpen = true
	return nil
}

// Stop stops recording
func (m *Manager) Stop() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.enabled {
		return nil // Already stopped
	}

	m.enabled = false
	m.backendOpen = false

	if err := m.backend.Close(); err != nil {
		return fmt.Errorf("close backend: %w", err)
	}

	return nil
}

// IsRecording returns whether recording is active
func (m *Manager) IsRecording() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.enabled
}

// Save records a data point (if recording is enabled)
func (m *Manager) Save(serverID, objectName, variableName string, value interface{}, timestamp time.Time) error {
	m.mu.RLock()
	enabled := m.enabled
	m.mu.RUnlock()

	if !enabled {
		return nil
	}

	record := DataRecord{
		ServerID:     serverID,
		ObjectName:   objectName,
		VariableName: variableName,
		Value:        value,
		Timestamp:    timestamp,
	}

	if err := m.backend.Save(record); err != nil {
		return fmt.Errorf("save record: %w", err)
	}

	// Periodic cleanup (every minute)
	m.mu.Lock()
	if time.Since(m.lastCleanup) > time.Minute {
		m.lastCleanup = time.Now()
		m.mu.Unlock()

		if err := m.backend.Cleanup(m.maxRecords); err != nil {
			return fmt.Errorf("cleanup: %w", err)
		}
	} else {
		m.mu.Unlock()
	}

	return nil
}

// SaveBatch records multiple data points (if recording is enabled)
func (m *Manager) SaveBatch(records []DataRecord) error {
	m.mu.RLock()
	enabled := m.enabled
	m.mu.RUnlock()

	if !enabled {
		return nil
	}

	if err := m.backend.SaveBatch(records); err != nil {
		return fmt.Errorf("save batch: %w", err)
	}

	return nil
}

// GetStats returns recording statistics
func (m *Manager) GetStats() (Stats, error) {
	m.mu.RLock()
	enabled := m.enabled
	backendOpen := m.backendOpen
	m.mu.RUnlock()

	// If backend is already open (recording), just get stats
	if backendOpen {
		stats, err := m.backend.GetStats()
		if err != nil {
			return stats, fmt.Errorf("get stats: %w", err)
		}
		stats.IsRecording = enabled
		return stats, nil
	}

	// If not recording, open backend temporarily to get stats
	if err := m.backend.Open(); err != nil {
		// Return empty stats if can't open
		return Stats{IsRecording: false}, nil
	}
	defer m.backend.Close()

	stats, err := m.backend.GetStats()
	if err != nil {
		return stats, fmt.Errorf("get stats: %w", err)
	}

	stats.IsRecording = enabled
	return stats, nil
}

// GetHistory retrieves recorded data with optional filters
func (m *Manager) GetHistory(filter ExportFilter) ([]DataRecord, error) {
	m.mu.RLock()
	backendOpen := m.backendOpen
	m.mu.RUnlock()

	if !backendOpen {
		if err := m.backend.Open(); err != nil {
			return nil, fmt.Errorf("open backend: %w", err)
		}
		defer m.backend.Close()
	}

	return m.backend.GetHistory(filter)
}

// Clear removes all recorded data
func (m *Manager) Clear() error {
	m.mu.RLock()
	backendOpen := m.backendOpen
	m.mu.RUnlock()

	if !backendOpen {
		if err := m.backend.Open(); err != nil {
			return fmt.Errorf("open backend: %w", err)
		}
		defer m.backend.Close()
	}

	return m.backend.Clear()
}

// ExportRaw exports the raw database file
func (m *Manager) ExportRaw(w io.Writer) error {
	m.mu.RLock()
	backendOpen := m.backendOpen
	m.mu.RUnlock()

	if !backendOpen {
		if err := m.backend.Open(); err != nil {
			return fmt.Errorf("open backend: %w", err)
		}
		defer m.backend.Close()
	}

	return m.backend.ExportRaw(w)
}

// SaveServer saves or updates server metadata
func (m *Manager) SaveServer(info ServerInfo) error {
	m.mu.RLock()
	backendOpen := m.backendOpen
	m.mu.RUnlock()

	if !backendOpen {
		if err := m.backend.Open(); err != nil {
			return fmt.Errorf("open backend: %w", err)
		}
		defer m.backend.Close()
	}

	return m.backend.SaveServer(info)
}

// GetServers returns all server metadata
func (m *Manager) GetServers() ([]ServerInfo, error) {
	m.mu.RLock()
	backendOpen := m.backendOpen
	m.mu.RUnlock()

	if !backendOpen {
		if err := m.backend.Open(); err != nil {
			return nil, fmt.Errorf("open backend: %w", err)
		}
		defer m.backend.Close()
	}

	return m.backend.GetServers()
}

// Backend returns the underlying backend (for type-specific operations)
func (m *Manager) Backend() Backend {
	return m.backend
}
