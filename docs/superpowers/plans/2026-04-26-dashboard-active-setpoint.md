# Dashboard Active Setpoint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-26-dashboard-active-setpoint-design.md`

**Goal:** Реализовать `SetpointWidget extends ActiveDashboardWidget` — числовой задатчик для AI/AO с 3 визуальными стилями (`input` default / `slider` / `stepper`), 2 apply mode (`manual` / `auto` 500ms debounce), inline-edit value (double-click → input на месте) и validation clamp в `[min, max]`.

**Architecture:** Один класс `SetpointWidget` с диспатчем `render()` по `config.style`. Inline-edit как private helper (`_makeInlineEditable`) внутри класса. Auto-apply через `setTimeout` debounce; manual — explicit Apply button (видим только когда widget в dirty state). Two-way binding: `commandValue` (что пользователь установил) vs `feedbackValue` (что вернул сервер); расхождение → CSS `.dirty`.

**Tech Stack:** ES6 class, Playwright E2E.

**E2E command form:** `docker compose run --rm e2e single/<spec>.spec.ts`. Stop dev profile first: `docker compose --profile dev down`.

---

## File Structure

| Файл | Действие | Ответственность |
|---|---|---|
| `ui/static/js/src/61-dashboard-active-setpoint.js` | **Create** | `SetpointWidget` class — render dispatch (3 styles), inline-edit helper, apply mode, config form |
| `ui/static/js/src/62-dashboard-manager.js` | **Modify** (`WIDGET_TYPES` ~lines 6-18) | Зарегистрировать `'setpoint': SetpointWidget` |
| `ui/static/css/style.css` | **Modify** (append) | `.setpoint-widget` + `.setpoint-style-{input,slider,stepper}` + `.dirty` state + `.setpoint-inline-edit` |
| `tests/single/dashboard-active-setpoint.spec.ts` | **Create** | E2E 8 сценариев |
| `tests/single/dashboard-widgets.spec.ts` | **Modify** (line 4 + lines 183/193) | Update widget picker count: 11 → 12; добавить `'setpoint'` в WIDGET_TYPES const |
| `CLAUDE.md` | **Modify** | Active widgets section — добавить параграф про SetpointWidget |

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
  single/dashboard-widgets.spec.ts
```
Expected: all PASS (smoke + toggle 13 + button 8 + widgets 21).

If anything fails — STOP, report BLOCKED.

---

## Phase 1 — SetpointWidget класс

### Task 1.1: Create `61-dashboard-active-setpoint.js`

**Files:**
- Create: `ui/static/js/src/61-dashboard-active-setpoint.js`

- [ ] **Step 1: Create the class file**

```javascript
// ============================================================================
// SetpointWidget — числовой задатчик для AI/AO датчиков.
//
// Семантика: пользователь вводит число в [min, max] с шагом step, посылается
// через POST .../ionc/set. Two-way: feedbackValue (от сервера) vs commandValue
// (что пользователь установил), расхождение → dirty state (жёлтая граница).
//
// Config:
//   sensor      — имя датчика (от base)
//   sensorId    — числовой ID (от base)
//   objectName  — IONC object (default 'SharedMemory', от base)
//   label       — заголовок виджета (от base)
//   min         — нижняя граница диапазона (default 0)
//   max         — верхняя граница (default 100)
//   step        — шаг изменения (default 1; влияет на stepper buttons и slider step)
//   unit        — текстовая подпись после value ("°C", "%", "Pa"; default '')
//   applyMode   — 'manual' (default) | 'auto'
//   style       — 'input' (default) | 'slider' | 'stepper'
//   requireConfirmation — bool (от base)
//
// Стили:
//   - 'input': текстовый input + Apply button (visible только в dirty state)
//   - 'slider': horizontal slider + value-label (с inline-edit) + min/max подписи
//   - 'stepper': '−' [value] '+' (auto-apply on click; inline-edit на value)
// ============================================================================

const SETPOINT_AUTO_APPLY_DEBOUNCE_MS = 500;

class SetpointWidget extends ActiveDashboardWidget {
    static type = 'setpoint';
    static displayName = 'Setpoint';
    static description = 'Numeric setpoint (analog write) with input/slider/stepper styles';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="9" width="18" height="6" rx="1"/><path d="M7 9v6M12 9v6M17 9v6"/></svg>';
    static styles = ['input', 'slider', 'stepper'];
    static defaultStyle = 'input';
    static defaultSize = { width: 3, height: 2 };
    static minSize = { width: 2, height: 1 };
    static maxSize = { width: 6, height: 3 };

