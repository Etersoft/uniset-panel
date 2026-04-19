# Task: SSE status updates in sidebar groups

Metadata:
- Dependencies: task-05 (group rendering must work)
- Provides: Live status dot updates for entities in sidebar groups
- Size: Small (1 file)

## Implementation Content
Implement `updateGroupEntityStatus()` function that updates status indicators on sidebar group items when SSE events arrive. This function is called from existing SSE event handlers (server_status, launcher_connection) to update the status dot on matching sidebar group items without re-rendering the entire sidebar.

## Target Files
- [ ] `ui/static/js/src/55-sidebar-groups.js`

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase
- [ ] Review existing SSE event handlers in `04-sse.js` (server_status, launcher_connection events)
- [ ] Review how status dots are currently updated in the legacy sidebar
- [ ] Identify where to hook into SSE handlers to call `updateGroupEntityStatus()`

### 2. Green Phase

#### 2a. Status update function (`55-sidebar-groups.js`)
- [ ] Implement `updateGroupEntityStatus(entityType, entityName, serverId, status)`:
  ```javascript
  function updateGroupEntityStatus(entityType, entityName, serverId, status) {
      if (state.sidebarGroups === null) return; // legacy mode, nothing to do

      const container = document.getElementById('sidebar-groups');
      if (!container) return;

      // Find matching item by data attributes
      let selector = `.sidebar-group-item[data-type="${entityType}"][data-name="${entityName}"]`;
      if (serverId) {
          selector += `[data-server-id="${serverId}"]`;
      }

      const items = container.querySelectorAll(selector);
      items.forEach(item => {
          const dot = item.querySelector('.server-status-dot');
          if (dot) {
              if (status === 'disconnected' || status === false) {
                  dot.classList.add('disconnected');
              } else {
                  dot.classList.remove('disconnected');
              }
          }
      });
  }
  ```

#### 2b. Hook into SSE handlers
- [ ] Add calls to `updateGroupEntityStatus()` in the appropriate SSE event processing:
  - For `server_status` events: call with type='server', name=serverId, status=connected
  - For `launcher_connection` events: call with type='launcher', name=launcherId, status=connected
  - For object status changes (if any): call with type='object', name, serverId, status
- [ ] This can be done either:
  - By adding calls at the end of existing SSE handler functions in `04-sse.js`, OR
  - By adding a general-purpose hook in `55-sidebar-groups.js` that listens to state changes
  - Preferred approach: add a simple function call in the SSE handlers since the plan specifies "add hooks"

#### 2c. Build
- [ ] Run `make app` to regenerate `app.js`
- [ ] Run `make build` to verify

### 3. Refactor Phase
- [ ] Verify that `updateGroupEntityStatus()` is a no-op in legacy mode (returns immediately)
- [ ] Confirm no full sidebar re-render occurs on status change (DOM update only)

## Completion Criteria
- [ ] Entity status dot updates live when server disconnects/reconnects (AC: FR7)
- [ ] Status updates work without page reload
- [ ] Function is no-op in legacy mode
- [ ] `make build` succeeds
- [ ] Operation verified: L1 (functional -- disconnect server, verify dot changes in group)

## Notes
- Impact scope: `55-sidebar-groups.js` (new function), possibly `04-sse.js` (add hook calls)
- Constraints: No re-rendering of sidebar on status change -- DOM update only (querySelector + class toggle)
- The status dot uses existing CSS class `.disconnected` on `.server-status-dot` element
- If modifying `04-sse.js` is needed, this task grows to 2 files (still within Small size)
