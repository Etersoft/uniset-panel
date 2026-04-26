# Dashboard Active Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-26-dashboard-active-generator-design.md`

**Goal:** Реализовать `GeneratorWidget extends ActiveDashboardWidget` — пятый active widget, обёртка вокруг готового `SignalGenerator` engine'а с UX для запуска/остановки + текущим значением. Один стиль `compact` (3×1), параметры через config dialog.

**Architecture:** Widget держит instance `SignalGenerator` (от `08-signal-generator.js`), запускает/останавливает по toggle. Каждый tick → `_writeRaw(value)` (custom helper, без per-tick confirm/state). Feedback от sensor игнорируется (`update()` no-op, как PushButton).

**Tech Stack:** ES6 class, Playwright E2E.

**E2E command form:** `docker compose run --rm e2e single/<spec>.spec.ts`. Stop dev profile first: `docker compose --profile dev down`.

---

## File Structure

| Файл | Действие | Ответственность |
|---|---|---|
| `ui/static/js/src/61-dashboard-active-generator.js` | **Create** | `GeneratorWidget` class — render + toggle + start/stop + config form (с conditional fields) + _writeRaw helper |
| `ui/static/js/src/62-dashboard-manager.js` | **Modify** (`WIDGET_TYPES` ~lines 6-19) | Зарегистрировать `'generator': GeneratorWidget` |
| `ui/static/css/style.css` | **Modify** (append) | `.generator-widget` + `.gen-label/value/toggle` + `.gen-toggle.running` |
| `tests/single/dashboard-active-generator.spec.ts` | **Create** | E2E 10 сценариев |
| `tests/single/dashboard-widgets.spec.ts` | **Modify** (line 4 + lines 183/193) | Update widget picker count: 12 → 13; добавить `'generator'` в WIDGET_TYPES const |
| `CLAUDE.md` | **Modify** | Active widgets section — добавить параграф про GeneratorWidget |

---

## Phase 0 — Baseline

### Task 0.1: Verify branch + run reference E2E

- [ ] **Step 1: Confirm branch**

Run: `git branch --show-current`
Expected: `story/dashboard-active-controls`

- [ ] **Step 2: Stop dev profile**

Run: `docker compose --profile dev down`

- [ ] **Step 3: Backend baseline**

Run: `go test -mod=vendor ./internal/...`
Expected: all PASS.

- [ ] **Step 4: Frontend baseline E2E**

Run:
```bash
docker compose run --rm e2e \
  single/dashboard-active-base.spec.ts \
  single/dashboard-active-toggle.spec.ts \
  single/dashboard-active-button.spec.ts \
  single/dashboard-active-setpoint.spec.ts \
  single/dashboard-widgets.spec.ts
```
Expected: all PASS.

If anything fails — STOP, report BLOCKED.

---

## Phase 1 — GeneratorWidget класс

### Task 1.1: Create `61-dashboard-active-generator.js`

**Files:**
- Create: `ui/static/js/src/61-dashboard-active-generator.js`

- [ ] **Step 1: Create the class file**

