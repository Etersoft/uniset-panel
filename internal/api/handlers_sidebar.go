package api

import (
	"net/http"

	"github.com/pv/uniset-panel/internal/sidebar"
)

// SetSidebarGroups устанавливает резолвленные группы sidebar
func (h *Handlers) SetSidebarGroups(groups []sidebar.SidebarGroup) {
	h.sidebarGroups = groups
}

// GetSidebar возвращает резолвленное дерево sidebar групп
// GET /api/sidebar
func (h *Handlers) GetSidebar(w http.ResponseWriter, r *http.Request) {
	if h.sidebarGroups == nil {
		h.writeJSON(w, map[string]interface{}{"groups": nil})
		return
	}
	h.writeJSON(w, map[string]interface{}{"groups": h.sidebarGroups})
}