    constructor(id, config, container) {
        super(id, config, container);
        this._autoApplyTimer = null;
    }

    _currentStyle() {
        return this.config?.style || SetpointWidget.defaultStyle;
    }

    _applyMode() {
        return this.config?.applyMode || 'manual';
    }

    _clamp(value) {
        const min = this.config?.min ?? -Infinity;
        const max = this.config?.max ?? Infinity;
        return Math.max(min, Math.min(max, value));
    }

    // ===== Render dispatch =====
    render() {
        const style = this._currentStyle();
        this.element = document.createElement('div');
        this.element.className = `widget-content setpoint-widget setpoint-style-${style}`;

        if (style === 'slider') {
            this._renderSlider();
        } else if (style === 'stepper') {
            this._renderStepper();
        } else {
            this._renderInput();
        }

        this.container.appendChild(this.element);
        // Initial display sync
        this.renderFeedback();
    }

    // ===== Style: input =====
    _renderInput() {
        const unit = escapeHtml(this.config?.unit || '');
        const min = this.config?.min ?? '';
        const max = this.config?.max ?? '';
        const step = this.config?.step ?? 1;
        this.element.innerHTML = `
            <div class="setpoint-feedback" data-test="feedback">feedback: <strong data-test="feedback-value">--</strong>${unit ? '<span class="setpoint-unit">' + unit + '</span>' : ''}</div>
            <div class="setpoint-input-row">
                <input type="number" class="setpoint-input" data-test="value-input"
                       min="${min}" max="${max}" step="${step}">
                ${unit ? '<span class="setpoint-unit">' + unit + '</span>' : ''}
                <button class="setpoint-apply-btn" data-test="apply-btn">Apply</button>
                <button class="setpoint-cancel-btn" data-test="cancel-btn" title="Cancel">×</button>
            </div>
        `;

        const input = this.element.querySelector('[data-test="value-input"]');
        const applyBtn = this.element.querySelector('[data-test="apply-btn"]');
        const cancelBtn = this.element.querySelector('[data-test="cancel-btn"]');

        input.addEventListener('input', () => {
            const num = Number(input.value);
            if (!Number.isFinite(num)) return;
            this._setCommand(num);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this._applyNow(); }
            else if (e.key === 'Escape') { e.preventDefault(); this._cancel(); }
        });
        applyBtn.addEventListener('click', () => this._applyNow());
        cancelBtn.addEventListener('click', () => this._cancel());
    }

    // ===== Style: slider =====
    _renderSlider() {
        const unit = escapeHtml(this.config?.unit || '');
        const min = this.config?.min ?? 0;
        const max = this.config?.max ?? 100;
        const step = this.config?.step ?? 1;
        this.element.innerHTML = `
            <div class="setpoint-slider-wrap">
                <div class="setpoint-slider-value-row">
                    <span class="setpoint-slider-value" data-test="value" title="Двойной клик — точный ввод">--</span>
                    ${unit ? '<span class="setpoint-unit">' + unit + '</span>' : ''}
                </div>
                <input type="range" class="setpoint-slider" data-test="slider"
                       min="${min}" max="${max}" step="${step}">
                <div class="setpoint-slider-labels">
                    <span>${min}</span>
                    <span>${max}</span>
                </div>
            </div>
        `;

        const slider = this.element.querySelector('[data-test="slider"]');
        const valueSpan = this.element.querySelector('[data-test="value"]');

        slider.addEventListener('input', () => {
            const num = Number(slider.value);
            this._setCommand(num);
            valueSpan.textContent = String(num);
        });
        // Manual mode: change (release) = trigger apply
        slider.addEventListener('change', () => {
            if (this._applyMode() === 'manual') {
                // В manual mode для slider apply при release (change event).
                // (Apply button + Cancel также видны для consistency с input style.)
                this._applyNow();
            }
        });
        this._makeInlineEditable(valueSpan);
    }

    // ===== Style: stepper =====
    _renderStepper() {
        const unit = escapeHtml(this.config?.unit || '');
        this.element.innerHTML = `
            <div class="setpoint-feedback" data-test="feedback">feedback: <strong data-test="feedback-value">--</strong>${unit ? '<span class="setpoint-unit">' + unit + '</span>' : ''}</div>
            <div class="setpoint-stepper-row">
                <button class="setpoint-step-btn" data-test="step-down">−</button>
                <span class="setpoint-stepper-value" data-test="value" title="Двойной клик — точный ввод">--</span>
                <button class="setpoint-step-btn" data-test="step-up">+</button>
            </div>
        `;

        const stepDown = this.element.querySelector('[data-test="step-down"]');
        const stepUp = this.element.querySelector('[data-test="step-up"]');
        const valueSpan = this.element.querySelector('[data-test="value"]');
        const step = this.config?.step ?? 1;

        const stepBy = (delta) => {
            if (!this.isInteractive()) return;
            const current = this.commandValue ?? this.feedbackValue ?? this.config?.min ?? 0;
            const next = this._clamp(current + delta);
            this._setCommand(next);
            // Stepper всегда auto-apply (нет explicit Apply кнопки).
            this._applyNow();
        };
        stepDown.addEventListener('click', () => stepBy(-step));
        stepUp.addEventListener('click', () => stepBy(step));

        this._makeInlineEditable(valueSpan);
    }

    // ===== Common: feedback rendering =====
    renderFeedback() {
        if (!this.element) return;
        const fbValueEl = this.element.querySelector('[data-test="feedback-value"]');
        if (fbValueEl) {
            fbValueEl.textContent = (this.feedbackValue !== null && this.feedbackValue !== undefined)
                ? String(this.feedbackValue) : '--';
        }

        const style = this._currentStyle();
        if (style === 'input') {
            const input = this.element.querySelector('[data-test="value-input"]');
            if (input && this.commandValue === null) {
                // Не редактировал — синхронизируем с feedback
                input.value = this.feedbackValue ?? '';
            }
        } else if (style === 'slider') {
            const slider = this.element.querySelector('[data-test="slider"]');
            const valueSpan = this.element.querySelector('[data-test="value"]');
            const display = this.commandValue ?? this.feedbackValue;
            if (slider && display !== null && display !== undefined) {
                slider.value = display;
            }
            if (valueSpan) {
                valueSpan.textContent = (display !== null && display !== undefined) ? String(display) : '--';
            }
        } else { // stepper
            const valueSpan = this.element.querySelector('[data-test="value"]');
            const display = this.commandValue ?? this.feedbackValue;
            if (valueSpan) {
                valueSpan.textContent = (display !== null && display !== undefined) ? String(display) : '--';
            }
        }

        // Auto-snap dirty when feedback догнал command
        if (this.commandValue !== null && this.commandValue === this.feedbackValue) {
            this.commandValue = null;
            this._updateDirty(false);
        }
    }

    renderCommand() {
        // No-op для setpoint (commandValue отображается через renderFeedback).
    }

    // ===== Apply flow =====
    _setCommand(value) {
        const clamped = this._clamp(value);
        this.commandValue = clamped;
        this._updateDirty(true);
        if (this._applyMode() === 'auto') {
            clearTimeout(this._autoApplyTimer);
            this._autoApplyTimer = setTimeout(() => this._applyNow(), SETPOINT_AUTO_APPLY_DEBOUNCE_MS);
        }
    }

    _applyNow() {
        clearTimeout(this._autoApplyTimer);
        if (this.commandValue === null || this.commandValue === undefined) return;
        this.writeValue(this.commandValue);
    }

    _cancel() {
        clearTimeout(this._autoApplyTimer);
        this.commandValue = null;
        this._updateDirty(false);
        this.renderFeedback();
    }

    _updateDirty(isDirty) {
        const root = this.element;
        if (!root) return;
        root.classList.toggle('dirty', !!isDirty);
    }

    // ===== Inline-edit helper =====
    _makeInlineEditable(spanEl) {
        spanEl.addEventListener('dblclick', () => {
            const currentValue = spanEl.textContent.trim();
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'setpoint-inline-edit';
            input.dataset.test = 'inline-input';
            input.value = currentValue === '--' ? '' : currentValue;
            input.min = String(this.config?.min ?? '');
            input.max = String(this.config?.max ?? '');
            input.step = String(this.config?.step ?? 1);
            spanEl.replaceWith(input);
            input.select();

            const finish = (apply) => {
                if (apply) {
                    const num = Number(input.value);
                    if (Number.isFinite(num)) {
                        this._setCommand(num);
                        if (this._applyMode() !== 'manual') {
                            this._applyNow();
                        }
                        // В manual mode — оставляем dirty state, ждём explicit Apply
                        // (для slider: change event slider'а не сработает, но visual dirty
                        // уже выставлен; в stepper всегда auto-apply через _applyNow).
                    }
                }
                input.replaceWith(spanEl);
                this.renderFeedback();  // обновить display
            };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); finish(true); }
                else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
            });
            input.addEventListener('blur', () => finish(true));
            // Stop click propagation, чтобы не открыть widget config dialog
            // через bubble на родителя.
            input.addEventListener('click', (e) => e.stopPropagation());
        });
    }

    // ===== Config form =====
    static getActiveConfigFields(config = {}) {
        const applyMode = config.applyMode || 'manual';
        return `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>min</label>
                    <input type="number" class="widget-input" name="min"
                           value="${config.min ?? 0}" data-test="cfg-min">
                </div>
                <div class="widget-config-field">
                    <label>max</label>
                    <input type="number" class="widget-input" name="max"
                           value="${config.max ?? 100}" data-test="cfg-max">
                </div>
                <div class="widget-config-field">
                    <label>step</label>
                    <input type="number" class="widget-input" name="step"
                           value="${config.step ?? 1}" min="0" data-test="cfg-step">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Unit</label>
                    <input type="text" class="widget-input" name="unit"
                           value="${escapeHtml(config.unit || '')}" placeholder="°C, %, Pa..." data-test="cfg-unit">
                </div>
                <div class="widget-config-field">
                    <label>Apply mode</label>
                    <select class="widget-input" name="applyMode" data-test="cfg-applyMode">
                        <option value="manual" ${applyMode === 'manual' ? 'selected' : ''}>manual (Apply button)</option>
                        <option value="auto" ${applyMode === 'auto' ? 'selected' : ''}>auto (debounce 500ms)</option>
                    </select>
                </div>
            </div>
        `;
    }

    static parseActiveConfigFields(form) {
        return {
            min:       Number(form.querySelector('[name="min"]')?.value ?? 0),
            max:       Number(form.querySelector('[name="max"]')?.value ?? 100),
            step:      Number(form.querySelector('[name="step"]')?.value ?? 1),
            unit:      form.querySelector('[name="unit"]')?.value || '',
            applyMode: form.querySelector('[name="applyMode"]')?.value || 'manual',
        };
    }

    destroy() {
        clearTimeout(this._autoApplyTimer);
        super.destroy();
    }
}

