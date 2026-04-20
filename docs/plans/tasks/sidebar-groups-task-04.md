# Task: API endpoint, config propagation, and entity collection

Metadata:
- Dependencies: task-03 (resolver must be implemented)
- Provides: `GET /api/sidebar` endpoint returning resolved groups
- Size: Medium (5 files)

## Implementation Content
Wire the sidebar resolver into the application:
1. Propagate `SidebarConfig` from YAML to `Config` struct in `config.go`
2. Create `handlers_sidebar.go` with `GetSidebar()` handler
3. Add `sidebarGroups` field + setter to `Handlers` struct
4. Register `GET /api/sidebar` route in `server.go`
5. Collect entities from all managers in `main.go`, call `Resolve()`, pass to handlers

## Target Files
- [ ] `internal/config/config.go`
- [ ] `internal/api/handlers.go`
- [ ] `internal/api/handlers_sidebar.go` (new)
- [ ] `internal/api/server.go`
- [ ] `cmd/server/main.go`

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase
- [ ] Review existing code: `Config` struct, `Handlers` struct, `setupRoutes()`, `main.go` initialization sequence
- [ ] Plan integration points

### 2. Green Phase

#### 2a. Config propagation (`internal/config/config.go`)
- [ ] Add `Sidebar *SidebarConfig` field to `Config` struct (pointer, nil = legacy mode)
- [ ] In `Parse()`, after loading YAML config, add: `cfg.Sidebar = yamlConfig.Sidebar`
- [ ] Verify compilation: `go build ./...`

#### 2b. Handler setup (`internal/api/handlers.go` + `handlers_sidebar.go`)
- [ ] Add to `Handlers` struct in `handlers.go`:
  ```go
  sidebarGroups []sidebar.SidebarGroup
  ```
- [ ] Add setter method in `handlers.go`:
  ```go
  func (h *Handlers) SetSidebarGroups(groups []sidebar.SidebarGroup) {
      h.sidebarGroups = groups
  }
  ```
- [ ] Add import for `github.com/pv/uniset-panel/internal/sidebar`
- [ ] Create `internal/api/handlers_sidebar.go`:
  ```go
  func (h *Handlers) GetSidebar(w http.ResponseWriter, r *http.Request) {
      if h.sidebarGroups == nil {
          h.writeJSON(w, map[string]interface{}{"groups": nil})
          return
      }
      h.writeJSON(w, map[string]interface{}{"groups": h.sidebarGroups})
  }
  ```

#### 2c. Route registration (`internal/api/server.go`)
- [ ] Add route in `setupRoutes()`:
  ```go
  s.mux.HandleFunc("GET /api/sidebar", s.handlers.GetSidebar)
  ```

#### 2d. Entity collection and resolution (`cmd/server/main.go`)
- [ ] Add import for `github.com/pv/uniset-panel/internal/sidebar`
- [ ] After all managers are initialized (after launcher, dashboard, journal setup), add entity collection:
  ```go
  // Resolve sidebar groups if configured
  if cfg.Sidebar != nil && len(cfg.Sidebar.Groups) > 0 {
      var entities []sidebar.SidebarItem
      // Collect objects from all servers
      for _, srv := range serverMgr.GetAllObjectsWithServersList() {
          // ... iterate objects, create SidebarItem{Type: "object", Name: ..., ServerID: ...}
      }
      // Collect launchers
      // Collect journals
      // Collect servers from config
      groups := sidebar.Resolve(cfg.Sidebar.Groups, entities)
      handlers.SetSidebarGroups(groups)
      slog.Info("Sidebar groups configured", "count", len(groups))
  } else {
      slog.Info("Sidebar groups not configured, using legacy mode")
  }
  ```
- [ ] Determine the correct method to get all objects with server info from `serverMgr` (check `server.Manager` API)
- [ ] Run `go build ./...` to verify compilation

### 3. Refactor Phase
- [ ] Verify `go vet ./...` passes
- [ ] Check that entity collection logic handles empty managers gracefully (nil launchers, nil journals, etc.)

## Completion Criteria
- [ ] `go build ./...` succeeds
- [ ] `go vet ./...` passes
- [ ] `go test ./...` passes (all existing + new tests)
- [ ] `GET /api/sidebar` returns `{"groups": null}` when no sidebar config
- [ ] `GET /api/sidebar` returns `{"groups": [...]}` when sidebar configured
- [ ] Operation verified: L2 (test operation verification) + L3 (build success)

## Notes
- Impact scope: Config propagation path, API handler addition, route registration, main.go initialization
- Constraints: Do not modify existing handler behavior or routes
- Entity collection requires inspecting `server.Manager` methods to find the right way to get all objects with their server IDs
- Launchers are collected from `cfg.Launchers` config (each has Name and ID)
- Journals are collected from `journalMgr.GetAllClients()` or similar method
- Servers are collected from `cfg.Servers` config (each has ID and Name)
- Dashboard entities from `dashboardMgr` are server-side dashboards; user dashboards are handled on frontend
