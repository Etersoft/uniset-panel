package api

import (
	"errors"
	"sync"
	"time"
)

var (
	ErrInvalidToken     = errors.New("invalid token")
	ErrControlTaken     = errors.New("control already taken by another session")
	ErrNotController    = errors.New("not the controller")
	ErrControlDisabled  = errors.New("control is disabled")
)

// ControlStatus представляет статус управления для UI
type ControlStatus struct {
	Enabled       bool `json:"enabled"`       // включён ли контроль токенами
	HasController bool `json:"hasController"` // есть активный контроллер
	IsController  bool `json:"isController"`  // запрашивающий является контроллером
	TimeoutSec    int  `json:"timeoutSec"`    // таймаут в секундах
}

// ControlManager управляет сессиями контроля
type ControlManager struct {
	mu             sync.RWMutex
	tokens         map[string]bool // множество валидных токенов
	activeToken    string          // токен активной сессии (пустой = свободно)
	lastActivity   time.Time       // время последней активности
	timeout        time.Duration   // таймаут неактивности
	sseHub         *SSEHub         // для уведомлений
	stopChan       chan struct{}   // для остановки goroutine
	pendingRelease *time.Timer     // таймер отложенного освобождения
}

// NewControlManager создаёт новый менеджер контроля
func NewControlManager(tokens []string, timeout time.Duration, hub *SSEHub) *ControlManager {
	tokenSet := make(map[string]bool)
	for _, t := range tokens {
		if t != "" {
			tokenSet[t] = true
		}
	}

	m := &ControlManager{
		tokens:   tokenSet,
		timeout:  timeout,
		sseHub:   hub,
		stopChan: make(chan struct{}),
	}

	// Запускаем проверку таймаута только если контроль включён
	if m.IsEnabled() {
		go m.startTimeoutChecker()
	}

	return m
}

// IsEnabled возвращает true если контроль токенами включён
func (m *ControlManager) IsEnabled() bool {
	return len(m.tokens) > 0
}

// IsValidToken проверяет валидность токена
func (m *ControlManager) IsValidToken(token string) bool {
	if !m.IsEnabled() {
		return false
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.tokens[token]
}

// TakeControl пытается захватить управление
func (m *ControlManager) TakeControl(token string) error {
	if !m.IsEnabled() {
		return ErrControlDisabled
	}

	if !m.IsValidToken(token) {
		return ErrInvalidToken
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Отменяем отложенное освобождение если есть (для переподключения)
	if m.pendingRelease != nil {
		m.pendingRelease.Stop()
		m.pendingRelease = nil
	}

	// Проверяем, не занято ли управление другим токеном
	if m.activeToken != "" && m.activeToken != token {
		// Проверяем таймаут
		if time.Since(m.lastActivity) < m.timeout {
			return ErrControlTaken
		}
		// Таймаут истёк, освобождаем
	}

	m.activeToken = token
	m.lastActivity = time.Now()

	// Уведомляем всех клиентов
	m.broadcastStatus()

	return nil
}

// ReleaseControl освобождает управление
func (m *ControlManager) ReleaseControl(token string) error {
	if !m.IsEnabled() {
		return ErrControlDisabled
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.activeToken != token {
		return ErrNotController
	}

	m.activeToken = ""
	m.lastActivity = time.Time{}

	// Уведомляем всех клиентов
	m.broadcastStatus()

	return nil
}

// ReleaseBySSE освобождает управление при отключении SSE клиента
// Использует grace period 3 секунды для переподключения
func (m *ControlManager) ReleaseBySSE(token string) {
	if !m.IsEnabled() {
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.activeToken != token {
		return
	}

	// Отменяем предыдущий таймер если был
	if m.pendingRelease != nil {
		m.pendingRelease.Stop()
	}

	// Запускаем отложенное освобождение через 3 секунды
	m.pendingRelease = time.AfterFunc(3*time.Second, func() {
		m.mu.Lock()
		defer m.mu.Unlock()

		// Проверяем что токен не изменился (клиент не переподключился)
		if m.activeToken == token {
			m.activeToken = ""
			m.lastActivity = time.Time{}
			m.pendingRelease = nil
			m.broadcastStatus()
		}
	})
}

// CancelPendingRelease отменяет отложенное освобождение для токена
// Вызывается при переподключении SSE клиента
func (m *ControlManager) CancelPendingRelease(token string) {
	if !m.IsEnabled() || token == "" {
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Отменяем только если это тот же токен что и активный
	if m.activeToken == token && m.pendingRelease != nil {
		m.pendingRelease.Stop()
		m.pendingRelease = nil
	}
}

// IsController проверяет, является ли токен активным контроллером
func (m *ControlManager) IsController(token string) bool {
	if !m.IsEnabled() {
		return true // если контроль отключён, все могут управлять
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.activeToken == token && token != ""
}

// HasController возвращает true если есть активный контроллер
func (m *ControlManager) HasController() bool {
	if !m.IsEnabled() {
		return false
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.activeToken != ""
}

// GetStatus возвращает статус контроля для указанного токена
func (m *ControlManager) GetStatus(token string) ControlStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return ControlStatus{
		Enabled:       m.IsEnabled(),
		HasController: m.activeToken != "",
		IsController:  m.activeToken == token && token != "",
		TimeoutSec:    int(m.timeout.Seconds()),
	}
}

// Touch обновляет время последней активности
func (m *ControlManager) Touch(token string) {
	if !m.IsEnabled() {
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.activeToken == token {
		m.lastActivity = time.Now()
	}
}

// Stop останавливает goroutine проверки таймаута
func (m *ControlManager) Stop() {
	m.mu.Lock()
	if m.pendingRelease != nil {
		m.pendingRelease.Stop()
		m.pendingRelease = nil
	}
	m.mu.Unlock()
	close(m.stopChan)
}

// startTimeoutChecker запускает периодическую проверку таймаута
func (m *ControlManager) startTimeoutChecker() {
	ticker := time.NewTicker(m.timeout / 2) // проверяем в 2 раза чаще чем таймаут
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			m.checkTimeout()
		case <-m.stopChan:
			return
		}
	}
}

// checkTimeout проверяет и освобождает управление при таймауте
func (m *ControlManager) checkTimeout() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.activeToken == "" {
		return
	}

	if time.Since(m.lastActivity) >= m.timeout {
		m.activeToken = ""
		m.lastActivity = time.Time{}
		m.broadcastStatus()
	}
}

// broadcastStatus отправляет статус всем SSE клиентам
// Вызывается под блокировкой mu
func (m *ControlManager) broadcastStatus() {
	if m.sseHub == nil {
		return
	}

	// Отправляем событие control_status
	status := ControlStatus{
		Enabled:       m.IsEnabled(),
		HasController: m.activeToken != "",
		IsController:  false, // каждый клиент сам определит
		TimeoutSec:    int(m.timeout.Seconds()),
	}

	m.sseHub.BroadcastControlStatus(status)
}
