package launcher

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

// StatusCallback вызывается при изменении статуса Launcher'а
type StatusCallback func(nodeID, nodeName string, status *LauncherStatus)

// ConnectionCallback вызывается при изменении connectivity
type ConnectionCallback func(nodeID, nodeName string, connected bool, lastError string)

// Poller опрашивает Launcher с заданным интервалом
type Poller struct {
	client     *Client
	nodeID     string
	nodeName   string
	interval   time.Duration
	statusCb   StatusCallback
	connCb     ConnectionCallback
	lastStatus *LauncherStatus
	connected  bool
	mu         sync.RWMutex

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// NewPoller создаёт новый поллер для Launcher'а
func NewPoller(client *Client, nodeID, nodeName string, interval time.Duration) *Poller {
	return &Poller{
		client:   client,
		nodeID:   nodeID,
		nodeName: nodeName,
		interval: interval,
	}
}

// SetStatusCallback устанавливает callback для изменения статуса
func (p *Poller) SetStatusCallback(cb StatusCallback) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.statusCb = cb
}

// SetConnectionCallback устанавливает callback для изменения connectivity
func (p *Poller) SetConnectionCallback(cb ConnectionCallback) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.connCb = cb
}

// Start запускает поллер
func (p *Poller) Start() {
	p.ctx, p.cancel = context.WithCancel(context.Background())
	p.wg.Add(1)
	go p.poll()
}

// Stop останавливает поллер
func (p *Poller) Stop() {
	if p.cancel != nil {
		p.cancel()
	}
	p.wg.Wait()
}

// IsConnected возвращает текущее состояние подключения
func (p *Poller) IsConnected() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.connected
}

// GetLastStatus возвращает последний известный статус
func (p *Poller) GetLastStatus() *LauncherStatus {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.lastStatus
}

func (p *Poller) poll() {
	defer p.wg.Done()

	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()

	// Первый опрос сразу
	p.doPoll()

	for {
		select {
		case <-p.ctx.Done():
			return
		case <-ticker.C:
			p.doPoll()
		}
	}
}

func (p *Poller) doPoll() {
	status, err := p.client.GetStatus(p.ctx)

	p.mu.Lock()
	wasConnected := p.connected
	var statusCb StatusCallback
	var connCb ConnectionCallback

	if err != nil {
		if wasConnected {
			p.connected = false
			connCb = p.connCb
			slog.Warn("Launcher disconnected", "node", p.nodeName, "error", err)
		}
		p.mu.Unlock()

		if connCb != nil {
			connCb(p.nodeID, p.nodeName, false, err.Error())
		}
		return
	}

	// Подключились
	if !wasConnected {
		p.connected = true
		connCb = p.connCb
		slog.Info("Launcher connected", "node", p.nodeName)
	}

	// Проверяем изменения статуса
	if p.statusChanged(status) {
		p.lastStatus = status
		statusCb = p.statusCb
	}

	p.mu.Unlock()

	if connCb != nil {
		connCb(p.nodeID, p.nodeName, true, "")
	}
	if statusCb != nil {
		statusCb(p.nodeID, p.nodeName, status)
	}
}

// statusChanged сравнивает текущий и предыдущий статусы
func (p *Poller) statusChanged(newStatus *LauncherStatus) bool {
	if p.lastStatus == nil {
		return true
	}

	old := p.lastStatus

	if old.AllRunning != newStatus.AllRunning || old.AnyCriticalFailed != newStatus.AnyCriticalFailed {
		return true
	}

	if len(old.Processes) != len(newStatus.Processes) {
		return true
	}

	// Строим map для быстрого сравнения
	oldMap := make(map[string]Process, len(old.Processes))
	for _, proc := range old.Processes {
		oldMap[proc.Name] = proc
	}

	for _, proc := range newStatus.Processes {
		oldProc, exists := oldMap[proc.Name]
		if !exists {
			return true
		}
		if oldProc.State != proc.State || oldProc.PID != proc.PID || oldProc.RestartCount != proc.RestartCount {
			return true
		}
	}

	return false
}
