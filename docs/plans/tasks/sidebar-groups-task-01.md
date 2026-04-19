# Task: Add SidebarConfig YAML structs

Metadata:
- Dependencies: None (foundation task)
- Provides: `SidebarGroupConfig` and `SidebarConfig` structs in `internal/config/yaml.go`
- Size: Small (1 file)

## Implementation Content
Add the YAML config structs for sidebar groups to `internal/config/yaml.go`. This adds `SidebarGroupConfig` and `SidebarConfig` types, and a `Sidebar` field on the existing `ConfigFile` struct. No behavioral changes -- just struct definitions for YAML deserialization.

## Target Files
- [ ] `internal/config/yaml.go`

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase
- [ ] Review existing `ConfigFile` struct in `internal/config/yaml.go`
- [ ] Plan struct additions per Design Doc Component 1

### 2. Green Phase
- [ ] Add `SidebarGroupConfig` struct:
  ```go
  type SidebarGroupConfig struct {
      Name        string   `yaml:"name"`
      Icon        string   `yaml:"icon,omitempty"`
      Items       []string `yaml:"items,omitempty"`
      Patterns    []string `yaml:"patterns,omitempty"`
      GroupByType bool     `yaml:"group_by_type,omitempty"`
  }
  ```
- [ ] Add `SidebarConfig` struct:
  ```go
  type SidebarConfig struct {
      Groups []SidebarGroupConfig `yaml:"groups,omitempty"`
  }
  ```
- [ ] Add `Sidebar` field to `ConfigFile`:
  ```go
  Sidebar *SidebarConfig `yaml:"sidebar,omitempty"`
  ```
- [ ] Run `go build ./...` to verify compilation

### 3. Refactor Phase
- [ ] Verify struct field ordering is consistent with existing code style
- [ ] Confirm `go vet ./...` passes

## Completion Criteria
- [ ] Structs compile without errors: `go build ./...`
- [ ] `go vet ./...` passes
- [ ] Operation verified: L3 (build success)

## Notes
- Impact scope: Only `internal/config/yaml.go` -- adding new struct types and a field
- Constraints: Do not modify any existing struct fields or behavior
- The `Sidebar` field is a pointer (`*SidebarConfig`) to allow nil detection (nil = legacy mode)