window.SetpointWidget = SetpointWidget;
```

- [ ] **Step 2: Rebuild app.js**

Run: `make app`
Expected: `Generated static/js/app.js from 37 files` (count was 36, +1 for new file).

- [ ] **Step 3: Grep checks**

Run: `grep -c "class SetpointWidget extends ActiveDashboardWidget" ui/static/js/app.js`
Expected: `1`.

Run: `grep -c "window.SetpointWidget" ui/static/js/app.js`
Expected: ≥ 1.

Run: `grep -c "SETPOINT_AUTO_APPLY_DEBOUNCE_MS" ui/static/js/app.js`
Expected: ≥ 1.

- [ ] **Step 4: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-setpoint.js ui/static/js/app.js
git commit -m "feat(dashboard): SetpointWidget — numeric setpoint with 3 styles

Четвёртый active widget. 3 визуальных стиля через static styles:
- 'input' (default): text input + Apply button (visible в dirty state)
- 'slider': horizontal slider + value-label (inline-edit) + min/max
- 'stepper': '−' [value] '+' (auto-apply on click; inline-edit на value)

2 apply mode (config.applyMode):
- 'manual' (default): explicit Apply button + Cancel в dirty state
- 'auto': debounce 500ms после change → автоотправка

Inline-edit helper: двойной клик на value-display → input на месте →
Enter apply / Esc cancel / blur apply. Используется slider+stepper.

Two-way binding: feedbackValue + commandValue, расхождение → CSS .dirty.
Validation: clamp значения к [min, max].

CSS — отдельным шагом.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — Регистрация в WIDGET_TYPES

### Task 2.1: Add 'setpoint' + update test count

**Files:**
- Modify: `ui/static/js/src/62-dashboard-manager.js` (line ~6-18)
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
    'chart': ChartWidget
};
```

