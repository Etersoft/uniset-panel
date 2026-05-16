# SetpointWidget style='slider' Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `<input type="range">`-based slider style of SetpointWidget with a custom-rendered slider supporting click-to-jump, drag-and-release, color zones, and horizontal/vertical orientation.

**Architecture:** Custom DOM (track-wrap > track + zones + fill + handle + fb-marker + labels) with mouse-driven interaction. Two-mode feedback tracking: handle follows feedback when idle (`commandValue === null`), stays put with separate fb-marker when dirty. SSE updates ignored during drag. Reuse existing `renderColorZonesEditor` / `parseColorZones` from `06-utils.js` and base class infrastructure (`writeValue`, `_makeInlineEditable`, `_clamp`, `_setCommand`, `_applyNow`).

**Tech Stack:** JavaScript (no framework), CSS, Playwright E2E, Node.js mock server.

**Spec:** `docs/superpowers/specs/2026-05-07-dashboard-active-slider-redesign-design.md`

**Branch:** `story/dashboard-active-controls`

---

## File Map

| File | Type | Responsibility after this plan |
|---|---|---|
| `tests/mock-server/server.js` | modify | Add `POST /api/mock/set-sensor-value` hook for deterministic SSE-driven feedback updates in tests |
| `ui/static/css/style.css` | modify | New slider classes; remove old native-range slider styling |
| `ui/static/js/src/61-dashboard-active-setpoint.js` | modify | Custom-rendered slider DOM, mouse handlers, two-mode feedback, conditional config form |
| `ui/static/js/src/62-dashboard-manager.js` | modify | Pass `config` to `getDefaultSizeForStyle`; orientation-aware default size |
| `tests/single/dashboard-active-setpoint.spec.ts` | modify | Replace 1 obsolete slider render test; add 13 acceptance criteria tests |

After implementation: rebuild concatenated `ui/static/js/app.js` via `make app`.

---

## Task 1: Mock-server hook for deterministic sensor injection

Adds a test-only HTTP hook that overrides a sensor's value in the mock-server's in-memory state. The IONC poller will pick up the new value at the next 1s tick and broadcast via SSE. Required by AC-3 (no-jump-during-drag) where the test must inject a feedback update at a specific moment.

**Files:**
- Modify: `tests/mock-server/server.js` — add request handler in the existing HTTP server.

- [ ] **Step 1.1: Find the HTTP routing block**

Run: `grep -n "/api/mock/disconnect\|/api/mock/reconnect" tests/mock-server/server.js`

Expected output: lines around 582–592 showing existing `/api/mock/*` handlers.

- [ ] **Step 1.2: Add the new mock route**

Find the line `} else if (url === '/api/mock/status') {` (around line 592). Just before that `else if`, insert a new branch:

```javascript
  } else if (url === '/api/mock/set-sensor-value' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { id, value } = JSON.parse(body);
        if (typeof id !== 'number' || typeof value !== 'number') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'expected {id: number, value: number}' }));
          return;
        }
        const sensor = mockSensors.find(s => s.id === id);
        if (!sensor) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `sensor ${id} not found` }));
          return;
        }
        sensor.value = value;
        sensor.real_value = value;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id, value }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e) }));
      }
    });
    return;
```

(Note: setting both `sensor.value` and `sensor.real_value` mirrors the freeze-handler pattern already in this file so the random-fluctuation interval doesn't immediately overwrite the injected value.)

- [ ] **Step 1.3: Smoke-verify mock starts**

Run: `cd tests/mock-server && node -e "require('./server.js')" 2>&1 | head -5`

Expected: no syntax errors. (The mock-server is started by Playwright fixtures, not run standalone, but a syntax check prevents wasted time.)

- [ ] **Step 1.4: Commit**

```bash
git add tests/mock-server/server.js
git commit -m "test(mock): add /api/mock/set-sensor-value injection hook

Allows Playwright tests to deterministically push a feedback update
into a specific sensor. The IONC poller picks it up on the next
1s tick and broadcasts via SSE — used by slider tests that need to
verify behavior under specific feedback values."
```

---

## Task 2: CSS scaffolding for new slider

Defines all CSS classes the new DOM will use. No JS yet — at this point `style='slider'` widgets will look broken (no styling on placeholder DOM). That's OK; Task 3 swaps the DOM and the visual is restored.

**Files:**
- Modify: `ui/static/css/style.css` — append new section, remove old `.setpoint-slider` (input[type=range]) rules.

- [ ] **Step 2.1: Locate and remove old native-range styles**

Run: `grep -n "\.setpoint-slider " ui/static/css/style.css`

Expected: 1–4 lines referencing `input[type=range]` styling. Remove those rule blocks. Keep `.setpoint-slider-wrap` and `.setpoint-slider-labels` if present — they are reused.

- [ ] **Step 2.2: Append new slider CSS**

Append to `ui/static/css/style.css`:

```css
/* ===== SetpointWidget style='slider' (custom-rendered) ===== */
.setpoint-slider-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
}
.setpoint-slider-value-row {
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-height: 22px;
}
.setpoint-slider-value {
    font-size: 18px;
    font-weight: 600;
    cursor: text;
    padding: 0 3px;
    border-radius: 3px;
    line-height: 1.1;
}
.setpoint-slider-value:hover {
    background: rgba(255, 255, 255, 0.06);
}
.setpoint-widget.dirty .setpoint-slider-value {
    color: #fbbf24;
}
.setpoint-slider-track-wrap {
    position: relative;
    height: 36px;
    flex: 1;
    cursor: pointer;
    user-select: none;
}
.setpoint-slider-track {
    position: absolute;
    left: 0; right: 0;
    top: 14px;
    height: 8px;
    background: var(--bg-secondary, #374151);
    border-radius: 4px;
}
.setpoint-slider-fill {
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 0;
    background: var(--accent-primary, #3b82f6);
    border-radius: 4px;
    transition: width 80ms ease-out;
}
.setpoint-slider-zones {
    position: absolute;
    left: 0; right: 0;
    top: 14px;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    pointer-events: none;
}
.setpoint-slider-zone {
    position: absolute;
    top: 0; bottom: 0;
}
.setpoint-slider-handle {
    position: absolute;
    top: 6px;
    left: 0;
    width: 24px;
    height: 24px;
    background: #fff;
    border: 2px solid var(--accent-primary, #3b82f6);
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    transform: translateX(-50%);
    transition: left 80ms ease-out;
    z-index: 2;
}
.setpoint-slider-track-wrap.dragging .setpoint-slider-handle {
    transition: none;
    transform: translateX(-50%) scale(1.1);
}
.setpoint-slider-tooltip {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    background: #111827;
    color: #fff;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 80ms ease-out;
}
.setpoint-slider-track-wrap.dragging .setpoint-slider-tooltip {
    opacity: 1;
}
.setpoint-slider-fb-marker {
    position: absolute;
    top: 24px;
    left: 0;
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 8px solid #fbbf24;
    transform: translateX(-50%);
    pointer-events: none;
    transition: left 80ms ease-out;
    display: none;
}
.setpoint-widget.dirty .setpoint-slider-fb-marker {
    display: block;
}
.setpoint-slider-labels {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--text-muted, #6b7280);
    margin-top: 2px;
}
.setpoint-slider-no-data .setpoint-slider-handle,
.setpoint-slider-no-data .setpoint-slider-fill {
    opacity: 0.4;
}
.setpoint-slider-no-data .setpoint-slider-value {
    opacity: 0.5;
}

/* Vertical orientation */
.setpoint-style-slider.setpoint-slider-vertical .setpoint-slider-wrap {
    align-items: center;
}
.setpoint-slider-vertical .setpoint-slider-track-wrap {
    width: 36px;
    height: auto;
    flex: 1;
    margin: 0 auto;
}
.setpoint-slider-vertical .setpoint-slider-track {
    left: 14px;
    top: 0;
    bottom: 0;
    right: auto;
    width: 8px;
    height: auto;
}
.setpoint-slider-vertical .setpoint-slider-fill {
    left: 0; right: 0; bottom: 0; top: auto;
    width: auto;
    height: 0;
    transition: height 80ms ease-out;
}
.setpoint-slider-vertical .setpoint-slider-zones {
    left: 14px;
    top: 0;
    bottom: 0;
    right: auto;
    width: 8px;
    height: auto;
}
.setpoint-slider-vertical .setpoint-slider-zone {
    left: 0; right: 0;
    top: auto; bottom: 0;
}
.setpoint-slider-vertical .setpoint-slider-handle {
    left: 18px;
    top: auto;
    bottom: 0;
    transform: translateX(-50%) translateY(50%);
    transition: bottom 80ms ease-out;
}
.setpoint-slider-vertical .setpoint-slider-track-wrap.dragging .setpoint-slider-handle {
    transition: none;
    transform: translateX(-50%) translateY(50%) scale(1.1);
}
.setpoint-slider-vertical .setpoint-slider-tooltip {
    left: calc(100% + 4px);
    bottom: 50%;
    transform: translateY(50%);
}
.setpoint-slider-vertical .setpoint-slider-fb-marker {
    top: auto;
    bottom: 0;
    left: -2px;
    border-left: none;
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    border-right: 8px solid #fbbf24;
    transform: translateY(50%);
    transition: bottom 80ms ease-out;
}
.setpoint-slider-vertical .setpoint-slider-labels {
    flex-direction: column-reverse;
    position: absolute;
    right: 4px;
    top: 0; bottom: 0;
}
```

- [ ] **Step 2.3: Commit**

```bash
git add ui/static/css/style.css
git commit -m "css(setpoint): add custom-rendered slider styles

Adds .setpoint-slider-track-wrap / -track / -fill / -handle / -tooltip
/ -fb-marker / -zones / -zone / -no-data classes plus vertical
orientation variants. Removes old native-range slider styling.
DOM that uses these classes lands in the next commit."
```

---

## Task 3: Replace `_renderSlider` DOM (no behavior yet)

Swaps native `<input type="range">` for the new DOM structure. No mouse handlers wired yet — placeholder click on track-wrap does nothing. The widget must still render without errors and existing render test must pass after a small selector update.

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-setpoint.js` lines 169–207 (`_renderSlider`).
- Modify: `tests/single/dashboard-active-setpoint.spec.ts` line 73–76 (rendering selector).

- [ ] **Step 3.1: Update existing render test for new selector**

Edit `tests/single/dashboard-active-setpoint.spec.ts` lines 73–76:

```typescript
    test('renders style "slider"', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'slider' });
        await expect(page.locator('.setpoint-style-slider').first()).toBeVisible();
        await expect(page.locator('[data-test="track-wrap"]').first()).toBeVisible();
    });
