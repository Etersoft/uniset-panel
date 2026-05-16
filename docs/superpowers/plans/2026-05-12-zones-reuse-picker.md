# Color Zones Reuse Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить inline-picker над `renderColorZonesEditor` в config-формах Setpoint slider / Gauge / Level виджетов — переиспользование зон из других виджетов на dashboard'е и из Recent history (localStorage FIFO).

**Architecture:** Все helpers в `06-utils.js` (центр zones-инфраструктуры), wiring через `static getConfigForm` / `static initConfigHandlers` каждого из трёх виджетов, history-push после save в `62-dashboard-manager.js applyWidgetConfig`. CSS в `style.css`. Константы в `00-constants.js`. Без backend, без schema migrations.

**Tech Stack:** Vanilla JS (concat-сборка), Vitest + jsdom для unit тестов, Playwright (Docker) для E2E.

**Spec:** `docs/superpowers/specs/2026-05-12-zones-reuse-picker-design.md`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `ui/static/js/src/00-constants.js` | Modify | Добавить 3 константы: `ZONES_HISTORY_MAX`, `ZONES_PICKER_MAX_HEIGHT_PX`, `ZONES_HISTORY_STORAGE_KEY` |
| `ui/static/js/src/06-utils.js` | Modify | Добавить 7 функций: `canonicalizeZones`, `getZonesHistory`, `addZonesToHistory`, `getDashboardZoneSources`, `renderZoneChipBar`, `renderZonesReusePicker`, `applyZonesToEditor`, `setupZonesReusePicker` |
| `ui/static/css/style.css` | Modify | Добавить CSS для picker'а (~80 строк) |
| `ui/static/js/src/61-dashboard-widget-gauge.js` | Modify | Обернуть `renderColorZonesEditor` picker'ом в `getConfigForm`, добавить `setupZonesReusePicker` в `initConfigHandlers` |
| `ui/static/js/src/61-dashboard-widgets.js` (LevelWidget) | Modify | То же для Level |
| `ui/static/js/src/61-dashboard-active-setpoint.js` | Modify | То же для Setpoint slider style |
| `ui/static/js/src/62-dashboard-manager.js` | Modify | В `applyWidgetConfig` после `parseConfigForm` — вызвать `addZonesToHistory` |
| `tests/unit/zones-reuse.test.ts` | Create | Unit тесты для canonicalize/history CRUD/getDashboardZoneSources/renderers/applyZonesToEditor |
| `tests/single/dashboard-zones-reuse.spec.ts` | Create | 6 E2E тестов |
| `CLAUDE.md` | Modify | Документация новых helpers в секции «Общие хелперы» |

---

## Task 1: Constants

**Files:**
- Modify: `ui/static/js/src/00-constants.js`

- [ ] **Step 1: Open constants file and find appropriate section**

Find the constants file structure. Constants grouped by category (Таймауты, SSE, LogViewer, ...). Find a logical placement — `// === Zones reuse picker ===` block at bottom.

- [ ] **Step 2: Add constants**

Edit `ui/static/js/src/00-constants.js` — append at the end (before the IIFE or globalThis exports if any, otherwise just at end of file):

```javascript
// === Zones reuse picker ===
const ZONES_HISTORY_MAX = 10;                              // FIFO cap для localStorage history
const ZONES_PICKER_MAX_HEIGHT_PX = 220;                    // max-height scrollable area
const ZONES_HISTORY_STORAGE_KEY = 'uniset.zonesHistory';   // localStorage key для recent zones
```

- [ ] **Step 3: Rebuild app.js**

Run: `make app`
Expected output ends with: `Generated static/js/app.js from 43 files`

- [ ] **Step 4: Verify constants are in app.js**

