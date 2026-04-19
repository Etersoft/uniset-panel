# Task: Frontend state, loadSidebar, renderSidebarGroups, CSS, and init integration

Metadata:
- Dependencies: task-04 (API endpoint must work)
- Provides: Sidebar group rendering in browser with CSS styling
- Size: Medium (5 files)

## Implementation Content
Implement the core frontend sidebar group rendering:
1. Add `sidebarGroups` and `groupCollapseState` to global state
2. Create `55-sidebar-groups.js` with `loadSidebar()`, `renderSidebarGroups()`, `renderSidebarGroup()` functions
3. Add `#sidebar-groups` container to `index.html`
4. Update `99-init.js` to call `loadSidebar()` and switch between group/legacy mode
5. Add all CSS styles for sidebar groups

After all JS changes, run `make app` to regenerate `app.js`.

## Target Files
- [ ] `ui/static/js/src/00-state.js`
- [ ] `ui/static/js/src/55-sidebar-groups.js` (new)
- [ ] `ui/static/js/src/99-init.js`
- [ ] `ui/templates/index.html`
- [ ] `ui/static/css/style.css`

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase
- [ ] Review existing sidebar HTML structure in `index.html` (hardcoded sections)
- [ ] Review existing rendering functions: `renderObjectsList()`, `renderLaunchersSection()`, `renderServersSection()`
- [ ] Plan CSS additions per Design Doc CSS specification

### 2. Green Phase

#### 2a. State additions (`00-state.js`)
- [ ] Add to `state` object:
  ```javascript
  sidebarGroups: null,         // null = legacy mode, array = group mode
  groupCollapseState: {},      // { groupName: boolean }
  ```

#### 2b. Sidebar groups JS (`55-sidebar-groups.js`)
- [ ] Define constants:
  ```javascript
  const ENTITY_TYPE_ORDER = ['object', 'launcher', 'journal', 'dashboard', 'server'];
  const ENTITY_TYPE_LABELS = {
      object: 'Objects', launcher: 'Launchers', journal: 'Journals',
      dashboard: 'Dashboards', server: 'Servers'
  };
  const ENTITY_TYPE_BADGE = {
      object: 'Obj', launcher: 'Lnc', journal: 'Jrn',
      dashboard: 'Dsh', server: 'Srv'
  };
  ```
- [ ] Implement `loadSidebar()`:
  - Fetch `GET /api/sidebar`
  - On success: set `state.sidebarGroups = data.groups`
  - On error: `console.warn`, `state.sidebarGroups = null` (degrade to legacy)
  - Log mode: `'Sidebar: group mode enabled, N groups'` or `'Sidebar: legacy mode'`
- [ ] Implement `renderSidebarGroups()`:
  - Get `#sidebar-groups` container, clear it
  - Iterate `state.sidebarGroups`, call `renderSidebarGroup()` for each
  - Add user dashboards from localStorage to a "Custom" group (if any exist)
- [ ] Implement `renderSidebarGroup(group, container)`:
  - Create group div with `.sidebar-group` class and `data-group-name` attribute
  - Render header with collapse icon, title (`escapeHtml`), count badge
  - Restore collapse state from `state.groupCollapseState`
  - If `group.groupByType`: render type sub-sections with `ENTITY_TYPE_ORDER`
  - Else: render flat `<ul>` with type badges
  - Each item: `<li>` with `data-type`, `data-name`, `data-server-id` attributes
  - Status dot for objects and servers
  - Click handler: call appropriate tab-opening function based on entity type
- [ ] Implement `activateSidebarGroupItem(type, name, serverId)`:
  - Switch on entity type to call existing functions: `openTab()`, `openLauncherTab()`, `openDashboard()`, `openJournal()`, `openServerTab()` etc.
  - Set `.active` class on clicked item, remove from others

#### 2c. HTML container (`index.html`)
- [ ] Add before the hardcoded sidebar sections (inside `#sidebar-content` or equivalent):
  ```html
  <div id="sidebar-groups" style="display:none"></div>
  ```

#### 2d. Init integration (`99-init.js`)
- [ ] In `DOMContentLoaded`, before `fetchObjects()`:
  ```javascript
  // Load sidebar config first
  await loadSidebar();
  if (state.sidebarGroups !== null) {
      // Group mode: hide hardcoded sections, show groups container
      document.getElementById('sidebar-groups').style.display = '';
      // Hide hardcoded sections (launchers, objects, journals, dashboards, servers)
      // ... set display:none on hardcoded section containers
      renderSidebarGroups();
  }
  ```
- [ ] Ensure legacy mode path is unchanged (no `sidebarGroups` = existing behavior)

#### 2e. CSS styles (`style.css`)
- [ ] Add all sidebar group CSS per Design Doc specification:
  - `.sidebar-group`, `.sidebar-group-header`, `.sidebar-group-count`
  - `.sidebar-group.collapsed`, collapse icon rotation
  - `.sidebar-group-items`, `.sidebar-group-item`, hover/active states
  - `.entity-type-badge` and type-specific color classes
  - `.sidebar-type-section`, `.sidebar-type-header`, `.sidebar-type-items`

#### 2f. Build
- [ ] Run `make app` to regenerate `app.js`
- [ ] Run `make build` to verify full build succeeds

### 3. Refactor Phase
- [ ] Review HTML escaping: all entity names use `escapeHtml()`
- [ ] Review CSS: only CSS variables used, no hardcoded colors
- [ ] Verify no `document.getElementById()` misuse for tab-scoped elements

## Completion Criteria
- [ ] `make build` succeeds
- [ ] Sidebar shows dynamic groups when API returns groups
- [ ] Sidebar shows legacy sections when API returns null
- [ ] Entity type badges displayed in flat mode
- [ ] Type sub-sections rendered when `groupByType: true`
- [ ] Clicking entity opens correct tab
- [ ] Group order matches YAML config order
- [ ] Operation verified: L1 (functional operation in browser) + L3 (build success)

## Notes
- Impact scope: Frontend state, new JS file, init sequence, HTML template, CSS
- Constraints: Legacy sidebar rendering code must remain completely untouched
- After any JS source changes, always run `make app` to regenerate `app.js`
- Identify the correct existing functions for opening tabs of each entity type by inspecting the codebase
- User dashboards stored in localStorage are not known to server -- add them on frontend in a "Custom" group
