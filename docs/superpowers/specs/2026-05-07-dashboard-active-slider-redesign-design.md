# SetpointWidget style='slider' — redesign with mouse-friendly UX

> **Status:** Design approved 2026-05-07. Implementation pending.

## Goal

Replace the current `setpoint.style='slider'` implementation (native `<input type="range">`) with a custom-rendered analog slider optimized for mouse interaction in SCADA HMI: click anywhere on the track jumps the handle and writes the value, drag-and-release writes on mouseup, supports color zones and orientation (horizontal/vertical), large hit-area handle, and continuous feedback tracking when the operator is idle.

## Non-goals

- New widget type. The slider stays inside `SetpointWidget` as a style. Sensor binding, SSE plumbing, control token handling, frozen state — all inherited from `ActiveDashboardWidget` base. No backend or SSE protocol changes.
- Touch / gesture support. Out of scope for MVP. Pointer events can be added later as a delegation layer over the existing mouse handlers.
- Tick marks. Considered (option B in brainstorming) and rejected for MVP.
- Knob / dial / 2D-pad alternatives. Considered and rejected. Linear horizontal/vertical slider only.
- Logarithmic scale. Linear interpolation between min and max only.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Replace `style='slider'` in-place | Config nearly identical to existing setpoint; native-range implementation was added recently (spec 2026-04-26) and not entrenched; minimum migration |
| Write semantics | Click-to-jump → instant POST. Drag → POST on release | Exactly one POST per gesture. SCADA-safe (no debounce floods). Operator-predictable. |
| `applyMode` for slider | Ignored (hidden in form when style='slider') | `manual`/`auto` are meaningless when every gesture commits exactly once on release. |
| Orientation | Conditional config field `orientation: 'horizontal' \| 'vertical'`, default `'horizontal'` | One style, one config flag. Layout flip via CSS class only. |
| Color zones | Reuse Gauge's `zones: [{from, to, color}]` format and `renderColorZonesEditor` / `parseColorZones` from `06-utils.js` | Avoid duplicated zone-editor code. Behaves consistently with other zone-aware widgets. |
| Tick marks | Not in MVP | YAGNI. Color zones serve the "show ranges" purpose; ticks would clutter the small grid sizes. |
| Default size | `4 × 1` for horizontal, `1 × 4` for vertical via `getDefaultSizeForStyle('slider', orientation)` | Slider needs length to feel like a slider; existing 3 × 2 default is too square. |
| Migration | Forward-compatible. Existing dashboard configs with `style='slider'` keep working. `applyMode` becomes a no-op. `orientation` defaults to `'horizontal'`, `zones` defaults to `[]`. | Lossy only for `applyMode` (which had no effect on slider behavior anyway after this change). |

## Architecture

### Files

| File | Change |
|---|---|
| `ui/static/js/src/61-dashboard-active-setpoint.js` | Replace `_renderSlider()` with custom-rendered DOM + drag/click handlers. Extend `_applyFeedbackToSlider()` (or equivalent path inside `renderFeedback`) to handle the two-mode (idle/dirty) feedback tracking. Update `getActiveConfigFields` and `parseActiveConfigFields` for conditional `orientation` / `zones` / `applyMode` fields. Update `initConfigHandlers` for style-driven field visibility. |
| `ui/static/css/style.css` | Replace native-range styles with `.setpoint-slider-track-wrap`, `.setpoint-slider-track`, `.setpoint-slider-fill`, `.setpoint-slider-handle`, `.setpoint-slider-tooltip`, `.setpoint-slider-fb-marker`, `.setpoint-slider-zones`, `.setpoint-slider-zone`, `.setpoint-slider-vertical`, `.setpoint-slider-no-data`. Define hover/dragging/dirty states. |
| `ui/static/js/src/62-dashboard-manager.js` | Extend `getDefaultSizeForStyle(style, config)` so that `style==='slider'` returns `{ width: 4, height: 1 }` for `orientation==='horizontal'` (default) and `{ width: 1, height: 4 }` for `orientation==='vertical'`. |
| `tests/single/dashboard-active-setpoint.spec.ts` | Replace existing slider-style tests (which reference `<input type="range">`). Add tests for click-to-jump, drag-and-release, idle tracking, no-jump-during-drag, auto-snap, external drift, color zones, vertical orientation, initial state, frozen, no-token, config form conditional fields. |
| `tests/mock-server/server.js` | If not already present, add a test hook (e.g. `POST /__mock__/sensor-value`) that lets a Playwright test push an SSE-driven feedback update for a specific sensor on demand — required by no-jump-during-drag test. |