```javascript
// ============================================================================
// GeneratorWidget — обёртка вокруг SignalGenerator engine для dashboard.
//
// Запускает математический генератор (square/sin/cos/linear/random),
// каждый тик пишет в датчик через _writeRaw (fire-and-forget). Параметры
// настраиваются только через config dialog, на widget'е — Start/Stop toggle
// + текущее значение.
//
// Один стиль 'compact' (default 3×1). Сетpoint feedback игнорируется
// (update() no-op, как PushButton) — UI показывает что генератор послал.
//
// Config:
//   sensor      — имя датчика (от base)
//   sensorId    — числовой ID (от base)
//   objectName  — IONC object (default 'SharedMemory', от base)
//   label       — подпись виджета (default = имя датчика)
//   requireConfirmation — bool, спрашивать ли confirm при Start (от base)
//   type        — 'square' (default) | 'sin' | 'cos' | 'linear' | 'random'
//   min, max    — диапазон значений
//   step        — для linear/sin/cos (число точек на полуцикл)
//   pause       — для linear/sin/cos/square (ms между шагами)
//   pulseWidth  — для square (ms ширина импульса)
//   period      — для random (ms между генерациями)
// ============================================================================

class GeneratorWidget extends ActiveDashboardWidget {
    static type = 'generator';
    static displayName = 'Signal Generator';
    static description = 'Writes generated signal (square/sin/cos/linear/random) to a sensor';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12 L6 12 L6 4 L10 4 L10 20 L14 20 L14 4 L18 4 L18 12 L22 12"/></svg>';
    static defaultSize = { width: 3, height: 1 };
    static minSize = { width: 2, height: 1 };
    static maxSize = { width: 6, height: 2 };
    // Один стиль — base.getConfigForm НЕ рендерит style select когда styles.length <= 1.
    static styles = [];
    static defaultStyle = '';

    constructor(id, config, container) {
        super(id, config, container);
        this._signalGen = null;
        this._lastTickValue = null;
    }

    // === Render ===
    render() {
        const label = this.config?.label || this.config?.sensor || 'Generator';
        this.element = document.createElement('div');
        this.element.className = 'widget-content generator-widget';
        this.element.innerHTML = `
            <div class="gen-label" data-test="label">${escapeHtml(label)}</div>
            <div class="gen-value" data-test="value">--</div>
            <div class="gen-toggle" data-test="toggle" role="switch" aria-checked="false">
                <div class="gen-handle"></div>
            </div>
        `;
        this.container.appendChild(this.element);

        const toggle = this.element.querySelector('[data-test="toggle"]');
        toggle.addEventListener('click', (e) => { e.stopPropagation(); this._onToggle(); });
        // mousedown.preventDefault — toggle не должен забирать фокус на click
        toggle.addEventListener('mousedown', (e) => e.preventDefault());
    }

    // === SSE feedback override — игнорируем (как PushButton) ===
    update(value, error = null) {
        this.feedbackValue = value;
        this.value = value;
        this.error = error;
        // НЕ вызываем renderFeedback — UI показывает _lastTickValue от генератора.
    }

    // === Toggle handler ===
    async _onToggle() {
        if (!this.isInteractive()) return;
        if (this._isRunning()) {
            this._stop();
        } else {
            if (this.needsConfirmation() && !await this._confirm(this.config?.sensor || 'sensor')) return;
            this._start();
        }
    }

    async _confirm(sensorName) {
        return window.confirm(`Start generator on ${sensorName}? Будет писать каждый тик.`);
    }

    // === Start/Stop ===
    _start() {
        // Проверка: sensorId должен быть задан
        const sensorId = this.config?.sensorId ?? this.config?.sensor;
        if (sensorId === undefined || sensorId === null || sensorId === '') {
            this._setWriteState('error', 'Sensor not configured');
            return;
        }
        // Создать SignalGenerator с config + onTick
        this._signalGen = new SignalGenerator({
            type: this.config?.type || 'square',
            min: this.config?.min ?? 0,
            max: this.config?.max ?? 100,
            step: this.config?.step,
            pause: this.config?.pause,
            pulseWidth: this.config?.pulseWidth,
            period: this.config?.period,
            onTick: (value) => this._onTick(value),
        });
        this._signalGen.start();
        this._updateRunningUI(true);
    }

    _stop() {
        if (this._signalGen) {
            this._signalGen.stop();
            this._signalGen = null;
        }
        this._lastTickValue = null;
        this._updateValueDisplay(null);
        this._updateRunningUI(false);
    }

    _isRunning() {
        return !!this._signalGen?.isRunning();
    }

    _onTick(value) {
        this._lastTickValue = value;
        this._updateValueDisplay(value);
        this._writeRaw(value);
    }

    // _writeRaw — fire-and-forget POST на ionc/set, без per-tick confirm/state.
    // Errors → _stop + setWriteState('error') → UI: purple border + tooltip.
    async _writeRaw(value) {
        const sensorId = this.config?.sensorId ?? this.config?.sensor;
        const serverId = this._resolveServerId();
        if (!serverId) {
            this._stop();
            this._setWriteState('error', 'No connected server');
            return;
        }
        const objectName = this.config?.objectName || 'SharedMemory';
        const url = `/api/objects/${encodeURIComponent(objectName)}/ionc/set?server=${encodeURIComponent(serverId)}`;
        try {
            const resp = await controlledFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sensor_id: sensorId, value }),
            });
            if (!resp.ok) {
                const data = await resp.json().catch(() => ({}));
                console.warn('Generator write failed:', resp.status, data.error);
                this._stop();
                this._setWriteState('error', data.error || `HTTP ${resp.status}`);
            }
        } catch (e) {
            console.warn('Generator write exception:', e);
            this._stop();
            this._setWriteState('error', e.message);
        }
    }

    // === UI update helpers ===
    _updateValueDisplay(value) {
        if (!this.element) return;
        const valueEl = this.element.querySelector('[data-test="value"]');
        if (valueEl) {
            valueEl.textContent = (value !== null && value !== undefined) ? String(value) : '--';
            valueEl.classList.toggle('running', value !== null && value !== undefined);
        }
    }

    _updateRunningUI(isRunning) {
        if (!this.element) return;
        const toggle = this.element.querySelector('[data-test="toggle"]');
        if (toggle) {
            toggle.classList.toggle('running', isRunning);
            toggle.setAttribute('aria-checked', isRunning ? 'true' : 'false');
        }
    }

    // === ControlToken released во время работы → стоп ===
    _updateInteractivityClass() {
        super._updateInteractivityClass();
        if (this._isRunning() && !this.isInteractive()) {
            this._stop();
        }
    }

    // === Render hooks (не используются для Generator) ===
    renderFeedback() { /* no-op */ }
    renderCommand() { /* no-op */ }

    // === Cleanup ===
    destroy() {
        this._stop();
        super.destroy();
    }

    // === Config form ===
    static getActiveConfigFields(config = {}) {
        const type = config.type || 'square';
        const showLinSinCos = (type === 'linear' || type === 'sin' || type === 'cos');
        const showSquare = (type === 'square');
        const showRandom = (type === 'random');

        return `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Type</label>
                    <select class="widget-input" name="type" data-test="cfg-type">
                        <option value="square" ${type==='square'?'selected':''}>square</option>
                        <option value="sin"    ${type==='sin'?'selected':''}>sin</option>
                        <option value="cos"    ${type==='cos'?'selected':''}>cos</option>
                        <option value="linear" ${type==='linear'?'selected':''}>linear</option>
                        <option value="random" ${type==='random'?'selected':''}>random</option>
                    </select>
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>min</label>
                    <input type="number" class="widget-input" name="min" value="${config.min ?? 0}" data-test="cfg-min">
                </div>
                <div class="widget-config-field">
                    <label>max</label>
                    <input type="number" class="widget-input" name="max" value="${config.max ?? 100}" data-test="cfg-max">
                </div>
            </div>
            <div class="widget-config-row gen-cfg-lin-sin-cos" data-test="cfg-row-step-pause" style="display:${showLinSinCos?'flex':'none'}">
                <div class="widget-config-field">
                    <label>step</label>
                    <input type="number" class="widget-input" name="step" value="${config.step ?? 10}" data-test="cfg-step">
                </div>
                <div class="widget-config-field">
                    <label>pause (ms)</label>
                    <input type="number" class="widget-input" name="pause" value="${config.pause ?? 200}" min="1" data-test="cfg-pause">
                </div>
            </div>
            <div class="widget-config-row gen-cfg-square" data-test="cfg-row-square" style="display:${showSquare?'flex':'none'}">
                <div class="widget-config-field">
                    <label>pulseWidth (ms)</label>
                    <input type="number" class="widget-input" name="pulseWidth" value="${config.pulseWidth ?? 500}" min="1" data-test="cfg-pulseWidth">
                </div>
                <div class="widget-config-field">
                    <label>pause (ms)</label>
                    <input type="number" class="widget-input" name="pause-square" value="${config.pause ?? 500}" min="1" data-test="cfg-pause-square">
                </div>
            </div>
            <div class="widget-config-row gen-cfg-random" data-test="cfg-row-random" style="display:${showRandom?'flex':'none'}">
                <div class="widget-config-field">
                    <label>period (ms)</label>
                    <input type="number" class="widget-input" name="period" value="${config.period ?? 1000}" min="100" data-test="cfg-period">
                </div>
            </div>
        `;
    }

    // initConfigHandlers ОВЕРРАЙДИМ для conditional полей по type.
    // ОБЯЗАТЕЛЬНО зовём super.initConfigHandlers (для autocomplete + IONC dropdown).
    static initConfigHandlers(form, config = {}) {
        super.initConfigHandlers(form, config);
        // Idempotency для нашего type listener'а
        if (form.dataset.genHandlersWired === 'true') return;
        form.dataset.genHandlersWired = 'true';

        const typeSelect = form.querySelector('[name="type"]');
        const rowLinSinCos = form.querySelector('[data-test="cfg-row-step-pause"]');
        const rowSquare    = form.querySelector('[data-test="cfg-row-square"]');
        const rowRandom    = form.querySelector('[data-test="cfg-row-random"]');
        if (!typeSelect) return;

        const updateConditional = () => {
            const t = typeSelect.value;
            if (rowLinSinCos) rowLinSinCos.style.display = (t === 'linear' || t === 'sin' || t === 'cos') ? 'flex' : 'none';
            if (rowSquare)    rowSquare.style.display    = (t === 'square') ? 'flex' : 'none';
            if (rowRandom)    rowRandom.style.display    = (t === 'random') ? 'flex' : 'none';
        };
        typeSelect.addEventListener('change', updateConditional);
        // Не вызываем сразу — initial display уже установлен через template style attr.
    }

    static parseActiveConfigFields(form) {
        const type = form.querySelector('[name="type"]')?.value || 'square';
        const numOrDefault = (name, def) => {
            const v = Number(form.querySelector(`[name="${name}"]`)?.value);
            return Number.isFinite(v) ? v : def;
        };
        const minRaw = numOrDefault('min', 0);
        const maxRaw = numOrDefault('max', 100);
        // Validation: min<max swap; period>=100; pause>0; pulseWidth>0; step≠0
        const min = Math.min(minRaw, maxRaw);
        const max = Math.max(minRaw, maxRaw);

        const result = { type, min, max };
        if (type === 'linear' || type === 'sin' || type === 'cos') {
            const step = numOrDefault('step', 10);
            const pause = Math.max(1, numOrDefault('pause', 200));
            result.step = step !== 0 ? step : 10;
            result.pause = pause;
        } else if (type === 'square') {
            result.pulseWidth = Math.max(1, numOrDefault('pulseWidth', 500));
            // Note: square pause input has different name 'pause-square' для уникальности
            const pauseSq = Number(form.querySelector('[name="pause-square"]')?.value);
            result.pause = Math.max(1, Number.isFinite(pauseSq) ? pauseSq : 500);
        } else { // random
            result.period = Math.max(100, numOrDefault('period', 1000));
        }
        return result;
    }
}

window.GeneratorWidget = GeneratorWidget;
```

