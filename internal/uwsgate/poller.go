package uwsgate

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/pv/uniset-panel/internal/recording"
)

// BatchUpdateCallback функция для батчевых обновлений SSE
type BatchUpdateCallback func(updates []SensorUpdate)

// Poller управляет подписками на датчики UWebSocketGate
type Poller struct {
	client   *Client
	callback BatchUpdateCallback
	serverID string

	mu sync.RWMutex
	// subscriptions: objectName -> sensorName -> struct{}
	subscriptions map[string]map[string]struct{}
	// lastValues: sensorName -> valueHash (для change detection)
	lastValues map[string]string
	// currentValues: sensorName -> SensorData (текущие значения)
	currentValues map[string]SensorData

	recordingMgr *recording.Manager

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup

	logger *slog.Logger
}

// NewPoller создаёт новый Poller для UWebSocketGate
func NewPoller(baseURL string, callback BatchUpdateCallback, logger *slog.Logger) *Poller {
	if logger == nil {
		logger = slog.Default()
	}

	client := NewClient(baseURL, logger)

	p := &Poller{
		client:        client,
		callback:      callback,
		subscriptions: make(map[string]map[string]struct{}),
		lastValues:    make(map[string]string),
		currentValues: make(map[string]SensorData),
		logger:        logger.With("component", "uwsgate-poller"),
	}

	// Устанавливаем callback для данных
	client.SetOnData(p.handleData)

	return p
}

// Start запускает poller
func (p *Poller) Start(ctx context.Context) error {
	p.mu.Lock()
	p.ctx, p.cancel = context.WithCancel(ctx)
	p.mu.Unlock()

	p.logger.Info("starting UWebSocketGate poller")

	if err := p.client.Connect(ctx); err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}

	return nil
}

// Stop останавливает poller
func (p *Poller) Stop() {
	p.logger.Info("stopping UWebSocketGate poller")

	p.mu.Lock()
	if p.cancel != nil {
		p.cancel()
	}
	p.mu.Unlock()

	p.client.Close()
	p.wg.Wait()
}

// Subscribe подписывается на датчики для объекта
func (p *Poller) Subscribe(objectName string, sensorNames []string) error {
	if len(sensorNames) == 0 {
		return nil
	}

	p.mu.Lock()
	if p.subscriptions[objectName] == nil {
		p.subscriptions[objectName] = make(map[string]struct{})
	}

	newSensors := make([]string, 0)
	for _, name := range sensorNames {
		if _, exists := p.subscriptions[objectName][name]; !exists {
			p.subscriptions[objectName][name] = struct{}{}
			newSensors = append(newSensors, name)
		}
	}
	p.mu.Unlock()

	if len(newSensors) == 0 {
		return nil
	}

	p.logger.Info("subscribing to sensors",
		"object", objectName,
		"count", len(newSensors),
		"sensors", newSensors)

	return p.client.Subscribe(newSensors)
}

// Unsubscribe отписывается от датчиков
func (p *Poller) Unsubscribe(objectName string, sensorNames []string) error {
	if len(sensorNames) == 0 {
		return nil
	}

	p.mu.Lock()
	if p.subscriptions[objectName] == nil {
		p.mu.Unlock()
		return nil
	}

	toUnsubscribe := make([]string, 0)
	for _, name := range sensorNames {
		if _, exists := p.subscriptions[objectName][name]; exists {
			delete(p.subscriptions[objectName], name)
			// Проверяем, не подписан ли этот датчик для другого объекта
			stillSubscribed := false
			for _, subs := range p.subscriptions {
				if _, ok := subs[name]; ok {
					stillSubscribed = true
					break
				}
			}
			if !stillSubscribed {
				toUnsubscribe = append(toUnsubscribe, name)
				delete(p.lastValues, name)
				delete(p.currentValues, name)
			}
		}
	}

	if len(p.subscriptions[objectName]) == 0 {
		delete(p.subscriptions, objectName)
	}
	p.mu.Unlock()

	if len(toUnsubscribe) == 0 {
		return nil
	}

	p.logger.Info("unsubscribing from sensors",
		"object", objectName,
		"count", len(toUnsubscribe),
		"sensors", toUnsubscribe)

	return p.client.Unsubscribe(toUnsubscribe)
}

