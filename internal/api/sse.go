package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"log/slog"

	"github.com/pv/uniset-panel/internal/ionc"
	"github.com/pv/uniset-panel/internal/journal"
	"github.com/pv/uniset-panel/internal/launcher"
	"github.com/pv/uniset-panel/internal/modbus"
	"github.com/pv/uniset-panel/internal/opcua"
	"github.com/pv/uniset-panel/internal/sm"
	"github.com/pv/uniset-panel/internal/trace"
	"github.com/pv/uniset-panel/internal/uniset"
	"github.com/pv/uniset-panel/internal/uwsgate"
)

// SSE defaults
const (
	sseEventBufferSize = 50               // размер буфера канала событий на клиента
	sseHeartbeatInterval = 25 * time.Second // интервал heartbeat для keep-alive
)

// SSE event types
const (
	EventObjectData         = "object_data"
	EventObjectsList        = "objects_list"
	EventServerStatus       = "server_status"
	EventSensorData         = "sensor_data"
	EventControlStatus      = "control_status"
	EventConnected          = "connected"
	EventIONCSensorBatch    = "ionc_sensor_batch"
	EventModbusRegisterBatch = "modbus_register_batch"
	EventOPCUASensorBatch   = "opcua_sensor_batch"
	EventUWSGateSensorBatch = "uwsgate_sensor_batch"
	EventLauncherStatus     = "launcher_status"
	EventLauncherConnection = "launcher_connection"
	EventJournalMessages    = "journal_messages"
	EventJournalConnection  = "journal_connection"
	EventTrace              = "trace"
)

// SSEHub управляет SSE подключениями клиентов
type SSEHub struct {
	mu         sync.RWMutex
	clients    map[*sseClient]bool
	controlMgr *ControlManager // для освобождения контроля при отключении
}

type sseClient struct {
	objectName   string         // если пусто - получает все события
	controlToken string         // токен контроля (если клиент контроллер)
	traceOnly    bool           // если true - получает только trace события (и ничего другого)
	connectedAt  time.Time      // время подключения (для логирования)
	events       chan SSEEvent
	done         chan struct{}
}

// SSEEvent представляет событие для отправки клиенту
type SSEEvent struct {
	Type       string      `json:"type"` // "object_data", "object_list", "server_status", "error"
	ServerID   string      `json:"serverId,omitempty"`
	ServerName string      `json:"serverName,omitempty"`
	ObjectName string      `json:"objectName,omitempty"`
	Data       interface{} `json:"data,omitempty"`
	Timestamp  time.Time   `json:"timestamp"`
}

// NewSSEHub создаёт новый SSE hub
func NewSSEHub() *SSEHub {
	return &SSEHub{
		clients: make(map[*sseClient]bool),
	}
}

// SetControlManager устанавливает менеджер контроля (для освобождения при отключении)
func (h *SSEHub) SetControlManager(mgr *ControlManager) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.controlMgr = mgr
}

// AddClient добавляет нового SSE клиента
func (h *SSEHub) AddClient(objectName string) *sseClient {
	return h.AddClientWithToken(objectName, "")
}

// AddClientWithToken добавляет нового SSE клиента с токеном контроля
func (h *SSEHub) AddClientWithToken(objectName, controlToken string) *sseClient {
	client := &sseClient{
		objectName:   objectName,
		controlToken: controlToken,
		connectedAt:  time.Now(),
		events:       make(chan SSEEvent, sseEventBufferSize),
		done:         make(chan struct{}),
	}

	h.mu.Lock()
	h.clients[client] = true
	controlMgr := h.controlMgr
	h.mu.Unlock()

	// Если клиент переподключается с токеном, отменяем отложенное освобождение
	if controlToken != "" && controlMgr != nil {
		controlMgr.CancelPendingRelease(controlToken)
	}

	slog.Debug("SSE client connected", "object", objectName, "hasToken", controlToken != "", "total_clients", len(h.clients))
	return client
}

// AddTraceClient добавляет нового SSE клиента, который получает ТОЛЬКО trace события
// (и не получает object_data, ionc_sensor_batch и другие потоки).
// objectName задаёт фильтр по объекту; если пусто - клиент получит все trace события.
func (h *SSEHub) AddTraceClient(objectName string) *sseClient {
	client := &sseClient{
		objectName:  objectName,
		traceOnly:   true,
		connectedAt: time.Now(),
		events:      make(chan SSEEvent, sseEventBufferSize),
		done:        make(chan struct{}),
	}

	h.mu.Lock()
	h.clients[client] = true
	h.mu.Unlock()

	slog.Debug("SSE trace client connected", "object", objectName, "total_clients", len(h.clients))
	return client
}