```

- [ ] **Step 3.2: Run that test — expect FAIL**

Run: `docker compose --profile dev down && cd tests && DOCKER_COMPOSE=1 npx playwright test single/dashboard-active-setpoint.spec.ts -g 'renders style "slider"' --reporter=line 2>&1 | tail -20`

Expected: FAIL because `[data-test="track-wrap"]` is not in DOM (still `[data-test="slider"]`).

(If the project uses `make js-tests` to run tests in a container — the equivalent is `docker compose run --rm -T tests npx playwright test single/dashboard-active-setpoint.spec.ts -g 'renders style "slider"'`. Use whichever fits the project conventions; both work for selecting a single grep'd test.)

- [ ] **Step 3.3: Replace `_renderSlider` body**

In `ui/static/js/src/61-dashboard-active-setpoint.js`, replace lines 169–207 (`_renderSlider() { ... }`):

```javascript
    // ===== Style: slider =====
    _renderSlider() {
        const unit = escapeHtml(this.config?.unit || '');
        const min = this.config?.min ?? SETPOINT_DEFAULT_MIN;
        const max = this.config?.max ?? SETPOINT_DEFAULT_MAX;
        const orientation = this.config?.orientation === 'vertical' ? 'vertical' : 'horizontal';
        const zones = Array.isArray(this.config?.zones) ? this.config.zones : [];
        if (orientation === 'vertical') {
            this.element.classList.add('setpoint-slider-vertical');
        }
        const zonesHtml = zones.length > 0
            ? `<div class="setpoint-slider-zones" data-test="zones">${this._renderZonesHtml(zones, min, max, orientation)}</div>`
            : '';
        const fillHtml = zones.length > 0
            ? ''
            : '<div class="setpoint-slider-fill"></div>';

        this.element.innerHTML = `
            ${this._labelHtml()}
            <div class="setpoint-slider-wrap">
                <div class="setpoint-slider-value-row">
                    <span class="setpoint-slider-value" data-test="value" title="Двойной клик — точный ввод">--</span>
                    ${unit ? '<span class="setpoint-unit">' + unit + '</span>' : ''}
                </div>
                <div class="setpoint-slider-track-wrap" data-test="track-wrap">
                    ${zonesHtml}
                    <div class="setpoint-slider-track">${fillHtml}</div>
                    <div class="setpoint-slider-handle" data-test="handle">
                        <div class="setpoint-slider-tooltip" data-test="tooltip">--</div>
                    </div>
                    <div class="setpoint-slider-fb-marker" data-test="fb-marker"></div>
                </div>
                <div class="setpoint-slider-labels">
                    <span>${escapeHtml(String(min))}</span>
                    <span>${escapeHtml(String(max))}</span>
                </div>
            </div>
        `;

        const valueSpan = this.element.querySelector('[data-test="value"]');
        this._makeInlineEditable(valueSpan);
        // Mouse handlers wired in Task 4 / 5 / 7.
    }

    _renderZonesHtml(zones, min, max, orientation) {
        const range = max - min;
        if (range <= 0) return '';
        return zones.map(z => {
            const fromPct = Math.max(0, Math.min(100, (z.from - min) / range * 100));
            const toPct   = Math.max(0, Math.min(100, (z.to   - min) / range * 100));
            const left  = Math.min(fromPct, toPct);
            const right = 100 - Math.max(fromPct, toPct);
            const color = escapeAttr(z.color || '#ef4444');
            if (orientation === 'vertical') {
                // bottom = lower value, top grow by height
                const bottom = left;
                const heightPct = 100 - left - right;
                return `<div class="setpoint-slider-zone" style="bottom:${bottom}%;height:${heightPct}%;background:${color}"></div>`;
            }
            return `<div class="setpoint-slider-zone" style="left:${left}%;right:${right}%;background:${color}"></div>`;
        }).join('');
    }
```

- [ ] **Step 3.4: Rebuild concatenated `app.js`**

Run: `make app`

Expected: silent success.

- [ ] **Step 3.5: Re-run the render test — expect PASS**

Run: `cd tests && docker compose run --rm -T tests npx playwright test single/dashboard-active-setpoint.spec.ts -g 'renders style "slider"' --reporter=line 2>&1 | tail -10`

Expected: PASS.

- [ ] **Step 3.6: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-setpoint.js ui/static/js/app.js tests/single/dashboard-active-setpoint.spec.ts
git commit -m "feat(setpoint): replace native range with custom slider DOM

DOM scaffolding only — track-wrap, track, fill (or zones overlay),
handle, tooltip, fb-marker, labels. Vertical orientation supported
via root class. Mouse handlers come in subsequent commits.

Updates the render test selector from data-test=slider (native range
input) to data-test=track-wrap."
```

---

## Task 4: Click-to-jump handler (AC-1)

