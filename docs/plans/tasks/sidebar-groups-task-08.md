# Task: Quality Assurance

Metadata:
- Dependencies: All previous tasks (01-07) and all phase completions
- Provides: Final quality verification
- Size: Verification only (no new code)

## Implementation Content
Final quality verification: ensure all acceptance criteria from the Design Doc are met, all tests pass, backward compatibility is verified, and code quality standards are maintained.

## Target Files
- No new files. Review all files created/modified in tasks 01-07.

## Verification Steps

### 1. Design Doc Acceptance Criteria
- [ ] FR1: YAML config with items, patterns, `@serverId`, malformed pattern handling
- [ ] FR2: API returns groups or null
- [ ] FR3: Dynamic group rendering, legacy mode, type badges, SSE status updates
- [ ] FR4: "Other" group for ungrouped entities
- [ ] FR5: Group collapse persistence
- [ ] FR6: Backward compatibility (no config = current behavior)
- [ ] FR7: Type badges and status indicators
- [ ] FR8: Group order matches YAML
- [ ] FR9: `group_by_type` sub-sections

### 2. Backend Tests
- [ ] Run `go test ./...` -- all tests pass
- [ ] Run `go vet ./...` -- no issues

### 3. Build
- [ ] Run `make build` -- successful build

### 4. E2E Tests
- [ ] Run `make js-tests` -- all E2E tests pass (both modes)

### 5. Backward Compatibility
- [ ] Start without sidebar config -- all existing E2E tests pass
- [ ] Legacy sidebar rendering identical to current behavior
- [ ] Existing localStorage settings unaffected

### 6. Error Handling
- [ ] Malformed patterns logged at startup, not crashing
- [ ] API failure degrades to legacy mode on frontend

### 7. Code Review Checklist
- [ ] `escapeHtml()` on all user-facing strings in sidebar groups
- [ ] CSS variables used (not hardcoded colors)
- [ ] No `document.getElementById()` misuse for tab-scoped elements
- [ ] Proper console logging per Design Doc specification
- [ ] No commented-out code or debug statements left
- [ ] Godoc comments on all exported Go functions

## Completion Criteria
- [ ] All acceptance criteria from Design Doc satisfied (FR1-FR9)
- [ ] `go test ./...` passes
- [ ] `go vet ./...` passes
- [ ] `make build` succeeds
- [ ] `make js-tests` passes
- [ ] No regressions in legacy mode
- [ ] Operation verified: L1 (full functional verification)

## Notes
- This task produces no new code -- it is a verification-only step
- If issues are found, fix them and create a new commit (do not amend previous task commits)
- Impact scope: All files from tasks 01-07
