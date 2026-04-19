package api

import (
	"errors"
	"net/http"

	"github.com/pv/uniset-panel/internal/debug"
)

// HandleSnapshot proxies uniset /<Object>/dump via debug.Client.
// GET /api/servers/{id}/objects/{name}/snapshot
func (h *Handlers) HandleSnapshot(w http.ResponseWriter, r *http.Request) {
	serverID := r.PathValue("id")
	name := r.PathValue("name")
	if serverID == "" {
		h.writeError(w, http.StatusBadRequest, "server id required")
		return
	}
	if name == "" {
		h.writeError(w, http.StatusBadRequest, "object name required")
		return
	}
	if h.debugClient == nil {
		h.writeError(w, http.StatusServiceUnavailable, "debug client not configured")
		return
	}
	snap, err := h.debugClient.Snapshot(r.Context(), serverID, name)
	if err != nil {
		h.writeError(w, mapDebugError(err), err.Error())
		return
	}
	h.writeJSON(w, snap)
}

func mapDebugError(err error) int {
	switch {
	case errors.Is(err, debug.ErrObjectNotFound):
		return http.StatusNotFound
	case errors.Is(err, debug.ErrUpstream):
		return http.StatusBadGateway
	default:
		return http.StatusServiceUnavailable
	}
}