- [ ] **Step 2: Rebuild app.js**

Run from repo root: `make app`
Expected output last line: `Generated static/js/app.js from 38 files` (37 + 1 new file).

- [ ] **Step 3: Grep checks**

Run:
```bash
grep -c "class GeneratorWidget extends ActiveDashboardWidget" ui/static/js/app.js
grep -c "window.GeneratorWidget" ui/static/js/app.js
grep -c "_writeRaw" ui/static/js/app.js
```
Expected: each ≥ 1.

- [ ] **Step 4: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-generator.js ui/static/js/app.js
git commit -m "$(cat <<'EOF'
feat(dashboard): GeneratorWidget — signal generator (5-th active)

Пятый и последний active widget. Оборачивает готовый SignalGenerator
engine (08-signal-generator.js) для запуска тестовых сигналов в датчик
с dashboard'а.

Один стиль compact (default 3×1):
- label слева
- текущее значение по центру (зелёный когда running, '--' когда stopped)
- toggle Start/Stop справа (зелёный фон когда running)

Параметры через config dialog:
- type [square|sin|cos|linear|random]
- min, max
- conditional поля по type:
  * linear/sin/cos: step, pause
  * square: pulseWidth, pause
  * random: period

Behavior:
- Toggle on → SignalGenerator.start, onTick → _writeRaw (POST без
  per-tick confirm/state)