- [ ] **Step 2: Update test file**

In `tests/single/dashboard-widgets.spec.ts`:

(a) Line 4 — change WIDGET_TYPES array:
```typescript
const WIDGET_TYPES = ['gauge', 'level', 'led', 'label', 'divider', 'statusbar', 'bargraph', 'digital', 'toggle', 'pushbutton', 'chart'];
```
to:
```typescript
const WIDGET_TYPES = ['gauge', 'level', 'led', 'label', 'divider', 'statusbar', 'bargraph', 'digital', 'toggle', 'pushbutton', 'setpoint', 'chart'];
```

(b) Find line 183 — update test name:
```typescript
  test('Widget picker показывает все 11 типов виджетов', async ({ page }) => {
```
to:
```typescript
  test('Widget picker показывает все 12 типов виджетов', async ({ page }) => {
```

(c) Line ~193 — update count:
```typescript
    await expect(items).toHaveCount(11);
```
to:
```typescript
    await expect(items).toHaveCount(12);
```

- [ ] **Step 3: Rebuild and test**

Run: `make app`
Run: `docker compose --profile dev down`
Run: `docker compose run --rm e2e single/dashboard-widgets.spec.ts`
Expected: 21/21 PASS.

- [ ] **Step 4: Commit**

```bash
git add ui/static/js/src/62-dashboard-manager.js ui/static/js/app.js tests/single/dashboard-widgets.spec.ts
git commit -m "feat(dashboard): register SetpointWidget in WIDGET_TYPES (count 11 → 12)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 — CSS

### Task 3.1: Append setpoint styles

**Files:**
- Modify: `ui/static/css/style.css` (append at end)

- [ ] **Step 1: Append CSS**

```css

