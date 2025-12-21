package uwsgate

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// DataCallback функция обратного вызова для входящих данных
type DataCallback func(data []SensorData)

// DisconnectCallback функция обратного вызова при разрыве соединения
type DisconnectCallback func(err error)

// Client WebSocket клиент для UWebSocketGate
type Client struct {
	baseURL    string // http://host:port
	wsURL      string // ws://host:port/wsgate/
	conn       *websocket.Conn
	mu         sync.RWMutex
	connected  bool
	onData     DataCallback
	onDisconnect DisconnectCallback

	// Reconnect параметры
	reconnectInterval time.Duration
	maxReconnectInterval time.Duration
	currentReconnectInterval time.Duration

	// Context для управления жизненным циклом
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup

	// Буфер команд для переотправки после переподключения
	pendingSubscriptions []string
	subMu sync.Mutex

	logger *slog.Logger
}

// NewClient создаёт нового клиента UWebSocketGate
// baseURL должен быть в формате http://host:port
func NewClient(baseURL string, logger *slog.Logger) *Client {
	// Преобразуем http:// в ws://
	wsURL := strings.Replace(baseURL, "https://", "wss://", 1)
	wsURL = strings.Replace(wsURL, "http://", "ws://", 1)
	if !strings.HasSuffix(wsURL, "/") {
		wsURL += "/"
	}
	wsURL += "wsgate/"

	if logger == nil {
		logger = slog.Default()
	}

	return &Client{
		baseURL:              baseURL,
		wsURL:                wsURL,
		reconnectInterval:    time.Second,
		maxReconnectInterval: 30 * time.Second,
		currentReconnectInterval: time.Second,
		pendingSubscriptions: make([]string, 0),
		logger:               logger.With("component", "uwsgate-client"),
	}
}

// SetOnData устанавливает callback для входящих данных
func (c *Client) SetOnData(callback DataCallback) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onData = callback
}

// SetOnDisconnect устанавливает callback для разрыва соединения
func (c *Client) SetOnDisconnect(callback DisconnectCallback) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onDisconnect = callback
}

// Connect подключается к WebSocket серверу
func (c *Client) Connect(ctx context.Context) error {
	c.mu.Lock()
	if c.connected {
		c.mu.Unlock()
		return nil
	}

	c.ctx, c.cancel = context.WithCancel(ctx)
	c.mu.Unlock()

	return c.connect()
}

func (c *Client) connect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.connected {
		return nil
	}

	u, err := url.Parse(c.wsURL)
	if err != nil {
		return fmt.Errorf("invalid websocket URL: %w", err)
	}

	c.logger.Info("connecting to UWebSocketGate", "url", c.wsURL)

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	conn, _, err := dialer.DialContext(c.ctx, u.String(), nil)
	if err != nil {
		return fmt.Errorf("websocket dial failed: %w", err)
	}

	c.conn = conn
	c.connected = true
	c.currentReconnectInterval = c.reconnectInterval

	c.logger.Info("connected to UWebSocketGate")

	// Запускаем цикл чтения
	c.wg.Add(1)
	go c.readLoop()

	// Переподписываемся на датчики
	c.resubscribe()

	return nil
}

// Close закрывает соединение
func (c *Client) Close() error {
	c.mu.Lock()
	if c.cancel != nil {
		c.cancel()
	}

	if c.conn != nil {
		c.conn.Close()
	}
	c.connected = false
	c.mu.Unlock()

	c.wg.Wait()
	return nil
}

// IsConnected возвращает статус подключения
func (c *Client) IsConnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.connected
}

// Subscribe подписывается на датчики (команда ask:)
func (c *Client) Subscribe(sensors []string) error {
	if len(sensors) == 0 {
		return nil
	}

	// Сохраняем для переподписки
	c.subMu.Lock()
	for _, s := range sensors {
		found := false
		for _, existing := range c.pendingSubscriptions {
			if existing == s {
				found = true
				break
			}
		}
		if !found {
			c.pendingSubscriptions = append(c.pendingSubscriptions, s)
		}
	}
	c.subMu.Unlock()

	cmd := "ask:" + strings.Join(sensors, ",")
	return c.sendCommand(cmd)
}

// Unsubscribe отписывается от датчиков (команда del:)
func (c *Client) Unsubscribe(sensors []string) error {
	if len(sensors) == 0 {
		return nil
	}

	// Удаляем из списка подписок
	c.subMu.Lock()
	newSubs := make([]string, 0, len(c.pendingSubscriptions))
	for _, s := range c.pendingSubscriptions {
		remove := false
		for _, toRemove := range sensors {
			if s == toRemove {
				remove = true
				break
			}
		}
		if !remove {
			newSubs = append(newSubs, s)
		}
	}
	c.pendingSubscriptions = newSubs
	c.subMu.Unlock()

	cmd := "del:" + strings.Join(sensors, ",")
	return c.sendCommand(cmd)
}