Single click anywhere on `.setpoint-slider-track-wrap` jumps the handle to that position and sends one POST.

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-setpoint.js` (`_renderSlider`).
- Modify: `tests/single/dashboard-active-setpoint.spec.ts` (add test).

- [ ] **Step 4.1: Write the failing test**

Append to `tests/single/dashboard-active-setpoint.spec.ts` inside the `test.describe(...)` block (use any existing block grouping slider tests, or add a new describe at file end if absent):

```typescript
    test('AC-1: click on track jumps handle and sends POST', async ({ page }) => {
        const requests: Array<{ url: string; body: string }> = [];
        page.on('request', (req) => {
            if (req.url().includes('/ionc/set')) {
                requests.push({ url: req.url(), body: req.postData() || '' });
            }
        });
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 1 });
        await takeControl(page);

        const trackWrap = page.locator('[data-test="track-wrap"]').first();
        const box = await trackWrap.boundingBox();
        if (!box) throw new Error('track-wrap has no box');
        // Click at 50% horizontally
        await trackWrap.click({ position: { x: box.width * 0.5, y: box.height / 2 } });

        await page.waitForTimeout(300);
        expect(requests.length).toBeGreaterThanOrEqual(1);
        const last = requests[requests.length - 1];
        // value should be ~50 (within step rounding)
        expect(last.url).toMatch(/value=(48|49|50|51|52)/);
    });
```

(Helpers `createSetpointDashboard` and `takeControl` already exist in this file — they are used by the existing tests at lines 64, 73, 82.)

- [ ] **Step 4.2: Run the test — expect FAIL**

Run: `cd tests && docker compose run --rm -T tests npx playwright test single/dashboard-active-setpoint.spec.ts -g 'AC-1' --reporter=line 2>&1 | tail -15`

Expected: FAIL — no POST sent (handlers not wired).

- [ ] **Step 4.3: Add click-to-jump handler**

In `ui/static/js/src/61-dashboard-active-setpoint.js` `_renderSlider`, after `this._makeInlineEditable(valueSpan);` and before the comment, insert:

```javascript
        const trackWrap = this.element.querySelector('[data-test="track-wrap"]');
        const handle = this.element.querySelector('[data-test="handle"]');

        const valueAtPointer = (e) => {
            const rect = trackWrap.getBoundingClientRect();
            const cfgMin = this.config?.min ?? SETPOINT_DEFAULT_MIN;
            const cfgMax = this.config?.max ?? SETPOINT_DEFAULT_MAX;
            const cfgStep = this.config?.step ?? SETPOINT_DEFAULT_STEP;
            const isVertical = this.config?.orientation === 'vertical';
            let pct = isVertical
                ? 1 - (e.clientY - rect.top) / rect.height
                : (e.clientX - rect.left) / rect.width;
            pct = Math.max(0, Math.min(1, pct));
            const raw = cfgMin + pct * (cfgMax - cfgMin);
            const stepped = Math.round(raw / cfgStep) * cfgStep;
            return Math.max(cfgMin, Math.min(cfgMax, stepped));
        };

        trackWrap.addEventListener('mousedown', (e) => {
            if (!this.isInteractive()) return;
            e.preventDefault();
            e.stopPropagation();
            const v = valueAtPointer(e);
            this._setCommand(v);
            this._applyNow();
        });
```

(The `e.preventDefault()` keeps focus stable; `e.stopPropagation()` stops the dashboard manager click handler from intercepting.)

- [ ] **Step 4.4: Rebuild and rerun**

Run: `make app && cd tests && docker compose run --rm -T tests npx playwright test single/dashboard-active-setpoint.spec.ts -g 'AC-1' --reporter=line 2>&1 | tail -10`

Expected: PASS.

- [ ] **Step 4.5: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-setpoint.js ui/static/js/app.js tests/single/dashboard-active-setpoint.spec.ts
git commit -m "feat(setpoint): slider click-to-jump (AC-1)

mousedown anywhere on .setpoint-slider-track-wrap computes
step-rounded value from pointer position, sets commandValue,
and sends one POST via _applyNow."
```

---

## Task 5: Drag-and-release handler (AC-2)

Drag = mousedown → window mousemove(s) → window mouseup. Exactly one POST on mouseup. Intermediate mousemove updates handle position only.

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-setpoint.js`.
- Modify: `tests/single/dashboard-active-setpoint.spec.ts`.

- [ ] **Step 5.1: Write the failing test**

Append to `tests/single/dashboard-active-setpoint.spec.ts`:

```typescript
    test('AC-2: drag sends exactly one POST on release', async ({ page }) => {
        const requests: Array<{ url: string }> = [];
        page.on('request', (req) => {
            if (req.url().includes('/ionc/set')) requests.push({ url: req.url() });
        });
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 1 });
        await takeControl(page);

        const trackWrap = page.locator('[data-test="track-wrap"]').first();
        const box = await trackWrap.boundingBox();
        if (!box) throw new Error('track-wrap has no box');

        const startX = box.x + box.width * 0.2;
        const midX = box.x + box.width * 0.5;
        const endX = box.x + box.width * 0.8;
        const y = box.y + box.height / 2;

        await page.mouse.move(startX, y);
        await page.mouse.down();
        await page.mouse.move(midX, y, { steps: 5 });
        await page.mouse.move(endX, y, { steps: 5 });
        // mid-drag: no POST yet
        expect(requests.filter(r => r.url.includes('/ionc/set'))).toHaveLength(1);
        // ^ one POST from initial mousedown — that's the click-to-jump path firing on press.
        // Actually drag test must verify exactly ONE POST per gesture, including mousedown+release.
        await page.mouse.up();
        await page.waitForTimeout(300);
        // After release: still exactly one POST (mousedown started drag, mouseup committed; no extra POST per mousemove)
        expect(requests.length).toBe(1);
        expect(requests[0].url).toMatch(/value=(7[5-9]|8[0-5])/);
    });