// RemoveClient удаляет SSE клиента
func (h *SSEHub) RemoveClient(client *sseClient) {
	h.mu.Lock()
	delete(h.clients, client)
	controlMgr := h.controlMgr
	h.mu.Unlock()

	// Close done channel (avoid panic on double close)
	select {
	case <-client.done:
		// already closed
	default:
		close(client.done)
	}

	// Если клиент был контроллером, освобождаем управление
	if client.controlToken != "" && controlMgr != nil {
		controlMgr.ReleaseBySSE(client.controlToken)
		slog.Debug("SSE client disconnected, released control", "object", client.objectName)
	}

	duration := time.Since(client.connectedAt).Round(time.Second)
	slog.Debug("SSE client disconnected", "object", client.objectName, "duration", duration, "total_clients", len(h.clients))
}

// Broadcast отправляет событие всем подходящим клиентам
func (h *SSEHub) Broadcast(event SSEEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	// Глобальные события отправляются всем клиентам
	isGlobalEvent := event.Type == EventServerStatus || event.Type == EventObjectsList || event.Type == EventControlStatus ||
		event.Type == EventLauncherStatus || event.Type == EventLauncherConnection || event.Type == EventJournalConnection

	isTraceEvent := event.Type == EventTrace

	for client := range h.clients {
		// trace-only клиент получает ТОЛЬКО trace события; обычный - всё КРОМЕ trace.
		if client.traceOnly {
			if !isTraceEvent {
				continue
			}
		} else {
			if isTraceEvent {
				continue
			}
		}

		// Отправляем если: глобальное событие ИЛИ клиент подписан на все объекты ИЛИ на конкретный
		if isGlobalEvent || client.objectName == "" || client.objectName == event.ObjectName {
			select {
			case client.events <- event:
			default:
				// Канал переполнен, пропускаем событие
				slog.Warn("SSE client event buffer full, dropping event",
					"object", client.objectName)
			}
		}
	}
}

// BroadcastObjectDataWithServer отправляет данные объекта с информацией о сервере
func (h *SSEHub) BroadcastObjectDataWithServer(serverID, serverName, objectName string, data *uniset.ObjectData) {
	h.Broadcast(SSEEvent{
		Type:       EventObjectData,
		ServerID:   serverID,
		ServerName: serverName,
		ObjectName: objectName,
		Data:       data,
		Timestamp:  time.Now(),
	})
}

// BroadcastServerStatus отправляет изменение статуса сервера
func (h *SSEHub) BroadcastServerStatus(serverID, serverName string, connected bool, lastError string) {
	h.Broadcast(SSEEvent{
		Type:       EventServerStatus,
		ServerID:   serverID,
		ServerName: serverName,
		Data: map[string]interface{}{
			"connected": connected,
			"lastError": lastError,
		},
		Timestamp: time.Now(),
	})
}

// BroadcastObjectsList отправляет обновлённый список объектов (при восстановлении связи)
func (h *SSEHub) BroadcastObjectsList(serverID, serverName string, objects []string) {
	h.Broadcast(SSEEvent{
		Type:       EventObjectsList,
		ServerID:   serverID,
		ServerName: serverName,
		Data: map[string]interface{}{
			"objects":   objects,
			"connected": true,
		},
		Timestamp: time.Now(),
	})
}

// SharedMemoryServerID - идентификатор сервера для SharedMemory событий
const SharedMemoryServerID = "sm"

// BroadcastSensorUpdate отправляет обновление внешнего датчика клиентам
func (h *SSEHub) BroadcastSensorUpdate(update sm.SensorUpdate) {
	h.Broadcast(SSEEvent{
		Type:       EventSensorData,
		ServerID:   SharedMemoryServerID,
		ObjectName: update.ObjectName,
		Data:       update.Sensor,
		Timestamp:  update.Timestamp,
	})
}

