package journal

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

// ConnectionCallback вызывается при изменении connectivity журнала
type ConnectionCallback func(journalID string, connected bool, lastError string)

// Poller опрашивает журнал на наличие новых сообщений
type Poller struct {
	client        *Client
	interval      time.Duration
	lastTimestamp time.Time
	callback      func(journalID string, messages []Message)
	connCb        ConnectionCallback
	connected     bool
	logger        *slog.Logger
	mu            sync.RWMutex

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// NewPoller создаёт новый poller для журнала
func NewPoller(client *Client, interval time.Duration, callback func(journalID string, messages []Message), logger *slog.Logger) *Poller {
	if logger == nil {
		logger = slog.Default()
	}
	if interval <= 0 {
		interval = 2 * time.Second
	}
	return &Poller{
		client:        client,
		interval:      interval,
		lastTimestamp: time.Now(),
		callback:      callback,
		logger:        logger,
	}
}

// SetConnectionCallback устанавливает callback для изменения connectivity
func (p *Poller) SetConnectionCallback(cb ConnectionCallback) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.connCb = cb
}

// IsConnected возвращает текущее состояние подключения
func (p *Poller) IsConnected() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.connected
}

// Start запускает опрос
func (p *Poller) Start() {
	p.ctx, p.cancel = context.WithCancel(context.Background())
	p.wg.Add(1)
	go p.loop()
}

// Stop останавливает опрос
func (p *Poller) Stop() {
	if p.cancel != nil {
		p.cancel()
	}
	p.wg.Wait()
}

func (p *Poller) loop() {
	defer p.wg.Done()

	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()

	journalID := p.client.ID()
	p.logger.Debug("journal poller started", "id", journalID, "interval", p.interval)

	for {
		select {
		case <-p.ctx.Done():
			p.logger.Debug("journal poller stopped", "id", journalID)
			return
		case <-ticker.C:
			p.poll()
		}
	}
}

func (p *Poller) poll() {
	ctx, cancel := context.WithTimeout(p.ctx, 10*time.Second)
	defer cancel()

	journalID := p.client.ID()
	messages, err := p.client.GetNewMessages(ctx, p.lastTimestamp, 100)

	p.mu.Lock()
	wasConnected := p.connected
	var connCb ConnectionCallback

	if err != nil {
		if wasConnected {
			p.connected = false
			connCb = p.connCb
			p.logger.Warn("journal disconnected", "id", journalID, "error", err)
		}
		p.mu.Unlock()

		if connCb != nil {
			connCb(journalID, false, err.Error())
		}
		return
	}

	// Подключились (или первый успешный опрос)
	if !wasConnected {
		p.connected = true
		connCb = p.connCb
		p.logger.Info("journal connected", "id", journalID)
	}
	p.mu.Unlock()

	if connCb != nil {
		connCb(journalID, true, "")
	}

	if len(messages) > 0 {
		// Обновляем lastTimestamp на самое свежее сообщение
		for _, msg := range messages {
			if msg.Timestamp.After(p.lastTimestamp) {
				p.lastTimestamp = msg.Timestamp
			}
		}

		// Вызываем callback
		if p.callback != nil {
			p.callback(journalID, messages)
		}

		p.logger.Debug("polled new messages", "id", journalID, "count", len(messages))
	}
}
