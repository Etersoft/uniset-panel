# Task: Implement Sidebar Resolver with unit tests

Metadata:
- Dependencies: task-01 (SidebarGroupConfig struct must exist)
- Provides: `internal/sidebar/resolver.go` + `internal/sidebar/resolver_test.go`
- Size: Medium (2 files)

## Implementation Content
Create the sidebar resolver package with `Resolve()`, `matchEntity()`, and `buildEntityId()` functions. The resolver takes group config rules and a list of known entities, and produces resolved groups with entities assigned by first-match-wins pattern matching. Includes comprehensive unit tests.

## Target Files
- [ ] `internal/sidebar/resolver.go` (new)
- [ ] `internal/sidebar/resolver_test.go` (new)

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase
- [ ] Create `internal/sidebar/` directory
- [ ] Create `internal/sidebar/resolver_test.go` with failing tests:
  - `TestBuildEntityId` -- all entity types (object, launcher, dashboard, journal, server) with and without serverId
  - `TestMatchEntity_GlobPatterns` -- `*`, `?`, prefix, suffix, middle wildcards
  - `TestMatchEntity_ServerIdPatterns` -- pattern with `@serverId`, pattern without `@`, entity with/without serverId
  - `TestMatchEntity_MalformedPattern` -- malformed glob (e.g., `[invalid`) should not panic, return false
  - `TestResolve_ItemsMatching` -- exact name matching (case-sensitive, any type)
  - `TestResolve_PatternsMatching` -- glob pattern matching
  - `TestResolve_FirstMatchWins` -- entity in first matching group only
  - `TestResolve_OtherGroup` -- unmatched entities in auto-generated "Prochie" group
  - `TestResolve_OtherGroupOmitted` -- all entities matched, no "Other" group
  - `TestResolve_EmptyConfig` -- nil/empty config returns nil (legacy mode)
  - `TestResolve_MalformedPatternSkipped` -- malformed pattern logged and skipped, other patterns work
- [ ] Run tests: `go test -v ./internal/sidebar/...` -- confirm compilation fails (no implementation yet)

### 2. Green Phase
- [ ] Create `internal/sidebar/resolver.go` with package declaration
- [ ] Define types:
  ```go
  type SidebarItem struct {
      Type     string `json:"type"`
      Name     string `json:"name"`
      ServerID string `json:"serverId,omitempty"`
  }

  type SidebarGroup struct {
      Name        string        `json:"name"`
      Icon        string        `json:"icon,omitempty"`
      GroupByType bool          `json:"groupByType"`
      Items       []SidebarItem `json:"items"`
  }
  ```
- [ ] Implement `buildEntityId(entityType, name, serverId string) string`
- [ ] Implement `matchEntity(pattern, entityId string) bool` using `path.Match`
  - Pattern with `@`: match against full entityId
  - Pattern without `@`: match against entityId stripped of `@serverId` suffix
  - `path.Match` errors (malformed pattern): log warning, return false
- [ ] Implement `Resolve(config []config.SidebarGroupConfig, entities []SidebarItem) []SidebarGroup`
  - Track matched entities in a `map[string]bool` (keyed by entityId)
  - For each group config: create SidebarGroup, check items (exact name match, any type) then patterns (glob match)
  - For items matching: iterate entities, match by Name (case-sensitive, any entity type)
  - For patterns matching: iterate entities, build entityId, match against patterns
  - First-match-wins: skip already-matched entities
  - After all groups: collect unmatched entities into "Prochie" group (only if non-empty)
  - Return nil if config is nil or empty
- [ ] Run tests: `go test -v ./internal/sidebar/...` -- all pass

### 3. Refactor Phase
- [ ] Extract any repeated logic
- [ ] Add godoc comments to exported functions
- [ ] Confirm `go vet ./...` passes
- [ ] Confirm `go test -v ./internal/sidebar/...` still passes

## Completion Criteria
- [ ] All tests pass: `go test -v ./internal/sidebar/...`
- [ ] `buildEntityId()` correctly formats all entity types
- [ ] `matchEntity()` handles glob patterns, `@serverId`, and malformed patterns
- [ ] `Resolve()` implements first-match-wins, items matching, patterns matching, "Other" group
- [ ] Empty/nil config returns nil
- [ ] `go build ./...` and `go vet ./...` pass
- [ ] Operation verified: L2 (test operation verification)

## Notes
- Impact scope: New package `internal/sidebar/` -- no existing code modified
- Constraints: Must use `path.Match` from Go stdlib (not a third-party glob library)
- Import `github.com/pv/uniset-panel/internal/config` for `SidebarGroupConfig` type
- Use `log/slog` for warning logs on malformed patterns
- The "Other" group name in Russian: "Prochie" (per Design Doc: auto-group for unmatched entities)
