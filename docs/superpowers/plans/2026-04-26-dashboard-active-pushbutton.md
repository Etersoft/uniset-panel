# Dashboard Active Push Button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-26-dashboard-active-pushbutton-design.md`

**Goal:** Реализовать `PushButtonWidget extends ActiveDashboardWidget` — write-only momentary/pulse кнопка для команд, с 3 визуальными стилями (`flat`/`mushroom`/`pill`).

**Architecture:** Отдельный класс (не style toggle'а) — другая семантика: write-only, нет двух-состоянного латча. Использует готовый foundation (`getConfigForm`/`parseConfigForm`/`initConfigHandlers` из base). Pulse режим: click → POST valueOn → setTimeout(pulseWidth) → POST valueOff. Momentary: mousedown → POST valueOn; window-level mouseup → POST valueOff (guard от потери mouseup при mouseleave). `update()` override — игнорируем feedback от своего sensor'а.

**Tech Stack:** ES6 класс, Playwright E2E.

**E2E command form:** `docker compose run --rm e2e single/<spec>.spec.ts`. Stop dev profile first: `docker compose --profile dev down`.

---

## File Structure

| Файл | Действие | Ответственность |
|---|---|---|
| `ui/static/js/src/61-dashboard-active-button.js` | **Create** | `PushButtonWidget` class — render dispatch по style, pulse/momentary handlers, config form fields, update() no-op override |
| `ui/static/js/src/62-dashboard-manager.js` | **Modify** (`WIDGET_TYPES` ~line 15) | Зарегистрировать `'pushbutton': PushButtonWidget` |
| `ui/static/css/style.css` | **Modify** (append) | `.pushbutton-widget` + `.pushbutton-style-{flat,mushroom,pill}` + `.pb-btn.pressed` + `@keyframes pb-pulse-flash` |
| `tests/single/dashboard-active-button.spec.ts` | **Create** | E2E ~7 сценариев: render styles, pulse-flow, momentary-flow + mouseleave guard, edit-mode block, control-token block, custom config |
| `tests/single/dashboard-widgets.spec.ts` | **Modify** (line 4 + line 183) | Update widget picker count: 10 → 11; добавить `'pushbutton'` в `WIDGET_TYPES` const |
| `CLAUDE.md` | **Modify** | Active widgets section — добавить параграф про PushButtonWidget |

---

## Phase 0 — Baseline

### Task 0.1: Verify branch + run reference E2E

- [ ] **Step 1: Confirm branch and clean state**

Run: `git branch --show-current`
Expected: `story/dashboard-active-controls`

- [ ] **Step 2: Stop dev profile**

Run: `docker compose --profile dev down`

- [ ] **Step 3: Backend baseline (quick safety check)**

Run: `go test -mod=vendor ./internal/...`
Expected: all PASS.

- [ ] **Step 4: Frontend baseline E2E**

Run:
```bash
docker compose run --rm e2e \
  single/dashboard-active-base.spec.ts \
  single/dashboard-active-toggle.spec.ts \
  single/dashboard-widgets.spec.ts
```
Expected: smoke 2/2 + toggle 13/13 (8 slider + 5 checkbox) + widgets 19/19 → all PASS. Reference for "no regressions" later.

If anything fails — STOP, report BLOCKED before Phase 1.

---

## Phase 1 — PushButtonWidget класс

### Task 1.1: Create `61-dashboard-active-button.js`

**Files:**
- Create: `ui/static/js/src/61-dashboard-active-button.js`

- [ ] **Step 1: Create the file with the class**

```javascript
// ============================================================================
// PushButtonWidget — write-only momentary/pulse кнопка для команд.
//
// Семантика отличается от toggle: нет двух-состоянного латча, нет feedback
// отображения (push-button — fire-and-forget команда). update() override
// в no-op (feedback игнорируется).
//
// Config:
//   sensor      — имя датчика (от base)
//   sensorId    — числовой ID (от base)
//   objectName  — IONC object (default 'SharedMemory', от base)
//   label       — подпись на кнопке (default = sensor name)
//   valueOn     — числовое значение «нажато» (default 1)
//   valueOff    — числовое значение «отпущено» (default 0)
//   mode        — 'pulse' (default) | 'momentary'
//   pulseWidth  — ms, длительность импульса для pulse режима (default 500)
//   style       — 'flat' (default) | 'mushroom' | 'pill'
//   requireConfirmation — bool (от base; в momentary НЕ работает, warning в форме)
// ============================================================================

class PushButtonWidget extends ActiveDashboardWidget {
    static type = 'pushbutton';
    static displayName = 'Push Button';
    static description = 'Momentary/pulse command button (write-only)';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>';
    static styles = ['flat', 'mushroom', 'pill'];
    static defaultStyle = 'flat';
    static defaultSize = { width: 2, height: 1 };
    static minSize = { width: 2, height: 1 };
    static maxSize = { width: 6, height: 3 };

    // Helper: подсказка для выбора размера на стороне формы конфига
    // (dashboard-manager при первом создании использует static defaultSize;
    // юзер может ресайзить вручную drag handle'ом).
    static getDefaultSizeForStyle(style) {
        if (style === 'mushroom') return { width: 2, height: 2 };
        return { width: 2, height: 1 };
    }

    // === SSE feedback override — игнорируем (push-button fire-and-forget) ===
    update(value, error = null) {
        // Сохраняем поля для совместимости с base (writeState handlers могут читать),
        // но НЕ вызываем renderFeedback — push-button не визуализирует feedback своего
        // sensor'а (valueOn пролетает за миллисекунды и не несёт смысла оператору).
        this.feedbackValue = value;
        this.value = value;
        this.error = error;
    }

    _currentStyle() {
        return this.config?.style || PushButtonWidget.defaultStyle;
    }

    _currentMode() {
        return this.config?.mode || 'pulse';
    }

    // === Render ===
    render() {
        const style = this._currentStyle();
        const label = this.config?.label || this.config?.sensor || 'BUTTON';

        this.element = document.createElement('div');
        this.element.className = `widget-content pushbutton-widget pushbutton-style-${style}`;
        this.element.innerHTML = `<button class="pb-btn" data-test="btn">${escapeHtml(label)}</button>`;
        this.container.appendChild(this.element);

        const btn = this.element.querySelector('[data-test="btn"]');
        if (this._currentMode() === 'momentary') {
            this._bindMomentary(btn);
        } else {
            btn.addEventListener('click', () => this._onPulseClick());
        }
    }

    // === Pulse mode handler ===
    _onPulseClick() {
        if (!this.isInteractive()) return;
        const valueOn = this.config?.valueOn ?? 1;
        const valueOff = this.config?.valueOff ?? 0;
        const pulseWidth = this.config?.pulseWidth ?? 500;

        // Visual flash (300ms независимо от pulseWidth — это UI feedback).
        const btn = this.element?.querySelector('[data-test="btn"]');
        if (btn) {
            btn.classList.add('pulsing');
            setTimeout(() => btn?.classList.remove('pulsing'), 300);
        }

        // POST valueOn → wait pulseWidth → POST valueOff.
        // Второй POST через _writeValueRaw чтобы не дублировать confirm dialog.
        this.writeValue(valueOn);
        setTimeout(() => this._writeValueRaw(valueOff), pulseWidth);
    }

    // === Momentary mode handler ===
    _bindMomentary(btn) {
        const valueOn = this.config?.valueOn ?? 1;
        const valueOff = this.config?.valueOff ?? 0;

        const onDown = (e) => {
            if (!this.isInteractive()) return;
            e.preventDefault();
            btn.classList.add('pressed');
            this.writeValue(valueOn);
            // Window-level listeners — гарантия release даже если мышь ушла за пределы кнопки.
            const onUp = () => {
                btn.classList.remove('pressed');
                this._writeValueRaw(valueOff);
                window.removeEventListener('mouseup', onUp);
                window.removeEventListener('touchend', onUp);
            };
            window.addEventListener('mouseup', onUp);
            window.addEventListener('touchend', onUp);
        };
        btn.addEventListener('mousedown', onDown);
        btn.addEventListener('touchstart', onDown);
    }

    // Вспомогательный write без confirm dialog (для второго шага pulse / release momentary).
    async _writeValueRaw(value) {
        const orig = this.config?.requireConfirmation;
        if (this.config) this.config.requireConfirmation = false;
        try { await this.writeValue(value); }
        finally { if (this.config) this.config.requireConfirmation = orig; }
    }

    // Push-button doesn't visualize commandValue or feedbackValue — overrides пустые.
    renderCommand() { /* no-op */ }
    renderFeedback() { /* no-op */ }

    // === Config form ===
    static getActiveConfigFields(config = {}) {
        const mode = config.mode || 'pulse';
        return `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Mode</label>
                    <select class="widget-input" name="mode" data-test="cfg-mode">
                        <option value="pulse" ${mode === 'pulse' ? 'selected' : ''}>pulse</option>
                        <option value="momentary" ${mode === 'momentary' ? 'selected' : ''}>momentary</option>
                    </select>
                </div>
                <div class="widget-config-field">
                    <label>Pulse width (ms)</label>
                    <input type="number" class="widget-input" name="pulseWidth"
                           value="${config.pulseWidth ?? 500}" min="50" data-test="cfg-pulseWidth">
                    <small style="color:#6b7280">Применяется только в pulse mode</small>
                </div>
            </div>
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
            <div class="widget-config-field" data-momentary-warning style="display:${mode === 'momentary' ? '' : 'none'}">
                <small style="color:#f59e0b">⚠ В momentary режиме requireConfirmation не работает (POST уйдёт без диалога).</small>
            </div>
        `;
    }

    static initConfigHandlers(form, config = {}) {
        super.initConfigHandlers(form, config);
        // Дополнительно: показывать warning при выборе momentary mode.
        const modeSel = form.querySelector('[name="mode"]');
        const warning = form.querySelector('[data-momentary-warning]');
        if (!modeSel || !warning) return;
        const update = () => { warning.style.display = modeSel.value === 'momentary' ? '' : 'none'; };
        modeSel.addEventListener('change', update);
        update();
    }

    static parseActiveConfigFields(form) {
        return {
            mode:       form.querySelector('[name="mode"]')?.value || 'pulse',
            pulseWidth: parseInt(form.querySelector('[name="pulseWidth"]')?.value, 10) || 500,
            valueOff:   Number(form.querySelector('[name="valueOff"]')?.value ?? 0),
            valueOn:    Number(form.querySelector('[name="valueOn"]')?.value ?? 1),
        };
    }
}

window.PushButtonWidget = PushButtonWidget;
```

- [ ] **Step 2: Rebuild app.js**

Run: `make app`
Expected: `Generated static/js/app.js from 36 files` (count incremented by 1).

- [ ] **Step 3: Grep checks**

Run: `grep -c "class PushButtonWidget extends ActiveDashboardWidget" ui/static/js/app.js`
Expected: `1`.

Run: `grep -c "window.PushButtonWidget" ui/static/js/app.js`
Expected: ≥ 1.

- [ ] **Step 4: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-button.js ui/static/js/app.js
git commit -m "feat(dashboard): PushButtonWidget — write-only command button

Третий active widget. Семантически отличается от toggle: write-only,
нет двух-состоянного латча, feedback от своего sensor'а игнорируется
(fire-and-forget команда).

Поддерживает 2 режима через config.mode:
- 'pulse' (default): click → POST valueOn → wait pulseWidth → POST valueOff
- 'momentary': mousedown → POST valueOn; window-level mouseup → POST valueOff
  (window-level guard защищает от потери mouseup при mouseleave)

3 визуальных стиля через static styles=['flat','mushroom','pill']
(default 'flat'). Style select рендерится автоматически базовым
getConfigForm. CSS — отдельным шагом.

update() override игнорирует SSE feedback от sensor'а — но сохраняет
поля для совместимости с base writeState handlers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — Регистрация в WIDGET_TYPES

### Task 2.1: Add to WIDGET_TYPES + update widget-picker test count

**Files:**
- Modify: `ui/static/js/src/62-dashboard-manager.js` (line 6-17)
- Modify: `tests/single/dashboard-widgets.spec.ts` (lines 4 + 183)

- [ ] **Step 1: Add 'pushbutton' to WIDGET_TYPES**

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
    'chart': ChartWidget
};
```

- [ ] **Step 2: Update widget picker count test**

In `tests/single/dashboard-widgets.spec.ts`, find line 4:

```typescript
const WIDGET_TYPES = ['gauge', 'level', 'led', 'label', 'divider', 'statusbar', 'bargraph', 'digital', 'toggle', 'chart'];
```

Replace with:

```typescript
const WIDGET_TYPES = ['gauge', 'level', 'led', 'label', 'divider', 'statusbar', 'bargraph', 'digital', 'toggle', 'pushbutton', 'chart'];
```

Find line ~183:

```typescript
  test('Widget picker показывает все 10 типов виджетов', async ({ page }) => {
```

Replace with:

```typescript
  test('Widget picker показывает все 11 типов виджетов', async ({ page }) => {
```

Find line ~193:

```typescript
    await expect(items).toHaveCount(10);
```

Replace with:

```typescript
    await expect(items).toHaveCount(11);
```

- [ ] **Step 3: Rebuild app.js**

Run: `make app`
Expected: success.

- [ ] **Step 4: Run dashboard-widgets test**

Run: `docker compose --profile dev down`
Run: `docker compose run --rm e2e single/dashboard-widgets.spec.ts`
Expected: 19/19 PASS (with new count assertion).

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/62-dashboard-manager.js ui/static/js/app.js tests/single/dashboard-widgets.spec.ts
git commit -m "feat(dashboard): register PushButtonWidget in WIDGET_TYPES (count 10 → 11)

Widget picker test обновлён: ожидаем 11 типов виджетов.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 — CSS

### Task 3.1: Append push-button styles to style.css

**Files:**
- Modify: `ui/static/css/style.css` (append at end)

- [ ] **Step 1: Append CSS**

```css

/* ============================================================================
 * PushButtonWidget — base layout
 * ============================================================================ */

.pushbutton-widget {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 10px;
    box-sizing: border-box;
}

.pushbutton-widget .pb-btn {
    cursor: pointer;
    transition: background 0.1s, color 0.1s, border-color 0.1s, box-shadow 0.2s, transform 0.05s;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    user-select: none;
}

/* === flat (default) — Material primary === */
.pushbutton-style-flat .pb-btn {
    padding: 10px 24px;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    box-shadow: 0 2px 4px rgba(0,0,0,.3);
}
.pushbutton-style-flat .pb-btn.pressed {
    background: #2563eb;
    transform: translateY(1px);
    box-shadow: 0 1px 2px rgba(0,0,0,.3);
}

/* === mushroom — SCADA круглая === */
.pushbutton-style-mushroom .pb-btn {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, #ef4444, #b91c1c);
    border: 3px solid #7f1d1d;
    color: #fff;
    font-size: 11px;
    box-shadow: 0 4px 8px rgba(0,0,0,.5), inset 0 -4px 8px rgba(0,0,0,.3);
}
.pushbutton-style-mushroom .pb-btn.pressed {
    box-shadow: 0 1px 3px rgba(0,0,0,.5), inset 0 4px 8px rgba(0,0,0,.4);
    transform: translateY(2px);
}

/* === pill — Compact outline === */
.pushbutton-style-pill .pb-btn {
    padding: 8px 18px;
    background: transparent;
    color: #d8dce2;
    border: 2px solid #6b7280;
    border-radius: 20px;
    font-size: 12px;
}
.pushbutton-style-pill .pb-btn:hover {
    border-color: #22c55e;
    color: #22c55e;
}
.pushbutton-style-pill .pb-btn.pressed {
    background: #22c55e;
    color: #fff;
    border-color: #22c55e;
}

/* === pulsing — кратковременный flash для pulse mode === */
.pb-btn.pulsing {
    animation: pb-pulse-flash 0.3s ease-out;
}
@keyframes pb-pulse-flash {
    0%   { background: #fbbf24; box-shadow: 0 0 8px rgba(251, 191, 36, 0.8); }
    100% { /* возврат к нормали — каскадом из стиля */ }
}
```

- [ ] **Step 2: Restart viewer (Go server reads CSS at startup)**

Run: `docker compose restart viewer 2>&1 | tail -2`

- [ ] **Step 3: Curl-verify served CSS**

Run: `curl -s http://localhost:8000/static/css/style.css | grep -c "pushbutton-style-"`
Expected: ≥ 3 (declarations of flat/mushroom/pill).

- [ ] **Step 4: Commit**

```bash
git add ui/static/css/style.css
git commit -m "feat(dashboard): CSS for PushButtonWidget

3 стиля (flat / mushroom / pill) + .pressed state + pb-pulse-flash
animation для pulse mode visual feedback.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 — E2E тест

### Task 4.1: Write `dashboard-active-button.spec.ts`

**Files:**
- Create: `tests/single/dashboard-active-button.spec.ts`
- Read for pattern: `tests/single/dashboard-active-toggle.spec.ts`

- [ ] **Step 1: Read existing toggle E2E for pattern reference**

Run: `head -80 tests/single/dashboard-active-toggle.spec.ts`

Note: route mocking, state.control в-place mutation, `dashboardManager` singleton, `dispatchEvent` click pattern, `[data-test="..."]` selectors, beforeEach with `waitForFunction` для connected server.

- [ ] **Step 2: Write the spec**

Create `tests/single/dashboard-active-button.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('PushButtonWidget — third active widget', () => {
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
            typeof (window as any).PushButtonWidget !== 'undefined' &&
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

    async function createButtonDashboard(page, configOverrides: Record<string, unknown> = {}) {
        await page.evaluate((overrides) => {
            const w: any = window;
            const widgetCfg = {
                id: 'pb-1',
                type: 'pushbutton',
                config: {
                    sensor: 'TEST_RESET',
                    sensorId: 100,
                    objectName: 'SharedMemory',
                    style: 'flat',
                    mode: 'pulse',
                    pulseWidth: 200,
                    valueOff: 0,
                    valueOn: 1,
                    label: 'RESET',
                    ...overrides,
                },
                position: { col: 0, row: 0, width: 2, height: 1 },
            };
            const dashCfg = {
                meta: { name: 'TEST_PB', description: '' },
                widgets: [widgetCfg],
            };
            w.dashboardState.dashboards.set('TEST_PB', dashCfg);
            w.dashboardManager.loadDashboard('TEST_PB');
            w.switchView('dashboard');
        }, configOverrides);
        await page.locator('[data-test="btn"]').first().waitFor({ state: 'visible', timeout: 5000 });
    }

    test('renders correct style class for each style', async ({ page }) => {
        await createButtonDashboard(page, { style: 'flat' });
        await expect(page.locator('.pushbutton-style-flat').first()).toBeVisible();
        await expect(page.locator('[data-test="btn"]').first()).toHaveText('RESET');
    });

    test('mushroom style renders with style class', async ({ page }) => {
        await createButtonDashboard(page, { style: 'mushroom', label: 'STOP' });
        await expect(page.locator('.pushbutton-style-mushroom').first()).toBeVisible();
        await expect(page.locator('[data-test="btn"]').first()).toHaveText('STOP');
    });

    test('pill style renders with style class', async ({ page }) => {
        await createButtonDashboard(page, { style: 'pill', label: 'ACK' });
        await expect(page.locator('.pushbutton-style-pill').first()).toBeVisible();
        await expect(page.locator('[data-test="btn"]').first()).toHaveText('ACK');
    });

    test('pulse mode: click → POST valueOn → wait → POST valueOff', async ({ page }) => {
        const posts: { value: number; time: number }[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try {
                    const body = JSON.parse(req.postData() || '{}');
                    posts.push({ value: body.value, time: Date.now() });
                } catch {}
            }
        });

        await createButtonDashboard(page, { mode: 'pulse', pulseWidth: 200, valueOff: 0, valueOn: 1 });
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        // Wait enough time for pulse cycle
        await page.waitForTimeout(500);

        expect(posts.length).toBeGreaterThanOrEqual(2);
        expect(posts[0].value).toBe(1);
        expect(posts[1].value).toBe(0);
        // Time gap should be ≥ pulseWidth (within reason)
        expect(posts[1].time - posts[0].time).toBeGreaterThanOrEqual(150);
    });

    test('momentary mode: mousedown → POST valueOn; window mouseup → POST valueOff', async ({ page }) => {
        const posts: { value: number }[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try {
                    const body = JSON.parse(req.postData() || '{}');
                    posts.push({ value: body.value });
                } catch {}
            }
        });

        await createButtonDashboard(page, { mode: 'momentary', valueOff: 0, valueOn: 1 });

        // mousedown on button
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        });
        await page.waitForTimeout(100);
        // Window-level mouseup (simulates user releasing mouse anywhere)
        await page.evaluate(() => {
            window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        });
        await page.waitForTimeout(200);

        expect(posts.length).toBeGreaterThanOrEqual(2);
        expect(posts[0].value).toBe(1);
        expect(posts[1].value).toBe(0);
    });

    test('edit mode: click does not write', async ({ page }) => {
        await createButtonDashboard(page);
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.editMode = true;
            document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', { detail: { editMode: true } }));
        });

        let requestSent = false;
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') requestSent = true;
        });

        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(500);
        expect(requestSent).toBe(false);
    });

    test('control token absent: click does not write', async ({ page }) => {
        await createButtonDashboard(page);
        await page.evaluate(() => {
            const w: any = window;
            w.state.control.enabled = true;
            w.state.control.isController = false;
            w.state.control.hasController = false;
            w.state.control.token = null;
            document.dispatchEvent(new CustomEvent('controlStatusChanged', { detail: w.state.control }));
        });

        let requestSent = false;
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') requestSent = true;
        });
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(500);
        expect(requestSent).toBe(false);
    });

    test('custom valueOn/valueOff sent in pulse', async ({ page }) => {
        const posts: { value: number }[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try {
                    const body = JSON.parse(req.postData() || '{}');
                    posts.push({ value: body.value });
                } catch {}
            }
        });

        await createButtonDashboard(page, { mode: 'pulse', pulseWidth: 100, valueOff: 5, valueOn: 42 });
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(400);

        expect(posts.length).toBeGreaterThanOrEqual(2);
        expect(posts[0].value).toBe(42);
        expect(posts[1].value).toBe(5);
    });
});
```

- [ ] **Step 3: Run the spec**

Run: `docker compose --profile dev down`
Run: `docker compose run --rm e2e single/dashboard-active-button.spec.ts`
Expected: 7/7 PASS.

If FAIL — debug. Common issues:
- Selector `[data-test="btn"]` не виден — проверить `renderHTML` в push-button class.
- `posts.length < 2` для pulse — увеличить `waitForTimeout` (может быть PlaywrightSlow CI).
- Momentary не release'ит — проверить что event listener на window'е, не на btn.

Iterate until all 7 PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/single/dashboard-active-button.spec.ts
git commit -m "test(dashboard): E2E for PushButtonWidget

7 cases:
- renders correct style class (flat / mushroom / pill — 3 теста)
- pulse mode: 2 POST'а с правильными values и timing
- momentary mode: mousedown → valueOn, window mouseup → valueOff
- edit mode: click does not write
- control token absent: click does not write
- custom valueOn/valueOff propagates to POST body

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5 — Regression sweep

### Task 5.1: Combined sweep

- [ ] **Step 1: Stop dev profile**

Run: `docker compose --profile dev down`

- [ ] **Step 2: Run all related specs**

Run:
```bash
docker compose run --rm e2e \
  single/dashboard.spec.ts \
  single/dashboard-sse.spec.ts \
  single/dashboard-widgets.spec.ts \
  single/dashboard-active-base.spec.ts \
  single/dashboard-active-toggle.spec.ts \
  single/dashboard-active-button.spec.ts