// UnsubscribeAll отписывается от всех датчиков объекта
func (p *Poller) UnsubscribeAll(objectName string) error {
	p.mu.RLock()
	subs, exists := p.subscriptions[objectName]
	if !exists {
		p.mu.RUnlock()
		return nil
	}

	sensorNames := make([]string, 0, len(subs))
	for name := range subs {
		sensorNames = append(sensorNames, name)
	}
	p.mu.RUnlock()

	return p.Unsubscribe(objectName, sensorNames)
}

// GetSubscriptions возвращает подписки объекта
func (p *Poller) GetSubscriptions(objectName string) []string {
	p.mu.RLock()
	defer p.mu.RUnlock()

	subs, exists := p.subscriptions[objectName]
	if !exists {
		return []string{}
	}

	result := make([]string, 0, len(subs))
	for name := range subs {
		result = append(result, name)
	}
	return result
}

// GetAllSubscriptions возвращает все подписки
func (p *Poller) GetAllSubscriptions() map[string][]string {
	p.mu.RLock()
	defer p.mu.RUnlock()

	result := make(map[string][]string)
	for objectName, subs := range p.subscriptions {
		names := make([]string, 0, len(subs))
		for name := range subs {
			names = append(names, name)
		}
		result[objectName] = names
	}
	return result
}

// GetCurrentValue возвращает текущее значение датчика
func (p *Poller) GetCurrentValue(sensorName string) (SensorData, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()

	data, exists := p.currentValues[sensorName]
	return data, exists
}

// GetSensorsForObject возвращает текущие значения датчиков для объекта
func (p *Poller) GetSensorsForObject(objectName string) []SensorData {
	p.mu.RLock()
	defer p.mu.RUnlock()

	subs, exists := p.subscriptions[objectName]
	if !exists {
		return []SensorData{}
	}

	result := make([]SensorData, 0, len(subs))
	for name := range subs {
		if data, ok := p.currentValues[name]; ok {
			result = append(result, data)
		}
	}
	return result
}

// handleData обрабатывает входящие данные от WebSocket
func (p *Poller) handleData(data []SensorData) {
	if len(data) == 0 {
		return
	}

	p.mu.Lock()

	// Группируем обновления по objectName
	updatesByObject := make(map[string][]SensorUpdate)
	now := time.Now()

	for _, sensor := range data {
		// Сохраняем текущее значение
		p.currentValues[sensor.Name] = sensor

		// Change detection
		valueHash := fmt.Sprintf("%d|%d", sensor.Value, sensor.ErrorCode())
		if p.lastValues[sensor.Name] == valueHash {
			continue // Значение не изменилось
		}
		p.lastValues[sensor.Name] = valueHash

		// Находим все объекты, подписанные на этот датчик
		for objectName, subs := range p.subscriptions {
			if _, exists := subs[sensor.Name]; exists {
				update := SensorUpdate{
					ObjectName: objectName,
					Sensor:     sensor,
					Timestamp:  now,
				}
				updatesByObject[objectName] = append(updatesByObject[objectName], update)
			}
		}

		// Recording
		if p.recordingMgr != nil {
			// Используем первый найденный objectName для записи
			for objName := range p.subscriptions {
				if _, exists := p.subscriptions[objName][sensor.Name]; exists {
					p.recordingMgr.Save(p.serverID, objName, "ws:"+sensor.Name, sensor.Value, now)
					break
				}
			}
		}
	}

	p.mu.Unlock()

	// Вызываем callback с обновлениями
	if p.callback != nil {
		// Собираем все обновления в один batch
		allUpdates := make([]SensorUpdate, 0)
		for _, updates := range updatesByObject {
			allUpdates = append(allUpdates, updates...)
		}
		if len(allUpdates) > 0 {
			p.callback(allUpdates)
		}
	}
}

// SetServerID устанавливает ID сервера
func (p *Poller) SetServerID(id string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.serverID = id
}

// SetRecordingManager устанавливает менеджер записи
func (p *Poller) SetRecordingManager(mgr *recording.Manager) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.recordingMgr = mgr
}

// IsConnected возвращает статус подключения
func (p *Poller) IsConnected() bool {
	return p.client.IsConnected()
}

// GetClient возвращает WebSocket клиент
func (p *Poller) GetClient() *Client {
	return p.client
}
