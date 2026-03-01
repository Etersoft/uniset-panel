package api

import (
	"net/http"

	"github.com/pv/uniset-panel/internal/dashboard"
)

// ============================================================================
// Dashboard API
// ============================================================================

// GetDashboards возвращает список всех серверных dashboard'ов
// GET /api/dashboards
func (h *Handlers) GetDashboards(w http.ResponseWriter, r *http.Request) {
	if h.dashboardMgr == nil {
		h.writeJSON(w, []dashboard.DashboardInfo{})
		return
	}

	h.writeJSON(w, h.dashboardMgr.ListInfo())
}

// GetDashboard возвращает конкретный dashboard по имени (raw JSON)
// GET /api/dashboards/{name}
func (h *Handlers) GetDashboard(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if name == "" {
		h.writeError(w, http.StatusBadRequest, "dashboard name required")
		return
	}

	if h.dashboardMgr == nil {
		h.writeError(w, http.StatusNotFound, "no dashboards configured")
		return
	}

	rawJSON, ok := h.dashboardMgr.Get(name)
	if !ok {
		h.writeError(w, http.StatusNotFound, "dashboard not found")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(rawJSON)
}