// broadcastBatchUpdates группирует updates по objectName и отправляет per-object SSE события.
func broadcastBatchUpdates[U any, D any](
	h *SSEHub, serverID, serverName, eventType string,
	updates []U,
	extract func(U) (objectName string, data D, ts time.Time),
) {
	if len(updates) == 0 {
		return
	}

	byObject := make(map[string][]D)
	var timestamp time.Time

	for _, u := range updates {
		obj, data, ts := extract(u)
		byObject[obj] = append(byObject[obj], data)
		timestamp = ts
	}

	for objectName, items := range byObject {
		h.Broadcast(SSEEvent{
			Type:       eventType,
			ServerID:   serverID,
			ServerName: serverName,
			ObjectName: objectName,
			Data:       items,
			Timestamp:  timestamp,
		})
	}
}

// BroadcastIONCSensorBatchWithServer отправляет батч обновлений IONC датчиков с информацией о сервере
func (h *SSEHub) BroadcastIONCSensorBatchWithServer(serverID, serverName string, updates []ionc.SensorUpdate) {
	broadcastBatchUpdates(h, serverID, serverName, EventIONCSensorBatch, updates,
		func(u ionc.SensorUpdate) (string, uniset.IONCSensor, time.Time) {
			return u.ObjectName, u.Sensor, u.Timestamp
		})
}

// BroadcastModbusRegisterBatchWithServer отправляет батч обновлений Modbus регистров с информацией о сервере
func (h *SSEHub) BroadcastModbusRegisterBatchWithServer(serverID, serverName string, updates []modbus.RegisterUpdate) {
	broadcastBatchUpdates(h, serverID, serverName, EventModbusRegisterBatch, updates,
		func(u modbus.RegisterUpdate) (string, uniset.MBRegister, time.Time) {
			return u.ObjectName, u.Register, u.Timestamp
		})
}

// BroadcastOPCUASensorBatchWithServer отправляет батч обновлений OPC UA датчиков с информацией о сервере
func (h *SSEHub) BroadcastOPCUASensorBatchWithServer(serverID, serverName string, updates []opcua.SensorUpdate) {
	broadcastBatchUpdates(h, serverID, serverName, EventOPCUASensorBatch, updates,
		func(u opcua.SensorUpdate) (string, opcua.OPCUASensor, time.Time) {
			return u.ObjectName, u.Sensor, u.Timestamp
		})
}

// BroadcastUWSGateSensorBatchWithServer отправляет батч обновлений UWebSocketGate датчиков с информацией о сервере
func (h *SSEHub) BroadcastUWSGateSensorBatchWithServer(serverID, serverName string, updates []uwsgate.SensorUpdate) {
	broadcastBatchUpdates(h, serverID, serverName, EventUWSGateSensorBatch, updates,
		func(u uwsgate.SensorUpdate) (string, uwsgate.SensorData, time.Time) {
			return u.ObjectName, u.Sensor, u.Timestamp
		})
}

// BroadcastTraceBatch отправляет батч trace-записей (dispatch-trace) для конкретного UObject.
// Доставляется только клиентам, зарегистрированным через AddTraceClient.
func (h *SSEHub) BroadcastTraceBatch(serverID, serverName, objectName string, batch trace.TraceBatch) {
	h.Broadcast(SSEEvent{
		Type:       EventTrace,
		ServerID:   serverID,
		ServerName: serverName,
		ObjectName: objectName,
		Data:       batch,
		Timestamp:  time.Now(),
	})
}

