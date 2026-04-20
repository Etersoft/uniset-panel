# Task: Add config parsing unit tests for sidebar YAML

Metadata:
- Dependencies: task-01 (SidebarConfig structs must exist)
- Provides: `internal/config/sidebar_test.go` with YAML parsing tests
- Size: Small (1 file)

## Implementation Content
Create unit tests verifying that the `sidebar.groups` YAML section is correctly parsed into the `SidebarConfig` struct. Tests cover: full config, empty sidebar section, partial config (items only, patterns only, mixed), nil sidebar.

## Target Files
- [ ] `internal/config/sidebar_test.go` (new)

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase
- [ ] Create `internal/config/sidebar_test.go`
- [ ] Write test `TestSidebarConfig_FullParsing` -- YAML with groups containing items, patterns, group_by_type, icon
- [ ] Write test `TestSidebarConfig_EmptySidebar` -- YAML with `sidebar:` but no groups -> nil Groups
- [ ] Write test `TestSidebarConfig_NoSidebar` -- YAML without sidebar section -> Sidebar is nil
- [ ] Write test `TestSidebarConfig_PartialGroups` -- groups with only items, only patterns, mixed
- [ ] Run tests: `go test -v ./internal/config/...` -- confirm tests pass (these are parsing tests, no red phase needed since structs already exist from task-01)

### 2. Green Phase
- [ ] Tests should pass immediately since task-01 added the correct struct tags
- [ ] If any test fails, fix the struct definition (unlikely, but possible for edge cases)
- [ ] Run tests and confirm all pass

### 3. Refactor Phase
- [ ] Review test helpers for reusability
- [ ] Ensure tests use literal expected values (not computed from implementation)
- [ ] Confirm `go test -v ./internal/config/...` passes

## Completion Criteria
- [ ] All tests pass: `go test -v ./internal/config/...`
- [ ] Tests cover: full parsing, empty sidebar, no sidebar, partial groups
- [ ] Operation verified: L2 (tests pass)

## Notes
- Impact scope: New test file only
- Constraints: Do not modify production code
- Tests use `yaml.Unmarshal` directly on test YAML strings to verify struct deserialization
- Test technique: create YAML string, unmarshal to ConfigFile, assert Sidebar field values
