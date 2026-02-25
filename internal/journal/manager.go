package journal

import (
	"fmt"
	"log/slog"
	"sync"
)

// Manager управляет несколькими журналами
type Manager struct {
	clients    map[string]*Client // id -> client
	connStatus map[string]bool    // id -> connected
	mu         sync.RWMutex
	logger     *slog.Logger
}

// NewManager создаёт нового менеджера журналов
func NewManager(logger *slog.Logger) *Manager {
	if logger == nil {
		logger = slog.Default()
	}
	return &Manager{
		clients:    make(map[string]*Client),
		connStatus: make(map[string]bool),
		logger:     logger,
	}
}

// AddJournal добавляет новый журнал по URL
func (m *Manager) AddJournal(urlStr string) error {
	client, err := NewClient(urlStr)
	if err != nil {
		return fmt.Errorf("failed to create client: %w", err)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	id := client.ID()
	if _, exists := m.clients[id]; exists {
		client.Close()
		return fmt.Errorf("journal with ID %s already exists", id)
	}

	m.clients[id] = client
	m.logger.Info("journal added", "id", id, "name", client.Info().Name)
	return nil
}

// GetClient возвращает клиента по ID
func (m *Manager) GetClient(id string) *Client {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.clients[id]
}

// UpdateConnectionStatus обновляет статус подключения журнала
func (m *Manager) UpdateConnectionStatus(id string, connected bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.connStatus[id] = connected
}

// GetAllInfos возвращает информацию о всех журналах
func (m *Manager) GetAllInfos() []JournalInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	infos := make([]JournalInfo, 0, len(m.clients))
	for _, client := range m.clients {
		info := client.Info()
		if connected, ok := m.connStatus[info.ID]; ok {
			info.Connected = connected
			if connected {
				info.Status = "connected"
			} else {
				info.Status = "error"
			}
		}
		infos = append(infos, info)
	}
	return infos
}

// GetAllClients возвращает всех клиентов
func (m *Manager) GetAllClients() []*Client {
	m.mu.RLock()
	defer m.mu.RUnlock()

	clients := make([]*Client, 0, len(m.clients))
	for _, client := range m.clients {
		clients = append(clients, client)
	}
	return clients
}

// Count возвращает количество журналов
func (m *Manager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.clients)
}

// Close закрывает все подключения
func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for id, client := range m.clients {
		if err := client.Close(); err != nil {
			m.logger.Error("failed to close journal", "id", id, "error", err)
		}
	}
	m.clients = make(map[string]*Client)
}
