# Overall Design Document: Sidebar Groups

Generation Date: 2026-02-18
Target Plan Document: sidebar-groups-plan.md

## Project Overview

### Purpose and Goals
Implement configurable sidebar groups allowing administrators to define logical groups in YAML config that combine any entity types (objects, launchers, dashboards, journals, servers) into collapsible sidebar sections. When no config is present, the sidebar works identically to the current behavior.

### Background and Context
The sidebar currently has 5 hardcoded sections (Launchers, Objects, Journals, Dashboards, Servers) in a fixed order. In deployments with many entities across multiple servers, users need to group related items by logical subsystem (e.g., "Diesel Generator", "HVAC") regardless of entity type.

## Task Division Design

### Division Policy
Horizontal slice for backend (foundation layers first), then vertical for frontend (incremental feature delivery). Each task produces a compilable/buildable codebase. TDD approach: tests before or alongside implementation.

- Backend tasks are split by responsibility: config structs, resolver logic, API wiring
- Frontend tasks are split by functionality: state + rendering, collapse persistence, SSE updates
- Phase completion tasks verify integration at phase boundaries

### Verifiability Level Distribution
- Tasks 01-04 (backend): L2 (test operation verification)
- Tasks 05-08 (frontend): L1 (functional operation via browser) + L3 (build success)
- Phase completion tasks: L1 (end-to-end functional verification)

### Inter-task Relationship Map
```
Task 01: SidebarConfig YAML structs          -> Deliverable: internal/config/yaml.go (modified)
  |
Task 02: Config parsing unit tests           -> Deliverable: internal/config/sidebar_test.go (new)
  |
Task 03: Sidebar Resolver                    -> Deliverable: internal/sidebar/resolver.go (new)
  |                                                         internal/sidebar/resolver_test.go (new)
  |
Phase 1 Completion: Backend Config & Resolver verification
  |
Task 04: API endpoint + config propagation   -> Deliverable: internal/api/handlers_sidebar.go (new)
  |       + entity collection in main.go                    internal/api/handlers.go (modified)
  |                                                         internal/api/server.go (modified)
  |                                                         internal/config/config.go (modified)
  |                                                         cmd/server/main.go (modified)
  |
Phase 2 Completion: Backend API verification
  |
Task 05: Frontend state + loadSidebar +      -> Deliverable: ui/static/js/src/00-state.js (modified)
  |       renderSidebarGroups + CSS +                       ui/static/js/src/55-sidebar-groups.js (new)
  |       index.html container + init                       ui/static/js/src/99-init.js (modified)
  |                                                         ui/templates/index.html (modified)
  |                                                         ui/static/css/style.css (modified)
  |
Phase 3 Completion: Frontend rendering verification
  |
Task 06: Group collapse state persistence    -> Deliverable: ui/static/js/src/55-sidebar-groups.js (modified)
  |                                                         ui/static/js/src/53-ui-settings.js (modified)
  |
Task 07: SSE status updates in groups        -> Deliverable: ui/static/js/src/55-sidebar-groups.js (modified)
  |
Phase 4 Completion: Frontend features verification
  |
Task 08: Quality Assurance                   -> Final verification
```

### Interface Change Impact Analysis
| Existing Interface | New Interface | Conversion Required | Corresponding Task |
|-------------------|---------------|-------------------|-------------------|
| `ConfigFile` struct | `ConfigFile` + `Sidebar *SidebarConfig` | Yes (field addition) | Task 01 |
| `Config` struct | `Config` + `Sidebar *config.SidebarConfig` | Yes (field addition) | Task 04 |
| `Handlers` struct | `Handlers` + `sidebarGroups` field | Yes (field + setter) | Task 04 |
| `setupRoutes()` | `setupRoutes()` + `GET /api/sidebar` | Yes (route addition) | Task 04 |
| `saveSettings()` | `saveSettings()` + `groupCollapseState` | Yes (key addition) | Task 06 |
| `loadSettings()` | `loadSettings()` + `groupCollapseState` | Yes (key addition) | Task 06 |
| N/A | `loadSidebar()` | New function | Task 05 |
| N/A | `renderSidebarGroups()` | New function | Task 05 |
| N/A | `updateGroupEntityStatus()` | New function | Task 07 |

### Common Processing Points
- Entity identifier format `{type}:{name}@{serverId}` used in both resolver (backend) and rendering (frontend data-attributes)
- Collapse state pattern (localStorage persistence) reused from existing section collapse in `53-ui-settings.js`
- Sidebar item HTML structure reuses existing patterns (status dot, click handlers)

## Implementation Considerations

### Principles to Maintain Throughout
1. Backward compatibility: without sidebar config, all behavior remains identical
2. Server resolves tree at startup; frontend receives and renders ready-made tree
3. First-match-wins ordering for pattern matching
4. All entity names escaped with `escapeHtml()` before DOM insertion
5. CSS uses existing variables (--bg-*, --text-*, --accent-*)

### Risks and Countermeasures
- Risk: Frontend refactoring breaks existing sidebar rendering
  Countermeasure: Conditional rendering -- legacy mode uses completely unmodified code paths. Group mode uses a new container (`#sidebar-groups`)
- Risk: Glob pattern matching edge cases
  Countermeasure: Comprehensive unit tests for `matchEntity()` with Go `path.Match` semantics
- Risk: Async entity loading causes groups to render incomplete
  Countermeasure: Server resolves groups at startup after all managers initialized

### Impact Scope Management
- Allowed change scope: Config parsing, new sidebar package, API handlers, frontend sidebar rendering
- No-change areas: Tab content area, dashboard/journal view logic, SSE event types/protocol, backend polling logic, recording/charts subsystems