/* ============================================================================
 * SetpointWidget — base layout
 * ============================================================================ */

.setpoint-widget {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 10px;
    box-sizing: border-box;
    gap: 8px;
}

.setpoint-widget .setpoint-feedback {
    font-size: 11px;
    color: #6b7280;
}
.setpoint-widget .setpoint-feedback strong {
    color: #22c55e;
    font-family: monospace;
}
.setpoint-widget .setpoint-unit {
    font-size: 11px;
    color: #9ca3af;
    margin-left: 4px;
}

/* === Style: input === */
.setpoint-style-input .setpoint-input-row {
    display: flex;
    gap: 6px;
    align-items: center;
}
.setpoint-style-input .setpoint-input {
    width: 100px;
    padding: 8px 10px;
    background: #0f172a;
    border: 2px solid #6b7280;
    border-radius: 4px;
    color: #d8dce2;
    text-align: right;
    font-family: monospace;
    font-size: 14px;
    font-weight: 600;
    box-sizing: border-box;
}
.setpoint-widget.dirty .setpoint-input {
    border-color: #fbbf24;
    background: #1e293b;
}

.setpoint-apply-btn {
    padding: 6px 12px;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    font-size: 12px;
    display: none;
}
.setpoint-cancel-btn {
    padding: 6px 8px;
    background: transparent;
    color: #9ca3af;
    border: 1px solid #4b5563;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    display: none;
}
.setpoint-widget.dirty .setpoint-apply-btn,
.setpoint-widget.dirty .setpoint-cancel-btn {
    display: inline-block;
}

/* === Style: slider === */
.setpoint-style-slider {
    width: 100%;
    padding: 8px 14px;
}
.setpoint-style-slider .setpoint-slider-wrap {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
}
.setpoint-style-slider .setpoint-slider-value-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
}
.setpoint-style-slider .setpoint-slider-value {
    font-size: 18px;
    font-weight: 600;
    color: #d8dce2;
    font-family: monospace;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 3px;
    transition: background 0.1s;
}
.setpoint-style-slider .setpoint-slider-value:hover {
    background: #374151;
}
.setpoint-widget.dirty .setpoint-slider-value {
    color: #fbbf24;
}
.setpoint-style-slider .setpoint-slider {
    width: 100%;
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    background: #374151;
    border-radius: 3px;
    outline: none;
}
.setpoint-style-slider .setpoint-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    background: #3b82f6;
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid #fff;
}
.setpoint-style-slider .setpoint-slider-labels {
    display: flex;
    justify-content: space-between;
    width: 100%;
    font-size: 10px;
    color: #6b7280;
}

/* === Style: stepper === */
.setpoint-style-stepper .setpoint-stepper-row {
    display: flex;
    align-items: center;
    background: #0f172a;
    border-radius: 6px;
    overflow: hidden;
}
.setpoint-style-stepper .setpoint-step-btn {
    width: 32px;
    height: 32px;
    background: #374151;
    color: #fff;
    border: none;
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
    transition: background 0.1s;
}
.setpoint-style-stepper .setpoint-step-btn:hover {
    background: #4b5563;
}
.setpoint-style-stepper .setpoint-stepper-value {
    padding: 0 14px;
    min-width: 70px;
    text-align: center;
    color: #d8dce2;
    font-family: monospace;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    line-height: 32px;
    transition: background 0.1s;
}
.setpoint-style-stepper .setpoint-stepper-value:hover {
    background: #1e293b;
}
.setpoint-widget.dirty .setpoint-stepper-value {
    color: #fbbf24;
}