```

(Note: the click-to-jump implementation in Task 4 sends a POST on `mousedown`. For drag-and-release semantics that's incompatible — drag must defer the POST to mouseup. This test forces us to refactor in Step 5.3.)

- [ ] **Step 5.2: Run — expect FAIL**

Run: `cd tests && docker compose run --rm -T tests npx playwright test single/dashboard-active-setpoint.spec.ts -g 'AC-2' --reporter=line 2>&1 | tail -15`

Expected: FAIL — Task 4's mousedown sends POST immediately; mid-drag check would pass with 1 POST but final value would be ~20 (from mousedown position), not 75–85 (from mouseup position).

- [ ] **Step 5.3: Refactor mousedown — defer POST to mouseup**

Replace the entire mouse-handler block in `_renderSlider` (the mousedown listener added in Task 4) with this:

```javascript
        const trackWrap = this.element.querySelector('[data-test="track-wrap"]');
        const handle = this.element.querySelector('[data-test="handle"]');

        const valueAtPointer = (e) => {
            const rect = trackWrap.getBoundingClientRect();
            const cfgMin = this.config?.min ?? SETPOINT_DEFAULT_MIN;
            const cfgMax = this.config?.max ?? SETPOINT_DEFAULT_MAX;
            const cfgStep = this.config?.step ?? SETPOINT_DEFAULT_STEP;
            const isVertical = this.config?.orientation === 'vertical';
            let pct = isVertical
                ? 1 - (e.clientY - rect.top) / rect.height
                : (e.clientX - rect.left) / rect.width;
            pct = Math.max(0, Math.min(1, pct));
            const raw = cfgMin + pct * (cfgMax - cfgMin);
            const stepped = Math.round(raw / cfgStep) * cfgStep;
            return Math.max(cfgMin, Math.min(cfgMax, stepped));
        };

        const onMove = (e) => {
            if (!this._sliderDragging) return;
            const v = valueAtPointer(e);
            this._setCommand(v);
        };
        const onUp = () => {
            if (!this._sliderDragging) return;
            this._sliderDragging = false;
            trackWrap.classList.remove('dragging');
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            this._applyNow();
        };

        trackWrap.addEventListener('mousedown', (e) => {
            if (!this.isInteractive()) return;
            e.preventDefault();
            e.stopPropagation();
            this._sliderDragging = true;
            trackWrap.classList.add('dragging');
            const v = valueAtPointer(e);
            this._setCommand(v);
            // Do NOT _applyNow() here — committed on mouseup.
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
```

This unifies click-to-jump and drag: mousedown always starts a "drag" (even a click without mousemove), mouseup commits the final value. Click-to-jump still sends one POST per gesture (AC-1 still passes).

- [ ] **Step 5.4: Run AC-1 and AC-2 together**

Run: `make app && cd tests && docker compose run --rm -T tests npx playwright test single/dashboard-active-setpoint.spec.ts -g 'AC-1|AC-2' --reporter=line 2>&1 | tail -10`

Expected: both PASS.

- [ ] **Step 5.5: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-setpoint.js ui/static/js/app.js tests/single/dashboard-active-setpoint.spec.ts
git commit -m "feat(setpoint): slider drag-and-release (AC-2)

mousedown -> mousemove -> mouseup gesture sends exactly one POST
on release. Click-to-jump (AC-1) is the same gesture with no
mousemove in between — both produce one POST per gesture."
```

---

## Task 6: Two-mode feedback tracking + initial state (AC-4, AC-5, AC-6, AC-10)

When `commandValue === null`, handle position tracks `feedbackValue` (idle mode). Initial state shows `--` value, hidden fb-marker, dimmed via `.setpoint-slider-no-data`. Auto-snap dirty when feedback catches up.

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-setpoint.js` (`renderFeedback`, `update`).
- Modify: `tests/single/dashboard-active-setpoint.spec.ts`.

- [ ] **Step 6.1: Write the failing tests**

Append:

```typescript
    test('AC-10: initial state shows no-data dim before SSE arrives', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 1 });
        // Don't take control, don't wait for SSE
        const widget = page.locator('.setpoint-widget').first();
        await widget.waitFor({ state: 'visible' });
        // Right after render, before any SSE update — value should be '--'
        const valueText = await page.locator('[data-test="value"]').first().textContent();
        expect(valueText?.trim()).toBe('--');
        const hasNoDataClass = await widget.evaluate(el =>
            el.querySelector('.setpoint-slider-wrap')?.parentElement?.classList.contains('setpoint-slider-no-data')
            || el.classList.contains('setpoint-slider-no-data'));
        // No-data class is on the widget root.
        expect(hasNoDataClass).toBe(true);
    });

    test('AC-4: handle tracks feedback when idle', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 1, sensorId: 99 });
        // Wait for first SSE
        await page.waitForTimeout(1500);
        // Inject fb=75 via mock hook
        await page.request.post('http://localhost:9090/api/mock/set-sensor-value', { data: { id: 99, value: 75 } });
        // Backend polls every 1s; wait for SSE to arrive
        await page.waitForTimeout(1500);
        const valueText = await page.locator('[data-test="value"]').first().textContent();
        expect(valueText?.trim()).toBe('75');
        // Handle position: left ~ 75% of track width
        const handle = page.locator('[data-test="handle"]').first();
        const trackWrap = page.locator('[data-test="track-wrap"]').first();
        const handleBox = await handle.boundingBox();
        const trackBox = await trackWrap.boundingBox();
        if (!handleBox || !trackBox) throw new Error('no boxes');
        const handleCenterX = handleBox.x + handleBox.width / 2;
        const pct = (handleCenterX - trackBox.x) / trackBox.width;
        expect(pct).toBeGreaterThan(0.7);
        expect(pct).toBeLessThan(0.8);
    });

    test('AC-5: auto-snap dirty -> idle when feedback catches up', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 1, sensorId: 99 });
        await takeControl(page);
        await page.waitForTimeout(1500);

        const trackWrap = page.locator('[data-test="track-wrap"]').first();
        const box = await trackWrap.boundingBox();
        if (!box) throw new Error('no box');
        await trackWrap.click({ position: { x: box.width * 0.5, y: box.height / 2 } });
        await page.waitForTimeout(300);

        // Now widget is dirty (cmd=50, fb=whatever original was)
        const widget = page.locator('.setpoint-widget').first();
        await expect(widget).toHaveClass(/dirty/);

        // Inject fb=50 — within step/2 of cmd
        await page.request.post('http://localhost:9090/api/mock/set-sensor-value', { data: { id: 99, value: 50 } });
        await page.waitForTimeout(1500);
        await expect(widget).not.toHaveClass(/dirty/);
    });

    test('AC-6: dirty stays when feedback drifts away from command', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 1, sensorId: 99 });
        await takeControl(page);
        await page.waitForTimeout(1500);

        const trackWrap = page.locator('[data-test="track-wrap"]').first();
        const box = await trackWrap.boundingBox();
        if (!box) throw new Error('no box');
        await trackWrap.click({ position: { x: box.width * 0.5, y: box.height / 2 } });
        await page.waitForTimeout(300);

        // Inject fb=20 — far from cmd=50
        await page.request.post('http://localhost:9090/api/mock/set-sensor-value', { data: { id: 99, value: 20 } });
        await page.waitForTimeout(1500);
        const widget = page.locator('.setpoint-widget').first();
        await expect(widget).toHaveClass(/dirty/);
        // fb-marker visible
        const fbMarker = page.locator('[data-test="fb-marker"]').first();
        await expect(fbMarker).toBeVisible();
    });
