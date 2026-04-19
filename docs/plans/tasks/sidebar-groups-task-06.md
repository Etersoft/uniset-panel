# Task: Group collapse state persistence

Metadata:
- Dependencies: task-05 (group rendering must work)
- Provides: Collapse state persistence across page reloads
- Size: Small (2 files)

## Implementation Content
Implement group collapse/expand toggle with state persistence in localStorage. When a user clicks a group header, the group toggles its collapsed state. This state is saved to localStorage and restored on page reload.

## Target Files
- [ ] `ui/static/js/src/55-sidebar-groups.js`
- [ ] `ui/static/js/src/53-ui-settings.js`

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase
- [ ] Review existing collapse patterns in `53-ui-settings.js` (saveSettings/loadSettings)
- [ ] Review how `renderSidebarGroup()` currently handles collapse state (from task-05)

### 2. Green Phase

#### 2a. Collapse toggle in `55-sidebar-groups.js`
- [ ] Add click handler on `.sidebar-group-header` elements:
  ```javascript
  header.addEventListener('click', () => {
      const groupEl = header.parentElement;
      groupEl.classList.toggle('collapsed');
      const groupName = groupEl.dataset.groupName;
      state.groupCollapseState[groupName] = groupEl.classList.contains('collapsed');
      saveGroupCollapseState();
  });
  ```
- [ ] Implement `saveGroupCollapseState()`:
  - Save `state.groupCollapseState` to localStorage key `uniset-panel-group-collapse`
- [ ] Implement `loadGroupCollapseState()`:
  - Load from localStorage key `uniset-panel-group-collapse`
  - Set `state.groupCollapseState` from loaded data
  - Handle corrupt data gracefully (reset to empty object)
- [ ] In `renderSidebarGroup()`: apply collapsed class from `state.groupCollapseState[group.name]`
- [ ] Call `loadGroupCollapseState()` before `renderSidebarGroups()` in init flow

#### 2b. Settings integration (`53-ui-settings.js`)
- [ ] In `saveSettings()`, add `groupCollapseState` to the saved settings object:
  ```javascript
  const settings = {
      // ... existing fields ...
      groupCollapseState: state.groupCollapseState
  };
  ```
- [ ] In `loadSettings()`, restore `groupCollapseState`:
  ```javascript
  if (settings.groupCollapseState) {
      state.groupCollapseState = settings.groupCollapseState;
  }
  ```

#### 2c. Build
- [ ] Run `make app` to regenerate `app.js`
- [ ] Run `make build` to verify

### 3. Refactor Phase
- [ ] Verify collapse state does not interfere with existing section collapse (legacy mode)
- [ ] Confirm existing `saveSettings()` / `loadSettings()` behavior unchanged in legacy mode

## Completion Criteria
- [ ] Group collapse state persists across page reloads (AC: FR5)
- [ ] Existing section collapse in legacy mode continues to work (AC: FR6)
- [ ] `make build` succeeds
- [ ] Operation verified: L1 (functional operation -- collapse, reload, verify state)

## Notes
- Impact scope: `55-sidebar-groups.js` (collapse logic), `53-ui-settings.js` (settings persistence)
- Constraints: Existing settings keys in localStorage must not be affected
- localStorage key: `uniset-panel-group-collapse` (separate from existing `uniset-panel-settings`)
- The `saveSettings()` addition is optional if using a separate localStorage key; evaluate which approach is cleaner