/* === Inline edit (общий для slider + stepper) === */
.setpoint-inline-edit {
    padding: 4px 8px;
    background: #0f172a;
    border: 2px solid #fbbf24;
    border-radius: 4px;
    color: #d8dce2;
    font-family: monospace;
    font-size: 14px;
    width: 70px;
    text-align: right;
    outline: none;
}
```

- [ ] **Step 2: Restart viewer + verify**

Run: `docker compose restart viewer 2>&1 | tail -2`
Run: `sleep 2 && curl -s http://localhost:8000/static/css/style.css | grep -c "setpoint-style-"`
Expected: ≥ 3 (input/slider/stepper).

- [ ] **Step 3: Commit**

```bash
git add ui/static/css/style.css
git commit -m "feat(dashboard): CSS for SetpointWidget

3 стиля (input / slider / stepper) + .dirty state (жёлтая граница для
input, жёлтый текст для slider/stepper value) + inline-edit input.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 — E2E тест

### Task 4.1: Write `dashboard-active-setpoint.spec.ts`

**Files:**
- Create: `tests/single/dashboard-active-setpoint.spec.ts`

- [ ] **Step 1: Create the file with 8 tests**

```typescript
import { test, expect } from '@playwright/test';

test.describe('SetpointWidget — fourth active widget', () => {
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
            typeof (window as any).SetpointWidget !== 'undefined' &&
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

    async function createSetpointDashboard(page, configOverrides: Record<string, unknown> = {}) {
        await page.evaluate((overrides) => {
            const w: any = window;
            const widgetCfg = {
                id: 'sp-1',
                type: 'setpoint',
                config: {
                    sensor: 'TEST_TEMP',
                    sensorId: 100,
                    objectName: 'SharedMemory',
                    style: 'input',
                    applyMode: 'manual',
                    min: 0,
                    max: 100,
                    step: 1,
                    unit: '',
                    label: 'TEMP',
                    ...overrides,
                },
                position: { col: 0, row: 0, width: 3, height: 2 },
            };
            const dashCfg = { meta: { name: 'TEST_SP' }, widgets: [widgetCfg] };
            w.dashboardState.dashboards.set('TEST_SP', dashCfg);
            w.dashboardManager.loadDashboard('TEST_SP');
            w.switchView('dashboard');
        }, configOverrides);
        await page.locator('.setpoint-widget').first().waitFor({ state: 'visible', timeout: 5000 });
    }

    test('renders style "input" (default)', async ({ page }) => {
        await createSetpointDashboard(page);
        await expect(page.locator('.setpoint-style-input').first()).toBeVisible();
        await expect(page.locator('[data-test="value-input"]').first()).toBeVisible();
    });

    test('renders style "slider"', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'slider' });
        await expect(page.locator('.setpoint-style-slider').first()).toBeVisible();
        await expect(page.locator('[data-test="slider"]').first()).toBeVisible();
        await expect(page.locator('[data-test="value"]').first()).toBeVisible();
    });

    test('renders style "stepper"', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'stepper' });
        await expect(page.locator('.setpoint-style-stepper').first()).toBeVisible();
        await expect(page.locator('[data-test="step-down"]').first()).toBeVisible();
        await expect(page.locator('[data-test="step-up"]').first()).toBeVisible();
    });

    test('manual apply: input change → dirty → Apply click → POST', async ({ page }) => {
        const posts: { value: number }[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try { posts.push({ value: JSON.parse(req.postData() || '{}').value }); } catch {}
            }
        });

        await createSetpointDashboard(page, { applyMode: 'manual' });
        // Type a value
        await page.evaluate(() => {
            const input = document.querySelector('[data-test="value-input"]') as HTMLInputElement;
            input.value = '42';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        // dirty class on widget root
        await expect(page.locator('.setpoint-widget').first()).toHaveClass(/dirty/);

        // Click Apply
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="apply-btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(300);

        expect(posts.length).toBeGreaterThanOrEqual(1);
        expect(posts[0].value).toBe(42);
    });

    test('auto apply: input change → wait 500ms → POST', async ({ page }) => {
        const posts: { value: number; time: number }[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try { posts.push({ value: JSON.parse(req.postData() || '{}').value, time: Date.now() }); } catch {}
            }
        });

        await createSetpointDashboard(page, { applyMode: 'auto' });
        const tStart = Date.now();
        await page.evaluate(() => {
            const input = document.querySelector('[data-test="value-input"]') as HTMLInputElement;
            input.value = '55';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(800);

        expect(posts.length).toBeGreaterThanOrEqual(1);
        expect(posts[0].value).toBe(55);
        // Debounced — at least 400ms after input
        expect(posts[0].time - tStart).toBeGreaterThanOrEqual(400);
    });

    test('inline edit (stepper): double-click value → input → Enter → POST', async ({ page }) => {
        const posts: { value: number }[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try { posts.push({ value: JSON.parse(req.postData() || '{}').value }); } catch {}
            }
        });

        await createSetpointDashboard(page, { style: 'stepper' });
        // Double-click on stepper value
        await page.evaluate(() => {
            const span = document.querySelector('[data-test="value"]') as HTMLElement;
            span.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        });
        // Inline input appears
        await expect(page.locator('[data-test="inline-input"]').first()).toBeVisible({ timeout: 2000 });

        // Type value + Enter
        await page.evaluate(() => {
            const inp = document.querySelector('[data-test="inline-input"]') as HTMLInputElement;
            inp.value = '37';
            inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        });
        await page.waitForTimeout(300);

        expect(posts.length).toBeGreaterThanOrEqual(1);
        expect(posts[0].value).toBe(37);
    });

    test('validation clamp: value > max → POSTs max', async ({ page }) => {
        const posts: { value: number }[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try { posts.push({ value: JSON.parse(req.postData() || '{}').value }); } catch {}
            }
        });

        await createSetpointDashboard(page, { applyMode: 'manual', min: 0, max: 50 });
        await page.evaluate(() => {
            const input = document.querySelector('[data-test="value-input"]') as HTMLInputElement;
            input.value = '999';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const btn = document.querySelector('[data-test="apply-btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(300);

        expect(posts.length).toBeGreaterThanOrEqual(1);
        expect(posts[0].value).toBe(50);  // clamped to max
    });

    test('custom unit displayed', async ({ page }) => {
        await createSetpointDashboard(page, { unit: '°C' });
        // Unit appears in feedback row and inline next to input
        const unitElements = page.locator('.setpoint-unit');
        await expect(unitElements.first()).toBeVisible();
        await expect(unitElements.first()).toHaveText('°C');
    });

    test('edit mode: input change does not auto-write', async ({ page }) => {
        await createSetpointDashboard(page, { applyMode: 'auto' });
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
            const input = document.querySelector('[data-test="value-input"]') as HTMLInputElement;
            input.value = '77';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.waitForTimeout(800);
        expect(requestSent).toBe(false);
    });
});
```

- [ ] **Step 2: Run the spec**

Run: `docker compose --profile dev down`
Run: `docker compose run --rm e2e single/dashboard-active-setpoint.spec.ts`
Expected: 8/8 PASS.

If FAIL: read errors. Common issues:
- `posts.length < 1` for auto-apply — increase waitForTimeout (800ms should suffice for 500ms debounce + render).
- `inline-input` not visible — check `_makeInlineEditable` properly attaches dblclick.
- "edit mode" test fails — check `isInteractive()` returns false in editMode (от base).

Iterate until 8/8 PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/single/dashboard-active-setpoint.spec.ts
git commit -m "test(dashboard): E2E for SetpointWidget

8 cases:
- renders style 'input' (default)
- renders style 'slider'
- renders style 'stepper'
- manual apply: input → dirty → Apply → POST
- auto apply: input → wait 500ms → POST (debounce verified)
- inline edit (stepper): double-click → input → Enter → POST
- validation clamp: value > max → POSTs max
- custom unit displayed
- edit mode: input change does not auto-write

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5 — Regression sweep

### Task 5.1: Combined sweep

- [ ] **Step 1: Stop dev profile + run all related specs**

Run: `docker compose --profile dev down`

Run:
```bash
docker compose run --rm e2e \
  single/dashboard.spec.ts \
  single/dashboard-sse.spec.ts \
  single/dashboard-widgets.spec.ts \
  single/dashboard-active-base.spec.ts \
  single/dashboard-active-toggle.spec.ts \
  single/dashboard-active-button.spec.ts \
  single/dashboard-active-setpoint.spec.ts
