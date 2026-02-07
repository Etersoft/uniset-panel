package launcher

import (
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/pv/uniset-panel/internal/config"
)

// Node представляет Launcher
type Node struct {
	ID          string
	Name        string
	LauncherURL string
	HasControl  bool // есть ли controlToken (доступно ли управление)
	Client      *Client
	Poller      *Poller
}

// Manager управляет несколькими Launcher'ами
type Manager struct {
	mu    sync.RWMutex
	nodes map[string]*Node
	order []string // порядок из конфига

	statusCb StatusCallback
	connCb   ConnectionCallback
}

// NewManager создаёт новый менеджер Launcher'ов
func NewManager() *Manager {
	return &Manager{
		nodes: make(map[string]*Node),
	}
}

// SetStatusCallback устанавливает callback для статуса Launcher'а
func (m *Manager) SetStatusCallback(cb StatusCallback) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.statusCb = cb
}

// SetConnectionCallback устанавливает callback для connectivity
func (m *Manager) SetConnectionCallback(cb ConnectionCallback) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.connCb = cb
}

// AddLauncher добавляет Launcher из конфига
func (m *Manager) AddLauncher(cfg config.LauncherConfig) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if cfg.URL == "" {
		return fmt.Errorf("launcher %q has no URL", cfg.Name)
	}

	if _, exists := m.nodes[cfg.ID]; exists {
		return fmt.Errorf("launcher with ID %q already exists", cfg.ID)
	}

	client := NewClient(cfg.URL, cfg.ReadToken, cfg.ControlToken)
	poller := NewPoller(client, cfg.ID, cfg.Name, 5*time.Second)

	// Устанавливаем callbacks
	if m.statusCb != nil {
		poller.SetStatusCallback(m.statusCb)
	}
	if m.connCb != nil {
		poller.SetConnectionCallback(m.connCb)
	}

	node := &Node{
		ID:          cfg.ID,
		Name:        cfg.Name,
		LauncherURL: cfg.URL,
		HasControl:  cfg.ControlToken != "",
		Client:      client,
		Poller:      poller,
	}

	m.nodes[cfg.ID] = node
	m.order = append(m.order, cfg.ID)

	slog.Info("Launcher added", "id", cfg.ID, "name", cfg.Name, "url", cfg.URL, "hasControl", node.HasControl)
	return nil
}

// GetNode возвращает ноду по ID
func (m *Manager) GetNode(nodeID string) (*Node, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	node, exists := m.nodes[nodeID]
	return node, exists
}

// ListNodes возвращает все ноды в порядке конфига
func (m *Manager) ListNodes() []*Node {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*Node, 0, len(m.order))
	for _, id := range m.order {
		if node, exists := m.nodes[id]; exists {
			result = append(result, node)
		}
	}
	return result
}

// StartAll запускает все pollers
func (m *Manager) StartAll() {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, node := range m.nodes {
		node.Poller.Start()
	}
	slog.Info("All launcher pollers started", "count", len(m.nodes))
}

// Shutdown останавливает все pollers
func (m *Manager) Shutdown() {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, node := range m.nodes {
		node.Poller.Stop()
	}
	slog.Info("All launcher pollers stopped")
}
