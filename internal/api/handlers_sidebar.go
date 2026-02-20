package api

import (
	"net/http"

	"github.com/pv/uniset-panel/internal/config"
	"github.com/pv/uniset-panel/internal/sidebar"
)

// SetSidebarConfig устанавливает конфигурацию sidebar
func (h *Handlers) SetSidebarConfig(cfg *config.SidebarConfig) {
	h.sidebarConfig = cfg
}

// GetSidebar возвращает резолвленное дерево sidebar групп
// Резолвит динамически при каждом запросе, чтобы отражать текущее состояние
// GET /api/sidebar
func (h *Handlers) GetSidebar(w http.ResponseWriter, r *http.Request) {
	entities := h.collectSidebarEntities()

	var groups []config.SidebarGroupConfig
	var exclude []string
	if h.sidebarConfig != nil {
		groups = h.sidebarConfig.Groups
		exclude = h.sidebarConfig.Exclude
	}

	result := sidebar.Resolve(groups, exclude, entities)
	h.writeJSON(w, map[string]interface{}{"groups": result})
}

// collectSidebarEntities собирает все известные сущности из менеджеров
func (h *Handlers) collectSidebarEntities() []sidebar.SidebarItem {
	var entities []sidebar.SidebarItem

	// Объекты со всех серверов
	if h.serverManager != nil {
		if allObjects, err := h.serverManager.GetAllObjects(); err == nil {
			for _, obj := range allObjects {
				entities = append(entities, sidebar.SidebarItem{
					Type:     "object",
					Name:     obj.ObjectName,
					ServerID: obj.ServerID,
				})
			}
		}
	}

	// Серверы
	if h.serverManager != nil {
		for _, inst := range h.serverManager.GetAllInstances() {
			displayName := inst.Config.Name
			if displayName == "" {
				displayName = inst.Config.URL
			}
			entities = append(entities, sidebar.SidebarItem{
				Type:        "server",
				Name:        inst.Config.ID,
				DisplayName: displayName,
			})
		}
	}

	// Launcher'ы
	if h.launcherMgr != nil {
		for _, node := range h.launcherMgr.ListNodes() {
			entities = append(entities, sidebar.SidebarItem{
				Type: "launcher",
				Name: node.Name,
			})
		}
	}

	// Dashboard'ы (серверные)
	if h.dashboardMgr != nil {
		for _, info := range h.dashboardMgr.ListInfo() {
			entities = append(entities, sidebar.SidebarItem{
				Type: "dashboard",
				Name: info.Name,
			})
		}
	}

	// Журналы
	if h.journalMgr != nil {
		for _, info := range h.journalMgr.GetAllInfos() {
			entities = append(entities, sidebar.SidebarItem{
				Type: "journal",
				Name: info.Name,
			})
		}
	}

	return entities
}