```

- [ ] **Step 6.2: Run — expect 4 FAIL**

Run: `cd tests && docker compose run --rm -T tests npx playwright test single/dashboard-active-setpoint.spec.ts -g 'AC-4|AC-5|AC-6|AC-10' --reporter=line 2>&1 | tail -25`

Expected: 4 failures. Most likely: `[data-test="value"]` text is empty (not `--`), no-data class missing, handle position not tracking feedback.

- [ ] **Step 6.3: Update `renderFeedback` for slider style**

Replace the `else if (style === 'slider')` branch in `renderFeedback()` (lines 281–290 in current code) with:

```javascript
        } else if (style === 'slider') {
            const trackWrap = this.element.querySelector('[data-test="track-wrap"]');
            const handle = this.element.querySelector('[data-test="handle"]');
            const tooltip = this.element.querySelector('[data-test="tooltip"]');
            const valueSpan = this.element.querySelector('[data-test="value"]');
            const fill = this.element.querySelector('.setpoint-slider-fill');
            const fbMarker = this.element.querySelector('[data-test="fb-marker"]');
            const display = this.commandValue ?? this.feedbackValue;
            const isVertical = this.config?.orientation === 'vertical';
            const cfgMin = this.config?.min ?? SETPOINT_DEFAULT_MIN;
            const cfgMax = this.config?.max ?? SETPOINT_DEFAULT_MAX;
            const range = cfgMax - cfgMin;

            const pct = (v) => {
                if (range <= 0) return 0;
                return Math.max(0, Math.min(100, (v - cfgMin) / range * 100));
            };

            // No-data state
            const noData = (display === null || display === undefined);
            this.element.classList.toggle('setpoint-slider-no-data', noData);

            if (valueSpan) {
                valueSpan.textContent = noData ? '--' : String(display);
            }
            if (tooltip) {
                tooltip.textContent = noData ? '' : String(display);
            }
            if (!noData && handle) {
                const p = pct(display);
                if (isVertical) {
                    handle.style.bottom = p + '%';
                    handle.style.left = '';
                } else {
                    handle.style.left = p + '%';
                    handle.style.bottom = '';
                }
            }
            if (!noData && fill) {
                if (isVertical) {
                    fill.style.height = pct(display) + '%';
                    fill.style.width = '';
                } else {
                    fill.style.width = pct(display) + '%';
                    fill.style.height = '';
                }
            }
            // fb-marker — only when dirty (cmd != fb), positioned at fb
            if (fbMarker) {
                const fbReady = this.feedbackValue !== null && this.feedbackValue !== undefined;
                const isDirty = this.commandValue !== null && this.commandValue !== undefined && fbReady;
                if (isDirty) {
                    const p = pct(this.feedbackValue);
                    if (isVertical) {
                        fbMarker.style.bottom = p + '%';
                        fbMarker.style.left = '';
                    } else {
                        fbMarker.style.left = p + '%';
                        fbMarker.style.bottom = '';
                    }
                }
            }
        } else { // stepper
```

(Keep the trailing `} else { // stepper` block as-is.)

- [ ] **Step 6.4: Run — expect 4 PASS**

Run: `make app && cd tests && docker compose run --rm -T tests npx playwright test single/dashboard-active-setpoint.spec.ts -g 'AC-4|AC-5|AC-6|AC-10' --reporter=line 2>&1 | tail -25`

Expected: all 4 PASS.

- [ ] **Step 6.5: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-setpoint.js ui/static/js/app.js tests/single/dashboard-active-setpoint.spec.ts
git commit -m "feat(setpoint): two-mode feedback tracking + no-data state (AC-4/5/6/10)

Handle position follows commandValue when set, otherwise feedbackValue.
fb-marker visible only when dirty, positioned at feedbackValue.
.setpoint-slider-no-data dims handle/fill until first SSE arrives.
Existing auto-snap (in update()) already handles AC-5; this commit
adds the visual rendering for AC-4/6/10."
```

---

## Task 7: No-jump-during-drag (AC-3)

While `_sliderDragging === true`, incoming SSE updates must not move the handle.

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-setpoint.js` (`update`).
- Modify: `tests/single/dashboard-active-setpoint.spec.ts`.

- [ ] **Step 7.1: Write the failing test**

Append:

```typescript
    test('AC-3: handle does not move during drag despite incoming SSE', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 1, sensorId: 99 });
        await takeControl(page);
        await page.waitForTimeout(1500);

        const trackWrap = page.locator('[data-test="track-wrap"]').first();
        const box = await trackWrap.boundingBox();
        if (!box) throw new Error('no box');

        // Start a drag at 30%
        await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(100);

        // Inject fb=80 mid-drag
        await page.request.post('http://localhost:9090/api/mock/set-sensor-value', { data: { id: 99, value: 80 } });
        await page.waitForTimeout(1500); // wait for SSE arrival

        // Handle should still be near 30% (because of drag), NOT 80%
        const handle = page.locator('[data-test="handle"]').first();
        const handleBox = await handle.boundingBox();
        if (!handleBox) throw new Error('no handle box');
        const handleCenterX = handleBox.x + handleBox.width / 2;
        const pct = (handleCenterX - box.x) / box.width;
        expect(pct).toBeGreaterThan(0.25);
        expect(pct).toBeLessThan(0.35);

        await page.mouse.up();
    });
```

- [ ] **Step 7.2: Run — expect FAIL**

Run: `cd tests && docker compose run --rm -T tests npx playwright test single/dashboard-active-setpoint.spec.ts -g 'AC-3' --reporter=line 2>&1 | tail -15`

Expected: FAIL — handle moves to 80% because update() called renderFeedback.

- [ ] **Step 7.3: Update `update()` to skip render during drag**

In `61-dashboard-active-setpoint.js`, replace the body of `update(value, error = null, meta = null)` (lines 305–319) with:

```javascript
    update(value, error = null, meta = null) {
        this.feedbackValue = value;
        this.value = value;
        this.error = error;
        this._applyFeedbackMeta(meta);
        if (this.commandValue !== null && this.commandValue !== undefined &&
            value !== null && value !== undefined) {
            const tolerance = Math.abs(this.config?.step ?? 1) / 2;
            if (Math.abs(this.commandValue - value) <= tolerance) {
                this.commandValue = null;
                this._updateDirty(false);
            }
        }
        // Skip handle re-render during active drag — feedback is recorded but not visualized
        // until mouseup, so the handle does not "jump out of the operator's hand".
        if (!this._sliderDragging) {
            this.renderFeedback();
        }
    }
```

- [ ] **Step 7.4: Run — expect PASS**

Run: `make app && cd tests && docker compose run --rm -T tests npx playwright test single/dashboard-active-setpoint.spec.ts -g 'AC-3' --reporter=line 2>&1 | tail -10`

Expected: PASS.

- [ ] **Step 7.5: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-setpoint.js ui/static/js/app.js tests/single/dashboard-active-setpoint.spec.ts
git commit -m "feat(setpoint): slider ignores SSE during drag (AC-3)

While the operator is dragging, incoming SSE updates record
feedbackValue but do not call renderFeedback — the handle stays
under the cursor. Normal rendering resumes on mouseup."
```

---

## Task 8: Inline-edit + frozen + no-token guards (AC-7, AC-8, AC-9)

Inline-edit (dblclick on value) was already wired in Task 3 via `_makeInlineEditable`. Frozen / no-token blocking is inherited from base. These three tests verify it works end-to-end.

**Files:**
- Modify: `tests/single/dashboard-active-setpoint.spec.ts` (add 3 tests).

- [ ] **Step 8.1: Write the failing tests**

Append:

```typescript
    test('AC-7: dblclick on value, type, Enter -> POST', async ({ page }) => {
        const requests: Array<{ url: string }> = [];
        page.on('request', (req) => {
            if (req.url().includes('/ionc/set')) requests.push({ url: req.url() });
        });
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 1 });
        await takeControl(page);
        await page.waitForTimeout(800);

        const valueSpan = page.locator('[data-test="value"]').first();
        await valueSpan.dblclick();
        const inlineInput = page.locator('[data-test="inline-input"]').first();
        await inlineInput.fill('42');
        await inlineInput.press('Enter');
        await page.waitForTimeout(300);
        expect(requests.length).toBeGreaterThanOrEqual(1);
        expect(requests[requests.length - 1].url).toMatch(/value=42/);
    });

    test('AC-8: frozen sensor blocks click and drag', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 1, sensorId: 99 });
        await takeControl(page);
        await page.waitForTimeout(800);

        // Use existing freeze API
        await page.request.get('http://localhost:9090/freeze?supplier=test&99=42');
        await page.waitForTimeout(1500);

        const requests: Array<{ url: string }> = [];
        page.on('request', (req) => {
            if (req.url().includes('/ionc/set')) requests.push({ url: req.url() });
        });

        const trackWrap = page.locator('[data-test="track-wrap"]').first();
        const box = await trackWrap.boundingBox();
        if (!box) throw new Error('no box');
        await trackWrap.click({ position: { x: box.width * 0.7, y: box.height / 2 } });
        await page.waitForTimeout(500);
        expect(requests).toHaveLength(0);

        const widget = page.locator('.setpoint-widget').first();
        await expect(widget).toHaveAttribute('data-frozen', 'true');
    });

    test('AC-9: no control token blocks click and drag', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'slider', min: 0, max: 100, step: 1 });
        // Do NOT take control
        await page.waitForTimeout(800);

        const requests: Array<{ url: string }> = [];
        page.on('request', (req) => {
            if (req.url().includes('/ionc/set')) requests.push({ url: req.url() });
        });

        const trackWrap = page.locator('[data-test="track-wrap"]').first();
        const box = await trackWrap.boundingBox();
        if (!box) throw new Error('no box');
        await trackWrap.click({ position: { x: box.width * 0.7, y: box.height / 2 } });
        await page.waitForTimeout(500);
        expect(requests).toHaveLength(0);

        const widget = page.locator('.setpoint-widget').first();
        await expect(widget).toHaveAttribute('data-control-blocked', 'true');
    });
