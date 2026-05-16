# Dashboard Active Checkbox-style + Base Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-26-dashboard-active-checkbox-design.md`

**Goal:** Добавить второй визуальный стиль `'checkbox'` в существующий ToggleWidget (через `static styles` pattern), параллельно сделать foundation refactor: поднять общие части (`sensorId`/`objectName`/`parseConfigForm`/`initConfigHandlers`/`usesNewSensorAutocomplete=true дефолт`) из `ToggleWidget` в базовый класс `ActiveDashboardWidget` — убрать дубль и подготовить fundament для будущих widget'ов. Backend микро-оптимизация: `serverMgr.GetServerObjects(serverID)`.

**Architecture:** Frontend: один класс `ToggleWidget` с `static styles = ['slider', 'checkbox']` и диспатчем в `render`/`renderCommand`/`renderFeedback` по `config.style` (default `'slider'`). Foundation: универсальный `parseConfigForm` парсит `sensor`/`sensorId`/`objectName`/`label`/`requireConfirmation`/`style`; `initConfigHandlers` загружает IONC dropdown + autocomplete для всех active widget'ов. Backend: новый `GetServerObjects(serverID)` метод вместо итерации всех серверов в `GetAllObjectsGrouped`.

**Tech Stack:** Go (`net/http`, table-tests), ES6 классы, Playwright E2E.

**E2E command form:** `docker compose run --rm e2e single/<spec>.spec.ts`. Stop dev profile first: `docker compose --profile dev down`.

---

## File Structure

| Файл | Действие | Ответственность |
|---|---|---|
| `internal/server/manager.go` | **Modify** (after `GetServer`) | Новый method `GetServerObjects(serverID string) ([]string, error)` — single-server lookup без итерации |
| `internal/server/manager_test.go` | **Modify** | Test `TestGetServerObjects` — found / not-found / cache fallback |
| `internal/api/handlers.go` | **Modify** (`GetObjects` ~lines 255-267) | Использовать `GetServerObjects(serverID)` вместо grouped-lookup |
| `ui/static/js/src/61-dashboard-active-base.js` | **Modify** | (1) `usesNewSensorAutocomplete = true` (дефолт); (2) `getConfigForm` рендерит objectName select + sensor input + hidden sensorId + style select (когда `this.styles.length > 1`); (3) `parseConfigForm` парсит objectName + sensorId + style + spread parseActiveConfigFields; (4) Новый `static initConfigHandlers(form, config)` — IONC dropdown + autocomplete |
| `ui/static/js/src/61-dashboard-active-toggle.js` | **Modify** | (1) Удалить override `usesNewSensorAutocomplete`; (2) `static styles = ['slider', 'checkbox']`; `static defaultStyle = 'slider'`; (3) `render()` диспатчит на `renderSlider()` / `renderCheckbox()`; (4) `renderCommand` / `renderFeedback` ветвятся; (5) Новые `renderSlider` / `renderCheckbox` / `renderCheckboxCommand` / `renderCheckboxFeedback`; (6) `getActiveConfigFields` оставляет только value/label поля (objectName/sensor/sensorId уходят в base); (7) Удалить override `parseConfigForm`, оставить override `parseActiveConfigFields` для value/label; (8) Удалить override `initConfigHandlers` (теперь в base) |
| `ui/static/css/style.css` | **Modify** (append после toggle slider styles) | `.toggle-style-checkbox` (flex-direction:row, gap, padding) + `.toggle-cb` (24×24 material flat) + `fb-on/off/unknown/diverge` для checkbox |
| `tests/single/dashboard-active-toggle.spec.ts` | **Modify** | Добавить describe block для checkbox style: создание widget с `config.style: 'checkbox'`, рендер, click, fb-on/off/unknown, diverge |
| `CLAUDE.md` | **Modify** | Active widgets section — упомянуть `static styles` pattern и checkbox-style |

Конкретные имена файлов и контракты — verbatim из spec'а.

---

## Phase 0 — Baseline

### Task 0.1: Verify state and run baseline tests

- [ ] **Step 1: Confirm branch and clean state**

Run: `git branch --show-current`
Expected: `story/dashboard-active-controls`

Run: `git status -s | grep -v "^??" | head -5`
Expected: empty (all changes committed; only untracked screenshots remain).

- [ ] **Step 2: Stop dev viewers**

Run: `docker compose --profile dev down 2>&1 | tail -2`

- [ ] **Step 3: Backend baseline**

Run: `go test -mod=vendor ./internal/...`
Expected: all packages PASS.

- [ ] **Step 4: Frontend baseline E2E**

Run:
```bash
docker compose run --rm e2e \
  single/dashboard-active-base.spec.ts \
  single/dashboard-active-toggle.spec.ts \
  single/dashboard-widgets.spec.ts \
  single/dashboard.spec.ts
```
Expected: all PASS.

- [ ] **Step 5: Note results**

Take note of total counts (X passed) per spec. This is reference for "no regressions" later.

If anything fails — STOP and report BLOCKED before Phase 1.

---

## Phase 1 — Backend `serverMgr.GetServerObjects`

### Task 1.1: Add `GetServerObjects` method

**Files:**
- Modify: `internal/server/manager.go` (insert after `GetServer` ~line 232)

- [ ] **Step 1: Add method to Manager**

Right after the `GetServer` function (~line 232), add:

```go
// GetServerObjects возвращает имена объектов на одном сервере без итерации
// всех (в отличие от GetAllObjectsGrouped). Возвращает кеш если сервер
// недоступен (но кеш есть). Ошибка если сервер не найден или недоступен и
// кеша нет.
func (m *Manager) GetServerObjects(serverID string) ([]string, error) {
	instance, exists := m.GetServer(serverID)
	if !exists {
		return nil, fmt.Errorf("server %q not found", serverID)
	}
	objects, err := instance.GetObjects()
	if err != nil {
		if cached := instance.GetCachedObjects(); cached != nil {
			return cached, nil
		}
		return nil, err
	}
	return objects, nil
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `go build -mod=vendor ./...`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add internal/server/manager.go
git commit -m "feat(server): add Manager.GetServerObjects(serverID) for single-server lookup

Возвращает имена объектов одного сервера без итерации всех (в отличие
от GetAllObjectsGrouped). При недоступности сервера возвращает кеш если
есть. Будет использоваться handlers.go GetObjects для оптимизации
single-server type-filter запросов.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.2: Test `GetServerObjects`

**Files:**
- Modify: `internal/server/manager_test.go`

- [ ] **Step 1: Read existing test patterns**

Run: `grep -n "func Test\|startMockUniset\|server.NewManager\|AddServer" internal/server/manager_test.go | head -20`

Note the existing patterns for setting up a Manager backed by httptest mock uniset (similar to handlers_test.go TestGetObjects_TypeFilter).

- [ ] **Step 2: Add test**

Append at the end of `manager_test.go` (or in appropriate location):

```go
func TestGetServerObjects(t *testing.T) {
	// Mock uniset returning two objects on /api/v2/list
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v2/list", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]string{"ObjA", "ObjB"})
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	mgr := NewManager(nil, 5*time.Second, time.Hour, "TestProc", 0)
	if err := mgr.AddServer(config.ServerConfig{ID: "srv1", URL: srv.URL}); err != nil {
		t.Fatalf("AddServer: %v", err)
	}
	defer mgr.RemoveServer("srv1")

	t.Run("found", func(t *testing.T) {
		names, err := mgr.GetServerObjects("srv1")
		if err != nil {
			t.Fatalf("err: %v", err)
		}
		if len(names) != 2 {
			t.Fatalf("want 2 names, got %d (%v)", len(names), names)
		}
	})

	t.Run("not found", func(t *testing.T) {
		_, err := mgr.GetServerObjects("nonexistent")
		if err == nil {
			t.Fatal("expected error for nonexistent server, got nil")
		}
		if !strings.Contains(err.Error(), "not found") {
			t.Errorf("expected 'not found' in error, got: %v", err)
		}
	})
}
```

⚠ NOTE: Verify that `internal/server/manager_test.go` already imports `net/http`, `net/http/httptest`, `encoding/json`, `strings`, `time`, `testing`, `config`, etc. If not, add the imports. Also verify `NewManager`'s exact signature — read `grep "func NewManager" internal/server/manager.go` and adjust the call accordingly. Common signature: `(store storage.Storage, pollInterval, historyTTL time.Duration, supplier string, sensorBatchSize int)`.

- [ ] **Step 3: Run test**

Run: `go test -mod=vendor -run TestGetServerObjects -v ./internal/server/...`
Expected: 2/2 sub-tests PASS.

- [ ] **Step 4: Run full backend suite for safety**

Run: `go test -mod=vendor ./internal/...`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/server/manager_test.go
git commit -m "test(server): GetServerObjects — found / not-found cases

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — handlers.go uses GetServerObjects

### Task 2.1: Replace grouped-lookup with single-server lookup

**Files:**
- Modify: `internal/api/handlers.go` (`GetObjects` lines 255-267)

- [ ] **Step 1: Read current logic**

Run: `sed -n '250,300p' internal/api/handlers.go`

- [ ] **Step 2: Replace the lookup block**

Replace this block (lines 255-267):

```go
	// Получаем имена объектов на сервере
	grouped, err := h.serverMgr.GetAllObjectsGrouped()
	if err != nil {
		h.writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	var names []string
	for _, sg := range grouped {
		if sg.ServerID == serverID {
			names = sg.Objects
			break
		}
	}
```

with:

```go
	// Получаем имена объектов на сервере (single-server lookup)
	names, err := h.serverMgr.GetServerObjects(serverID)
	if err != nil {
		h.writeError(w, http.StatusBadGateway, err.Error())
		return
	}
```

- [ ] **Step 3: Build**

Run: `go build -mod=vendor ./...`
Expected: success.

- [ ] **Step 4: Run existing GetObjects tests**

Run: `go test -mod=vendor -run TestGetObjects -v ./internal/api/...`
Expected: all 6 sub-tests PASS (TestGetObjects_TypeFilter — back-compat behavior preserved).

- [ ] **Step 5: Run full backend suite**

Run: `go test -mod=vendor ./internal/...`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add internal/api/handlers.go
git commit -m "refactor(api): GetObjects uses GetServerObjects (single-server lookup)

Раньше итерация по всем серверам через GetAllObjectsGrouped — теперь
прямой lookup. Микрооптимизация для multi-server конфигов.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 — Foundation refactor + ToggleWidget cleanup (atomic)

This phase is **one atomic commit** because moving logic from ToggleWidget to base requires both changes simultaneously — otherwise the form will either be broken (base has duplicate fields with toggle) or non-functional (toggle removed handler that base doesn't yet have).

### Task 3.1: Move getConfigForm/parseConfigForm/initConfigHandlers/usesNewSensorAutocomplete from ToggleWidget to ActiveDashboardWidget base

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-base.js`
- Modify: `ui/static/js/src/61-dashboard-active-toggle.js`

- [ ] **Step 1: Update ActiveDashboardWidget — set usesNewSensorAutocomplete default**

In `61-dashboard-active-base.js`, find the static fields block (~line 19-21):

```javascript
class ActiveDashboardWidget extends DashboardWidget {
    static type = 'active-base';
    static displayName = 'Active Widget (base)';
    static description = 'Base class for write-capable widgets';
```

Add after these lines:

```javascript
    // Active widgets всегда используют setupSensorAutocomplete (41-sensor-autocomplete.js).
    // dashboard-manager skip'ает legacy in-memory sensor autocomplete для widget'ов
    // c этим флагом. См. 62-dashboard-manager.js setupConfigDialog.
    static usesNewSensorAutocomplete = true;
    // Subclasses с несколькими стилями (toggle: ['slider','checkbox']) задают список;
    // base getConfigForm рендерит style select когда length > 1.
    static styles = [];
    static defaultStyle = '';
```

- [ ] **Step 2: Update getConfigForm — добавить objectName / sensorId / style**

Replace existing `static getConfigForm` (lines 199-221) with:

```javascript
    static getConfigForm(config = {}) {
        const styleSelect = (this.styles && this.styles.length > 1)
            ? `
            <div class="widget-config-field">
                <label>Style</label>
                <select class="widget-input" name="style" data-test="cfg-style">
                    ${this.styles.map(s => `<option value="${escapeHtml(s)}" ${(config.style || this.defaultStyle) === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
                </select>
            </div>
            `
            : '';

        const baseFields = `
            <div class="widget-config-field">
                <label>IONC Object</label>
                <select class="widget-input" name="objectName" data-test="cfg-objectName">
                    <option value="${escapeHtml(config.objectName || 'SharedMemory')}" selected>${escapeHtml(config.objectName || 'SharedMemory')}</option>
                </select>
                <small style="color:#6b7280">список загружается из /api/objects?type=IONotifyController</small>
            </div>
            <div class="widget-config-field">
                <label>Sensor (autocomplete)</label>
                <input type="text" class="widget-input" name="sensor" autocomplete="off"
                       value="${escapeHtml(config.sensor || '')}" data-test="cfg-sensor">
                <input type="hidden" name="sensorId" value="${config.sensorId ?? ''}" data-test="cfg-sensorId">
            </div>
            ${styleSelect}
            <div class="widget-config-field">
                <label>Label</label>
                <input type="text" class="widget-input" name="label"
                       value="${escapeHtml(config.label || '')}" placeholder="Display label">
            </div>
            <div class="widget-config-field">
                <label class="widget-checkbox-label">
                    <input type="checkbox" name="requireConfirmation"
                           ${config.requireConfirmation ? 'checked' : ''}>
                    <span>Require confirmation before write</span>
                </label>
            </div>
        `;
        return baseFields + (this.getActiveConfigFields ? this.getActiveConfigFields(config) : '');
    }
```

- [ ] **Step 3: Update parseConfigForm — добавить objectName / sensorId / style**

Replace existing `static parseConfigForm` (lines 228-236) with:

```javascript
    static parseConfigForm(form) {
        const base = {
            sensor:     form.querySelector('[name="sensor"]')?.value || '',
            sensorId:   parseInt(form.querySelector('[name="sensorId"]')?.value, 10) || null,
            objectName: form.querySelector('[name="objectName"]')?.value || 'SharedMemory',
            label:      form.querySelector('[name="label"]')?.value || '',
            requireConfirmation: form.querySelector('[name="requireConfirmation"]')?.checked || false,
        };
        const styleEl = form.querySelector('[name="style"]');
        if (styleEl) base.style = styleEl.value;
        const extra = this.parseActiveConfigFields ? this.parseActiveConfigFields(form) : {};
        return { ...base, ...extra };
    }
```

- [ ] **Step 4: Add static initConfigHandlers in base**

Right BEFORE `static parseActiveConfigFields` (after parseConfigForm), add:

```javascript
    static initConfigHandlers(form, config = {}) {
        const objectSelect = form.querySelector('[name="objectName"]');
        const sensorInput = form.querySelector('[name="sensor"]');
        const hiddenIdInput = form.querySelector('[name="sensorId"]');
        if (!objectSelect || !sensorInput || !hiddenIdInput) return;

        // Resolve serverId — first connected server (как в _resolveServerId).
        let serverId = '';
        for (const [id, srv] of state.servers) {
            if (srv.connected) { serverId = id; break; }
        }

        // Populate IONC objects dropdown.
        if (serverId) {
            fetch(`/api/objects?server=${encodeURIComponent(serverId)}&type=IONotifyController`)
                .then(r => r.ok ? r.json() : { objects: [] })
                .then(data => {
                    const objs = data.objects || [];
                    const currentValue = config.objectName || 'SharedMemory';
                    objectSelect.innerHTML = objs.map(o => {
                        const name = typeof o === 'string' ? o : o.name;
                        return `<option value="${escapeHtml(name)}" ${name === currentValue ? 'selected' : ''}>${escapeHtml(name)}</option>`;
                    }).join('');
                    if (!objs.some(o => (typeof o === 'string' ? o : o.name) === currentValue)) {
                        const opt = document.createElement('option');
                        opt.value = currentValue;
                        opt.textContent = `${currentValue} (текущий, не найден)`;
                        opt.selected = true;
                        objectSelect.prepend(opt);
                    }
                })
                .catch(e => console.warn('Failed to load IONC objects:', e));
        }

        // Setup sensor autocomplete.
        const ac = setupSensorAutocomplete(
            sensorInput,
            hiddenIdInput,
            () => objectSelect.value,
            () => serverId
        );

        // Reset sensor on object change.
        objectSelect.addEventListener('change', () => {
            if (ac && typeof ac.resetOnObjectChange === 'function') {
                ac.resetOnObjectChange();
            }
        });
    }
```

- [ ] **Step 5: Update ToggleWidget — remove duplicates**

Open `ui/static/js/src/61-dashboard-active-toggle.js`.

Remove the `usesNewSensorAutocomplete` line (line 29):

```javascript
    static usesNewSensorAutocomplete = true;
```

Remove the entire `static initConfigHandlers(form, config = {})` method (lines 159-210). The base class now provides this.

Remove the entire `static parseConfigForm(form)` method (lines 212-227). The base class now handles it (and `parseActiveConfigFields` will handle valueOff/valueOn/labelOff/labelOn — see next step).

- [ ] **Step 6: Add `static parseActiveConfigFields` to ToggleWidget for value/label**

Add (in place of removed `parseConfigForm`):

```javascript
    static parseActiveConfigFields(form) {
        return {
            valueOff: Number(form.querySelector('[name="valueOff"]')?.value ?? 0),
            valueOn:  Number(form.querySelector('[name="valueOn"]')?.value ?? 1),
            labelOff: form.querySelector('[name="labelOff"]')?.value || '',
            labelOn:  form.querySelector('[name="labelOn"]')?.value || '',
        };
    }
```

- [ ] **Step 7: Trim getActiveConfigFields — remove objectName/sensor (now in base)**

Replace existing `static getActiveConfigFields(config = {})` (lines 117-157) with:

```javascript
    static getActiveConfigFields(config = {}) {
        return `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>valueOff</label>
                    <input type="number" class="widget-input" name="valueOff"
                           value="${config.valueOff ?? 0}" data-test="cfg-valueOff">
                </div>
                <div class="widget-config-field">
                    <label>valueOn</label>
                    <input type="number" class="widget-input" name="valueOn"
                           value="${config.valueOn ?? 1}" data-test="cfg-valueOn">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>labelOff</label>
                    <input type="text" class="widget-input" name="labelOff"
                           value="${escapeHtml(config.labelOff || '')}" placeholder="OFF" data-test="cfg-labelOff">
                </div>
                <div class="widget-config-field">
                    <label>labelOn</label>
                    <input type="text" class="widget-input" name="labelOn"
                           value="${escapeHtml(config.labelOn || '')}" placeholder="ON" data-test="cfg-labelOn">
                </div>
            </div>
        `;
    }
```

- [ ] **Step 8: Rebuild app.js and verify counts**

Run: `make app`
Expected: success.

Run: `grep -c "usesNewSensorAutocomplete = true" ui/static/js/src/61-dashboard-active-base.js`
Expected: `1`.

Run: `grep -c "usesNewSensorAutocomplete" ui/static/js/src/61-dashboard-active-toggle.js`
Expected: `0` (removed from toggle).

Run: `grep -c "static initConfigHandlers" ui/static/js/src/61-dashboard-active-base.js`
Expected: `1` (now in base).

Run: `grep -c "static initConfigHandlers" ui/static/js/src/61-dashboard-active-toggle.js`
Expected: `0` (removed from toggle).

Run: `grep -c "static parseConfigForm" ui/static/js/src/61-dashboard-active-toggle.js`
Expected: `0` (removed from toggle).

Run: `grep -c "static parseActiveConfigFields" ui/static/js/src/61-dashboard-active-toggle.js`
Expected: `1` (added).

- [ ] **Step 9: Run smoke E2E + toggle E2E**

Run: `docker compose --profile dev down`

Run: `docker compose run --rm e2e single/dashboard-active-base.spec.ts single/dashboard-active-toggle.spec.ts`
Expected: all PASS (smoke 2/2 + toggle 8/8).

Common failures:
- Toggle widget config form has duplicate fields (если getConfigForm в base дублирует то, что в getActiveConfigFields toggle'а) → проверить step 7 что objectName/sensor в base, не в toggle.
- "sensor input not found in form" → проверить что initConfigHandlers в base правильно ищет `[name="sensor"]`.

Iterate until все PASS. **Не двигаться** дальше с красным.

- [ ] **Step 10: Commit (atomic)**

```bash
git add ui/static/js/src/61-dashboard-active-base.js ui/static/js/src/61-dashboard-active-toggle.js ui/static/js/app.js
git commit -m "refactor(dashboard): promote sensorId/objectName/parseConfigForm/initConfigHandlers/usesNewSensorAutocomplete to ActiveDashboardWidget base

Toggle review TODO: дубль parseConfigForm в каждом active widget'е был
неудобен. Теперь в base:
- usesNewSensorAutocomplete = true (дефолт; не нужно в toggle override)
- static styles + defaultStyle для подсчёта style select в form
- getConfigForm рендерит objectName select + sensor input + hidden
  sensorId + style select (когда styles.length > 1)
- parseConfigForm парсит base поля + style + spread parseActiveConfigFields
- initConfigHandlers загружает IONC objects dropdown + setup autocomplete

ToggleWidget теперь:
- Не override'ит usesNewSensorAutocomplete (наследует true)
- Не override'ит parseConfigForm (наследует base; parseActiveConfigFields
  override для valueOff/valueOn/labelOff/labelOn)
- Не override'ит initConfigHandlers (наследует base)
- getActiveConfigFields содержит только value/label поля

Smoke E2E + toggle E2E зелёные.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 — ToggleWidget styles infrastructure + checkbox render

### Task 4.1: Add styles list and render dispatch

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-toggle.js`

- [ ] **Step 1: Add static styles + defaultStyle declaration**

After the existing `static maxSize` line, add:

```javascript
    // Доступные визуальные стили. base.getConfigForm рендерит style select
    // когда length > 1.
    static styles = ['slider', 'checkbox'];
    static defaultStyle = 'slider';
```

- [ ] **Step 2: Replace `render()` with style dispatcher**

Replace existing `render()` method (lines 32-51 in current file — после Phase 3 cleanup нумерация изменится; ищите по `render() {` после `static usesNewSensorAutocomplete`):

Find the existing render block:
```javascript
    render() {
        const label = this.config?.label || this.config?.sensor || 'Toggle';
        this.element = document.createElement('div');
        this.element.className = 'widget-content toggle-widget';
        this.element.innerHTML = `
            <div class="toggle-name" data-test="name">${escapeHtml(label)}</div>
            <div class="toggle-track" data-test="track" data-handle-pos="left">
                <div class="toggle-handle"></div>
            </div>
            <div class="toggle-state-text" data-test="state-text">${escapeHtml(this._currentLabel())}</div>
        `;
        this.container.appendChild(this.element);
        this.element.querySelector('[data-test="track"]').addEventListener('click', () => this.onClick());
        this.renderFeedback();
        this.renderCommand();
    }
```

Replace with:

```javascript
    render() {
        if (this._currentStyle() === 'checkbox') {
            this.renderCheckbox();
        } else {
            this.renderSlider();
        }
    }

    _currentStyle() {
        return this.config?.style || ToggleWidget.defaultStyle;
    }

    renderSlider() {
        const label = this.config?.label || this.config?.sensor || 'Toggle';
        this.element = document.createElement('div');
        this.element.className = 'widget-content toggle-widget toggle-style-slider';
        this.element.innerHTML = `
            <div class="toggle-name" data-test="name">${escapeHtml(label)}</div>
            <div class="toggle-track" data-test="track" data-handle-pos="left">
                <div class="toggle-handle"></div>
            </div>
            <div class="toggle-state-text" data-test="state-text">${escapeHtml(this._currentLabel())}</div>
        `;
        this.container.appendChild(this.element);
        this.element.querySelector('[data-test="track"]').addEventListener('click', () => this.onClick());
        this.renderFeedback();
        this.renderCommand();
    }

    renderCheckbox() {
        const label = this.config?.label || this.config?.sensor || 'Toggle';
        this.element = document.createElement('div');
        this.element.className = 'widget-content toggle-widget toggle-style-checkbox';
        this.element.innerHTML = `
            <div class="toggle-cb" data-test="cb"></div>
            <div class="toggle-name" data-test="name">${escapeHtml(label)}</div>
        `;
        this.container.appendChild(this.element);
        // Click anywhere on widget triggers writeValue (standard checkbox UX).
        this.element.addEventListener('click', () => this.onClick());
        this.renderFeedback();
        this.renderCommand();
    }
```

- [ ] **Step 3: Branch `renderCommand`**

Replace existing `renderCommand()`:

```javascript
    renderCommand() {
        const track = this.element?.querySelector('[data-test="track"]');
        if (!track) return;
        const valueOn = this.config?.valueOn ?? 1;
        const refValue = this.commandValue ?? this.feedbackValue;
        track.dataset.handlePos = refValue === valueOn ? 'right' : 'left';
        const diverges = this.commandValue !== null
            && this.commandValue !== undefined
            && this.commandValue !== this.feedbackValue;
        track.classList.toggle('diverge', !!diverges);
        const stateText = this.element?.querySelector('[data-test="state-text"]');
        if (stateText) stateText.textContent = this._currentLabel();
    }
```

with:

```javascript
    renderCommand() {
        if (this._currentStyle() === 'checkbox') {
            this.renderCheckboxCommand();
        } else {
            this.renderSliderCommand();
        }
    }

    renderSliderCommand() {
        const track = this.element?.querySelector('[data-test="track"]');
        if (!track) return;
        const valueOn = this.config?.valueOn ?? 1;
        const refValue = this.commandValue ?? this.feedbackValue;
        track.dataset.handlePos = refValue === valueOn ? 'right' : 'left';
        const diverges = this.commandValue !== null
            && this.commandValue !== undefined
            && this.commandValue !== this.feedbackValue;
        track.classList.toggle('diverge', !!diverges);
        const stateText = this.element?.querySelector('[data-test="state-text"]');
        if (stateText) stateText.textContent = this._currentLabel();
    }

    renderCheckboxCommand() {
        // diverge применяется к корневому .toggle-widget (yellow box-shadow вокруг
        // всего widget'а лучше читается чем вокруг 24px чекбокса).
        const root = this.element;
        if (!root) return;
        const diverges = this.commandValue !== null
            && this.commandValue !== undefined
            && this.commandValue !== this.feedbackValue;
        root.classList.toggle('diverge', !!diverges);
    }
```

- [ ] **Step 4: Branch `renderFeedback`**

Replace existing `renderFeedback()`:

```javascript
    renderFeedback() {
        const track = this.element?.querySelector('[data-test="track"]');
        if (!track) return;
        const valueOff = this.config?.valueOff ?? 0;
        const valueOn = this.config?.valueOn ?? 1;
        track.classList.remove('fb-on', 'fb-off', 'fb-unknown');
        if (this.feedbackValue === valueOn) {
            track.classList.add('fb-on');
        } else if (this.feedbackValue === valueOff) {
            track.classList.add('fb-off');
        } else {
            track.classList.add('fb-unknown');
        }
        if (this.feedbackValue !== null && this.feedbackValue !== undefined) {
            track.title = `actual: ${this.feedbackValue}`;
        }
        this.renderCommand();
    }
```

with:

```javascript
    renderFeedback() {
        if (this._currentStyle() === 'checkbox') {
            this.renderCheckboxFeedback();
        } else {
            this.renderSliderFeedback();
        }
    }

    renderSliderFeedback() {
        const track = this.element?.querySelector('[data-test="track"]');
        if (!track) return;
        const valueOff = this.config?.valueOff ?? 0;
        const valueOn = this.config?.valueOn ?? 1;
        track.classList.remove('fb-on', 'fb-off', 'fb-unknown');
        if (this.feedbackValue === valueOn) {
            track.classList.add('fb-on');
        } else if (this.feedbackValue === valueOff) {
            track.classList.add('fb-off');
        } else {
            track.classList.add('fb-unknown');
        }
        if (this.feedbackValue !== null && this.feedbackValue !== undefined) {
            track.title = `actual: ${this.feedbackValue}`;
        }
        this.renderCommand();
    }

    renderCheckboxFeedback() {
        const cb = this.element?.querySelector('[data-test="cb"]');
        if (!cb) return;
        const valueOff = this.config?.valueOff ?? 0;
        const valueOn = this.config?.valueOn ?? 1;
        cb.classList.remove('fb-on', 'fb-off', 'fb-unknown');
        if (this.feedbackValue === valueOn) {
            cb.classList.add('fb-on');
        } else if (this.feedbackValue === valueOff) {
            cb.classList.add('fb-off');
        } else {
            cb.classList.add('fb-unknown');
        }
        if (this.feedbackValue !== null && this.feedbackValue !== undefined) {
            cb.title = `actual: ${this.feedbackValue}`;
        }
        this.renderCommand();
    }
```

- [ ] **Step 5: Rebuild + grep checks**

Run: `make app`

Run: `grep -c "renderCheckbox\|renderSlider\|_currentStyle" ui/static/js/app.js`
Expected: ≥ 7 (each method definition + call sites).

- [ ] **Step 6: Run toggle E2E (existing tests use slider — should still pass)**

Run: `docker compose --profile dev down`
Run: `docker compose run --rm e2e single/dashboard-active-toggle.spec.ts`
Expected: 8/8 PASS (existing slider tests still work — they don't pass `config.style`, default `'slider'`).

If FAIL — debug. Common issues: `_currentStyle()` returns wrong value (typo); `renderSlider` missing original logic; selector `[data-test="track"]` no longer matches because checkbox path doesn't have it.

- [ ] **Step 7: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-toggle.js ui/static/js/app.js
git commit -m "feat(dashboard): ToggleWidget styles infrastructure + renderCheckbox

static styles = ['slider', 'checkbox']; static defaultStyle = 'slider'.
render()/renderCommand()/renderFeedback() диспатчат на slider или
checkbox методы по config.style. renderCheckbox создаёт layout
[checkbox][name], весь widget кликабелен (стандартный checkbox UX).
diverge применяется к корневому .toggle-widget для checkbox style
(вместо .toggle-track как у slider).

Существующие slider E2E зелёные (default style для конфигов без style).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5 — CSS для checkbox style

### Task 5.1: Append checkbox styles

**Files:**
- Modify: `ui/static/css/style.css` (append после существующих `.toggle-widget` slider правил)

- [ ] **Step 1: Find toggle-widget CSS block**

Run: `grep -n "^.toggle-widget" ui/static/css/style.css`

Note where the slider rules end (last rule for `.toggle-widget`).

- [ ] **Step 2: Append checkbox-style CSS**

Append after the last `.toggle-widget` slider rule (or at end of file):

```css

/* ============================================================================
 * ToggleWidget — checkbox style (config.style === 'checkbox')
 * ============================================================================ */

.toggle-widget.toggle-style-checkbox {
    flex-direction: row;
    justify-content: flex-start;
    gap: 10px;
    padding: 0 12px;
    cursor: pointer;
}

.toggle-widget .toggle-cb {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    border: 2px solid #6b7280;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s, box-shadow 0.2s;
    flex-shrink: 0;
    background: transparent;
}

.toggle-widget .toggle-cb.fb-on {
    background: #22c55e;
    border-color: #22c55e;
}
.toggle-widget .toggle-cb.fb-on::after {
    content: '✓';
    color: #fff;
    font-weight: bold;
    font-size: 16px;
    line-height: 1;
}

.toggle-widget .toggle-cb.fb-off {
    background: transparent;
    border-color: #6b7280;
}

.toggle-widget .toggle-cb.fb-unknown {
    background: #1f2937;
    border-style: dashed;
    border-color: #6b7280;
}
.toggle-widget .toggle-cb.fb-unknown::after {
    content: '?';
    color: #9ca3af;
    font-weight: 600;
    font-size: 14px;
}

/* diverge для checkbox — на корневом .toggle-widget (а не на .toggle-cb).
   Слайдер использует .toggle-track.diverge — это правило не пересекается. */
.toggle-widget.toggle-style-checkbox.diverge {
    box-shadow: 0 0 0 2px #f59e0b, 0 0 6px rgba(245, 158, 11, 0.5);
}
```

- [ ] **Step 3: Restart viewer (Go server reads CSS at startup)**

Run: `docker compose restart viewer 2>&1 | tail -2`

- [ ] **Step 4: Curl-verify served CSS contains the new rules**

Run: `curl -s http://localhost:8000/static/css/style.css | grep -c "toggle-style-checkbox"`
Expected: ≥ 2 (declaration + diverge selector).

- [ ] **Step 5: Commit**

```bash
git add ui/static/css/style.css
git commit -m "feat(dashboard): CSS for ToggleWidget checkbox style

Material flat 24x24, ✓ при ON, dashed '?' при unknown, жёлтая граница
вокруг root при diverge (вместо .toggle-track как у slider).
flex-direction:row для compact horizontal layout [checkbox][name].

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 6 — E2E тесты для checkbox style

### Task 6.1: Add checkbox describe block in dashboard-active-toggle.spec.ts

**Files:**
- Modify: `tests/single/dashboard-active-toggle.spec.ts`

- [ ] **Step 1: Read the existing slider tests for reference**

Run: `head -60 tests/single/dashboard-active-toggle.spec.ts`

Note the `createToggleDashboard` helper, route mocking pattern, evaluate-based dashboard injection, dispatchEvent click pattern.

- [ ] **Step 2: Append checkbox describe block at end of file**

Add at the end of the file (before final closing brace if any, otherwise append):

```typescript

test.describe('ToggleWidget — checkbox style', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/control/status', async (route) => {
            await route.fulfill({ json: { enabled: true, isController: true, hasController: true, timeoutSec: 60 } });
        });
        await page.route('**/ionc/set**', async (route) => {
            if (route.request().method() === 'POST') {
                await route.fulfill({ json: { status: 'ok' } });
            } else {
                await route.continue();
            }
        });

        await page.goto('/');
        await page.waitForFunction(() =>
            typeof (window as any).dashboardState !== 'undefined' &&
            typeof (window as any).ToggleWidget !== 'undefined' &&
            typeof (window as any).dashboardManager !== 'undefined'
        );
        await page.evaluate(() => {
            const w: any = window;
            w.state.control.enabled = true;
            w.state.control.isController = true;
            w.state.control.hasController = true;
            w.state.control.token = 'admin';
        });
        await page.waitForFunction(() => {
            const w: any = window;
            for (const [, srv] of (w.state?.servers || new Map())) {
                if (srv.connected) return true;
            }
            return false;
        }, { timeout: 10000 });
    });

    async function createCheckboxDashboard(page, configOverrides: Record<string, unknown> = {}) {
        await page.evaluate((overrides) => {
            const w: any = window;
            const widgetCfg = {
                id: 'cb-1',
                type: 'toggle',
                config: {
                    sensor: 'TEST_PUMP',
                    sensorId: 100,
                    objectName: 'SharedMemory',
                    style: 'checkbox',
                    valueOff: 0,
                    valueOn: 1,
                    labelOff: 'OFF',
                    labelOn: 'ON',
                    label: 'PUMP',
                    ...overrides,
                },
                position: { col: 0, row: 0, width: 2, height: 1 },
            };
            const dashCfg = {
                meta: { name: 'TEST_CB', description: '' },
                widgets: [widgetCfg],
            };
            w.dashboardState.dashboards.set('TEST_CB', dashCfg);
            w.dashboardManager.loadDashboard('TEST_CB');
            w.switchView('dashboard');
        }, configOverrides);
        await page.locator('[data-test="cb"]').first().waitFor({ state: 'visible', timeout: 5000 });
    }

    test('renders .toggle-cb (not .toggle-track) when style=checkbox', async ({ page }) => {
        await createCheckboxDashboard(page);
        await expect(page.locator('[data-test="cb"]').first()).toBeVisible();
        await expect(page.locator('[data-test="track"]')).toHaveCount(0);
        // Container has style class
        const container = page.locator('.toggle-widget.toggle-style-checkbox').first();
        await expect(container).toBeVisible();
    });

    test('click anywhere on widget triggers writeValue', async ({ page }) => {
        await createCheckboxDashboard(page);
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('cb-1').update(0);
        });
        const postPromise = page.waitForRequest(req =>
            req.url().includes('/ionc/set') && req.method() === 'POST'
        );
        // Click on the name (not the checkbox itself) — should still trigger
        await page.evaluate(() => {
            const name = document.querySelector('[data-test="name"]') as HTMLElement;
            name.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const req = await postPromise;
        const body = JSON.parse(req.postData() || '{}');
        expect(body.value).toBe(1);
    });

    test('shows fb-on green check when feedback=valueOn', async ({ page }) => {
        await createCheckboxDashboard(page);
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('cb-1').update(1);
        });
        const cb = page.locator('[data-test="cb"]').first();
        await expect(cb).toHaveClass(/fb-on/);
    });

    test('shows fb-unknown dashed for non-binary value', async ({ page }) => {
        await createCheckboxDashboard(page, { valueOff: 0, valueOn: 100 });
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('cb-1').update(47);
        });
        const cb = page.locator('[data-test="cb"]').first();
        await expect(cb).toHaveClass(/fb-unknown/);
        await expect(cb).toHaveAttribute('title', /actual:\s*47/);
    });

    test('diverge yellow border on root .toggle-widget (not .toggle-cb)', async ({ page }) => {
        await createCheckboxDashboard(page);
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('cb-1').update(0);
        });
        await page.evaluate(() => {
            const cb = document.querySelector('[data-test="cb"]') as HTMLElement;
            cb.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        // diverge на корневом .toggle-widget
        await expect(page.locator('.toggle-widget.toggle-style-checkbox').first()).toHaveClass(/diverge/);
        // НЕ на .toggle-cb
        await expect(page.locator('[data-test="cb"]').first()).not.toHaveClass(/diverge/);
    });
});
```

- [ ] **Step 3: Run the new tests**

Run: `docker compose --profile dev down`
Run: `docker compose run --rm e2e single/dashboard-active-toggle.spec.ts`

Expected: 13 tests PASS (8 existing slider + 5 new checkbox).

If FAIL — debug. Common issues:
- `state.control` initialization differs from existing slider tests — copy the pattern verbatim.
- `[data-test="cb"]` selector not visible — check renderCheckbox in toggle JS actually creates the element with that data-test attribute.

- [ ] **Step 4: Commit**

```bash
git add tests/single/dashboard-active-toggle.spec.ts
git commit -m "test(dashboard): E2E for ToggleWidget checkbox style