- Toggle off → SignalGenerator.stop, value → '--'
- Edit mode / без controlToken — toggle disabled (общий механизм)
- ControlToken released в процессе → автостоп
- POST error → автостоп + active-error border + tooltip
- destroy → _stop (нет утечек setInterval'ов)
- update() override = no-op (SSE feedback игнор, как PushButton)

CSS — отдельным шагом.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Регистрация в WIDGET_TYPES

### Task 2.1: Add 'generator' + update test count

**Files:**
- Modify: `ui/static/js/src/62-dashboard-manager.js` (line ~6-19)
- Modify: `tests/single/dashboard-widgets.spec.ts` (line 4 + lines 183/193)

- [ ] **Step 1: Update WIDGET_TYPES registry**

In `ui/static/js/src/62-dashboard-manager.js`, find:

```javascript
const WIDGET_TYPES = {
    'gauge': GaugeWidget,
    'level': LevelWidget,
    'led': LedWidget,
    'label': LabelWidget,
    'divider': DividerWidget,
    'statusbar': StatusBarWidget,
    'bargraph': BarGraphWidget,
    'digital': DigitalWidget,
    'toggle': ToggleWidget,
    'pushbutton': PushButtonWidget,
    'setpoint': SetpointWidget,
    'chart': ChartWidget
};
```

Replace with:

```javascript
const WIDGET_TYPES = {
    'gauge': GaugeWidget,
    'level': LevelWidget,
    'led': LedWidget,
    'label': LabelWidget,
    'divider': DividerWidget,
    'statusbar': StatusBarWidget,
    'bargraph': BarGraphWidget,
    'digital': DigitalWidget,
    'toggle': ToggleWidget,
    'pushbutton': PushButtonWidget,
    'setpoint': SetpointWidget,
    'generator': GeneratorWidget,
    'chart': ChartWidget
};
```

- [ ] **Step 2: Update test file**

In `tests/single/dashboard-widgets.spec.ts`:

(a) Line 4 — change WIDGET_TYPES array. Current:
```typescript
const WIDGET_TYPES = ['gauge', 'level', 'led', 'label', 'divider', 'statusbar', 'bargraph', 'digital', 'toggle', 'pushbutton', 'setpoint', 'chart'];
```
Replace with:
```typescript
const WIDGET_TYPES = ['gauge', 'level', 'led', 'label', 'divider', 'statusbar', 'bargraph', 'digital', 'toggle', 'pushbutton', 'setpoint', 'generator', 'chart'];
```

(b) Find line 183 — update test name:
```typescript
  test('Widget picker показывает все 12 типов виджетов', async ({ page }) => {
```
to:
```typescript
  test('Widget picker показывает все 13 типов виджетов', async ({ page }) => {
```

(c) Line ~193 — update count:
```typescript
    await expect(items).toHaveCount(12);
```
to:
```typescript
    await expect(items).toHaveCount(13);
```

- [ ] **Step 3: Rebuild and test**

Run:
```bash
make app
docker compose --profile dev down
docker compose run --rm e2e single/dashboard-widgets.spec.ts
```
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add ui/static/js/src/62-dashboard-manager.js ui/static/js/app.js tests/single/dashboard-widgets.spec.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): register GeneratorWidget in WIDGET_TYPES (count 12 → 13)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — CSS