```

- [ ] **Step 8.2: Run — expect 3 results**

Run: `cd tests && docker compose run --rm -T tests npx playwright test single/dashboard-active-setpoint.spec.ts -g 'AC-7|AC-8|AC-9' --reporter=line 2>&1 | tail -20`

Expected:
- AC-7 PASS — `_makeInlineEditable` already inherited via Task 3's `_renderSlider`.
- AC-8 PASS — base `isInteractive()` already returns false when frozen, mousedown handler bails. Verify `data-frozen` is set by base `_updateInteractivityClass`.
- AC-9 PASS — same path via `isInteractive()`.

If any fail, the cause is most likely that the test setup mismatches the existing helpers — verify `takeControl(page)` and freeze URL syntax match what other tests in this file use, then rerun.

- [ ] **Step 8.3: Commit**

```bash
git add tests/single/dashboard-active-setpoint.spec.ts
git commit -m "test(setpoint): slider inline-edit + frozen + no-token (AC-7/8/9)

Verifies that double-click-to-input editing, sensor freeze, and
absent control token all properly gate slider input. Behavior
already implemented via base class and Task 3 _makeInlineEditable;
these tests lock in the contract."
```

---

## Task 9: Color zones config form + AC-11 test

Adds `zones` field to setpoint config form when `style='slider'`. Reuses `renderColorZonesEditor` / `parseColorZones` from `06-utils.js`. The DOM rendering of zones (already added in Task 3 via `_renderZonesHtml`) gets exercised by the AC-11 test.

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-setpoint.js` (`getActiveConfigFields`, `parseActiveConfigFields`).
- Modify: `tests/single/dashboard-active-setpoint.spec.ts`.

- [ ] **Step 9.1: Write the failing test**

Append:

```typescript
    test('AC-11: color zones render with correct positions and colors', async ({ page }) => {
        await createSetpointDashboard(page, {
            style: 'slider',
            min: 0, max: 100, step: 1,
            zones: [
                { from: 0,  to: 40,  color: '#10b981' },
                { from: 40, to: 75,  color: '#fbbf24' },
                { from: 75, to: 100, color: '#ef4444' },
            ],
        });
        await page.waitForTimeout(800);

        const zoneEls = page.locator('.setpoint-slider-zone');
        await expect(zoneEls).toHaveCount(3);
        // Verify first zone: green, left:0%, right:60%
        const first = await zoneEls.nth(0).evaluate(el => ({
            bg: el.style.background || el.style.backgroundColor,
            left: el.style.left,
            right: el.style.right,
        }));
        expect(first.bg.toLowerCase()).toMatch(/16, 185, 129|10b981/);
        expect(first.left).toBe('0%');
        expect(first.right).toBe('60%');
        // Third zone: red, left:75%, right:0%
        const third = await zoneEls.nth(2).evaluate(el => ({
            bg: el.style.background || el.style.backgroundColor,
            left: el.style.left,
            right: el.style.right,
        }));
        expect(third.bg.toLowerCase()).toMatch(/239, 68, 68|ef4444/);
        expect(third.left).toBe('75%');
        expect(third.right).toBe('0%');
    });
```

(Note: the `createSetpointDashboard` helper must accept `zones` in the config and pass it through. Inspect that helper and add `zones` to the spread if needed — typically it does `Object.assign({sensor: ..., ...}, opts)` so it already passes through. If not, edit it to forward extra keys.)

- [ ] **Step 9.2: Run — expect PASS**

Run: `cd tests && docker compose run --rm -T tests npx playwright test single/dashboard-active-setpoint.spec.ts -g 'AC-11' --reporter=line 2>&1 | tail -10`

Expected: PASS — `_renderZonesHtml` from Task 3 already produces this DOM. If the helper drops the `zones` key, the test fails — fix the helper to forward it (one-line edit) and rerun.

- [ ] **Step 9.3: Add zones to config form**

In `61-dashboard-active-setpoint.js`, replace the existing `static getActiveConfigFields(config = {})` (lines 409–444) with:

```javascript
    static getActiveConfigFields(config = {}) {
        const applyMode = config.applyMode || 'manual';
        const orientation = config.orientation || 'horizontal';
        const zones = Array.isArray(config.zones) ? config.zones : [];
        return `
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>min</label>
                    <input type="number" class="widget-input" name="min"
                           value="${config.min ?? SETPOINT_DEFAULT_MIN}" data-test="cfg-min">
                </div>
                <div class="widget-config-field">
                    <label>max</label>
                    <input type="number" class="widget-input" name="max"
                           value="${config.max ?? SETPOINT_DEFAULT_MAX}" data-test="cfg-max">
                </div>
                <div class="widget-config-field">
                    <label>step</label>
                    <input type="number" class="widget-input" name="step"
                           value="${config.step ?? SETPOINT_DEFAULT_STEP}" min="0" data-test="cfg-step">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Unit</label>
                    <input type="text" class="widget-input" name="unit"
                           value="${escapeAttr(config.unit || '')}" placeholder="°C, %, Pa..." data-test="cfg-unit">
                </div>
                <div class="widget-config-field" data-row="applyMode">
                    <label>Apply mode</label>
                    <select class="widget-input" name="applyMode" data-test="cfg-applyMode">
                        <option value="manual" ${applyMode === 'manual' ? 'selected' : ''}>manual (Apply button)</option>
                        <option value="auto" ${applyMode === 'auto' ? 'selected' : ''}>auto (debounce ${SETPOINT_AUTO_APPLY_DEBOUNCE_MS}ms)</option>
                    </select>
                </div>
                <div class="widget-config-field" data-row="orientation">
                    <label>Orientation</label>
                    <select class="widget-input" name="orientation" data-test="cfg-orientation">
                        <option value="horizontal" ${orientation === 'horizontal' ? 'selected' : ''}>horizontal</option>
                        <option value="vertical"   ${orientation === 'vertical'   ? 'selected' : ''}>vertical</option>
                    </select>
                </div>
            </div>
            <div class="widget-config-row" data-row="zones">
                ${renderColorZonesEditor(zones, '#3b82f6')}
            </div>
        `;
    }
```

And replace `static parseActiveConfigFields(form)` (lines 446–458) with:

```javascript
    static parseActiveConfigFields(form) {
        const min = parseDecimalInputOrDefault(form.querySelector('[name="min"]')?.value, SETPOINT_DEFAULT_MIN);
        const max = parseDecimalInputOrDefault(form.querySelector('[name="max"]')?.value, SETPOINT_DEFAULT_MAX);
        const stepRaw = parseDecimalInputOrDefault(form.querySelector('[name="step"]')?.value, SETPOINT_DEFAULT_STEP);
        const step = stepRaw > 0 ? stepRaw : SETPOINT_DEFAULT_STEP;
        const style = form.querySelector('[name="style"]')?.value || SetpointWidget.defaultStyle;
        const result = {
            min: Math.min(min, max),
            max: Math.max(min, max),
            step,
            unit: form.querySelector('[name="unit"]')?.value || '',
        };
        if (style === 'slider') {
            const orient = form.querySelector('[name="orientation"]')?.value;
            result.orientation = orient === 'vertical' ? 'vertical' : 'horizontal';
            const zonesContainer = form.querySelector('[data-row="zones"]');
            result.zones = zonesContainer ? parseColorZones(zonesContainer) : [];
        } else {
            result.applyMode = form.querySelector('[name="applyMode"]')?.value === 'auto' ? 'auto' : 'manual';
        }
        return result;
    }
```

- [ ] **Step 9.4: Rerun AC-11 plus existing config tests**

Run: `make app && cd tests && docker compose run --rm -T tests npx playwright test single/dashboard-active-setpoint.spec.ts -g 'AC-11|config|persists' --reporter=line 2>&1 | tail -15`

Expected: AC-11 PASS, existing config-persistence tests PASS (no regressions in form parsing).

- [ ] **Step 9.5: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-setpoint.js ui/static/js/app.js tests/single/dashboard-active-setpoint.spec.ts
git commit -m "feat(setpoint): slider color zones config + render (AC-11)