5 cases:
- renders .toggle-cb (not .toggle-track) when style=checkbox
- click anywhere on widget triggers writeValue
- shows fb-on green check when feedback=valueOn
- shows fb-unknown dashed for non-binary value
- diverge yellow border on root .toggle-widget (not .toggle-cb)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 7 — Regression sweep

### Task 7.1: Combined sweep

- [ ] **Step 1: Stop dev profile**

Run: `docker compose --profile dev down`

- [ ] **Step 2: Run combined sweep**

Run:
```bash
docker compose run --rm e2e \
  single/generator.spec.ts \
  single/ionotifycontroller.spec.ts \
  single/dashboard.spec.ts \
  single/dashboard-sse.spec.ts \
  single/dashboard-widgets.spec.ts \
  single/dashboard-active-base.spec.ts \
  single/dashboard-active-toggle.spec.ts
```

Expected: all PASS (with at most 1 known flake in `generator.spec.ts:252` "should send set requests while generator is running" — already verified flake under 10-worker contention; passes in isolation).

- [ ] **Step 3: If flake — verify in isolation**

If `generator.spec.ts:252` failed: `docker compose run --rm e2e single/generator.spec.ts` — should be 19/19 in isolation.

- [ ] **Step 4: If anything else fails — investigate**

Most likely sources of regression:
- Toggle slider tests broken because `renderSlider` lost some logic in Phase 4.
- Foundation `getConfigForm` changes broke other widget config flow (label widget, gauge widget, etc.) — но они не extend ActiveDashboardWidget, должно быть ОК. Проверить grep.