### Task 3.1: Append generator styles

**Files:**
- Modify: `ui/static/css/style.css` (append at end)

- [ ] **Step 1: Append CSS**

```css

/* ============================================================================
 * GeneratorWidget — compact style
 * ============================================================================ */

.generator-widget {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    height: 100%;
    padding: 8px 12px;
    box-sizing: border-box;
}

.generator-widget .gen-label {
    font-size: 12px;
    font-weight: 600;
    color: #d8dce2;
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.generator-widget .gen-value {
    font-family: monospace;
    font-size: 18px;
    color: #6b7280;       /* серый когда stopped (--) */
    font-weight: 600;
    min-width: 50px;
    text-align: right;
    flex-shrink: 0;
}
.generator-widget .gen-value.running {
    color: #22c55e;       /* зелёный когда running */
}

.generator-widget .gen-toggle {
    width: 42px;
    height: 24px;
    background: #374151;
    border-radius: 12px;
    position: relative;
    cursor: pointer;
    transition: background 0.15s;
    flex-shrink: 0;
    user-select: none;
}
.generator-widget .gen-toggle:hover {
    background: #4b5563;
}
.generator-widget .gen-toggle.running {
    background: #22c55e;
}
.generator-widget .gen-toggle.running:hover {
    background: #16a34a;
}
.generator-widget .gen-toggle .gen-handle {
    width: 18px;
    height: 18px;
    background: #fff;
    border-radius: 50%;
    position: absolute;
    top: 3px;
    left: 3px;
    transition: left 0.15s;
}
.generator-widget .gen-toggle.running .gen-handle {
    left: 21px;
}
```

- [ ] **Step 2: Restart viewer + verify**

Run: `docker compose restart viewer 2>&1 | tail -2`
Run: `sleep 1 && grep -c "generator-widget\|gen-toggle" ui/static/css/style.css`
Expected: ≥ 5.

- [ ] **Step 3: Commit**

```bash
git add ui/static/css/style.css
git commit -m "$(cat <<'EOF'
feat(dashboard): CSS for GeneratorWidget

Compact layout: flex row label + value + toggle. Toggle slider 42×24
с handle 18px (зелёный когда running, серый когда stopped). Value text
зелёный когда есть значение, серый при '--'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — E2E тест

### Task 4.1: Write `dashboard-active-generator.spec.ts`

**Files:**
- Create: `tests/single/dashboard-active-generator.spec.ts`

- [ ] **Step 1: Create the file with 10 tests**

```typescript
import { test, expect } from '@playwright/test';