Adds zones[] field to setpoint config (visible only for style=slider)
via renderColorZonesEditor. parseActiveConfigFields routes by style:
slider -> {orientation, zones}, others -> {applyMode}. Old applyMode
key in slider configs becomes a no-op. Existing _renderZonesHtml
(Task 3) renders the zones into the slider DOM."
```

---

## Task 10: Vertical orientation behavior (AC-12)

Vertical orientation flips axis: drag mousedown at top → mouseup at bottom decreases value. Test exercises full vertical drag.

**Files:**
- Modify: `tests/single/dashboard-active-setpoint.spec.ts`.

- [ ] **Step 10.1: Write the failing test**

Append:

```typescript
    test('AC-12: vertical orientation - drag from top to bottom decreases value', async ({ page }) => {
        const requests: Array<{ url: string }> = [];
        page.on('request', (req) => {
            if (req.url().includes('/ionc/set')) requests.push({ url: req.url() });
        });
        await createSetpointDashboard(page, {
            style: 'slider',
            orientation: 'vertical',
            min: 0, max: 100, step: 1,
        });
        await takeControl(page);
        await page.waitForTimeout(800);

        const widget = page.locator('.setpoint-widget').first();
        await expect(widget).toHaveClass(/setpoint-slider-vertical/);

        const trackWrap = page.locator('[data-test="track-wrap"]').first();
        const box = await trackWrap.boundingBox();
        if (!box) throw new Error('no box');

        // Top of track = max, bottom = min. Start at top (~10% from top), release at bottom.
        const startY = box.y + box.height * 0.1;
        const endY = box.y + box.height * 0.9;
        const x = box.x + box.width / 2;

        await page.mouse.move(x, startY);
        await page.mouse.down();
        await page.mouse.move(x, endY, { steps: 5 });
        await page.mouse.up();
        await page.waitForTimeout(300);
        expect(requests.length).toBe(1);
        // End at 90% from top = 10% from bottom = ~10 in [0,100]
        expect(requests[0].url).toMatch(/value=([0-9]|1[0-5])(?!\d)/);
    });
```

- [ ] **Step 10.2: Run — expect PASS**

Run: `cd tests && docker compose run --rm -T tests npx playwright test single/dashboard-active-setpoint.spec.ts -g 'AC-12' --reporter=line 2>&1 | tail -10`

Expected: PASS — Task 3's `_renderSlider` already adds `setpoint-slider-vertical` class for vertical, Task 5's `valueAtPointer` already handles vertical inversion, Task 6's `renderFeedback` already positions handle on bottom-axis.

If FAIL, inspect: (a) is `setpoint-slider-vertical` class on root? (b) is handle.style.bottom being set instead of left? Trace via screenshot in test.

- [ ] **Step 10.3: Commit**

```bash
git add tests/single/dashboard-active-setpoint.spec.ts
git commit -m "test(setpoint): vertical slider drag inversion (AC-12)

Verifies that with orientation=vertical, dragging from top to bottom
decreases the value (Y axis inverted: top = max). Behavior already
in place from Tasks 3/5/6; this test locks in the contract."
```

---

## Task 11: Default size 4×1 / 1×4 by orientation

`getDefaultSizeForStyle('slider', config)` returns 4×1 for horizontal, 1×4 for vertical. Updates the dashboard-manager call site to pass `config` as second arg (backward-compatible since PushButton ignores it).

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-setpoint.js` (add static method).
- Modify: `ui/static/js/src/62-dashboard-manager.js` line 1130–1131 (pass config).

- [ ] **Step 11.1: Write the failing test**

Append to `tests/single/dashboard-active-setpoint.spec.ts`:

```typescript
    test('default size for slider: horizontal=4x1, vertical=1x4', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'slider' });
        await page.waitForTimeout(500);
        const sizeH = await page.locator('.setpoint-widget').first().evaluate((el) => {
            const w = (el.closest('[data-widget-id]') || el.parentElement);
            return { w: w?.style.gridColumn || '', h: w?.style.gridRow || '' };
        });
        // Horizontal default: spans 4 cols, 1 row
        expect(sizeH.w).toMatch(/span 4|\/ span 4/);
        expect(sizeH.h).toMatch(/span 1|\/ span 1/);
    });

    test('default size for slider vertical: 1x4', async ({ page }) => {
        await createSetpointDashboard(page, { style: 'slider', orientation: 'vertical' });
        await page.waitForTimeout(500);
        const sizeV = await page.locator('.setpoint-widget').first().evaluate((el) => {
            const w = (el.closest('[data-widget-id]') || el.parentElement);
            return { w: w?.style.gridColumn || '', h: w?.style.gridRow || '' };
        });
        expect(sizeV.w).toMatch(/span 1|\/ span 1/);
        expect(sizeV.h).toMatch(/span 4|\/ span 4/);
    });
```

