package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/pv/uniset-panel/internal/ionc"
	"github.com/pv/uniset-panel/internal/modbus"
	"github.com/pv/uniset-panel/internal/opcua"
	"github.com/pv/uniset-panel/internal/uniset"
)

// requireObjectName extracts object name from path and writes error if missing.
// Returns empty string and false if name is missing (error already written).
func (h *Handlers) requireObjectName(w http.ResponseWriter, r *http.Request) (string, bool) {
	name := r.PathValue("name")
	if name == "" {
		h.writeError(w, http.StatusBadRequest, "object name required")
		return "", false
	}
	return name, true
}

// requireClient returns UniSet client for the request's server parameter.
// Returns nil and false if client unavailable (error already written).
func (h *Handlers) requireClient(w http.ResponseWriter, r *http.Request) (*uniset.Client, bool) {
	serverID := r.URL.Query().Get("server")
	client, statusCode, errMsg := h.getUniSetClient(serverID)
	if client == nil {
		h.writeError(w, statusCode, errMsg)
		return nil, false
	}
	return client, true
}

// decodeJSONBody decodes request body into target struct.
// Returns false if decode failed (error already written).
func (h *Handlers) decodeJSONBody(w http.ResponseWriter, r *http.Request, target interface{}) bool {
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		h.writeError(w, http.StatusBadRequest, "invalid request body")
		return false
	}
	return true
}

// getPagination extracts offset and limit from query parameters with defaults.
func getPagination(r *http.Request, defaultLimit int) (offset, limit int) {
	offset = 0
	limit = defaultLimit

	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l >= 0 {
			limit = l
		}
	}

	return offset, limit
}

// resolvePoller resolves a poller from serverMgr (by server query param) with fallback.
// fromManager may be nil if serverMgr is not configured.
func resolvePoller[T any](r *http.Request, fromManager func(string) (T, bool), fallback T) T {
	serverID := r.URL.Query().Get("server")
	if serverID != "" && fromManager != nil {
		if p, ok := fromManager(serverID); ok {
			return p
		}
	}
	return fallback
}

// requireIONCPoller returns IONC poller for the request (supports multi-server).
// Returns nil and false if unavailable (error already written).
func (h *Handlers) requireIONCPoller(w http.ResponseWriter, r *http.Request) (*ionc.Poller, bool) {
	p := h.getIONCPoller(r)
	if p == nil {
		h.writeError(w, http.StatusServiceUnavailable, "IONC poller not available")
		return nil, false
	}
	return p, true
}

// requireModbusPoller returns Modbus poller for the request (supports multi-server).
// Returns nil and false if unavailable (error already written).
func (h *Handlers) requireModbusPoller(w http.ResponseWriter, r *http.Request) (*modbus.Poller, bool) {
	p := h.getModbusPoller(r)
	if p == nil {
		h.writeError(w, http.StatusServiceUnavailable, "Modbus poller not available")
		return nil, false
	}
	return p, true
}

// requireOPCUAPoller returns OPCUA poller for the request (supports multi-server).
// Returns nil and false if unavailable (error already written).
func (h *Handlers) requireOPCUAPoller(w http.ResponseWriter, r *http.Request) (*opcua.Poller, bool) {
	p := h.getOPCUAPoller(r)
	if p == nil {
		h.writeError(w, http.StatusServiceUnavailable, "OPCUA poller not available")
		return nil, false
	}
	return p, true
}

// getIONCPoller returns IONC poller for the request without error writing.
func (h *Handlers) getIONCPoller(r *http.Request) *ionc.Poller {
	var fromMgr func(string) (*ionc.Poller, bool)
	if h.serverMgr != nil {
		fromMgr = h.serverMgr.GetIONCPoller
	}
	return resolvePoller(r, fromMgr, h.ioncPoller)
}

// getModbusPoller returns Modbus poller for the request without error writing.
func (h *Handlers) getModbusPoller(r *http.Request) *modbus.Poller {
	var fromMgr func(string) (*modbus.Poller, bool)
	if h.serverMgr != nil {
		fromMgr = h.serverMgr.GetModbusPoller
	}
	return resolvePoller(r, fromMgr, h.modbusPoller)
}

// getOPCUAPoller returns OPCUA poller for the request without error writing.
func (h *Handlers) getOPCUAPoller(r *http.Request) *opcua.Poller {
	var fromMgr func(string) (*opcua.Poller, bool)
	if h.serverMgr != nil {
		fromMgr = h.serverMgr.GetOPCUAPoller
	}
	return resolvePoller(r, fromMgr, h.opcuaPoller)
}