### What does not change

- Widget type registry (`WIDGET_TYPES`) — no new entry.
- `static styles = ['input', 'slider', 'stepper']` — same array.
- Sensor binding fields (server, object, sensor, sensorId) — fully inherited from base.
- `update(value, error, meta)` interface — base behavior preserved.
- Backend API endpoints (`/api/objects/.../ionc/set`) — unchanged.
- SSE event types — unchanged.

## DOM structure

### Horizontal (default)

```
<div class="setpoint-slider-wrap setpoint-slider-horizontal" [data-no-data="true|false"]>
  <div class="setpoint-label">…</div>           <!-- if config.label -->
  <div class="setpoint-slider-value-row">
    <span class="setpoint-slider-value" data-test="value">42</span>
    <span class="setpoint-unit">°C</span>       <!-- if config.unit -->
  </div>
  <div class="setpoint-slider-track-wrap" data-test="track-wrap">
    <div class="setpoint-slider-zones" data-test="zones">  <!-- if zones[].length -->
      <div class="setpoint-slider-zone" style="left:0%;right:60%;background:#10b981"></div>
      …
    </div>
    <div class="setpoint-slider-track">
      <div class="setpoint-slider-fill"></div>  <!-- only when no zones -->
    </div>
    <div class="setpoint-slider-handle" data-test="handle">
      <div class="setpoint-slider-tooltip">42</div>
    </div>
    <div class="setpoint-slider-fb-marker" data-test="fb-marker"></div>
  </div>
  <div class="setpoint-slider-labels">
    <span>0</span><span>100</span>
  </div>
</div>
```

### Vertical

Same DOM. Root gets additional class `.setpoint-slider-vertical`. CSS rotates track / handle / labels by repositioning (no `transform: rotate` — flips axes via `top/bottom` and `left/right` instead, so labels stay readable).

### Sizing

- Track-wrap height (horizontal): 36px (large vertical hit-area for drag-on-edge).
- Track height: 8px, vertically centered in track-wrap.
- Handle: 24×24px, white fill, 2px primary-blue border, drop-shadow.
- Handle on `.dragging`: scale(1.1).
- fb-marker: 6×8 amber triangle below the track, pointing up.

## Interaction model

### Two modes

| Mode | Trigger | `commandValue` | Handle position | fb-marker |
|---|---|---|---|---|
| Idle | initial / after auto-snap | `null` | tracks `feedbackValue` | hidden |
| Dirty | drag started / click / inline-edit committed but feedback hasn't caught up | the operator's intent | `commandValue` | visible at `feedbackValue` position |

### Event handling

```
mousedown on .setpoint-slider-track-wrap:
  preventDefault, stopPropagation
  if !isInteractive() return
  this._dragging = true
  add .dragging class to root
  cmd = valueAtPointer(e)        // step-rounded, clamped
  this._setCommand(cmd)          // sets commandValue, marks dirty
  renderHandle()                 // immediately
  // POST is NOT sent here

window.mousemove (only while _dragging):
  cmd = valueAtPointer(e)
  this._setCommand(cmd)
  renderHandle()

window.mouseup (only while _dragging):
  this._dragging = false
  remove .dragging class
  this._applyNow()               // POST sent here
```

Click-to-jump path is the same `mousedown` → `mouseup` sequence with no intermediate `mousemove`. The result is the same: one POST per gesture.

`valueAtPointer(e)`:
1. `rect = trackWrap.getBoundingClientRect()`
2. `pct = (clientX - rect.left) / rect.width` for horizontal; `1 - (clientY - rect.top) / rect.height` for vertical
3. `pct = clamp(pct, 0, 1)`
4. `v = min + pct * (max - min)`
5. `v = round(v / step) * step` (step-snap)
6. `return clamp(v, min, max)`

Inline-edit on `.setpoint-slider-value` reuses the base `_makeInlineEditable(valueSpan)` helper. Enter / blur commits via `_setCommand(parsed)` + `_applyNow()`. Escape cancels.

### Feedback tracking