```

Expected: all PASS (smoke 2/2 + toggle 13/13 + button 7/7 + dashboard widgets 19/19 + sse + dashboard).

- [ ] **Step 3: If anything fails — investigate root cause**

Most likely sources of regression:
- `dashboard-widgets.spec.ts` count off — check Phase 2 Step 2.
- `dashboard-active-toggle.spec.ts` broken from PushButton CSS bleed — but selectors `pushbutton-*` should be orthogonal.

Fix root cause. Don't move forward red.

- [ ] **Step 4: Report final result**

If all green — Phase 5 done.

---

## Phase 6 — Документация

### Task 6.1: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (Active dashboard widgets section)

- [ ] **Step 1: Find existing active widgets section**

Run: `grep -n "ToggleWidget\|Active dashboard widgets" CLAUDE.md | head -5`

- [ ] **Step 2: Add PushButtonWidget paragraph**

Find the ToggleWidget paragraph block (after "**Поддерживаемые стили** через `static styles = ['slider', 'checkbox']`" section). Append after that block (and before `**Sensor autocomplete (...)` if exists, or before "**Generator engine:**"):

```markdown

**PushButtonWidget (`61-dashboard-active-button.js`):** write-only momentary/pulse
кнопка для команд (RESET, START, STOP, ACK ALARM). Семантически отличается от
toggle: нет двух-состоянного латча, feedback от своего sensor'а игнорируется
(fire-and-forget команда).