(The exact `style.gridColumn` format depends on the manager's implementation. Inspect one passing existing test to see the pattern; if it uses `data-grid-w`/`data-grid-h` attributes instead, adjust the assertions accordingly. The point is verifying width/height the dashboard-manager assigned.)

- [ ] **Step 11.2: Run — expect FAIL**

Run: `cd tests && docker compose run --rm -T tests npx playwright test single/dashboard-active-setpoint.spec.ts -g 'default size for slider' --reporter=line 2>&1 | tail -15`

Expected: FAIL — current default for setpoint is 3×2 regardless of style.

- [ ] **Step 11.3: Add `getDefaultSizeForStyle` to SetpointWidget**

In `61-dashboard-active-setpoint.js`, after `static maxSize = ...` (line 39), add:

```javascript
    static getDefaultSizeForStyle(style, config = {}) {
        if (style === 'slider') {
            const orientation = config.orientation === 'vertical' ? 'vertical' : 'horizontal';
            return orientation === 'vertical'
                ? { width: 1, height: 4 }
                : { width: 4, height: 1 };
        }
        return null; // fall back to static defaultSize
    }
```

- [ ] **Step 11.4: Update dashboard-manager to pass config**

In `ui/static/js/src/62-dashboard-manager.js` line 1130–1131, replace:

```javascript
            const sizeOverride = (typeof WidgetClass.getDefaultSizeForStyle === 'function' && config.style)
                ? WidgetClass.getDefaultSizeForStyle(config.style)
                : null;
```

with:

```javascript
            const sizeOverride = (typeof WidgetClass.getDefaultSizeForStyle === 'function' && config.style)
                ? WidgetClass.getDefaultSizeForStyle(config.style, config)
                : null;
```

(Backward-compatible: PushButton's `getDefaultSizeForStyle(style)` ignores the extra arg.)

- [ ] **Step 11.5: Rerun**

Run: `make app && cd tests && docker compose run --rm -T tests npx playwright test single/dashboard-active-setpoint.spec.ts -g 'default size for slider' --reporter=line 2>&1 | tail -10`

Expected: PASS.

- [ ] **Step 11.6: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-setpoint.js ui/static/js/src/62-dashboard-manager.js ui/static/js/app.js tests/single/dashboard-active-setpoint.spec.ts
git commit -m "feat(setpoint): orientation-aware default size for slider

getDefaultSizeForStyle('slider', config) returns 4x1 for horizontal,
1x4 for vertical. dashboard-manager passes config as a second arg
(backward-compatible: PushButton's existing single-arg signature
ignores extras)."
```

---

## Task 12: Config form — conditional field visibility (AC-13)

When `style='slider'` is selected in the edit dialog, hide the `applyMode` row and show `orientation` and `zones`. Switching back reverses.

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-setpoint.js` (`initConfigHandlers`).
- Modify: `tests/single/dashboard-active-setpoint.spec.ts`.

- [ ] **Step 12.1: Write the failing test**

Append:

```typescript
    test('AC-13: config form shows orientation+zones for slider, applyMode for others', async ({ page }) => {
        // Open dashboard, click Add Widget, choose Setpoint, see fields toggle by style.
        await page.goto('http://localhost:8000');
        await page.waitForTimeout(500);
        // Open dashboard tab (the helpers usually do this; adapt to file's pattern)
        await page.locator('text=Dashboard').first().click({ force: true }).catch(() => {});
        await page.waitForTimeout(300);
        // Enter edit mode + add widget — reuse existing test pattern via helper if present,
        // otherwise script directly:
        await page.evaluate(() => {
            window.dashboardManager?.toggleEditMode?.();
        });
        await page.waitForTimeout(200);
        await page.evaluate(() => {
            window.dashboardManager?.openAddWidgetDialog?.('setpoint');
        });
        await page.waitForTimeout(300);

        const styleSel = page.locator('[name="style"]').first();
        const applyRow = page.locator('[data-row="applyMode"]').first();
        const orientRow = page.locator('[data-row="orientation"]').first();
        const zonesRow = page.locator('[data-row="zones"]').first();

        // Default style is 'input' — applyMode visible, orientation/zones hidden
        await expect(applyRow).toBeVisible();
        await expect(orientRow).toBeHidden();
        await expect(zonesRow).toBeHidden();

        // Switch to slider
        await styleSel.selectOption('slider');
        await expect(applyRow).toBeHidden();
        await expect(orientRow).toBeVisible();
        await expect(zonesRow).toBeVisible();

        // Switch back to input
        await styleSel.selectOption('input');
        await expect(applyRow).toBeVisible();
        await expect(orientRow).toBeHidden();
        await expect(zonesRow).toBeHidden();
    });
```

(If the project's existing config-form tests use a different bootstrap helper — copy that pattern. The point is opening the Setpoint config dialog with default config.)

- [ ] **Step 12.2: Run — expect FAIL**

Run: `cd tests && docker compose run --rm -T tests npx playwright test single/dashboard-active-setpoint.spec.ts -g 'AC-13' --reporter=line 2>&1 | tail -15`

Expected: FAIL — no visibility-toggling logic yet.

- [ ] **Step 12.3: Add `initConfigHandlers` override**

In `61-dashboard-active-setpoint.js`, after `static parseActiveConfigFields(form) { ... }` and before `destroy()`, add:

```javascript
    static initConfigHandlers(form, config) {
        super.initConfigHandlers(form, config);  // base wires sensor binding

        if (form.dataset.setpointStyleHandlersWired === 'true') return;
        form.dataset.setpointStyleHandlersWired = 'true';

        const styleSel = form.querySelector('[name="style"]');
        if (!styleSel) return;

        const applyRow  = form.querySelector('[data-row="applyMode"]');
        const orientRow = form.querySelector('[data-row="orientation"]');
        const zonesRow  = form.querySelector('[data-row="zones"]');

        const applyVisibility = () => {
            const isSlider = styleSel.value === 'slider';
            if (applyRow)  applyRow.style.display  = isSlider ? 'none' : '';
            if (orientRow) orientRow.style.display = isSlider ? '' : 'none';
            if (zonesRow)  zonesRow.style.display  = isSlider ? '' : 'none';
        };
        applyVisibility();
        styleSel.addEventListener('change', applyVisibility);
    }
```

- [ ] **Step 12.4: Rerun**

Run: `make app && cd tests && docker compose run --rm -T tests npx playwright test single/dashboard-active-setpoint.spec.ts -g 'AC-13' --reporter=line 2>&1 | tail -10`

Expected: PASS.

- [ ] **Step 12.5: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-setpoint.js ui/static/js/app.js tests/single/dashboard-active-setpoint.spec.ts
git commit -m "feat(setpoint): conditional config form fields (AC-13)

initConfigHandlers wires a style-change listener that shows
orientation+zones rows when style=slider and applyMode for
input/stepper. Idempotent via form.dataset.setpointStyleHandlersWired."
```

---

## Task 13: Full E2E suite + CLAUDE.md update

Run the complete test suite to catch regressions, update CLAUDE.md docs to describe the new slider implementation, commit and push.

**Files:**
- Modify: `CLAUDE.md` (slider section in active widgets).

- [ ] **Step 13.1: Run full suite**

Run: `docker compose --profile dev down && make js-tests 2>&1 | tail -50`

Expected: all tests pass. If any non-slider test regresses (unlikely — all changes are inside `style='slider'` code paths and the dashboard-manager change is backward-compatible), debug and fix in this task before committing.

- [ ] **Step 13.2: Run Go backend tests**

Run: `go test ./... 2>&1 | tail -10`

Expected: all pass. (No backend code changed, so this should be a clean pass; running it confirms nothing was disturbed.)

- [ ] **Step 13.3: Update CLAUDE.md**

In `/home/pv/Projects/uniset-panel/CLAUDE.md`, find the SetpointWidget section (search for `**SetpointWidget`). Replace the sub-section starting with `**Поддерживаемые стили** через` (around the slider description) and the slider bullet with this:

```markdown
**Поддерживаемые стили** через `static styles = ['input', 'slider', 'stepper']`:
- **`input`** (default, defaultSize 3×2): текстовый input + Apply кнопка.
  В dirty state (cmd ≠ fb) — жёлтая граница input'а, видны Apply + Cancel.
  Enter = apply, Esc = cancel.
- **`slider`** (defaultSize 4×1 horizontal / 1×4 vertical через `getDefaultSizeForStyle`):
  custom-rendered (без `<input type="range">`). Click anywhere on track =
  handle прыгает + POST. Drag = POST на release. Inline-edit dblclick.
  Color zones (как у Gauge) — `zones: [{from,to,color}]`. Orientation
  `'horizontal'` (default) | `'vertical'` через config-поле. fb-marker
  ▾ под треком (или слева для vertical) показывает feedback при dirty.
  В idle (cmd=null) handle следует за feedback'ом. SSE updates ignored
  во время drag. `applyMode` игнорируется (всегда write-on-release/click).
- **`stepper`** (defaultSize 3×2): кнопки `−` / `+` + value-label.
  Stepper всегда auto-apply on click (applyMode игнорируется).
```

- [ ] **Step 13.4: Commit docs and push**

```bash
git add CLAUDE.md
git commit -m "docs: update SetpointWidget slider section for redesign

Documents the new custom-rendered slider: click-to-jump, drag-release,
color zones, orientation, idle/dirty feedback tracking, and the
default size override 4x1 / 1x4."

git push
```

---

## Self-review

Spec coverage check (each AC mapped to a task):

| AC | Task |
|---|---|
| AC-1 click-to-jump POST | Task 4 |
| AC-2 drag-release one POST | Task 5 |
| AC-3 no-jump-during-drag | Task 7 |
| AC-4 idle tracking | Task 6 |
| AC-5 auto-snap | Task 6 |
| AC-6 external drift dirty | Task 6 |
| AC-7 inline-edit | Task 8 |
| AC-8 frozen blocks | Task 8 |
| AC-9 no-token blocks | Task 8 |
| AC-10 initial no-data | Task 6 |
| AC-11 zones render | Task 9 |
| AC-12 vertical drag | Task 10 |
| AC-13 form conditional | Task 12 |

Plus default-size verification (Task 11), mock hook (Task 1, prerequisite for AC-3/4/5/6/7/8), CSS scaffolding (Task 2), DOM scaffolding (Task 3), full-suite check (Task 13).

Type / signature consistency:
- `valueAtPointer(e)` defined in Task 4, refactored in Task 5, used by both — single signature.
- `_sliderDragging` state field set in Task 5, read in Task 7 — consistent name.
- `_renderZonesHtml` defined in Task 3, exercised in Task 9's AC-11 test — same name.
- `getDefaultSizeForStyle(style, config)` defined in Task 11 — second arg is `config`, signature matches dashboard-manager call site updated in same task.
- `setpoint-slider-no-data` class set in Task 6's `renderFeedback`, styled in Task 2 — same name.

No placeholders. No TBDs. Each step has runnable commands and concrete code blocks.
