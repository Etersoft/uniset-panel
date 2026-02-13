package api

import (
	"context"
	"net/http"
	"time"

	"github.com/pv/uniset-panel/internal/launcher"
)

// SetLauncherManager устанавливает менеджер Launcher'ов
func (h *Handlers) SetLauncherManager(mgr *launcher.Manager) {
	h.launcherMgr = mgr
}

// GetLaunchers возвращает список Launcher'ов
// GET /api/launchers
func (h *Handlers) GetLaunchers(w http.ResponseWriter, r *http.Request) {
	if h.launcherMgr == nil {
		h.writeJSON(w, map[string]interface{}{
			"launchers": []interface{}{},
		})
		return
	}

	nodes := h.launcherMgr.ListNodes()
	result := make([]map[string]interface{}, 0, len(nodes))

	for _, node := range nodes {
		nodeInfo := map[string]interface{}{
			"id":          node.ID,
			"name":        node.Name,
			"launcherUrl": node.LauncherURL,
			"connected":   node.Poller.IsConnected(),
			"hasControl":  node.HasControl,
		}
		if status := node.Poller.GetLastStatus(); status != nil {
			nodeInfo["status"] = status
		}
		result = append(result, nodeInfo)
	}

	h.writeJSON(w, map[string]interface{}{
		"launchers": result,
	})
}

// GetLauncherStatus возвращает статус Launcher'а
// GET /api/launchers/{id}/status
func (h *Handlers) GetLauncherStatus(w http.ResponseWriter, r *http.Request) {
	node, ok := h.getLauncher(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	status, err := node.Client.GetStatus(ctx)
	if err != nil {
		h.writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	h.writeJSON(w, status)
}

// GetLauncherProcesses возвращает список процессов Launcher'а
// GET /api/launchers/{id}/processes
func (h *Handlers) GetLauncherProcesses(w http.ResponseWriter, r *http.Request) {
	node, ok := h.getLauncher(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	processes, err := node.Client.GetProcesses(ctx)
	if err != nil {
		h.writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	h.writeJSON(w, processes)
}

// GetLauncherGroups возвращает группы процессов Launcher'а
// GET /api/launchers/{id}/groups
func (h *Handlers) GetLauncherGroups(w http.ResponseWriter, r *http.Request) {
	node, ok := h.getLauncher(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	groups, err := node.Client.GetGroups(ctx)
	if err != nil {
		h.writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	h.writeJSON(w, groups)
}

// RestartLauncherProcess перезапускает процесс
// POST /api/launchers/{id}/process/{name}/restart
func (h *Handlers) RestartLauncherProcess(w http.ResponseWriter, r *http.Request) {
	node, ok := h.getLauncher(w, r)
	if !ok {
		return
	}

	processName := r.PathValue("name")
	if processName == "" {
		h.writeError(w, http.StatusBadRequest, "process name required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	if err := node.Client.RestartProcess(ctx, processName); err != nil {
		h.writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	h.writeJSON(w, map[string]string{"status": "ok", "action": "restart", "process": processName})
}

// StopLauncherProcess останавливает процесс
// POST /api/launchers/{id}/process/{name}/stop
func (h *Handlers) StopLauncherProcess(w http.ResponseWriter, r *http.Request) {
	node, ok := h.getLauncher(w, r)
	if !ok {
		return
	}

	processName := r.PathValue("name")
	if processName == "" {
		h.writeError(w, http.StatusBadRequest, "process name required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	if err := node.Client.StopProcess(ctx, processName); err != nil {
		h.writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	h.writeJSON(w, map[string]string{"status": "ok", "action": "stop", "process": processName})
}

// StartLauncherProcess запускает процесс
// POST /api/launchers/{id}/process/{name}/start
func (h *Handlers) StartLauncherProcess(w http.ResponseWriter, r *http.Request) {
	node, ok := h.getLauncher(w, r)
	if !ok {
		return
	}

	processName := r.PathValue("name")
	if processName == "" {
		h.writeError(w, http.StatusBadRequest, "process name required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	if err := node.Client.StartProcess(ctx, processName); err != nil {
		h.writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	h.writeJSON(w, map[string]string{"status": "ok", "action": "start", "process": processName})
}

// RestartAllLauncherProcesses перезапускает все процессы
// POST /api/launchers/{id}/restart-all
func (h *Handlers) RestartAllLauncherProcesses(w http.ResponseWriter, r *http.Request) {
	node, ok := h.getLauncher(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	if err := node.Client.RestartAll(ctx); err != nil {
		h.writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	h.writeJSON(w, map[string]string{"status": "ok", "action": "restart-all"})
}

// ReloadAllLauncherProcesses останавливает и перезапускает все процессы
// POST /api/launchers/{id}/reload-all
func (h *Handlers) ReloadAllLauncherProcesses(w http.ResponseWriter, r *http.Request) {
	node, ok := h.getLauncher(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	if err := node.Client.ReloadAll(ctx); err != nil {
		h.writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	h.writeJSON(w, map[string]string{"status": "ok", "action": "reload-all"})
}

// getLauncher извлекает Launcher из запроса
func (h *Handlers) getLauncher(w http.ResponseWriter, r *http.Request) (*launcher.Node, bool) {
	if h.launcherMgr == nil {
		h.writeError(w, http.StatusServiceUnavailable, "launcher not configured")
		return nil, false
	}

	launcherID := r.PathValue("id")
	if launcherID == "" {
		h.writeError(w, http.StatusBadRequest, "launcher ID required")
		return nil, false
	}

	node, exists := h.launcherMgr.GetNode(launcherID)
	if !exists {
		h.writeError(w, http.StatusNotFound, "launcher not found")
		return nil, false
	}

	return node, true
}