If a real regression — fix root cause, not work around.

- [ ] **Step 5: Report final result**

If all green (modulo known flake) — Phase 7 done.

---

## Phase 8 — Документация

### Task 8.1: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Find Active dashboard widgets section**

Run: `grep -n "Active dashboard widgets\|ToggleWidget\|sensor autocomplete" CLAUDE.md | head -10`

- [ ] **Step 2: Update / append**

Find the existing ToggleWidget paragraph and replace with (or extend):

```markdown
**ToggleWidget (`61-dashboard-active-toggle.js`):** двух-состояный
переключатель для DI/DO/AI/AO датчиков. Конфиг включает: `objectName`
(IONC объект), `sensorId` (числовой ID), `valueOff`/`valueOn` (любые
числа), `labelOff`/`labelOn` (текстовые подписи). Поддерживает
несколько визуальных стилей через `static styles = ['slider',
'checkbox']` и `config.style` (default `'slider'`). `render()`
диспатчит на `renderSlider()` / `renderCheckbox()`. Композиция:
- **slider** (3×2 default): цвет track = feedback, позиция handle =
  command, жёлтая граница на `.toggle-track` при diverge.
- **checkbox** (2×1 compact): material flat 24×24 + label справа,
  жёлтая граница на корневом `.toggle-widget` при diverge.

Серый «unknown» (dashed border) при `feedback ≠ valueOn ≠ valueOff` —
типично для AI/AO. `title` tooltip показывает фактическое значение.
```

