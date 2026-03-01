package api

import (
	"net/http"

	"github.com/pv/uniset-panel/internal/uwsgate"
)

// ============================================================================
// UWebSocketGate Handlers
// ============================================================================

// requireUWSGatePoller returns UWSGate poller for the request.
// Returns nil and false if unavailable (error already written).
func (h *Handlers) requireUWSGatePoller(w http.ResponseWriter, r *http.Request) (*uwsgate.Poller, bool) {
	p := h.getUWSGatePollerForObject(r)
	if p == nil {
		h.writeError(w, http.StatusServiceUnavailable, "UWebSocketGate poller not available")
		return nil, false
	}
	return p, true
}

// SubscribeUWSGateSensors подписывает на датчики через UWebSocketGate
// POST /api/objects/{name}/uwsgate/subscribe
func (h *Handlers) SubscribeUWSGateSensors(w http.ResponseWriter, r *http.Request) {
	name, ok := h.requireObjectName(w, r)
	if !ok {
		return
	}

	poller, ok := h.requireUWSGatePoller(w, r)
	if !ok {
		return
	}

	var req uwsgate.SubscribeRequest
	if !h.decodeJSONBody(w, r, &req) {
		return
	}

	if len(req.Sensors) == 0 {
		h.writeError(w, http.StatusBadRequest, "no sensors specified")
		return
	}

	if err := poller.Subscribe(name, req.Sensors); err != nil {
		h.writeError(w, http.StatusInternalServerError, "subscribe failed: "+err.Error())
		return
	}

	h.writeJSON(w, map[string]any{
		"status":  "ok",
		"message": "subscribed",
	})
}

// UnsubscribeUWSGateSensors отписывает от датчиков
// POST /api/objects/{name}/uwsgate/unsubscribe
func (h *Handlers) UnsubscribeUWSGateSensors(w http.ResponseWriter, r *http.Request) {
	name, ok := h.requireObjectName(w, r)
	if !ok {
		return
	}

	poller, ok := h.requireUWSGatePoller(w, r)
	if !ok {
		return
	}

	var req uwsgate.SubscribeRequest
	if !h.decodeJSONBody(w, r, &req) {
		return
	}

	if len(req.Sensors) == 0 {
		h.writeError(w, http.StatusBadRequest, "no sensors specified")
		return
	}

	if err := poller.Unsubscribe(name, req.Sensors); err != nil {
		h.writeError(w, http.StatusInternalServerError, "unsubscribe failed: "+err.Error())
		return
	}

	h.writeJSON(w, map[string]any{
		"status":  "ok",
		"message": "unsubscribed",
	})
}

// GetUWSGateSubscriptions возвращает список подписок для объекта
// GET /api/objects/{name}/uwsgate/subscriptions
func (h *Handlers) GetUWSGateSubscriptions(w http.ResponseWriter, r *http.Request) {
	name, ok := h.requireObjectName(w, r)
	if !ok {
		return
	}

	poller, ok := h.requireUWSGatePoller(w, r)
	if !ok {
		return
	}

	subscriptions := poller.GetSubscriptions(name)

	h.writeJSON(w, map[string]any{
		"sensors": subscriptions,
	})
}

// GetUWSGateSensors возвращает текущие значения подписанных датчиков
// GET /api/objects/{name}/uwsgate/sensors
func (h *Handlers) GetUWSGateSensors(w http.ResponseWriter, r *http.Request) {
	name, ok := h.requireObjectName(w, r)
	if !ok {
		return
	}

	poller, ok := h.requireUWSGatePoller(w, r)
	if !ok {
		return
	}

	sensorData := poller.GetSensorsForObject(name)

	// Конвертируем в формат Sensor с дополнительной информацией из sensorconfig
	sensors := make([]uwsgate.Sensor, 0, len(sensorData))
	for _, data := range sensorData {
		sensor := uwsgate.Sensor{
			ID:         data.ID,
			Name:       data.Name,
			Value:      data.Value,
			Error:      data.ErrorCode(),
			Timestamp:  data.TVSec,
			SupplierID: data.SupplierID,
			Supplier:   data.Supplier,
		}

		// Дополняем информацией из sensorconfig
		if h.sensorConfig != nil {
			if info := h.sensorConfig.GetByName(data.Name); info != nil {
				sensor.IOType = string(info.IOType)
				sensor.TextName = info.TextName
				sensor.IsDiscrete = info.IOType.IsDiscrete()
				sensor.IsInput = info.IOType.IsInput()
			}
		}

		sensors = append(sensors, sensor)
	}

	h.writeJSON(w, uwsgate.SensorsResponse{
		Sensors: sensors,
	})
}

// getUWSGatePollerForObject возвращает UWSGate poller для запроса
func (h *Handlers) getUWSGatePollerForObject(r *http.Request) *uwsgate.Poller {
	if h.serverMgr != nil {
		serverID := r.URL.Query().Get("server")
		if serverID != "" {
			return h.serverMgr.GetUWSGatePoller(serverID)
		}
	}
	return nil
}