Конфиг: `objectName` (от base), `sensorId` (от base), `valueOn`/`valueOff` (числа),
`mode` (`'pulse'` default | `'momentary'`), `pulseWidth` (ms, default 500), `style`,
`label`, `requireConfirmation` (от base; в `momentary` режиме НЕ работает —
warning в форме).

**Поддерживаемые стили** через `static styles = ['flat', 'mushroom', 'pill']`:
- **`flat`** (default, defaultSize 2×1): Material primary blue button. Для group
  of buttons, частые действия.
- **`mushroom`** (defaultSize 2×2): SCADA-classic круглая красная объёмная.
  Для emergency / mode switches (STOP, EMERGENCY).
- **`pill`** (defaultSize 2×1): minimal outline pill, заполняется при нажатии.
  Для частых маловажных действий (ACK ALARM).

**Поведение:**
- `pulse`: click → POST valueOn → wait `pulseWidth` ms → POST valueOff. Visual flash
  (yellow, 300ms) для feedback мгновенно.
- `momentary`: mousedown → POST valueOn; window-level mouseup → POST valueOff
  (window-listener гарантирует release даже при mouseleave).

`update()` override игнорирует SSE feedback от sensor'а (push-button показывает
только команду + общий writeState `pending`/`error`).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: PushButtonWidget — pulse/momentary command button

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Implemented in |
|---|---|
| `PushButtonWidget extends ActiveDashboardWidget` | Phase 1 (Task 1.1) |
| `static styles = ['flat', 'mushroom', 'pill']`, defaultStyle='flat' | Phase 1 |
| `static getDefaultSizeForStyle(style)` helper | Phase 1 (метод присутствует) |
| `update()` override no-op | Phase 1 |
| `render()` диспатчит по style + bind pulse/momentary handler | Phase 1 |
| `_onPulseClick` (POST valueOn → wait pulseWidth → POST valueOff) | Phase 1 |
| `_bindMomentary` (mousedown + window-level mouseup) | Phase 1 |
| `_writeValueRaw` (without confirm dialog для второго POST) | Phase 1 |
| `getActiveConfigFields` (mode/pulseWidth/valueOff/valueOn + warning) | Phase 1 |
| `initConfigHandlers` super + warning toggle | Phase 1 |
| `parseActiveConfigFields` | Phase 1 |
| Регистрация в WIDGET_TYPES (count 10 → 11) | Phase 2 |
| CSS: `.pushbutton-widget`, `.pushbutton-style-{flat,mushroom,pill}`, `.pressed`, `@keyframes pb-pulse-flash` | Phase 3 |
| E2E: 7 сценариев (3 styles + pulse + momentary + edit-mode + control-token + custom values) | Phase 4 |
| Regression sweep | Phase 5 |
| CLAUDE.md update | Phase 6 |

✅ Все требования spec'а покрыты.

**Placeholder scan:** грепнул TBD/TODO/«implement later» — нет.

**Type consistency:** проверил.
- `_onPulseClick`, `_bindMomentary`, `_writeValueRaw`, `_currentStyle`, `_currentMode` — единые имена.
- `[data-test="btn"]` — единый selector в HTML и тестах.
- `pushbutton-style-{style}` — единый CSS префикс.
- `WIDGET_TYPES` count 11 — синхронизирован с тестом.