test.describe('GeneratorWidget — fifth active widget', () => {
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
            typeof (window as any).GeneratorWidget !== 'undefined' &&
            typeof (window as any).dashboardManager !== 'undefined' &&
            typeof (window as any).SignalGenerator !== 'undefined'
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

    async function createGeneratorDashboard(page, configOverrides: Record<string, unknown> = {}) {
        await page.evaluate((overrides) => {
            const w: any = window;
            const widgetCfg = {
                id: 'gen-1',
                type: 'generator',
                config: {
                    sensor: 'GEN_SENSOR',
                    sensorId: 100,
                    objectName: 'SharedMemory',
                    label: 'GEN',
                    type: 'random',
                    min: 0,
                    max: 100,
                    period: 200,
                    requireConfirmation: false,
                    ...overrides,
                },
                position: { col: 0, row: 0, width: 6, height: 2 },
            };
            const dashCfg = { meta: { name: 'TEST_GEN' }, widgets: [widgetCfg] };
            w.dashboardState.dashboards.set('TEST_GEN', dashCfg);
            w.dashboardManager.loadDashboard('TEST_GEN');
            w.switchView('dashboard');
        }, configOverrides);
        await page.locator('.generator-widget').first().waitFor({ state: 'visible', timeout: 5000 });
    }

    test('renders compact widget с label, value, toggle', async ({ page }) => {
        await createGeneratorDashboard(page, { label: 'MY GEN' });
        await expect(page.locator('.generator-widget').first()).toBeVisible();
        await expect(page.locator('[data-test="label"]').first()).toHaveText('MY GEN');
        await expect(page.locator('[data-test="value"]').first()).toHaveText('--');
        await expect(page.locator('[data-test="toggle"]').first()).toBeVisible();
        // initial: not running
        await expect(page.locator('[data-test="toggle"]').first()).not.toHaveClass(/running/);
    });

    test('toggle Start запускает SignalGenerator + первый POST', async ({ page }) => {
        const posts: any[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try { posts.push(JSON.parse(req.postData() || '{}')); } catch {}
            }
        });

        await createGeneratorDashboard(page, { type: 'random', period: 150 });

        // Click toggle to start
        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });

        // Wait for at least one tick
        await page.waitForTimeout(400);

        // Toggle should have running class
        await expect(page.locator('[data-test="toggle"]').first()).toHaveClass(/running/);

        // At least one POST happened with sensor_id=100 and value in [0,100]
        expect(posts.length).toBeGreaterThanOrEqual(1);
        expect(posts[0].sensor_id).toBe(100);
        expect(posts[0].value).toBeGreaterThanOrEqual(0);
        expect(posts[0].value).toBeLessThanOrEqual(100);
    });

    test('toggle Stop останавливает + value=--', async ({ page }) => {
        await createGeneratorDashboard(page, { type: 'random', period: 150 });

        // Start
        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(300);

        // Verify value is not --
        const valueRunning = await page.evaluate(() =>
            document.querySelector('[data-test="value"]')?.textContent);
        expect(valueRunning).not.toBe('--');

        // Stop
        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(100);

        // value back to --, toggle not running, _signalGen=null
        const valueStopped = await page.evaluate(() =>
            document.querySelector('[data-test="value"]')?.textContent);
        expect(valueStopped).toBe('--');
        await expect(page.locator('[data-test="toggle"]').first()).not.toHaveClass(/running/);

        const isNull = await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                return (w as any)._signalGen === null;
            }
            return false;
        });
        expect(isNull).toBe(true);
    });

    test('toggle disabled в edit mode — не запускается', async ({ page }) => {
        await createGeneratorDashboard(page, { type: 'random', period: 150 });
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.editMode = true;
            document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', { detail: { editMode: true } }));
        });

        let postSent = false;
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') postSent = true;
        });

        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(300);

        expect(postSent).toBe(false);
        await expect(page.locator('[data-test="toggle"]').first()).not.toHaveClass(/running/);
    });

    test('toggle disabled без controlToken — не запускается', async ({ page }) => {
        await createGeneratorDashboard(page, { type: 'random', period: 150 });
        await page.evaluate(() => {
            const w: any = window;
            w.state.control.hasController = false;
            w.state.control.isController = false;
            w.state.control.token = null;
            document.dispatchEvent(new CustomEvent('controlStatusChanged'));
        });

        let postSent = false;
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') postSent = true;
        });

        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(300);

        expect(postSent).toBe(false);
    });

    test('multiple ticks fire POST много раз', async ({ page }) => {
        const posts: any[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try { posts.push(JSON.parse(req.postData() || '{}')); } catch {}
            }
        });

        await createGeneratorDashboard(page, { type: 'random', period: 150 });

        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });

        // Period 150ms, update interval ~ period/20 = 7-8ms. За 600ms должно
        // быть много тиков. Проверяем минимум 3 (с большим запасом).
        await page.waitForTimeout(600);

        // Stop generator before assert (так чище для следующего теста)
        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });

        expect(posts.length).toBeGreaterThanOrEqual(3);
    });

    test('config dialog: type select показывает conditional поля', async ({ page }) => {
        await createGeneratorDashboard(page, { type: 'random' });
        // Enter edit mode and open config dialog programmatically
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.editMode = true;
            document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', { detail: { editMode: true } }));
            w.dashboardManager.showWidgetConfig('gen-1');
        });

        // Initial: random selected → period row visible, others hidden
        await expect(page.locator('[data-test="cfg-row-random"]')).toBeVisible();
        await expect(page.locator('[data-test="cfg-row-step-pause"]')).toBeHidden();
        await expect(page.locator('[data-test="cfg-row-square"]')).toBeHidden();

        // Switch to square
        await page.evaluate(() => {
            const sel = document.querySelector('[data-test="cfg-type"]') as HTMLSelectElement;
            sel.value = 'square';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await expect(page.locator('[data-test="cfg-row-square"]')).toBeVisible();
        await expect(page.locator('[data-test="cfg-row-random"]')).toBeHidden();

        // Switch to sin
        await page.evaluate(() => {
            const sel = document.querySelector('[data-test="cfg-type"]') as HTMLSelectElement;
            sel.value = 'sin';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await expect(page.locator('[data-test="cfg-row-step-pause"]')).toBeVisible();
        await expect(page.locator('[data-test="cfg-row-square"]')).toBeHidden();
    });

    test('controlToken released во время работы → автостоп', async ({ page }) => {
        await createGeneratorDashboard(page, { type: 'random', period: 150 });

        // Start
        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(200);
        await expect(page.locator('[data-test="toggle"]').first()).toHaveClass(/running/);

        // Release control
        await page.evaluate(() => {
            const w: any = window;
            w.state.control.hasController = false;
            w.state.control.isController = false;
            w.state.control.token = null;
            document.dispatchEvent(new CustomEvent('controlStatusChanged'));
        });
        await page.waitForTimeout(100);

        // Should be stopped
        await expect(page.locator('[data-test="toggle"]').first()).not.toHaveClass(/running/);
        const isNull = await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                return (w as any)._signalGen === null;
            }
            return false;
        });
        expect(isNull).toBe(true);
    });

    test('destroy widget останавливает генератор', async ({ page }) => {
        await createGeneratorDashboard(page, { type: 'random', period: 150 });

        // Capture widget instance reference for verification after destroy
        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(200);

        // Save ref to widget
        const isRunningBefore = await page.evaluate(() => {
            const w: any = window;
            const widget = w.dashboardState.widgets.get('gen-1');
            (window as any).__testWidgetRef = widget;
            return widget?._isRunning();
        });
        expect(isRunningBefore).toBe(true);

        // Remove widget
        await page.evaluate(() => {
            (window as any).dashboardManager.removeWidget('gen-1');
        });
        await page.waitForTimeout(100);

        // _signalGen should be null after destroy
        const isRunningAfter = await page.evaluate(() => {
            return ((window as any).__testWidgetRef as any)?._isRunning();
        });
        expect(isRunningAfter).toBe(false);
    });

    test('requireConfirmation один раз при Start, не каждый тик', async ({ page }) => {
        // Mock window.confirm to count calls
        await page.evaluate(() => {
            (window as any).__confirmCount = 0;
            (window as any).confirm = () => { (window as any).__confirmCount++; return true; };
        });

        await createGeneratorDashboard(page, { type: 'random', period: 150, requireConfirmation: true });

        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(500);  // несколько тиков

        // Stop
        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });

        const count = await page.evaluate(() => (window as any).__confirmCount);
        expect(count).toBe(1);  // exactly one confirm at Start
    });
});
```

- [ ] **Step 2: Run the spec**

Run:
```bash
docker compose --profile dev down
docker compose run --rm e2e single/dashboard-active-generator.spec.ts
```
Expected: 10/10 PASS.

If FAIL: read errors. Common issues:
- `posts.length < 3` for "multiple ticks": увеличить waitForTimeout (700ms должно хватить).
- conditional rows visible не правильно: проверить `initConfigHandlers` дёргает `super.initConfigHandlers` ровно один раз; idempotency через `form.dataset.genHandlersWired`.
- destroy test fails — `_signalGen` остался не null: проверить что widget.destroy() реально вызывается из removeWidget'а dashboard-manager'а.

Iterate until 10/10 PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/single/dashboard-active-generator.spec.ts
git commit -m "$(cat <<'EOF'
test(dashboard): E2E for GeneratorWidget

10 cases:
- renders compact widget с label/value/toggle
- toggle Start → SignalGenerator + первый POST
- toggle Stop → останавливает + value=--
- toggle disabled в edit mode
- toggle disabled без controlToken
- multiple ticks fire POST много раз
- config dialog conditional fields per type
- controlToken released → автостоп
- destroy widget → стоп генератора
- requireConfirmation один раз при Start

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — Regression sweep

### Task 5.1: Combined sweep

- [ ] **Step 1: Stop dev profile + run all related specs**

Run:
```bash
docker compose --profile dev down
docker compose run --rm e2e \
  single/dashboard.spec.ts \
  single/dashboard-sse.spec.ts \
  single/dashboard-widgets.spec.ts \
  single/dashboard-active-base.spec.ts \
  single/dashboard-active-toggle.spec.ts \
  single/dashboard-active-button.spec.ts \
  single/dashboard-active-setpoint.spec.ts \
  single/dashboard-active-generator.spec.ts