// ClientCount возвращает количество подключённых клиентов
func (h *SSEHub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// Close закрывает все SSE соединения (для graceful shutdown)
func (h *SSEHub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()

	for client := range h.clients {
		select {
		case <-client.done:
			// already closed
		default:
			close(client.done)
		}
	}
	h.clients = make(map[*sseClient]bool)

	slog.Info("SSE hub closed, all clients disconnected")
}

// BroadcastControlStatus отправляет статус контроля всем клиентам
func (h *SSEHub) BroadcastControlStatus(status ControlStatus) {
	h.Broadcast(SSEEvent{
		Type:      EventControlStatus,
		Data:      status,
		Timestamp: time.Now(),
	})
}

// UpdateClientControlToken обновляет токен контроля для клиента
func (h *SSEHub) UpdateClientControlToken(client *sseClient, token string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, exists := h.clients[client]; exists {
		client.controlToken = token
	}
}

// BroadcastLauncherStatus отправляет статус Launcher'а
func (h *SSEHub) BroadcastLauncherStatus(nodeID, nodeName string, status *launcher.LauncherStatus) {
	h.Broadcast(SSEEvent{
		Type:       EventLauncherStatus,
		ServerID:   nodeID,
		ServerName: nodeName,
		Data:       status,
		Timestamp:  time.Now(),
	})
}

// BroadcastLauncherConnection отправляет изменение connectivity Launcher'а
func (h *SSEHub) BroadcastLauncherConnection(nodeID, nodeName string, connected bool, lastError string) {
	h.Broadcast(SSEEvent{
		Type:       EventLauncherConnection,
		ServerID:   nodeID,
		ServerName: nodeName,
		Data: map[string]interface{}{
			"connected": connected,
			"lastError": lastError,
		},
		Timestamp: time.Now(),
	})
}

// BroadcastJournalMessages отправляет новые сообщения журнала
func (h *SSEHub) BroadcastJournalMessages(journalID string, messages []journal.Message) {
	if len(messages) == 0 {
		return
	}
	h.Broadcast(SSEEvent{
		Type: EventJournalMessages,
		Data: map[string]interface{}{
			"journalId": journalID,
			"messages":  messages,
		},
		Timestamp: time.Now(),
	})
}

// BroadcastJournalConnection отправляет изменение connectivity журнала
func (h *SSEHub) BroadcastJournalConnection(journalID string, connected bool, lastError string) {
	h.Broadcast(SSEEvent{
		Type: EventJournalConnection,
		Data: map[string]interface{}{
			"journalId": journalID,
			"connected": connected,
			"lastError": lastError,
		},
		Timestamp: time.Now(),
	})
}

// HandleSSE обрабатывает SSE подключение
// GET /api/events?object=ObjectName&token=xxx (опционально)
func (h *Handlers) HandleSSE(w http.ResponseWriter, r *http.Request) {
	// Проверяем поддержку SSE
	flusher, ok := w.(http.Flusher)
	if !ok {
		h.writeError(w, http.StatusInternalServerError, "SSE not supported")
		return
	}

	// Получаем параметры из query
	objectName := r.URL.Query().Get("object")
	controlToken := r.URL.Query().Get("token")

	// Устанавливаем заголовки SSE
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("X-Accel-Buffering", "no") // Для nginx

	// Регистрируем клиента с токеном (если передан)
	client := h.sseHub.AddClientWithToken(objectName, controlToken)
	defer h.sseHub.RemoveClient(client)

	// Формируем данные приветственного сообщения
	connectedData := map[string]interface{}{
		"pollInterval": h.pollInterval.Milliseconds(),
		"smEnabled":    h.smPoller != nil,
	}

	// Добавляем статус контроля если менеджер настроен
	if h.controlMgr != nil {
		status := h.controlMgr.GetStatus(controlToken)
		connectedData["control"] = status
	} else {
		// Контроль отключён
		connectedData["control"] = ControlStatus{
			Enabled:       false,
			HasController: false,
			IsController:  false,
			TimeoutSec:    0,
		}
	}

	// Отправляем приветственное сообщение с capabilities и статусом контроля
	h.sendSSEEvent(w, SSEEvent{
		Type:      EventConnected,
		Timestamp: time.Now(),
		Data:      connectedData,
	})
	flusher.Flush()

	// Heartbeat для поддержания соединения (предотвращает разрыв прокси/балансировщиками)
	heartbeat := time.NewTicker(sseHeartbeatInterval)
	defer heartbeat.Stop()

	// Слушаем события
	for {
		select {
		case <-r.Context().Done():
			return
		case <-client.done:
			return
		case <-heartbeat.C:
			// SSE комментарий для keep-alive (не является событием, игнорируется клиентом)
			fmt.Fprintf(w, ": heartbeat\n\n")
			flusher.Flush()
		case event := <-client.events:
			h.sendSSEEvent(w, event)
			flusher.Flush()
		}
	}
}

// sendSSEEvent отправляет одно SSE событие
func (h *Handlers) sendSSEEvent(w http.ResponseWriter, event SSEEvent) {
	data, err := json.Marshal(event)
	if err != nil {
		slog.Error("Failed to marshal SSE event", "error", err)
		return
	}

	fmt.Fprintf(w, "event: %s\n", event.Type)
	fmt.Fprintf(w, "data: %s\n\n", data)
}
