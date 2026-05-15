package api

import "net/http"

// GetObjectsByType возвращает объекты заданного uniset-типа сгруппированные по серверам.
//
//	GET /api/objects-by-type?type=IONotifyController
//
// Используется combobox'ом IONC@server в config-форме активных widget'ов.
//
// Response:
//
//	{ "type": "...", "servers": [{ serverId, serverName, connected, objects:[name,...] }, ...] }
func (h *Handlers) GetObjectsByType(w http.ResponseWriter, r *http.Request) {
	if h.serverMgr == nil {
		h.writeError(w, http.StatusServiceUnavailable, "server manager not configured")
		return
	}
	typeFilter := r.URL.Query().Get("type")
	if typeFilter == "" {
		h.writeError(w, http.StatusBadRequest, "type parameter is required")
		return
	}
	servers, err := h.serverMgr.GetAllObjectsByType(typeFilter)
	if err != nil {
		h.writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	h.writeJSON(w, map[string]interface{}{
		"type":    typeFilter,
		"servers": servers,
	})
}