```

Expected: all PASS.

- [ ] **Step 2: If anything fails — investigate root cause**

Most likely sources of regression:
- Widget picker count off → check Phase 2.
- `dashboard-widgets.spec.ts` failure due to missing generator type — check Phase 2 Step 2.

Fix root cause. Don't move forward red.

- [ ] **Step 3: Report final result**

If all green — Phase 5 done.

---

## Phase 6 — Документация

### Task 6.1: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Find SetpointWidget paragraph**

Run: `grep -n "SetpointWidget\|Sensor autocomplete" CLAUDE.md | head -5`

- [ ] **Step 2: Append GeneratorWidget paragraph after SetpointWidget block**

Find the line just before "**Sensor autocomplete (..." (или where SetpointWidget block ends). Insert new paragraph:

```markdown

**GeneratorWidget (`61-dashboard-active-generator.js`):** обёртка вокруг
SignalGenerator engine (`08-signal-generator.js`) для запуска тестовых
сигналов в датчик с dashboard'а.

Конфиг: `objectName` (от base), `sensorId` (от base), `label` (от base),
`requireConfirmation` (от base), `type` (`square` default | `sin` | `cos`
| `linear` | `random`), `min`/`max`, и conditional поля по типу:
- `linear`/`sin`/`cos`: `step`, `pause` (ms)
- `square`: `pulseWidth`, `pause` (ms)
- `random`: `period` (ms)