Run: `grep -c "ZONES_HISTORY_MAX" ui/static/js/app.js`
Expected output: `1` (or higher — exact count doesn't matter, just non-zero).

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/00-constants.js ui/static/js/app.js
git commit -m "feat(zones): add reuse picker constants"
```

---

## Task 2: Canonicalization + history CRUD utils (TDD)

**Files:**
- Create: `tests/unit/zones-reuse.test.ts`
- Modify: `ui/static/js/src/06-utils.js`
- Modify: `tests/unit/setup.ts` (no — already loads 06-utils.js, no change needed; verify only)

- [ ] **Step 1: Write failing unit tests**

Create `tests/unit/zones-reuse.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

declare const canonicalizeZones: (zones: any) => string;
declare const getZonesHistory: () => any[];
declare const addZonesToHistory: (zones: any, type: string) => void;
declare const ZONES_HISTORY_STORAGE_KEY: string;
declare const ZONES_HISTORY_MAX: number;

describe('canonicalizeZones', () => {
    it('produces stable key independent of zone order', () => {
        const a = canonicalizeZones([
            { from: 0, to: 30, color: '#3B82F6' },
            { from: 30, to: 70, color: '#22c55e' },
        ]);
        const b = canonicalizeZones([
            { from: 30, to: 70, color: '#22C55E' },
            { from: 0, to: 30, color: '#3b82f6' },
        ]);
        expect(a).toBe(b);
    });

    it('normalizes color case and float precision', () => {
        const a = canonicalizeZones([{ from: 0.1, to: 0.2, color: '#FFFFFF' }]);
        const b = canonicalizeZones([{ from: 0.10000001, to: 0.2, color: '#ffffff' }]);
        expect(a).toBe(b);
    });

    it('differs for different zones', () => {
        const a = canonicalizeZones([{ from: 0, to: 100, color: '#ff0000' }]);
        const b = canonicalizeZones([{ from: 0, to: 100, color: '#00ff00' }]);
        expect(a).not.toBe(b);
    });
});

describe('getZonesHistory / addZonesToHistory', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('returns empty array when storage empty', () => {
        expect(getZonesHistory()).toEqual([]);
    });

    it('returns empty array on JSON parse error', () => {
        localStorage.setItem(ZONES_HISTORY_STORAGE_KEY, '{not json');
        expect(getZonesHistory()).toEqual([]);
    });

    it('addZonesToHistory persists entry', () => {
        addZonesToHistory([{ from: 0, to: 50, color: '#ff0000' }], 'gauge');
        const h = getZonesHistory();
        expect(h.length).toBe(1);
        expect(h[0].zones).toEqual([{ from: 0, to: 50, color: '#ff0000' }]);
        expect(h[0].sourceWidgetType).toBe('gauge');
        expect(typeof h[0].timestamp).toBe('number');
    });

    it('no-op for empty zones', () => {
        addZonesToHistory([], 'gauge');
        expect(getZonesHistory()).toEqual([]);
    });

    it('move-to-front on duplicate save', () => {
        addZonesToHistory([{ from: 0, to: 50, color: '#aaa' }], 'gauge');
        addZonesToHistory([{ from: 0, to: 100, color: '#bbb' }], 'level');
        addZonesToHistory([{ from: 0, to: 50, color: '#AAA' }], 'gauge'); // duplicate (color case-insensitive)
        const h = getZonesHistory();
        expect(h.length).toBe(2);
        expect(h[0].zones[0].color).toBe('#aaa'); // canonicalized to lowercase, moved to front
    });

    it('respects FIFO cap = ZONES_HISTORY_MAX', () => {
        for (let i = 0; i < ZONES_HISTORY_MAX + 5; i++) {
            addZonesToHistory([{ from: i, to: i + 1, color: '#000000' }], 'gauge');
        }
        const h = getZonesHistory();
        expect(h.length).toBe(ZONES_HISTORY_MAX);
        // Newest at front (loop pushed i=ZONES_HISTORY_MAX+4 last)
        expect(h[0].zones[0].from).toBe(ZONES_HISTORY_MAX + 4);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd tests/unit && npm install --no-fund --no-audit && npx vitest run zones-reuse.test.ts
```

Expected: All tests FAIL with `ReferenceError: canonicalizeZones is not defined` (and similar for the others).

- [ ] **Step 3: Implement canonicalizeZones + history CRUD in 06-utils.js**

Open `ui/static/js/src/06-utils.js`. Find existing zones helpers (`renderColorZoneItem`, `renderColorZonesEditor`, `parseColorZones`). Add the following functions **before** the `globalThis` export block, after the existing zone helpers:

```javascript
function canonicalizeZones(zones) {
    if (!Array.isArray(zones)) return '';
    const normalized = zones
        .map(z => ({
            from: Number(Number(z.from).toFixed(6)),
            to:   Number(Number(z.to).toFixed(6)),
            color: String(z.color || '').toLowerCase(),
        }))
        .sort((a, b) => a.from - b.from);
    return JSON.stringify(normalized);
}

function getZonesHistory() {
    try {
        const raw = localStorage.getItem(ZONES_HISTORY_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function addZonesToHistory(zones, sourceWidgetType) {
    if (!Array.isArray(zones) || zones.length === 0) return;
    const normalized = zones.map(z => ({
        from: Number(z.from),
        to: Number(z.to),
        color: String(z.color || '').toLowerCase(),
    }));
    const key = canonicalizeZones(normalized);
    const history = getZonesHistory();
    const filtered = history.filter(item => canonicalizeZones(item.zones) !== key);
    filtered.unshift({
        zones: normalized,
        timestamp: Date.now(),
        sourceWidgetType: sourceWidgetType || '',
    });
    const capped = filtered.slice(0, ZONES_HISTORY_MAX);
    try {
        localStorage.setItem(ZONES_HISTORY_STORAGE_KEY, JSON.stringify(capped));
    } catch (e) {
        console.warn('addZonesToHistory: localStorage write failed', e);
    }
}
```

Then add them to the existing `globalThis` export block (near end of `06-utils.js`, where `renderColorZonesEditor` is exported):

```javascript
    globalThis.canonicalizeZones = canonicalizeZones;
    globalThis.getZonesHistory = getZonesHistory;
    globalThis.addZonesToHistory = addZonesToHistory;
```

- [ ] **Step 4: Run unit tests to verify pass**

```bash
cd tests/unit && npx vitest run zones-reuse.test.ts
```

Expected: All tests pass (7 passed in the canonicalize + history blocks).

- [ ] **Step 5: Rebuild app.js**

Run: `make app`
Expected: `Generated static/js/app.js from 43 files`

- [ ] **Step 6: Commit**

```bash
git add tests/unit/zones-reuse.test.ts ui/static/js/src/06-utils.js ui/static/js/app.js
git commit -m "feat(zones): canonicalize + history CRUD helpers"
```

---

## Task 3: getDashboardZoneSources (TDD)

**Files:**
- Modify: `tests/unit/zones-reuse.test.ts`
- Modify: `ui/static/js/src/06-utils.js`

- [ ] **Step 1: Add failing test to zones-reuse.test.ts**

Append to `tests/unit/zones-reuse.test.ts`:

```typescript
declare const getDashboardZoneSources: (dashId: string, excludeWidgetId: string) => any[];

describe('getDashboardZoneSources', () => {
    beforeEach(() => {
        const w: any = globalThis;
        w.dashboardState = {
            dashboards: new Map([
                ['dash1', {
                    widgets: [
                        { id: 'wA', type: 'gauge',    config: { sensor: 'Temp_S',   zones: [{ from: 0, to: 100, color: '#aaa' }] } },
                        { id: 'wB', type: 'level',    config: { sensor: 'Tank_A',   zones: [{ from: 0, to: 500, color: '#bbb' }] } },
                        { id: 'wC', type: 'gauge',    config: { sensor: 'NoZones', zones: [] } },
                        { id: 'wD', type: 'gauge',    config: { sensor: 'OmitMe',   zones: [{ from: 0, to: 1, color: '#ccc' }] } },
                        { id: 'wE', type: 'setpoint', config: { sensor: 'Setpt_1',  zones: [{ from: -10, to: 10, color: '#ddd' }] } },
                    ],
                }],
            ]),
        };
    });

    it('returns widgets with non-empty zones, excludes specified widget', () => {
        const result = getDashboardZoneSources('dash1', 'wD');
        expect(result.map((r: any) => r.widgetId).sort()).toEqual(['wA', 'wB', 'wE']);
    });

    it('returns empty for unknown dashboard', () => {
        expect(getDashboardZoneSources('nope', '')).toEqual([]);
    });

    it('returns empty for missing dashboardState', () => {
        delete (globalThis as any).dashboardState;
        expect(getDashboardZoneSources('dash1', '')).toEqual([]);
    });

    it('returns sensorLabel (prefers config.sensor, falls back to label, then id)', () => {
        const result = getDashboardZoneSources('dash1', '');
        const wA = result.find((r: any) => r.widgetId === 'wA');
        expect(wA.sensorLabel).toBe('Temp_S');
        expect(wA.widgetType).toBe('gauge');
        expect(wA.zones).toEqual([{ from: 0, to: 100, color: '#aaa' }]);
    });
});
```

- [ ] **Step 2: Run unit tests to verify new tests fail**

```bash
cd tests/unit && npx vitest run zones-reuse.test.ts
```

Expected: previous 7 pass, 4 new fail with `ReferenceError: getDashboardZoneSources is not defined`.

- [ ] **Step 3: Implement getDashboardZoneSources in 06-utils.js**

Add to `ui/static/js/src/06-utils.js` (after `addZonesToHistory`):

```javascript
function getDashboardZoneSources(currentDashboardId, excludeWidgetId) {
    const state = globalThis.dashboardState;
    if (!state || !state.dashboards) return [];
    const dash = state.dashboards.get(currentDashboardId);
    if (!dash || !Array.isArray(dash.widgets)) return [];
    return dash.widgets
        .filter(w => w.id !== excludeWidgetId
                  && Array.isArray(w.config?.zones)
                  && w.config.zones.length > 0)
        .map(w => ({
            widgetId: w.id,
            widgetType: w.type,
            sensorLabel: w.config.sensor || w.config.label || w.id,
            zones: w.config.zones,
        }));
}
```

Then export it:

```javascript
    globalThis.getDashboardZoneSources = getDashboardZoneSources;
```

- [ ] **Step 4: Run unit tests to verify pass**

```bash
cd tests/unit && npx vitest run zones-reuse.test.ts
```

Expected: All 11 tests pass.

- [ ] **Step 5: Rebuild and commit**

```bash
make app
git add tests/unit/zones-reuse.test.ts ui/static/js/src/06-utils.js ui/static/js/app.js
git commit -m "feat(zones): getDashboardZoneSources helper"
```

---

## Task 4: renderZoneChipBar (TDD)

**Files:**
- Modify: `tests/unit/zones-reuse.test.ts`
- Modify: `ui/static/js/src/06-utils.js`

- [ ] **Step 1: Add failing test**

Append to `tests/unit/zones-reuse.test.ts`:

```typescript
declare const renderZoneChipBar: (zones: any) => string;

describe('renderZoneChipBar', () => {
    it('renders one span per zone with proportional flex and from-to text', () => {
        const html = renderZoneChipBar([
            { from: 0,  to: 30,  color: '#3b82f6' },
            { from: 30, to: 70,  color: '#22c55e' },
            { from: 70, to: 100, color: '#ef4444' },
        ]);
        const host = document.createElement('div');
        host.innerHTML = html;
        const bar = host.querySelector('.zone-bar')!;
        const spans = bar.querySelectorAll<HTMLSpanElement>('span');
        expect(spans.length).toBe(3);
        expect(spans[0].textContent).toBe('0–30');
        expect(spans[1].textContent).toBe('30–70');
        expect(spans[2].textContent).toBe('70–100');
        expect(spans[0].style.background).toContain('rgb(59, 130, 246)'); // #3b82f6 normalized
        // Proportional flex (1:1:1 for 30:40:30 — not equal weight; just check non-empty)
        expect(spans[0].style.flex).not.toBe('');
    });

    it('returns empty bar for empty zones', () => {
        const html = renderZoneChipBar([]);
        const host = document.createElement('div');
        host.innerHTML = html;
        expect(host.querySelectorAll('.zone-bar > span').length).toBe(0);
    });

    it('uses unique flex weight proportional to (to - from)', () => {
        const html = renderZoneChipBar([
            { from: 0, to: 10, color: '#000' },
            { from: 10, to: 90, color: '#fff' }, // 8x wider
        ]);
        const host = document.createElement('div');
        host.innerHTML = html;
        const spans = host.querySelectorAll<HTMLSpanElement>('.zone-bar > span');
        // flex value contains '10' vs '80' — pulled out for assertion
        expect(spans[0].style.flex).toContain('10');
        expect(spans[1].style.flex).toContain('80');
    });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
cd tests/unit && npx vitest run zones-reuse.test.ts
```

Expected: 3 new tests fail with `ReferenceError: renderZoneChipBar is not defined`.

- [ ] **Step 3: Implement renderZoneChipBar in 06-utils.js**

Add to `ui/static/js/src/06-utils.js`:

```javascript
function renderZoneChipBar(zones) {
    if (!Array.isArray(zones) || zones.length === 0) {
        return '<span class="zone-bar"></span>';
    }
    const spans = zones.map(z => {
        const weight = Math.max(1, Number(z.to) - Number(z.from));
        const color = escapeAttr(String(z.color || '#888'));
        const label = `${z.from}–${z.to}`;
        return `<span style="background:${color};flex:${weight}">${escapeHtml(label)}</span>`;
    }).join('');
    return `<span class="zone-bar">${spans}</span>`;
}
```

Note: `–` is the en-dash (–) matching the mockup. `escapeAttr` and `escapeHtml` already exist in `06-utils.js` (verify by `grep -n "function escapeAttr\|function escapeHtml" ui/static/js/src/06-utils.js`).

Export:

```javascript
    globalThis.renderZoneChipBar = renderZoneChipBar;
```

- [ ] **Step 4: Run to verify pass**

```bash
cd tests/unit && npx vitest run zones-reuse.test.ts
```

Expected: All 14 tests pass.

- [ ] **Step 5: Rebuild and commit**

```bash
make app
git add tests/unit/zones-reuse.test.ts ui/static/js/src/06-utils.js ui/static/js/app.js
git commit -m "feat(zones): renderZoneChipBar helper"
```

---

## Task 5: renderZonesReusePicker (TDD)

**Files:**
- Modify: `tests/unit/zones-reuse.test.ts`
- Modify: `ui/static/js/src/06-utils.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/unit/zones-reuse.test.ts`:

```typescript
declare const renderZonesReusePicker: (currentWidgetType: string, dashId: string, currentWidgetId: string) => string;

describe('renderZonesReusePicker', () => {
    beforeEach(() => {
        localStorage.clear();
        const w: any = globalThis;
        w.dashboardState = {
            dashboards: new Map([
                ['dash1', {
                    widgets: [
                        { id: 'wA', type: 'gauge', config: { sensor: 'Temp_S', zones: [{ from: 0, to: 100, color: '#aaa' }] } },
                        { id: 'wB', type: 'level', config: { sensor: 'Tank_A', zones: [{ from: 0, to: 500, color: '#bbb' }] } },
                    ],
                }],
            ]),
        };
    });

    it('returns empty string when no sources and no history', () => {
        (globalThis as any).dashboardState = { dashboards: new Map() };
        expect(renderZonesReusePicker('gauge', 'none', '')).toBe('');
    });

    it('renders block with sticky group label per widget type', () => {
        const html = renderZonesReusePicker('gauge', 'dash1', '');
        const host = document.createElement('div');
        host.innerHTML = html;
        expect(host.querySelector('.reuse-picker')).not.toBeNull();
        const labels = Array.from(host.querySelectorAll('.group-label')).map(el => el.textContent || '');
        // Same-type first (Gauge), then alphabetical other types (Level)
        expect(labels.some(l => l.includes('Gauge'))).toBe(true);
        expect(labels.some(l => l.includes('Level'))).toBe(true);
    });

    it('marks same-class group with group-same-class class', () => {
        const html = renderZonesReusePicker('gauge', 'dash1', '');
        const host = document.createElement('div');
        host.innerHTML = html;
        const sameClass = host.querySelector('.group-same-class');
        expect(sameClass).not.toBeNull();
        expect(sameClass!.textContent!.includes('Gauge')).toBe(true);
    });

    it('includes Recent group when history is non-empty', () => {
        addZonesToHistory([{ from: 0, to: 50, color: '#ff0000' }], 'gauge');
        const html = renderZonesReusePicker('gauge', 'dash1', '');
        const host = document.createElement('div');
        host.innerHTML = html;
        expect(host.querySelector('.group-recent')).not.toBeNull();
    });

    it('excludes currentWidgetId from dashboard sources', () => {
        const html = renderZonesReusePicker('gauge', 'dash1', 'wA');
        const host = document.createElement('div');
        host.innerHTML = html;
        const chips = host.querySelectorAll('.zone-chip');
        const sourceLabels = Array.from(chips).map(c => c.querySelector('.chip-source')?.textContent || '');
        expect(sourceLabels.every(l => !l.includes('Temp_S'))).toBe(true);
    });

    it('embeds zones as JSON in data-zones-json attribute', () => {
        const html = renderZonesReusePicker('gauge', 'dash1', '');
        const host = document.createElement('div');
        host.innerHTML = html;
        const chip = host.querySelector('.zone-chip') as HTMLElement;
        expect(chip).not.toBeNull();
        const parsed = JSON.parse(chip.dataset.zonesJson || 'null');
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBeGreaterThan(0);
    });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
cd tests/unit && npx vitest run zones-reuse.test.ts
```

Expected: 6 new tests fail (renderZonesReusePicker undefined).

- [ ] **Step 3: Implement renderZonesReusePicker in 06-utils.js**

Add to `ui/static/js/src/06-utils.js`:

```javascript
function _renderZoneChipFromSource(zones, sourceLabel, sourceClass) {
    const json = escapeAttr(JSON.stringify(zones));
    const labelHtml = escapeHtml(sourceLabel);
    const labelClass = sourceClass === 'recent' ? 'chip-source recent-source' : 'chip-source';
    return `<div class="zone-chip" data-zones-json="${json}" role="button" tabindex="0">${renderZoneChipBar(zones)}<span class="${labelClass}">${labelHtml}</span></div>`;
}

function _formatRelativeTime(timestamp) {
    const diff = Date.now() - timestamp;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}d ago`;
    return new Date(timestamp).toISOString().slice(0, 10);
}

function _widgetTypeDisplayName(type) {
    const types = globalThis.WIDGET_TYPES || {};
    return types[type]?.displayName || type;
}

function renderZonesReusePicker(currentWidgetType, currentDashboardId, currentWidgetId) {
    const dashSources = getDashboardZoneSources(currentDashboardId, currentWidgetId || '');
    const history = getZonesHistory();
    if (dashSources.length === 0 && history.length === 0) return '';

    // Group dashboard sources by widget type
    const byType = new Map();
    dashSources.forEach(src => {
        if (!byType.has(src.widgetType)) byType.set(src.widgetType, []);
        byType.get(src.widgetType).push(src);
    });

    // Order: current-type first, then alphabetical by displayName
    const orderedTypes = Array.from(byType.keys()).sort((a, b) => {
        if (a === currentWidgetType) return -1;
        if (b === currentWidgetType) return 1;
        return _widgetTypeDisplayName(a).localeCompare(_widgetTypeDisplayName(b));
    });

    const totalCount = dashSources.length + history.length;

    let groupsHtml = '';

    if (history.length > 0) {
        const recentChips = history.map(item => {
            const label = _formatRelativeTime(item.timestamp);
            return _renderZoneChipFromSource(item.zones, label, 'recent');
        }).join('');
        groupsHtml += `
            <div class="group-label group-recent">
                <span>★ Recent</span>
                <span class="group-count">(${history.length})</span>
                <span class="group-divider"></span>
            </div>
            <div>${recentChips}</div>
        `;
    }

    orderedTypes.forEach(type => {
        const list = byType.get(type);
        const isSame = type === currentWidgetType;
        const labelClass = isSame ? 'group-label group-same-class' : 'group-label';
        const typeName = escapeHtml(_widgetTypeDisplayName(type));
        const suffix = isSame ? ` · same type` : '';
        const chips = list.map(src => _renderZoneChipFromSource(src.zones, src.sensorLabel, '')).join('');
        groupsHtml += `
            <div class="${labelClass}">
                <span>${typeName}</span>
                <span class="group-count">(${list.length})${suffix}</span>
                <span class="group-divider"></span>
            </div>
            <div>${chips}</div>
        `;
    });

    return `
        <div class="reuse-picker">
            <div class="reuse-header">
                <span>Reuse zones</span>
                <span class="reuse-count">${totalCount} saved</span>
            </div>
            <div class="reuse-scroll" style="max-height:${ZONES_PICKER_MAX_HEIGHT_PX}px">${groupsHtml}</div>
        </div>
    `;
}
```

Export `renderZonesReusePicker`:

```javascript
    globalThis.renderZonesReusePicker = renderZonesReusePicker;
```

- [ ] **Step 4: Run to verify pass**

```bash
cd tests/unit && npx vitest run zones-reuse.test.ts
```

Expected: All 20 tests pass.

- [ ] **Step 5: Rebuild and commit**

```bash
make app
git add tests/unit/zones-reuse.test.ts ui/static/js/src/06-utils.js ui/static/js/app.js
git commit -m "feat(zones): renderZonesReusePicker with groups"
```

---

## Task 6: applyZonesToEditor + setupZonesReusePicker (TDD)

**Files:**
- Modify: `tests/unit/zones-reuse.test.ts`
- Modify: `ui/static/js/src/06-utils.js`

- [ ] **Step 1: Add failing tests**

Append to `tests/unit/zones-reuse.test.ts`:

```typescript
declare const applyZonesToEditor: (form: Element, zones: any) => void;
declare const setupZonesReusePicker: (form: Element) => void;

describe('applyZonesToEditor', () => {
    it('replaces .zones-list contents with new zone items', () => {
        const form = document.createElement('div');
        form.innerHTML = (globalThis as any).renderColorZonesEditor(
            [{ from: 0, to: 50, color: '#aaa' }], '#888'
        );
        // Sanity check
        expect(form.querySelectorAll('.zone-item').length).toBe(1);

        applyZonesToEditor(form, [
            { from: 0, to: 30, color: '#3b82f6' },
            { from: 30, to: 100, color: '#ef4444' },
        ]);

        const items = form.querySelectorAll('.zone-item');
        expect(items.length).toBe(2);
        const colors = Array.from(form.querySelectorAll<HTMLInputElement>('.zone-color')).map(i => i.value.toLowerCase());
        expect(colors).toEqual(['#3b82f6', '#ef4444']);
    });

    it('no-op when no .zones-list in form', () => {
        const form = document.createElement('div');
        form.innerHTML = '<div>no zones</div>';
        expect(() => applyZonesToEditor(form, [{ from: 0, to: 1, color: '#fff' }])).not.toThrow();
    });
});

describe('setupZonesReusePicker', () => {
    it('on chip click → applies that chip\'s zones to editor', () => {
        const form = document.createElement('div');
        // Build a form containing picker + editor
        const pickerHtml = `<div class="reuse-picker"><div class="zone-chip" data-zones-json='[{"from":0,"to":30,"color":"#3b82f6"},{"from":30,"to":100,"color":"#22c55e"}]'><span>chip</span></div></div>`;
        const editorHtml = (globalThis as any).renderColorZonesEditor([], '#888');
        form.innerHTML = pickerHtml + editorHtml;

        setupZonesReusePicker(form);

        const chip = form.querySelector('.zone-chip') as HTMLElement;
        chip.click();

        const items = form.querySelectorAll('.zone-item');
        expect(items.length).toBe(2);
        const colors = Array.from(form.querySelectorAll<HTMLInputElement>('.zone-color')).map(i => i.value.toLowerCase());
        expect(colors).toEqual(['#3b82f6', '#22c55e']);
    });

    it('idempotent — calling twice does not double-fire on click', () => {
        const form = document.createElement('div');
        form.innerHTML = `<div class="reuse-picker"><div class="zone-chip" data-zones-json='[{"from":0,"to":1,"color":"#fff"}]'>chip</div></div>` + (globalThis as any).renderColorZonesEditor([], '#888');
        setupZonesReusePicker(form);
        setupZonesReusePicker(form); // second call must be no-op
        const chip = form.querySelector('.zone-chip') as HTMLElement;
        chip.click();
        expect(form.querySelectorAll('.zone-item').length).toBe(1);
    });

    it('does nothing if data-zones-json is missing or malformed', () => {
        const form = document.createElement('div');
        form.innerHTML = `<div class="reuse-picker"><div class="zone-chip">no data</div></div>` + (globalThis as any).renderColorZonesEditor([], '#888');
        setupZonesReusePicker(form);
        const chip = form.querySelector('.zone-chip') as HTMLElement;
        expect(() => chip.click()).not.toThrow();
        expect(form.querySelectorAll('.zone-item').length).toBe(0);
    });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
cd tests/unit && npx vitest run zones-reuse.test.ts
```

Expected: 5 new tests fail with `applyZonesToEditor is not defined` / `setupZonesReusePicker is not defined`.

- [ ] **Step 3: Implement applyZonesToEditor + setupZonesReusePicker in 06-utils.js**

Add to `ui/static/js/src/06-utils.js`:

```javascript
function applyZonesToEditor(form, zones) {
    if (!form || !Array.isArray(zones)) return;
    const list = form.querySelector('.zones-list');
    if (!list) return;
    list.innerHTML = zones.map((z, idx) => renderColorZoneItem(z, idx, '#888')).join('');
}

function setupZonesReusePicker(form) {
    if (!form || form.dataset.zonesPickerWired === '1') return;
    form.dataset.zonesPickerWired = '1';
    form.addEventListener('click', (e) => {
        const chip = e.target.closest('.zone-chip');
        if (!chip || !form.contains(chip)) return;
        const raw = chip.dataset.zonesJson;
        if (!raw) return;
        let zones;
        try { zones = JSON.parse(raw); } catch { return; }
        if (!Array.isArray(zones)) return;
        applyZonesToEditor(form, zones);
    });
}
```

Export both:

```javascript
    globalThis.applyZonesToEditor = applyZonesToEditor;
    globalThis.setupZonesReusePicker = setupZonesReusePicker;
```

- [ ] **Step 4: Run to verify pass**

```bash
cd tests/unit && npx vitest run zones-reuse.test.ts
```

Expected: All 25 tests pass.

- [ ] **Step 5: Rebuild and commit**

```bash
make app
git add tests/unit/zones-reuse.test.ts ui/static/js/src/06-utils.js ui/static/js/app.js
git commit -m "feat(zones): applyZonesToEditor + setupZonesReusePicker"
```

---

## Task 7: CSS for picker

**Files:**
- Modify: `ui/static/css/style.css`

- [ ] **Step 1: Find a logical insertion point**

Open `ui/static/css/style.css`. Search for existing `.zones-editor` rule:

```bash
grep -n "\.zones-editor" ui/static/css/style.css | head -5
```

Insert the picker CSS **immediately before** the first `.zones-editor` rule (so they're co-located).

- [ ] **Step 2: Add picker CSS**

Insert this CSS block before `.zones-editor`:

```css
/* === Zones reuse picker (above .zones-editor) === */
.reuse-picker {
    background: rgba(59, 130, 246, 0.06);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 6px;
    padding: 8px 10px;
    margin-bottom: 10px;
}
.reuse-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #93c5fd;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.reuse-count {
    color: #6b7280;
    font-size: 10px;
    font-weight: normal;
    text-transform: none;
    letter-spacing: 0;
}
.reuse-scroll {
    overflow-y: auto;
    padding-right: 4px;
}
.reuse-scroll::-webkit-scrollbar { width: 6px; }
.reuse-scroll::-webkit-scrollbar-track { background: #0f172a; border-radius: 3px; }
.reuse-scroll::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
.reuse-scroll::-webkit-scrollbar-thumb:hover { background: #4b5563; }

.group-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 6px 0 4px;
    padding: 4px 2px 2px;
    position: sticky;
    top: 0;
    background: rgba(31, 41, 55, 0.95);
    backdrop-filter: blur(4px);
    z-index: 1;
}
.group-label .group-count { color: #4b5563; }
.group-label.group-same-class { color: #93c5fd; }
.group-label.group-recent { color: #fbbf24; }
.group-divider { flex: 1; height: 1px; background: #374151; }

.zone-chip {
    display: inline-flex;
    align-items: center;
    background: #111827;
    border: 1px solid #374151;
    border-radius: 4px;
    padding: 3px 6px 3px 4px;
    margin: 0 4px 4px 0;
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s, transform 0.08s;
    gap: 6px;
}
.zone-chip:hover {
    border-color: #60a5fa;
    background: #1e293b;
}
.zone-chip:active { transform: translateY(1px); }
.zone-bar {
    display: inline-flex;
    height: 14px;
    border-radius: 2px;
    overflow: hidden;
}
.zone-bar > span {
    display: inline-block;
    min-width: 26px;
    text-align: center;
    font-size: 9px;
    color: white;
    line-height: 14px;
    padding: 0 3px;
    font-weight: 600;
    text-shadow: 0 1px 1px rgba(0,0,0,0.4);
    border-right: 1px solid rgba(0,0,0,0.15);
}
.zone-bar > span:last-child { border-right: 0; }
.chip-source {
    color: #9ca3af;
    font-size: 11px;
    white-space: nowrap;
}
.chip-source.recent-source {
    color: #fbbf24;
    opacity: 0.85;
}
```

- [ ] **Step 3: Verify CSS file is well-formed**

Run: `grep -c "\.reuse-picker {" ui/static/css/style.css`
Expected: `1`

- [ ] **Step 4: Commit**

```bash
git add ui/static/css/style.css
git commit -m "feat(zones): CSS for reuse picker"
```

---

## Task 8: Wire picker into Gauge widget

**Files:**
- Modify: `ui/static/js/src/61-dashboard-widget-gauge.js`

- [ ] **Step 1: Locate the existing zones editor call in getConfigForm**

```bash
grep -n "renderColorZonesEditor\|getConfigForm\|initConfigHandlers" ui/static/js/src/61-dashboard-widget-gauge.js
```

Find the line where `renderColorZonesEditor` is called in `getConfigForm`. Note the static method context: `static getConfigForm(config)`.

- [ ] **Step 2: Modify getConfigForm to render picker before editor**

Open `ui/static/js/src/61-dashboard-widget-gauge.js`. Find this line (around line 979):

```javascript
                ${renderColorZonesEditor(zones, '#22c55e')}
```

Replace with:

```javascript
                ${renderZonesReusePicker('gauge', (globalThis.dashboardState?.currentDashboard ?? ''), config?.id ?? '')}
                ${renderColorZonesEditor(zones, '#22c55e')}
```

- [ ] **Step 3: Add or extend initConfigHandlers**

Find `static initConfigHandlers` in the same file (if present). If not present, add it:

```javascript
    static initConfigHandlers(form, config) {
        setupZonesReusePicker(form);
    }
```

If `initConfigHandlers` already exists, append `setupZonesReusePicker(form);` at the end of its body.

- [ ] **Step 4: Rebuild app.js**

```bash
make app
```

Expected: `Generated static/js/app.js from 43 files`

- [ ] **Step 5: Quick smoke check that wiring is in concatenated output**

```bash
grep -n "renderZonesReusePicker.*gauge\|setupZonesReusePicker" ui/static/js/app.js | head -4
```

Expected: 2+ matches.

- [ ] **Step 6: Commit**

```bash
git add ui/static/js/src/61-dashboard-widget-gauge.js ui/static/js/app.js
git commit -m "feat(zones): wire reuse picker into Gauge config form"
```

---

## Task 9: Wire picker into Level widget

**Files:**
- Modify: `ui/static/js/src/61-dashboard-widgets.js` (LevelWidget class around line 6-118)

- [ ] **Step 1: Locate the zones editor call**

```bash
grep -n "renderColorZonesEditor" ui/static/js/src/61-dashboard-widgets.js
```

Expected to find at least one match around line 92 (inside `LevelWidget.getConfigForm`).

- [ ] **Step 2: Modify getConfigForm**

Find the line (around line 92):

```javascript
                ${renderColorZonesEditor(zones, '#3b82f6')}
```

Replace with:

```javascript
                ${renderZonesReusePicker('level', (globalThis.dashboardState?.currentDashboard ?? ''), config?.id ?? '')}
                ${renderColorZonesEditor(zones, '#3b82f6')}
```

- [ ] **Step 3: Add initConfigHandlers if not present**

Check if `LevelWidget` has `static initConfigHandlers`. If not, add it after `parseConfigForm`:

```javascript
    static initConfigHandlers(form, config) {
        setupZonesReusePicker(form);
    }
```

If present — append `setupZonesReusePicker(form);` inside the body.

- [ ] **Step 4: Rebuild and verify**

```bash
make app
grep -c "renderZonesReusePicker.*'level'" ui/static/js/app.js
```

Expected: at least `1`.

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/61-dashboard-widgets.js ui/static/js/app.js
git commit -m "feat(zones): wire reuse picker into Level config form"
```

---

## Task 10: Wire picker into Setpoint slider config

**Files:**
- Modify: `ui/static/js/src/61-dashboard-active-setpoint.js`

- [ ] **Step 1: Locate the zones editor call**

```bash
grep -n "renderColorZonesEditor" ui/static/js/src/61-dashboard-active-setpoint.js
```

Expected match around line 691 inside the conditional `if (style === 'slider')` block.

- [ ] **Step 2: Modify getActiveConfigFields to render picker before editor**

Find this line:

```javascript
                ${renderColorZonesEditor(zones, '#3b82f6')}
```

Replace with:

```javascript
                ${renderZonesReusePicker('setpoint', (globalThis.dashboardState?.currentDashboard ?? ''), config?.id ?? '')}
                ${renderColorZonesEditor(zones, '#3b82f6')}
```

- [ ] **Step 3: Hook setupZonesReusePicker into initConfigHandlers**

Find `static initConfigHandlers(form, config)` in this file. It already exists (per CLAUDE.md: «Conditional config form»). Add at the **start** of its body (before existing logic):

```javascript
        setupZonesReusePicker(form);
```

- [ ] **Step 4: Rebuild and verify**

```bash
make app
grep -c "renderZonesReusePicker.*'setpoint'" ui/static/js/app.js
```

Expected: at least `1`.

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/61-dashboard-active-setpoint.js ui/static/js/app.js
git commit -m "feat(zones): wire reuse picker into Setpoint slider config"
```

---

## Task 11: History push on widget save

**Files:**
- Modify: `ui/static/js/src/62-dashboard-manager.js`

- [ ] **Step 1: Locate the save path**

```bash
grep -n "applyWidgetConfig\|parseConfigForm" ui/static/js/src/62-dashboard-manager.js | head -10
```

Find `applyWidgetConfig` (around line 1066). Note: after `parseConfigForm(content)` returns `config`, before `this.saveDashboard();` (around line 1150).

- [ ] **Step 2: Add history push after parseConfigForm**

In `applyWidgetConfig`, find this line (around line 1076):

```javascript
        const config = WidgetClass.parseConfigForm(content);
```

Add immediately after it (before the line that reads `transparent`):

```javascript
        // Save zones to reuse-history (Recent group of zones reuse picker)
        if (Array.isArray(config.zones) && config.zones.length > 0) {
            addZonesToHistory(config.zones, type);
        }
```

- [ ] **Step 3: Rebuild**

```bash
make app
```

- [ ] **Step 4: Sanity-grep**

```bash
grep -n "addZonesToHistory(config.zones" ui/static/js/app.js
```

Expected: 1 match.

- [ ] **Step 5: Commit**

```bash
git add ui/static/js/src/62-dashboard-manager.js ui/static/js/app.js
git commit -m "feat(zones): push to reuse-history on widget save"
```

---

## Task 12: E2E test — cross-widget reuse from dashboard

**Files:**
- Create: `tests/single/dashboard-zones-reuse.spec.ts`

- [ ] **Step 1: Create the spec file with test 1**

Create `tests/single/dashboard-zones-reuse.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Zones reuse picker', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/control/status', async (route) => {
            await route.fulfill({ json: { enabled: true, isController: true, hasController: true, timeoutSec: 60 } });
        });
        await page.goto('/');
        await page.waitForFunction(() =>
            typeof (window as any).dashboardState !== 'undefined' &&
            typeof (window as any).dashboardManager !== 'undefined' &&
            typeof (window as any).renderZonesReusePicker === 'function'
        );
        await page.evaluate(() => {
            const w: any = window;
            w.state.control.enabled = true;
            w.state.control.isController = true;
            w.state.control.hasController = true;
            w.state.control.token = 'admin';
            // Clean slate
            localStorage.removeItem('uniset.zonesHistory');
        });
        await page.waitForFunction(() => {
            const w: any = window;
            for (const [, srv] of (w.state?.servers || new Map())) {
                if (srv.connected) return true;
            }
            return false;
        }, { timeout: 10000 });
    });

    async function setupDashboardWithGaugeZones(page) {
        // Pre-create a dashboard with a Gauge widget having zones
        await page.evaluate(() => {
            const w: any = window;
            const dashCfg = {
                meta: { name: 'TEST_REUSE' },
                widgets: [{
                    id: 'gauge-src',
                    type: 'gauge',
                    position: { col: 0, row: 0, width: 4, height: 4 },
                    config: {
                        serverId: '385205fb',
                        objectName: 'SharedMemory',
                        sensor: 'Temp_S',
                        sensorId: 100,
                        min: 0, max: 100,
                        zones: [
                            { from: 0,  to: 30,  color: '#3b82f6' },
                            { from: 30, to: 70,  color: '#22c55e' },
                            { from: 70, to: 100, color: '#ef4444' },
                        ],
                    },
                }],
            };
            w.dashboardState.dashboards.set('TEST_REUSE', dashCfg);
            w.dashboardManager.loadDashboard('TEST_REUSE');
            w.switchView('dashboard');
        });
    }

    test('cross-widget reuse from dashboard: click chip → zones applied to new Level widget', async ({ page }) => {
        await setupDashboardWithGaugeZones(page);
        // Open "create new Level widget" dialog
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardManager.openWidgetConfig({ type: 'level' });
        });
        // Wait for picker to render
        await page.locator('.reuse-picker').waitFor({ state: 'visible', timeout: 2000 });

        // Pick the Gauge chip
        const chip = page.locator('.zone-chip').filter({ hasText: 'Temp_S' }).first();
        await chip.click();

        // .zones-list now has 3 items with matching colors
        const colors = await page.locator('.zone-color').evaluateAll((els: HTMLInputElement[]) =>
            els.map(e => e.value.toLowerCase())
        );
        expect(colors).toEqual(['#3b82f6', '#22c55e', '#ef4444']);
    });
});
```

- [ ] **Step 2: Run the test**

```bash
docker compose --profile dev down 2>&1 | tail -3
docker compose run --rm e2e single/dashboard-zones-reuse.spec.ts 2>&1 | tail -20
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/single/dashboard-zones-reuse.spec.ts
git commit -m "test(zones): cross-widget reuse from dashboard"
```

---

## Task 13: E2E test — history push on save

**Files:**
- Modify: `tests/single/dashboard-zones-reuse.spec.ts`

- [ ] **Step 1: Append test 2**

Append to the existing `test.describe` block in `tests/single/dashboard-zones-reuse.spec.ts`:

```typescript
    test('history push: saving widget with zones adds them to Recent', async ({ page }) => {
        // Empty start
        await page.evaluate(() => {
            const w: any = window;
            const dashCfg = { meta: { name: 'TEST_PUSH' }, widgets: [] };
            w.dashboardState.dashboards.set('TEST_PUSH', dashCfg);
            w.dashboardManager.loadDashboard('TEST_PUSH');
            w.switchView('dashboard');
        });

        // Create a Gauge widget with zones via the config dialog flow.
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardManager.openWidgetConfig({ type: 'gauge' });
        });

        // Wait for form
        await page.locator('#widget-config-content').waitFor({ state: 'visible' });

        // Fill in min/max via the form, then add zones programmatically via dataset (faster than UI for this test)
        await page.evaluate(() => {
            const form = document.getElementById('widget-config-content')!;
            // Two zones
            (window as any).applyZonesToEditor(form, [
                { from: 0,  to: 50,  color: '#abcdef' },
                { from: 50, to: 100, color: '#fedcba' },
            ]);
        });

        // Click Apply
        await page.evaluate(() => {
            (window as any).dashboardManager.applyWidgetConfig();
        });

        // Verify localStorage history
        const history = await page.evaluate(() =>
            (window as any).getZonesHistory()
        );
        expect(history.length).toBe(1);
        expect(history[0].zones).toEqual([
            { from: 0, to: 50, color: '#abcdef' },
            { from: 50, to: 100, color: '#fedcba' },
        ]);
        expect(history[0].sourceWidgetType).toBe('gauge');
    });
```

- [ ] **Step 2: Run the spec**

```bash
docker compose run --rm e2e single/dashboard-zones-reuse.spec.ts 2>&1 | tail -10
```

Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/single/dashboard-zones-reuse.spec.ts
git commit -m "test(zones): history push on save"
```

---

## Task 14: E2E test — history dedup (move-to-front)

**Files:**
- Modify: `tests/single/dashboard-zones-reuse.spec.ts`

- [ ] **Step 1: Append test 3**

```typescript
    test('history dedup: re-saving same zones moves them to front, length unchanged', async ({ page }) => {
        await page.evaluate(() => {
            const w: any = window;
            // Seed history with 2 distinct sets
            w.addZonesToHistory([{ from: 0, to: 10, color: '#aaaaaa' }], 'gauge');
            w.addZonesToHistory([{ from: 0, to: 20, color: '#bbbbbb' }], 'level');
        });
        const before = await page.evaluate(() => (window as any).getZonesHistory());
        expect(before.length).toBe(2);
        expect(before[0].zones[0].color).toBe('#bbbbbb'); // last-pushed at front

        // Re-save the older (#aaaaaa) entry — should move-to-front, not duplicate
        await page.evaluate(() => {
            (window as any).addZonesToHistory([{ from: 0, to: 10, color: '#AAAAAA' }], 'gauge');
        });
        const after = await page.evaluate(() => (window as any).getZonesHistory());
        expect(after.length).toBe(2);
        expect(after[0].zones[0].color).toBe('#aaaaaa');
        expect(after[1].zones[0].color).toBe('#bbbbbb');
    });
```

- [ ] **Step 2: Run**

```bash
docker compose run --rm e2e single/dashboard-zones-reuse.spec.ts 2>&1 | tail -10
```

Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/single/dashboard-zones-reuse.spec.ts
git commit -m "test(zones): history dedup move-to-front"
```

---

## Task 15: E2E test — FIFO cap

**Files:**
- Modify: `tests/single/dashboard-zones-reuse.spec.ts`

- [ ] **Step 1: Append test 4**

```typescript
    test('FIFO cap: history length never exceeds ZONES_HISTORY_MAX', async ({ page }) => {
        const cap = await page.evaluate(() => (window as any).ZONES_HISTORY_MAX);
        await page.evaluate((cap: number) => {
            for (let i = 0; i < cap + 5; i++) {
                (window as any).addZonesToHistory(
                    [{ from: i, to: i + 1, color: '#000000' }],
                    'gauge'
                );
            }
        }, cap);
        const history = await page.evaluate(() => (window as any).getZonesHistory());
        expect(history.length).toBe(cap);
        // Newest at front (last loop iter pushed i = cap+4)
        expect(history[0].zones[0].from).toBe(cap + 4);
    });
```

- [ ] **Step 2: Run**

```bash
docker compose run --rm e2e single/dashboard-zones-reuse.spec.ts 2>&1 | tail -10
```

Expected: 4 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/single/dashboard-zones-reuse.spec.ts
git commit -m "test(zones): FIFO cap"
```

---

## Task 16: E2E test — empty state hides block

**Files:**
- Modify: `tests/single/dashboard-zones-reuse.spec.ts`

- [ ] **Step 1: Append test 5**

```typescript
    test('empty state: no dashboard zones + no history → picker block not rendered', async ({ page }) => {
        await page.evaluate(() => {
            const w: any = window;
            const dashCfg = { meta: { name: 'TEST_EMPTY' }, widgets: [] };
            w.dashboardState.dashboards.set('TEST_EMPTY', dashCfg);
            w.dashboardManager.loadDashboard('TEST_EMPTY');
            w.switchView('dashboard');
            localStorage.removeItem('uniset.zonesHistory');
        });

        await page.evaluate(() => {
            const w: any = window;
            w.dashboardManager.openWidgetConfig({ type: 'gauge' });
        });

        await page.locator('#widget-config-content').waitFor({ state: 'visible' });
        const pickerCount = await page.locator('.reuse-picker').count();
        expect(pickerCount).toBe(0);
    });
```

- [ ] **Step 2: Run**

```bash
docker compose run --rm e2e single/dashboard-zones-reuse.spec.ts 2>&1 | tail -10
```

Expected: 5 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/single/dashboard-zones-reuse.spec.ts
git commit -m "test(zones): empty state hides picker"
```

---

## Task 17: E2E test — same-type-first ordering

**Files:**
- Modify: `tests/single/dashboard-zones-reuse.spec.ts`

- [ ] **Step 1: Append test 6**

```typescript
    test('same-type-first: editing Gauge → Gauge group precedes Level group', async ({ page }) => {
        await page.evaluate(() => {
            const w: any = window;
            const dashCfg = {
                meta: { name: 'TEST_ORDER' },
                widgets: [
                    { id: 'L1', type: 'level',
                      position: { col: 0, row: 0, width: 4, height: 4 },
                      config: { sensor: 'Tank_A', zones: [{ from: 0, to: 100, color: '#aaaaaa' }] } },
                    { id: 'G1', type: 'gauge',
                      position: { col: 4, row: 0, width: 4, height: 4 },
                      config: { sensor: 'Temp_S', zones: [{ from: 0, to: 100, color: '#bbbbbb' }] } },
                ],
            };
            w.dashboardState.dashboards.set('TEST_ORDER', dashCfg);
            w.dashboardManager.loadDashboard('TEST_ORDER');
            w.switchView('dashboard');
            localStorage.removeItem('uniset.zonesHistory');
        });

        // Open new Gauge config (so same-type = Gauge)
        await page.evaluate(() => {
            (window as any).dashboardManager.openWidgetConfig({ type: 'gauge' });
        });
        await page.locator('.reuse-picker').waitFor({ state: 'visible' });

        const groupTexts = await page.locator('.reuse-picker .group-label').evaluateAll(els =>
            els.map(el => (el.textContent || '').trim())
        );

        // Find indices
        const gaugeIdx = groupTexts.findIndex(t => t.includes('Gauge'));
        const levelIdx = groupTexts.findIndex(t => t.includes('Level'));
        expect(gaugeIdx).toBeGreaterThanOrEqual(0);
        expect(levelIdx).toBeGreaterThanOrEqual(0);
        expect(gaugeIdx).toBeLessThan(levelIdx);

        // Verify Gauge group has same-class marker
        const sameClassCount = await page.locator('.reuse-picker .group-same-class').count();
        expect(sameClassCount).toBe(1);
    });
```

- [ ] **Step 2: Run**

```bash
docker compose run --rm e2e single/dashboard-zones-reuse.spec.ts 2>&1 | tail -10
```

Expected: 6 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/single/dashboard-zones-reuse.spec.ts
git commit -m "test(zones): same-type-first ordering"
```

---

## Task 18: CLAUDE.md documentation update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Locate the «Общие хелперы» table in CLAUDE.md**

```bash
grep -n "Общие хелперы\|renderColorZonesEditor" CLAUDE.md | head
```

Find the table where `renderColorZonesEditor` is documented.

- [ ] **Step 2: Add new rows for picker helpers**

Add these rows to the helpers table (after the row for `renderColorZonesEditor`/`parseColorZones`):

```markdown
| `canonicalizeZones(zones)` | `06-utils.js` | Канонический JSON-ключ для dedup (sort by from, lowercase color, fixed precision). Используется в `addZonesToHistory`. Не вызывать напрямую из renderer'ов. |
| `getZonesHistory()` / `addZonesToHistory(zones, sourceType)` | `06-utils.js` | localStorage CRUD для Recent zones. FIFO cap = `ZONES_HISTORY_MAX`. Move-to-front при duplicate. No-op для пустого `zones`. Push вызывается из `dashboard-manager.applyWidgetConfig` после save. |
| `getDashboardZoneSources(dashId, excludeWidgetId)` | `06-utils.js` | Live-read widget'ов текущего dashboard'а с непустыми zones, исключая редактируемый. Возвращает `{widgetId, widgetType, sensorLabel, zones}[]`. |
| `renderZonesReusePicker(currentType, dashId, currentWidgetId)` | `06-utils.js` | HTML для блока reuse-picker'а над `renderColorZonesEditor`. Группировка: Recent → same-class → others alphabetical. Возвращает `''` если оба источника пусты. |
| `setupZonesReusePicker(form)` | `06-utils.js` | Click-delegation на `.zone-chip` элементах. Idempotent (`form.dataset.zonesPickerWired`). Вызывать в `static initConfigHandlers` каждого widget'а с zones. |
| `applyZonesToEditor(form, zones)` | `06-utils.js` | DOM-replace `.zones-list` через `renderColorZoneItem`. Используется внутри `setupZonesReusePicker` click handler'а. |
```

- [ ] **Step 3: Add Reuse Picker convention block**

After the helpers table, add a short paragraph (find a natural section like «JavaScript модули» or «Sensor identity» and add an adjacent block):

```markdown
### Zones reuse picker

Виджеты с `zones: [{from, to, color}]` — Setpoint slider, Gauge, Level — рендерят
inline-picker над zones-editor для переиспользования предыдущих наборов.

Wiring per widget:
- В `static getConfigForm` (или `getActiveConfigFields` для Setpoint) — вызвать
  `renderZonesReusePicker(widgetType, currentDashboard, currentWidgetId)` ПЕРЕД
  `renderColorZonesEditor(...)`.
- В `static initConfigHandlers(form, config)` — `setupZonesReusePicker(form);`
  (idempotent, можно звать многократно).
- History push автоматически из `62-dashboard-manager.js applyWidgetConfig` —
  никаких ручных вызовов из widget класса.

Константы: `ZONES_HISTORY_MAX`, `ZONES_PICKER_MAX_HEIGHT_PX`,
`ZONES_HISTORY_STORAGE_KEY` (все в `00-constants.js`).
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(zones): document reuse picker helpers and wiring convention"
```

---

## Task 19: Full E2E sweep + unit test re-run

**Files:** None (verification only)

- [ ] **Step 1: Run all unit tests**

```bash
cd tests/unit && npx vitest run 2>&1 | tail -15
```

Expected: All tests pass — pre-existing + 25 new in `zones-reuse.test.ts`.

- [ ] **Step 2: Run all affected E2E specs**

```bash
cd /home/pv/Projects/uniset-panel
docker compose --profile dev down 2>&1 | tail -3
docker compose run --rm e2e single/dashboard-zones-reuse.spec.ts single/dashboard-active-setpoint.spec.ts 2>&1 | tail -20
```

Expected: All tests in both files pass. Setpoint spec MUST stay at 44+ passed (no regressions introduced by adding picker to its config form).

- [ ] **Step 3: Verify final state of branch**

```bash
git status
git log --oneline -20
```

Expected: clean working tree, 18-19 new commits since the spec commit. No untracked files (other than pre-existing `.playwright-mcp/`).

- [ ] **Step 4: Clean up**

```bash
docker compose down 2>&1 | tail -3
```

- [ ] **Step 5: Final commit if any straggling app.js regeneration needed**

```bash
make app
git status
# If app.js shows uncommitted changes:
git add ui/static/js/app.js
git commit -m "chore(zones): regenerate app.js"
```

---

## Self-Review Notes

**Spec coverage:**
- ✅ Inline picker over zones-editor (Tasks 5, 7, 8-10)
- ✅ Two sources: dashboard widgets + Recent history (Tasks 2, 3, 5)
- ✅ Group order: Recent → same-class → others (Task 5, verified Task 17)
- ✅ Preview-chip with proportional flex + from-to labels (Task 4)
- ✅ Source labels: sensor name or relative date (Task 5)
- ✅ Sticky group headers + scroll (Task 7 CSS)
- ✅ Empty state hides block (Tasks 5, 16)
- ✅ Cross-widget-type AS-IS apply (Tasks 6, 12)
- ✅ FIFO cap=ZONES_HISTORY_MAX (Tasks 2, 15)
- ✅ Auto dedup move-to-front (Tasks 2, 14)
- ✅ No manual delete UI (intentionally omitted — spec'd as "no")
- ✅ Replace vs append on chip click — Replace (Task 6)
- ✅ Magic numbers → constants (Task 1)
- ✅ 3 widgets wired (Tasks 8, 9, 10)
- ✅ History push on save (Task 11)
- ✅ All 6 E2E tests from spec (Tasks 12-17)
- ✅ CLAUDE.md update (Task 18)

**Type consistency:**
- `canonicalizeZones(zones) → string` consistent across Tasks 2, 14
- `addZonesToHistory(zones, sourceWidgetType) → void` consistent Tasks 2, 11, 14, 15
- `getDashboardZoneSources(dashId, excludeWidgetId) → array<{widgetId, widgetType, sensorLabel, zones}>` consistent Tasks 3, 5
- `renderZonesReusePicker(currentType, dashId, currentWidgetId)` consistent Tasks 5, 8, 9, 10
- `setupZonesReusePicker(form)` (no extra args) consistent Tasks 6, 8, 9, 10

**No placeholders:** every step has concrete code, exact paths, expected output.