```
update(value, error, meta):
  super.update(value, error, meta)        // base sets feedbackValue, error, meta
  if this._dragging:
    return                                // ignore, do not move handle
  if this.commandValue !== null
     && |this.feedbackValue - this.commandValue| < this.config.step / 2:
    this.commandValue = null              // auto-snap dirty → idle
  this.renderFeedback()

renderFeedback():
  display = this.commandValue ?? this.feedbackValue
  if display === null:
    // no-data: dim handle, value '--', hide fb-marker
    root.classList.add('setpoint-slider-no-data')
    return
  root.classList.remove('setpoint-slider-no-data')
  positionHandleAt(display)
  valueText.textContent = String(display)
  if this.commandValue !== null && this.commandValue !== this.feedbackValue:
    showFbMarkerAt(this.feedbackValue)
    root.classList.add('dirty')
  else:
    hideFbMarker()
    root.classList.remove('dirty')
```

External drift example: operator writes 60, process holds at 55, then drifts to 50 due to external override. Sequence:
1. Drag-release → `commandValue = 60`, POST sent. Handle at 60. fb-marker at 55. `.dirty`.
2. SSE delivers fb=55 (unchanged): `|55-60| = 5 ≥ step/2 (=0.5)` → no auto-snap. Still dirty.
3. SSE delivers fb=50: still dirty. fb-marker moves to 50. Operator sees the gap visually.

### Disabled / blocked states

Inherited from base `ActiveDashboardWidget`:
- Edit mode → `[data-control-blocked="true"]` → grayscale, no input.
- No control token → same.
- `meta.frozen=true` → `[data-frozen="true"]` → icy cyan tint + ❄ marker. `isInteractive()` returns false; mousedown handler bails out via the `isInteractive()` guard.

## Config form

### Field set

All fields render once. Visibility is toggled by JS based on the selected `style`.

| Field | Type | Default | Visible when style is |
|---|---|---|---|
| serverId | server select | — | always (base) |
| objectName | IONC object dropdown | — | always (base) |
| sensor + sensorId | autocomplete | — | always (base) |
| label | text | `''` | always (base) |
| style | select (input/slider/stepper) | `input` | always (base) |
| requireConfirmation | checkbox | `false` | always (base) |
| min | number | `0` | always |
| max | number | `100` | always |
| step | number | `1` | always |
| unit | text | `''` | always |
| applyMode | select (manual/auto) | `manual` | input, stepper |
| **orientation** | select (horizontal/vertical) | `horizontal` | **slider** |
| **zones** | repeating editor (from / to / color) | `[]` | **slider** |

### Visibility logic in `initConfigHandlers`

`super.initConfigHandlers(form, config)` wires sensor binding. Then:

```
const styleSel = form.querySelector('[name="style"]');
const applyVisibility = () => {
    const isSlider = styleSel.value === 'slider';
    form.querySelector('[data-row="applyMode"]').style.display = isSlider ? 'none' : '';
    form.querySelector('[data-row="orientation"]').style.display = isSlider ? '' : 'none';
    form.querySelector('[data-row="zones"]').style.display = isSlider ? '' : 'none';
};
applyVisibility();
styleSel.addEventListener('change', applyVisibility);
```

Idempotent via `form.dataset.setpointStyleHandlersWired = 'true'`.

### Validation in `parseActiveConfigFields`

```
result = {
    min: parseDecimalInputOrDefault(form.min.value, 0),
    max: parseDecimalInputOrDefault(form.max.value, 100),
    step: parseDecimalInputOrDefault(form.step.value, 1),
    unit: form.unit.value || '',
}
if step <= 0 then step = 1
if min > max then [min, max] = [max, min]

if style === 'slider':
    result.orientation = (form.orientation.value === 'vertical') ? 'vertical' : 'horizontal'
    result.zones = parseColorZones(form)
else:
    result.applyMode = (form.applyMode.value === 'auto') ? 'auto' : 'manual'
```

`parseColorZones` (existing helper): for each zone row, parses `from` / `to` as floats clamped to `[min, max]`, swaps if `from > to`, validates `color` as `#RRGGBB`. Returns array of `{from, to, color}`. Empty rows are dropped.

Lean serialization: only the fields relevant to the selected style are written into the dashboard config. On reload, missing fields default as listed above.

### Migration of existing dashboard configs with `style='slider'`