Find the foundation contract paragraph (`ActiveDashboardWidget`) and update:

```markdown
**Контракт `ActiveDashboardWidget`:**
- `writeValue(value)` — POST через `controlledFetch` на `/api/objects/{config.objectName}/ionc/set?server=...`
  (default `objectName = 'SharedMemory'`, `sensor_id` берётся из `config.sensorId` с fallback на `config.sensor`)
- `update(value, error)` — приходит от SSE, обновляет `feedbackValue`
- `commandValue` / `feedbackValue` — раздельное хранение «команда vs обратная связь» (SCADA)
- `writeState`: `idle | pending | success | error` — CSS `.active-*` на контейнере
- `isInteractive()` — `false` в edit mode и без controlToken
- `_updateInteractivityClass()` — реактивно обновляет `active-disabled`/`data-control-blocked`
- `_recomputeTitle()` — единая точка владения tooltip'ом (приоритет: error > control-blocked > пусто)
- `requireConfirmation` — опция в config, default off
- `usesNewSensorAutocomplete = true` — дефолт; legacy in-memory autocomplete пропускается для всех ActiveDashboardWidget
- **Override surface** в наследниках:
  - `render()`/`renderCommand()`/`renderFeedback()` — DOM/обновления
  - `static getActiveConfigFields(config)` — дополнительные поля формы (НЕ переопределяй `getConfigForm` —
    base уже рендерит objectName/sensor/sensorId/style/label/requireConfirmation)
  - `static parseActiveConfigFields(form)` — парсинг доп. полей (НЕ переопределяй `parseConfigForm`)
  - `static styles = [...]` — список визуальных стилей; base `getConfigForm` рендерит style select когда length > 1
  - `static initConfigHandlers(form, config)` — base загружает IONC dropdown + sensor autocomplete; override через `super.initConfigHandlers(form, config)` если нужно дополнить
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: ToggleWidget styles + ActiveDashboardWidget refactor

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Implemented in |
|---|---|
| `serverMgr.GetServerObjects(serverID)` + handlers.go использует | Phase 1+2 |
| `usesNewSensorAutocomplete = true` дефолт | Phase 3 (Step 1) |
| `ActiveDashboardWidget.getConfigForm` рендерит objectName/sensor/style | Phase 3 (Step 2) |
| `ActiveDashboardWidget.parseConfigForm` парсит base поля | Phase 3 (Step 3) |
| `ActiveDashboardWidget.initConfigHandlers` (IONC dropdown + autocomplete) | Phase 3 (Step 4) |
| ToggleWidget cleanup (удалить дубль) | Phase 3 (Steps 5-7) |
| `static styles = ['slider', 'checkbox']` + `defaultStyle` | Phase 4 (Step 1) |
| `render()` диспатчит на renderSlider/renderCheckbox | Phase 4 (Step 2) |
| `renderCheckbox` с layout `[cb][name]` | Phase 4 (Step 2) |
| `renderCheckboxCommand` (diverge на root) | Phase 4 (Step 3) |
| `renderCheckboxFeedback` (fb-on/off/unknown на .toggle-cb) | Phase 4 (Step 4) |
| Click anywhere on widget triggers writeValue | Phase 4 (Step 2 — listener на root) |
| CSS material flat 24×24 + state classes | Phase 5 |
| CSS diverge на корне для checkbox style | Phase 5 |
| E2E checkbox renders .toggle-cb | Phase 6 |
| E2E click anywhere triggers writeValue | Phase 6 |
| E2E fb-on/unknown/diverge | Phase 6 |
| Regression sweep | Phase 7 |
| CLAUDE.md update | Phase 8 |
| Open question: defaultSize per style | НЕ реализуется (отложено по spec'у — простая версия без auto-resize по style) |

✅ Все требования spec'а покрыты.

**Placeholder scan:** грепнул TBD/TODO/«implement later» — нет (только TODO в комментариях про defer'нутую реализацию, согласовано со spec'ом).

**Type consistency:** проверил.
- `usesNewSensorAutocomplete` — единый идентификатор в base + удалён из toggle.
- `static styles`, `static defaultStyle`, `_currentStyle()` — единые имена.
- `renderSlider`/`renderCheckbox`/`renderSliderCommand`/`renderCheckboxCommand`/`renderSliderFeedback`/`renderCheckboxFeedback` — согласованная nomenclature.
- `[data-test="cb"]` (checkbox) vs `[data-test="track"]` (slider) — единое использование во всех тестах.
- `.toggle-style-slider` / `.toggle-style-checkbox` — единый префикс.

✅ Consistency сохранена.
