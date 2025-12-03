package logserver

import (
	"bufio"
	"context"
	"fmt"
	"log/slog"
	"net"
	"sync"
	"time"
)

// LogCallback функция обратного вызова для получения строк лога
type LogCallback func(line string)

// Client клиент для подключения к LogServer UniSet2
type Client struct {
	config *ClientConfig
	conn   net.Conn
	mu     sync.RWMutex

	connected      bool
	reconnectCount int
	lastError      string

	// Для управления чтением
	cancel context.CancelFunc
	wg     sync.WaitGroup

	logger *slog.Logger
}

// NewClient создает новый клиент LogServer
func NewClient(config *ClientConfig, logger *slog.Logger) *Client {
	if config == nil {
		config = DefaultConfig()
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &Client{
		config: config,
		logger: logger,
	}
}

// Connect подключается к LogServer
func (c *Client) Connect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.connected && c.conn != nil {
		return nil // Уже подключены
	}

	addr := fmt.Sprintf("%s:%d", c.config.Host, c.config.Port)
	timeout := time.Duration(c.config.ConnectTimeout) * time.Millisecond

	c.logger.Info("connecting to LogServer", "addr", addr, "timeout", timeout)

	conn, err := net.DialTimeout("tcp", addr, timeout)
	if err != nil {
		c.lastError = err.Error()
		c.logger.Error("failed to connect to LogServer", "addr", addr, "error", err)
		return fmt.Errorf("connect to %s: %w", addr, err)
	}

	c.conn = conn
	c.connected = true
	c.lastError = ""

	c.logger.Info("connected to LogServer", "addr", addr)
	return nil
}

// Disconnect отключается от LogServer
func (c *Client) Disconnect() {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Останавливаем горутину чтения
	if c.cancel != nil {
		c.cancel()
		c.cancel = nil
	}

	if c.conn != nil {
		c.conn.Close()
		c.conn = nil
	}
	c.connected = false

	c.logger.Info("disconnected from LogServer")
}

// IsConnected возвращает true если подключен к LogServer
func (c *Client) IsConnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.connected
}

// GetStatus возвращает текущий статус подключения
func (c *Client) GetStatus() *ConnectionStatus {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return &ConnectionStatus{
		Connected:      c.connected,
		Host:           c.config.Host,
		Port:           c.config.Port,
		LastError:      c.lastError,
		ReconnectCount: c.reconnectCount,
	}
}

// SendCommand отправляет команду на LogServer
func (c *Client) SendCommand(cmd Command, data uint32, logname string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected || c.conn == nil {
		return fmt.Errorf("not connected to LogServer")
	}

	msg := NewMessage(cmd, data, logname)
	msgBytes, err := msg.Marshal()
	if err != nil {
		return fmt.Errorf("marshal message: %w", err)
	}

	// Устанавливаем таймаут записи
	if c.config.WriteTimeout > 0 {
		deadline := time.Now().Add(time.Duration(c.config.WriteTimeout) * time.Millisecond)
		c.conn.SetWriteDeadline(deadline)
	}

	n, err := c.conn.Write(msgBytes)
	if err != nil {
		c.lastError = err.Error()
		return fmt.Errorf("write command: %w", err)
	}

	if n != len(msgBytes) {
		return fmt.Errorf("incomplete write: wrote %d of %d bytes", n, len(msgBytes))
	}

	c.logger.Debug("sent command", "cmd", cmd.String(), "data", data, "logname", logname)
	return nil
}

// ReadLogs читает логи с LogServer и вызывает callback для каждой строки
// Работает в горутине до отмены контекста или ошибки подключения
func (c *Client) ReadLogs(ctx context.Context, callback LogCallback) error {
	c.mu.Lock()
	if !c.connected || c.conn == nil {
		c.mu.Unlock()
		return fmt.Errorf("not connected to LogServer")
	}

	// Создаем контекст для остановки
	readCtx, cancel := context.WithCancel(ctx)
	c.cancel = cancel
	conn := c.conn
	c.mu.Unlock()

	c.wg.Add(1)
	defer c.wg.Done()

	reader := bufio.NewReader(conn)

	for {
		select {
		case <-readCtx.Done():
			return readCtx.Err()
		default:
		}

		// Устанавливаем таймаут чтения
		if c.config.ReadTimeout > 0 {
			deadline := time.Now().Add(time.Duration(c.config.ReadTimeout) * time.Millisecond)
			conn.SetReadDeadline(deadline)
		}

		line, err := reader.ReadString('\n')
		if err != nil {
			// Проверяем, не отменен ли контекст
			select {
			case <-readCtx.Done():
				return readCtx.Err()
			default:
			}

			// Проверяем таймаут
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				// Таймаут - продолжаем читать
				continue
			}

			c.mu.Lock()
			c.lastError = err.Error()
			c.connected = false
			c.mu.Unlock()

			c.logger.Error("ошибка чтения логов", "error", err)
			return fmt.Errorf("read logs: %w", err)
		}

		if len(line) > 0 && callback != nil {
			callback(line)
		}
	}
}

// StartReadingWithReconnect запускает чтение логов с автоматическим переподключением
func (c *Client) StartReadingWithReconnect(ctx context.Context, callback LogCallback) {
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()

		for {
			select {
			case <-ctx.Done():
				c.logger.Info("stopping log reader")
				return
			default:
			}

			// Подключаемся если не подключены
			if !c.IsConnected() {
				if err := c.Connect(); err != nil {
					c.mu.Lock()
					c.reconnectCount++
					c.mu.Unlock()

					c.logger.Warn("reconnect failed, retrying",
						"error", err,
						"delay", c.config.ReconnectDelay,
						"count", c.reconnectCount)

					select {
					case <-ctx.Done():
						return
					case <-time.After(time.Duration(c.config.ReconnectDelay) * time.Millisecond):
						continue
					}
				}
			}

			// Читаем логи
			if err := c.ReadLogs(ctx, callback); err != nil {
				if ctx.Err() != nil {
					// Контекст отменен - выходим
					return
				}

				c.logger.Warn("log reading stopped, will reconnect",
					"error", err,
					"delay", c.config.ReconnectDelay)

				// Закрываем соединение перед переподключением
				c.Disconnect()

				select {
				case <-ctx.Done():
					return
				case <-time.After(time.Duration(c.config.ReconnectDelay) * time.Millisecond):
					continue
				}
			}
		}
	}()
}

// Wait ожидает завершения всех горутин
func (c *Client) Wait() {
	c.wg.Wait()
}

// Close закрывает клиент и освобождает ресурсы
func (c *Client) Close() {
	c.Disconnect()
	c.Wait()
}

// SetFilter устанавливает фильтр логов (отправляет cmdFilterMode)
func (c *Client) SetFilter(logname string) error {
	return c.SendCommand(CmdFilterMode, 0, logname)
}

// SetLogLevel устанавливает уровень логирования
func (c *Client) SetLogLevel(level LogLevel, logname string) error {
	return c.SendCommand(CmdSetLevel, uint32(level), logname)
}

// AddLogLevel добавляет уровень логирования
func (c *Client) AddLogLevel(level LogLevel, logname string) error {
	return c.SendCommand(CmdAddLevel, uint32(level), logname)
}

// DelLogLevel удаляет уровень логирования
func (c *Client) DelLogLevel(level LogLevel, logname string) error {
	return c.SendCommand(CmdDelLevel, uint32(level), logname)
}

// RequestList запрашивает список логов
func (c *Client) RequestList(logname string) error {
	return c.SendCommand(CmdList, 0, logname)
}
