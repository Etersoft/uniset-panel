# ADR: Configurable Sidebar Groups

## Status

Accepted (Implemented)

## Context

Previously, the UniSet Panel sidebar displayed entities in hardcoded sections (Launchers, Objects, Journals, Dashboards, Servers) with a fixed order. In real deployments with many UniSet2 objects across multiple servers, launchers, dashboards and journals, users need a way to logically group related items together regardless of their type (e.g., grouping all entities related to a particular subsystem like "Diesel", "Ventilation", or "Power Supply").

The current fixed sections force users to jump between sections to find related items, which degrades usability as the number of monitored entities grows.

### Constraints

- Configuration is read-only at startup (no hot-reload requirement)
- Groups must be flat (one level, no nesting)
- All entity types (objects, launchers, dashboards, journals, servers) can be mixed in a single group
- Items not matching any group must appear in an auto-generated "Прочие" group at the bottom
- No config case: without group configuration, the backend returns a single unnamed group with all entities
- Only visual grouping (no batch operations on groups)

## Decision

### Decision Details

| Item | Content |
|------|---------|
| **Decision** | Server-driven configurable sidebar groups via YAML config, delivered to frontend through a new API endpoint |
| **Why now** | The project is growing in deployment complexity with multiple servers and entity types; users need customizable navigation before the entity count makes the UI unwieldy |
| **Why this** | Server-driven config ensures all users see the same sidebar layout without manual per-browser setup, while requiring zero UI complexity for configuration management |
| **Known unknowns** | Exact glob pattern matching behavior for edge cases (overlapping patterns across groups); performance impact of pattern matching with large entity lists (100+) |
| **Kill criteria** | If the config format becomes so complex that users prefer the flat list, or if startup time increases by more than 500ms due to pattern evaluation |

## Rationale

Server-driven configuration (Option A) was selected because it provides the best balance of simplicity, consistency, and maintainability for a monitoring panel used by operations teams. The configuration lives alongside other infrastructure config, can be version-controlled, and ensures all browsers show the same layout.

### Options Considered

#### Option A: Config-driven groups (Server delivers group config, frontend renders) -- SELECTED

The server reads a `sidebar.groups` section from the YAML config at startup. A new `GET /api/sidebar` endpoint returns the evaluated group configuration including the mapping of entities to groups. The frontend replaces hardcoded sections with dynamic group rendering.

- **Pros**:
  - Consistent sidebar across all browsers/users
  - Config lives with infrastructure, version-controllable
  - No UI complexity for group management
  - Server can validate config at startup and log errors
  - Group evaluation happens once on server, not per-client
- **Cons**:
  - Requires server restart to change groups
  - No per-user customization
  - New API endpoint required

#### Option B: Frontend-only groups (localStorage config, user configures in UI)

Groups are defined entirely in the browser. Users create/edit groups through a drag-and-drop UI. Configuration stored in localStorage.

- **Pros**:
  - No server changes needed
  - Per-user customization
  - No restart required for changes
- **Cons**:
  - Different users see different layouts (confusing for operations teams)
  - Requires complex UI for group management (drag-and-drop, rename, reorder)
  - Configuration lost when clearing browser data
  - Significantly more JS code to write and maintain
  - Does not scale: new team members start with empty config

#### Option C: Hybrid (server config + UI override)

Server provides default groups, but users can override in the browser.

- **Pros**:
  - Best of both worlds conceptually
  - Sensible defaults with flexibility
- **Cons**:
  - Highest implementation complexity (3x more code)
  - Merge logic between server and local config is error-prone
  - Difficult to debug: "why does my sidebar look different?"
  - UI state conflicts when server config changes
  - Violates YAGNI: no evidence hybrid approach is needed

### Comparison Matrix

| Evaluation Axis          | Option A (Config-driven) | Option B (Frontend-only) | Option C (Hybrid) |
|--------------------------|--------------------------|--------------------------|-------------------|
| Implementation Effort    | ~3-4 days               | ~5-7 days               | ~8-10 days        |
| Consistency across users | High                    | None                    | Medium            |
| Maintainability          | High                    | Medium                  | Low               |
| Per-user customization   | None                    | Full                    | Full              |
| Config versioning        | Yes (YAML in git)       | No (localStorage)       | Partial           |
| Backward compatibility   | Full                    | Full                    | Full              |
| UI complexity added      | Minimal                 | Significant             | High              |
| Server changes required  | Moderate                | None                    | High              |
| Risk                     | Low                     | Medium                  | High              |

## Consequences

### Positive Consequences

- Users can organize sidebar items by logical subsystem across entity types
- Configuration is version-controlled alongside other infrastructure config
- All team members see the same sidebar layout
- No UI complexity for group management (aligns with monitoring panel philosophy)
- Full backward compatibility when groups are not configured

### Negative Consequences

- Server restart required to apply group changes (acceptable per requirement: config only at startup)
- No per-user sidebar customization (mitigated: operations teams benefit from consistency)

### Neutral Consequences

- New API endpoint (`GET /api/sidebar`) added
- Frontend sidebar rendering code refactored from hardcoded sections to dynamic groups
- localStorage keys for section collapse state use group-based keys (no migration from old keys, they are ignored)

## Implementation Guidance

- Use the established YAML config pattern: add `sidebar` section to `ConfigFile` struct, same parsing flow as `servers`, `launchers`, `journals`
- Group matching should support two mechanisms: explicit name lists (`items`) and glob patterns (`patterns`) matching against `{type}:{name}@{serverId}` entity identifiers
- Ungrouped entities must automatically appear in a system-generated "Прочие" group rendered last
- Frontend group rendering should reuse existing CSS patterns for section collapse/expand (`.collapsed`, collapse-icon SVG)
- Group collapse state should be persisted in localStorage using group name as key
- Preserve entity-type visual indicators within groups (type badges, status dots)
- Use dependency injection pattern: pass sidebar config to Handlers, which serves it via API

## Related Information

- Current sidebar sections: `ui/templates/index.html` (sidebar container)
- Sidebar rendering functions: `ui/static/js/src/50-ui-tabs.js`
- YAML config structure: `internal/config/yaml.go`
- Config parsing: `internal/config/config.go`
- API routing: `internal/api/server.go`
- Example config: `config/config.example.yaml`

## References

- [Starlight Sidebar Configuration](https://starlight.astro.build/reference/configuration/) - YAML-based sidebar group pattern in documentation frameworks
- [Redocly Sidebar Navigation](https://redocly.com/docs-legacy/developer-portal/configuration/sidebar-nav) - Server-driven sidebar config pattern
- [Home Assistant Sidebar Organizer](https://github.com/ngocjohn/sidebar-organizer) - Configurable sidebar grouping in monitoring UIs
- [isaacs/minimatch](https://github.com/isaacs/minimatch) - Reference glob matching implementation for pattern syntax
- [Picomatch](https://bestofjs.org/projects/picomatch) - Lightweight glob matching library