```

Expected: all PASS (smoke 2 + toggle 13 + button 8 + setpoint 8 + widgets 21 + dashboard 10 + sse 8).

- [ ] **Step 2: If anything fails — investigate root cause**

Most likely sources of regression:
- Widget picker count off → check Phase 2.
- `dashboard-widgets.spec.ts` failure due to missing setpoint type — check Phase 2 Step 2.

Fix root cause. Don't move forward red.

- [ ] **Step 3: Report final result**

If all green — Phase 5 done.

---

## Phase 6 — Документация

### Task 6.1: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Find PushButtonWidget paragraph**

Run: `grep -n "PushButtonWidget\|Sensor autocomplete" CLAUDE.md | head -5`

- [ ] **Step 2: Append SetpointWidget paragraph after PushButtonWidget**

Find the line ending PushButtonWidget block (just before "**Sensor autocomplete (..."). Insert new paragraph:

```markdown

**SetpointWidget (`61-dashboard-active-setpoint.js`):** числовой задатчик
для AI/AO датчиков. Произвольное значение в `[min, max]` с шагом `step`.

Конфиг: `objectName` (от base), `sensorId` (от base), `min`/`max`/`step`
(числа), `unit` (текст: '°C', '%', 'Pa'), `applyMode` (`'manual'` default |
`'auto'`), `style`, `label` (от base), `requireConfirmation` (от base).