**Стиль один — `compact`** (defaultSize 3×1): label слева, текущее
значение по центру (зелёный когда running, '--' когда stopped), toggle
Start/Stop справа (зелёный фон когда running). `static styles = []` —
base.getConfigForm не рендерит style select.

**Behavior:**
- Toggle on → создаёт `SignalGenerator` instance, `start()`, onTick →
  `_writeRaw(value)` (custom helper, fire-and-forget POST без per-tick
  confirm/state).
- Toggle off → `signalGen.stop()`, instance = null, value → '--'.
- POST error → автостоп + `active-error` (purple border + tooltip).
- ControlToken released во время работы → автостоп через override
  `_updateInteractivityClass`.
- `destroy()` override → `_stop()` + `super.destroy()` (нет утечек таймеров).
- `update()` override = no-op (SSE feedback игнорируется как у PushButton).
- `requireConfirmation` спрашивается ОДИН РАЗ при Start, не на каждом тике.
- Не persist running state между reload'ами (после reload всегда stopped).

**Config form:** conditional поля по type через `initConfigHandlers` override —
type select change handler показывает/скрывает соответствующие row'ы.
Idempotency через `form.dataset.genHandlersWired`.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: GeneratorWidget — пятый и последний active widget

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Implemented in |
|---|---|
| `GeneratorWidget extends ActiveDashboardWidget` | Phase 1 (Task 1.1) |
| Один стиль compact (`static styles = []`) | Phase 1 + Phase 3 (CSS) |
| Render: label + value + toggle | Phase 1 (`render()`) + Phase 3 (CSS) |
| Toggle Start/Stop + isRunning state | Phase 1 (`_onToggle`, `_start`, `_stop`, `_isRunning`) |
| SignalGenerator instance management + onTick | Phase 1 (`_start`, `_onTick`) |
| `_writeRaw` helper (fire-and-forget без per-tick confirm) | Phase 1 |
| update() override = no-op | Phase 1 |
| ControlToken released → автостоп | Phase 1 (`_updateInteractivityClass` override) |
| destroy → stop | Phase 1 (`destroy` override) |
| Config form: type select + min/max + conditional fields | Phase 1 (`getActiveConfigFields` + `initConfigHandlers`) |
| Validation в parseActiveConfigFields (min/max swap, period>=100, etc.) | Phase 1 (`parseActiveConfigFields`) |
| requireConfirmation один раз при Start | Phase 1 (`_onToggle` + `_confirm`) |
| POST error → автостоп + active-error | Phase 1 (`_writeRaw`) |
| Регистрация в WIDGET_TYPES (count 12 → 13) | Phase 2 |
| CSS: `.generator-widget` + `.gen-{label,value,toggle,handle}` + .running | Phase 3 |
| E2E: 10 сценариев | Phase 4 |
| Regression sweep | Phase 5 |
| CLAUDE.md update | Phase 6 |

✅ Все требования spec'а покрыты.

**Placeholder scan:** TBD/FIXME/XXX — нет (только Future Enhancements в spec'е, согласовано).

**Type consistency:**
- `_signalGen`, `_lastTickValue`, `_onTick`, `_writeRaw`, `_start`, `_stop`, `_isRunning`, `_updateValueDisplay`, `_updateRunningUI`, `_updateInteractivityClass` — единые имена везде.
- `[data-test="label"]`, `[data-test="value"]`, `[data-test="toggle"]`, `[data-test="cfg-type"]`, `[data-test="cfg-row-{step-pause,square,random}"]` — единое использование в render и тестах.
- `WIDGET_TYPES` count: 13 — синхронизирован между manager.js и тестом.
- CSS селекторы matches HTML `class="gen-label"` / `class="gen-value"` / `class="gen-toggle"` / `.running` — единая schema.