// Get запрашивает текущие значения (команда get:)
func (c *Client) Get(sensors []string) error {
	if len(sensors) == 0 {
		return nil
	}
	cmd := "get:" + strings.Join(sensors, ",")
	return c.sendCommand(cmd)
}

// Set устанавливает значения датчиков (команда set:)
func (c *Client) Set(values map[string]int64) error {
	if len(values) == 0 {
		return nil
	}

	parts := make([]string, 0, len(values))
	for name, value := range values {
		parts = append(parts, fmt.Sprintf("%s=%d", name, value))
	}

	cmd := "set:" + strings.Join(parts, ",")
	return c.sendCommand(cmd)
}

// sendCommand отправляет команду через WebSocket
func (c *Client) sendCommand(cmd string) error {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.connected || c.conn == nil {
		return fmt.Errorf("not connected")
	}

	c.logger.Debug("sending command", "cmd", cmd)

	err := c.conn.WriteMessage(websocket.TextMessage, []byte(cmd))
	if err != nil {
		return fmt.Errorf("write message failed: %w", err)
	}

	return nil
}

// readLoop читает сообщения из WebSocket
func (c *Client) readLoop() {
	defer c.wg.Done()

	for {
		select {
		case <-c.ctx.Done():
			return
		default:
		}

		c.mu.RLock()
		conn := c.conn
		c.mu.RUnlock()

		if conn == nil {
			return
		}

		_, message, err := conn.ReadMessage()
		if err != nil {
			c.handleDisconnect(err)
			return
		}

		c.handleMessage(message)
	}
}

// handleMessage обрабатывает входящее сообщение
func (c *Client) handleMessage(message []byte) {
	var resp Response
	if err := json.Unmarshal(message, &resp); err != nil {
		c.logger.Warn("failed to parse message", "error", err, "message", string(message))
		return
	}

	// Фильтруем Ping сообщения
	sensorData := make([]SensorData, 0, len(resp.Data))
	for _, d := range resp.Data {
		if d.Type != "Ping" {
			sensorData = append(sensorData, d)
		}
	}

	if len(sensorData) > 0 {
		c.mu.RLock()
		callback := c.onData
		c.mu.RUnlock()

		if callback != nil {
			callback(sensorData)
		}
	}
}

// handleDisconnect обрабатывает разрыв соединения
func (c *Client) handleDisconnect(err error) {
	c.mu.Lock()
	c.connected = false
	if c.conn != nil {
		c.conn.Close()
		c.conn = nil
	}

	callback := c.onDisconnect
	c.mu.Unlock()

	c.logger.Warn("disconnected from UWebSocketGate", "error", err)

	if callback != nil {
		callback(err)
	}

	// Запускаем переподключение
	go c.reconnectLoop()
}

// reconnectLoop пытается переподключиться с exponential backoff
func (c *Client) reconnectLoop() {
	for {
		select {
		case <-c.ctx.Done():
			return
		case <-time.After(c.currentReconnectInterval):
		}

		c.logger.Info("attempting to reconnect", "interval", c.currentReconnectInterval)

		if err := c.connect(); err != nil {
			c.logger.Warn("reconnect failed", "error", err)

			// Увеличиваем интервал (exponential backoff)
			c.currentReconnectInterval *= 2
			if c.currentReconnectInterval > c.maxReconnectInterval {
				c.currentReconnectInterval = c.maxReconnectInterval
			}
			continue
		}

		// Успешно переподключились
		return
	}
}

// resubscribe переподписывается на все датчики после переподключения
func (c *Client) resubscribe() {
	c.subMu.Lock()
	sensors := make([]string, len(c.pendingSubscriptions))
	copy(sensors, c.pendingSubscriptions)
	c.subMu.Unlock()

	if len(sensors) > 0 {
		c.logger.Info("resubscribing to sensors", "count", len(sensors))
		cmd := "ask:" + strings.Join(sensors, ",")
		// Напрямую отправляем, не через Subscribe чтобы избежать дублирования
		if err := c.conn.WriteMessage(websocket.TextMessage, []byte(cmd)); err != nil {
			c.logger.Warn("resubscribe failed", "error", err)
		}
	}
}

// GetWSURL возвращает WebSocket URL
func (c *Client) GetWSURL() string {
	return c.wsURL
}

// GetBaseURL возвращает базовый HTTP URL
func (c *Client) GetBaseURL() string {
	return c.baseURL
}