**Поддерживаемые стили** через `static styles = ['input', 'slider', 'stepper']`:
- **`input`** (default, defaultSize 3×2): текстовый input + Apply кнопка.
  В dirty state (cmd ≠ fb) — жёлтая граница input'а, видны Apply + Cancel.
  Enter = apply, Esc = cancel.
- **`slider`** (defaultSize 3×2): horizontal slider + value-label сверху +
  min/max подписи снизу. В manual mode change-event (release) триггерит apply.
- **`stepper`** (defaultSize 3×2): кнопки `−` / `+` + value-label.
  Stepper всегда auto-apply on click (applyMode игнорируется).

**Apply mode:**
- `manual`: пользователь явно жмёт Apply (или Enter). До того value «dirty».
- `auto`: debounce 500ms на input/slider change → автоотправка.

**Inline-edit:** двойной клик на value-display (slider или stepper) →
input на месте → Enter apply / Esc cancel / blur apply. Используется для
точного ввода когда slider/stepper неудобен.

**Two-way:** `feedbackValue` от SSE + `commandValue` (что пользователь
установил, до Apply). Расхождение → CSS `.dirty`. Когда feedback догнал
command → dirty снимается автоматически.

**Validation:** значения вне `[min, max]` обрезаются (clamp).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: SetpointWidget — числовой задатчик с 3 styles

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Implemented in |
|---|---|
| `SetpointWidget extends ActiveDashboardWidget` | Phase 1 (Task 1.1) |
| `static styles = ['input', 'slider', 'stepper']`, defaultStyle='input' | Phase 1 |
| Render dispatch `_renderInput`/`_renderSlider`/`_renderStepper` | Phase 1 |
| Apply mode manual/auto + 500ms debounce | Phase 1 (`_setCommand` + `_applyNow` + `_autoApplyTimer`) |
| Inline-edit helper (`_makeInlineEditable`) | Phase 1 |
| Two-way binding (commandValue + feedbackValue + auto-snap dirty) | Phase 1 (`renderFeedback`) |
| Validation clamp `_clamp` | Phase 1 |
| `getActiveConfigFields` (min/max/step/unit/applyMode) | Phase 1 |
| `parseActiveConfigFields` | Phase 1 |
| Регистрация в WIDGET_TYPES (count 11 → 12) | Phase 2 |
| CSS: `.setpoint-widget`, `.setpoint-style-{input,slider,stepper}`, `.dirty`, `.setpoint-inline-edit` | Phase 3 |
| E2E: 8 сценариев (3 styles + manual + auto + inline + clamp + unit + edit-mode) | Phase 4 |
| Regression sweep | Phase 5 |
| CLAUDE.md update | Phase 6 |

✅ Все требования spec'а покрыты.

**Placeholder scan:** грепнул TBD/FIXME/XXX — нет (только TODO/Future enhancements в комментариях, согласовано со spec'ом).

**Type consistency:**
- `_currentStyle`, `_applyMode`, `_clamp`, `_setCommand`, `_applyNow`, `_cancel`, `_updateDirty`, `_makeInlineEditable`, `SETPOINT_AUTO_APPLY_DEBOUNCE_MS` — единые имена.
- `[data-test="value-input"]` (input style), `[data-test="value"]` (slider/stepper), `[data-test="slider"]`, `[data-test="step-up/down"]`, `[data-test="apply-btn"]`, `[data-test="cancel-btn"]`, `[data-test="inline-input"]`, `[data-test="feedback-value"]` — единое использование в тестах и render.
- `setpoint-style-{input,slider,stepper}` — единые CSS префиксы.
- WIDGET_TYPES count 12 — синхронизирован.