| Field in old config | After first render with new code | After first save |
|---|---|---|
| `style: 'slider'` | unchanged | unchanged |
| `applyMode: 'manual'` or `'auto'` | ignored at render time | dropped from config (not written by parseActiveConfigFields) |
| `min`, `max`, `step`, `unit`, `label` | unchanged | unchanged |
| `orientation` (absent) | defaults to `'horizontal'` | written explicitly |
| `zones` (absent) | defaults to `[]` (no zones, plain fill) | written as `[]` if user did not add any |

Migration is silent and forward-compatible; the only lossy aspect is `applyMode`, which had no observable effect anyway.

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | Click on `.setpoint-slider-track-wrap` at horizontal pixel x → handle position equals `clamp(round((x_pct * range + min) / step) * step, min, max)` and exactly one POST is sent to `/api/objects/{name}/ionc/set?server=…` with that value. |
| AC-2 | Drag (mousedown → mousemove × N → mouseup) sends exactly one POST on mouseup, with the value matching the final mousemove position. No POST on intermediate mousemove. |
| AC-3 | While `_dragging === true`, an incoming SSE update with a different feedback value does NOT change handle position. After mouseup, normal feedback tracking resumes. |
| AC-4 | When `commandValue === null` and SSE delivers a new feedback value, handle position transitions to the new value (visible after CSS transition ~80ms). |
| AC-5 | After Apply (cmd=X) and an SSE feedback update with `\|fb - X\| < step/2`, the `.dirty` class is removed, fb-marker is hidden, and `commandValue === null`. |
| AC-6 | After Apply (cmd=X) and an SSE feedback update with `\|fb - X\| ≥ step/2`, `.dirty` remains, fb-marker is shown at the feedback position, handle stays at X. |
| AC-7 | Double-click on `.setpoint-slider-value` opens an input. Typing a value and pressing Enter sends one POST with the clamped/step-snapped value. Escape cancels with no POST. |
| AC-8 | When `meta.frozen === true`, click and drag on the track-wrap are no-ops (no POST), `[data-frozen="true"]` is set on the root, and the frozen marker is rendered. |
| AC-9 | When the user has no control token, click and drag are no-ops (no POST), `[data-control-blocked="true"]` is set on the root. |
| AC-10 | Before the first SSE update arrives, the root has class `.setpoint-slider-no-data`, value text is `--`, and the fb-marker is hidden. |
| AC-11 | When `config.zones = [{from:0,to:40,color:'#10b981'}, {from:40,to:75,color:'#fbbf24'}, {from:75,to:100,color:'#ef4444'}]`, the DOM contains three `.setpoint-slider-zone` elements with the corresponding `left/right %` (horizontal) or `top/bottom %` (vertical) and the corresponding `background-color`. |
| AC-12 | When `config.orientation === 'vertical'`, the root has `.setpoint-slider-vertical`. Vertical drag (mousedown at the top, mouseup at the bottom of the track) sets a value below the start value (Y axis is inverted: top = max). |
| AC-13 | In the widget edit dialog, when `style` is changed to `slider`, the `applyMode` row hides and `orientation` and `zones` rows appear. Switching back to `input` or `stepper` reverses the visibility. |

## Testing strategy

E2E with Playwright in `tests/single/dashboard-active-setpoint.spec.ts`. The 13 acceptance criteria map 1:1 to test cases. Existing slider-style tests that reference `<input type="range">` are removed and replaced.

Test driver requirements:
- Mock-server already supports IONC `/set` and SSE batch updates.
- For AC-3 (no-jump-during-drag) the test needs to push a feedback update mid-drag. If the existing mock does not yet expose a hook for that, add `POST /__mock__/sensor-value` that takes `{sensorId, value}` and synthesizes an `ionc_sensor_batch` SSE event.

Visual aspects (handle look, drop-shadow, transition smoothness, drag jank) are out of scope for automated testing; verify manually via dev-server.

## Out of scope

- Touch / pointer events.
- Tick marks (rejected for MVP).
- Logarithmic / non-linear scales.
- Multi-handle (range slider).
- Knob / dial / 2D pad styles.
- Per-zone hover tooltips ("Warning: 40-75°C").
- Animated value count-up between feedback values.
- Backend or SSE protocol changes.

## Open questions

None at design time. Implementation may surface UX corner cases (e.g. exact transition timing, exact tolerance for auto-snap) — those are tunable constants and do not affect the contract.
