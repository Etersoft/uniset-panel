# UObject Debug Spec 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose existing `story/system-overview` (1438-line `58-system-overview.js`) into 9 focused modules, port Navigation UX from uniset2-debug-ui.html (hotkeys, minimap, click-highlight, LOD, persistent state), switch to Sugiyama layout via dagre.js, replace object palette with FB Status panel, and provide trace-SSE subscription API + CustomEvent hooks for future Spec 4.

**Architecture:** Пошаговая extract-refactor из монолита в 9 файлов `58-overview-*.js`. Каждый extract — pure relocation без logic change (проверяется E2E smoke до/после). Новые фичи (dagre, hotkeys, minimap, LOD, highlight, FB Status panel, trace API, SVG export) добавляются последовательно после extract. CustomEvent contract обеспечивает слабую связанность с будущим Спеком 4.

**Tech Stack:** Vanilla JS (no ES modules — global scope per project convention), LiteGraph.js (existing vendor), dagre.js (new vendor, ~20KB gzip), Playwright E2E (existing), **Vitest + jsdom (new, для unit-тестов чистой логики)**, mock server (existing from story/system-overview).

**Testing strategy:** двухслойная.
- **Vitest unit** — чистая логика без DOM: `state.js` (serialize/deserialize/version migration), `layout.js` (dagre adapter, autoOrientation), `highlight.js` (applyOverviewHighlight на фикстуре), `trace.js` (subscribe/unsubscribe lifecycle c mocked EventSource). Файлы: `tests/unit/*.test.js`. Загружают модуль через `new Function(fs.readFileSync(...))` в jsdom-контексте (т.к. исходники — vanilla globals, не ESM).
- **Playwright E2E** — интеграция: render в браузере, SSE через mock-server, localStorage reload, hotkeys через клавиатуру, визуальные smoke-тесты.

---

## File map

### New files

- `ui/static/js/src/58-overview-node.js` — `UniSetProcessNode` класс (extracted).
- `ui/static/js/src/58-overview-core.js` — orchestration: open/close tab, fetch data, init.
- `ui/static/js/src/58-overview-layout.js` — dagre Sugiyama + manualPositions.
- `ui/static/js/src/58-overview-navigation.js` — hotkeys + help overlay + minimap + zoom-around-cursor + LOD.
- `ui/static/js/src/58-overview-highlight.js` — click-to-highlight edges/neighbors + dblclick-edge info.
- `ui/static/js/src/58-overview-state.js` — localStorage persist (debounce, beforeunload flush).
- `ui/static/js/src/58-overview-fb-status.js` — FB Status panel (list + search, replacing palette).
- `ui/static/js/src/58-overview-trace.js` — trace SSE subscription API для Спека 4.
- `ui/static/js/src/58-overview-events.js` — CustomEvent emission helpers.
- `ui/static/js/vendor/dagre.min.js` — new vendor.
- `ui/static/css/vendor/` — CSS for hi-* / lod-hidden / FB Status / minimap.
- `tests/overview-spec3.spec.ts` — Playwright E2E.
- `tests/vitest.config.js` — Vitest конфиг (environment: jsdom, globs).
- `tests/unit/overview-state.test.js` — unit: load/save/version migration.
- `tests/unit/overview-layout.test.js` — unit: dagre adapter, autoOrientation.
- `tests/unit/overview-highlight.test.js` — unit: applyOverviewHighlight pure logic.
- `tests/unit/overview-trace.test.js` — unit: subscribe/unsubscribe token lifecycle.
- `tests/unit/helpers/load-src.js` — helper для загрузки vanilla-исходника в jsdom (`new Function`).

### Removed / transformed

- `ui/static/js/src/58-system-overview.js` — разбит на 9 выше. Удаляется на последнем таске.

### Modified

- `ui/static/js/src/00-constants.js` — добавить overview color constants если нужно.
- Overview HTML template (см. в проекте ту, что рендерит `#overview-tab`) — добавить FB Status panel контейнер + View dropdown + minimap + help overlay markup.
- `tests/mock-server/` — если нужно, stub trace endpoint.

---

## Task 1: Branch + Vitest infrastructure + smoke-baseline

**Files:**
- Create: `tests/vitest.config.js`
- Create: `tests/unit/helpers/load-src.js`
- Create: `tests/unit/smoke.test.js`
- Modify: `tests/package.json` (add vitest/jsdom deps, test:unit script)

**Branch**: `story/uobject-debug-spec3` от story/system-overview (НЕ от master — нам нужна его основа).

**Почему этот таск существует:** Spec 3 добавляет 4 модуля с чистой логикой (state, layout, highlight, trace), которые дёшево и быстро тестируются в jsdom. Playwright E2E — медленный (секунды), плохо ловит corner-cases сериализации и computation. Vitest — нативный ESM, jest-compatible API, мгновенный watch-mode. Настраиваем один раз здесь, переиспользуем во всех дальнейших тасках.

- [ ] **Step 1: Branch from story/system-overview**

```bash
cd /home/pv/Projects/uniset-panel
git fetch origin
git checkout -b story/uobject-debug-spec3 story/system-overview
```

- [ ] **Step 2: Install Vitest + jsdom**

```bash
cd /home/pv/Projects/uniset-panel/tests
npm install --save-dev vitest@^1.6.0 jsdom@^24.0.0
```

Это добавит в `package.json` две dev-зависимости. Commit `package.json` + `package-lock.json`.

- [ ] **Step 3: Add `vitest.config.js`**

```js
// tests/vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['unit/**/*.test.js'],
        globals: true, // describe/it/expect без импорта
        reporters: ['default'],
    },
});
```

- [ ] **Step 4: Add `tests/unit/helpers/load-src.js`**

Проект использует vanilla globals (`<script src>`), не ESM. Helper читает исходник и исполняет в текущем global scope (jsdom's window):

```js
// tests/unit/helpers/load-src.js
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

/**
 * Загружает vanilla-JS исходник в текущий global scope (jsdom window).
 * @param {string} relPath — путь от корня репо, напр. 'ui/static/js/src/58-overview-state.js'
 */
export function loadSrc(relPath) {
    const abs = path.resolve(ROOT, relPath);
    const code = fs.readFileSync(abs, 'utf-8');
    // Выполняем в global scope. Файл-исходник объявляет функции/константы,
    // которые становятся доступны как globals.
    const fn = new Function(code);
    fn.call(globalThis);
}
```

- [ ] **Step 5: Add smoke test `tests/unit/smoke.test.js`**

```js
// tests/unit/smoke.test.js
import { describe, it, expect } from 'vitest';

describe('vitest infrastructure', () => {
    it('runs in jsdom', () => {
        expect(typeof window).toBe('object');
        expect(typeof document).toBe('object');
    });

    it('has localStorage', () => {
        localStorage.setItem('k', 'v');
        expect(localStorage.getItem('k')).toBe('v');
        localStorage.clear();
    });
});
```

- [ ] **Step 6: Add `test:unit` script to `tests/package.json`**

Отредактировать `scripts` блок:
```json
"scripts": {
    "test": "playwright test",
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
    "test:headed": "playwright test --headed",
    "test:debug": "playwright test --debug",
    "report": "playwright show-report"
}
```

- [ ] **Step 7: Run unit smoke**

```bash
cd /home/pv/Projects/uniset-panel/tests
npm run test:unit
```

Expected: `2 passed`.

- [ ] **Step 8: Baseline E2E smoke (до изменений)**

```bash
cd /home/pv/Projects/uniset-panel/tests
npx playwright test --list | head -20
npx playwright test system-overview 2>&1 | tail -20
```

Записать текущий PASS count — это baseline, который не должен сломаться после extracts.

- [ ] **Step 9: Commit Vitest infra**

```bash
cd /home/pv/Projects/uniset-panel
git add tests/package.json tests/package-lock.json \
        tests/vitest.config.js \
        tests/unit/helpers/load-src.js \
        tests/unit/smoke.test.js
git commit -m "chore(tests): add vitest + jsdom for JS unit tests"
```

---

## Task 2: Extract `UniSetProcessNode` in `58-overview-node.js`

**Files:**
- Create: `ui/static/js/src/58-overview-node.js`
- Modify: `ui/static/js/src/58-system-overview.js` (remove extracted section)

Extract lines 1-90 (roughly) of current 58-system-overview.js which contain `UniSetProcessNode` + helpers (`formatOverviewPortValue`, `formatPortConnectionLabel`, `populatePortConnections`). These are used only by rendering logic.

- [ ] **Step 1: Read current code**

```bash
cd /home/pv/Projects/uniset-panel
sed -n '1,150p' ui/static/js/src/58-system-overview.js
```

Identify exact boundary: from first `// =====` marker through `populatePortConnections` end.

- [ ] **Step 2: Create `58-overview-node.js`**

Copy the identified section into new file. Preserve `// = header, comments, constants used. At top add block header:

```js
// ============================================================================
// System Overview — UniSetProcessNode (LiteGraph custom node type)
// ============================================================================
// Renders one process as a block with input/output ports showing live values
// (via portValues + pulse on change). Connection labels at port level.
// ============================================================================
```

- [ ] **Step 3: Remove extracted code from `58-system-overview.js`**

Delete the lines you copied. Keep `overviewInstances` global if it's used elsewhere (probably in core).

- [ ] **Step 4: Run E2E smoke — baseline should still pass**

```bash
cd /home/pv/Projects/uniset-panel/tests
npx playwright test system-overview 2>&1 | tail -10
```

Expected: same PASS count as Task 1 baseline. If regressed — roll back, check what extract took too much/little.

- [ ] **Step 5: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/58-overview-node.js ui/static/js/src/58-system-overview.js
git commit -m "refactor(overview): extract UniSetProcessNode to 58-overview-node.js"
```

---

## Task 3: Extract orchestration to `58-overview-core.js`

**Files:**
- Create: `ui/static/js/src/58-overview-core.js`
- Modify: `ui/static/js/src/58-system-overview.js`

Extract: `overviewInstances` global, `openSystemOverview`, `createOverviewTab`, `closeOverviewTab`, `openOverviewErrorTab`, `showOverviewError`, `showOverviewMessage`, `initOverviewGraph`, `buildOverviewGraph`. These are high-level orchestration.

- [ ] **Step 1: Read boundary**

```bash
cd /home/pv/Projects/uniset-panel
sed -n '144,600p' ui/static/js/src/58-system-overview.js | head -80
```

- [ ] **Step 2: Create `58-overview-core.js` with extracted functions**

Include the orchestration section + `overviewInstances` global. Top header:

```js
// ============================================================================
// System Overview — orchestration: open/close tab, data fetch, init
// ============================================================================
// Public API (globals):
//   window.overviewInstances = { [serverId]: {graph, canvas, nodeMap, ...} }
//   openSystemOverview(serverId, serverName) -- entry point, called from sidebar
// ============================================================================
```

- [ ] **Step 3: Remove from 58-system-overview.js**

- [ ] **Step 4: Run E2E smoke**

```bash
cd /home/pv/Projects/uniset-panel/tests
npx playwright test system-overview 2>&1 | tail -10
```

Expected: baseline pass.

- [ ] **Step 5: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/58-overview-core.js ui/static/js/src/58-system-overview.js
git commit -m "refactor(overview): extract orchestration to 58-overview-core.js"
```

---

## Task 4: Extract layout to `58-overview-layout.js` + dagre vendor

**Files:**
- Create: `ui/static/js/src/58-overview-layout.js`
- Create: `ui/static/js/vendor/dagre.min.js`
- Modify: `ui/static/js/src/58-system-overview.js`
- Modify: overview HTML template (add `<script src="vendor/dagre.min.js">`).

Extract: `findSlotIndex`, `applyOverviewLayout`, `autoLayoutOverview` (and related). Add dagre-based `computeSugiyamaPositions`.

- [ ] **Step 1: Add `dagre.min.js` vendor**

Download dagre v0.8.5 or latest stable:
```bash
cd /home/pv/Projects/uniset-panel
curl -L -o ui/static/js/vendor/dagre.min.js https://cdn.jsdelivr.net/npm/dagre@0.8.5/dist/dagre.min.js
```

Add `<script src="/static/js/vendor/dagre.min.js"></script>` to the HTML template that loads overview JS (find it; likely `ui/templates/*.html` or similar).

- [ ] **Step 2: Create `58-overview-layout.js`**

Copy existing `applyOverviewLayout` + `autoLayoutOverview` + `findSlotIndex`. Add new:

```js
// Sugiyama layout via dagre. Returns { [nodeName]: {x, y} }.
function computeSugiyamaPositions(nodes, edges, opts) {
    if (typeof dagre === 'undefined') {
        console.warn('[overview-layout] dagre.js not loaded, falling back to H layout');
        return null; // caller falls back
    }
    const g = new dagre.graphlib.Graph().setGraph({
        rankdir: opts.direction || 'LR',  // 'LR' or 'TB'
        nodesep: 40,
        ranksep: 80,
    });
    for (const n of nodes) {
        g.setNode(n.name, { width: opts.nodeWidth || 220, height: opts.nodeHeight || 140 });
    }
    for (const e of edges) {
        g.setEdge(e.fromNode, e.toNode);
    }
    dagre.layout(g);
    const positions = {};
    for (const name of g.nodes()) {
        const {x, y} = g.node(name);
        positions[name] = { x, y };
    }
    return positions;
}

// Auto-detect orientation based on aspect ratio of placement.
function autoOrientation(nodes, edges) {
    // Simple heuristic: if edge count > node count → deeper pipeline → LR.
    // Otherwise → TB.
    return edges.length > nodes.length ? 'LR' : 'TB';
}
```

- [ ] **Step 3: Wire `autoLayoutOverview` to try Sugiyama first, fallback on H**

Modify existing `autoLayoutOverview(nodeMap, edges, direction, canvasSize)` to:

```js
function autoLayoutOverview(nodeMap, edges, direction, canvasSize) {
    const nodes = Object.values(nodeMap);
    const dir = direction === 'auto' ? autoOrientation(nodes, edges) : direction;
    const positions = computeSugiyamaPositions(nodes, edges, {direction: dir});
    if (positions) {
        for (const name in positions) {
            if (nodeMap[name]) {
                nodeMap[name].pos = [positions[name].x, positions[name].y];
            }
        }
        return;
    }
    // Fallback: existing H/V logic (keep unchanged)
    applyOverviewLayout(nodeMap, edges, dir === 'LR' ? 'H' : 'V', canvasSize);
}
```

- [ ] **Step 4: Vitest unit — autoOrientation + computeSugiyamaPositions**

```js
// tests/unit/overview-layout.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import { loadSrc } from './helpers/load-src.js';

beforeAll(async () => {
    // dagre берём из node_modules (совместим с vendor build)
    const dagre = await import('dagre');
    globalThis.dagre = dagre.default || dagre;
    loadSrc('ui/static/js/src/58-overview-layout.js');
});

describe('autoOrientation', () => {
    it('choses LR when edges > nodes', () => {
        const nodes = [{name:'a'},{name:'b'},{name:'c'}];
        const edges = [{fromNode:'a',toNode:'b'},{fromNode:'b',toNode:'c'},{fromNode:'a',toNode:'c'},{fromNode:'c',toNode:'a'}];
        expect(autoOrientation(nodes, edges)).toBe('LR');
    });
    it('choses TB when edges <= nodes', () => {
        const nodes = [{name:'a'},{name:'b'},{name:'c'}];
        const edges = [{fromNode:'a',toNode:'b'}];
        expect(autoOrientation(nodes, edges)).toBe('TB');
    });
});

describe('computeSugiyamaPositions', () => {
    it('produces positions for every node', () => {
        const nodes = [{name:'a'},{name:'b'},{name:'c'}];
        const edges = [{fromNode:'a',toNode:'b'},{fromNode:'b',toNode:'c'}];
        const pos = computeSugiyamaPositions(nodes, edges, {direction:'LR'});
        expect(Object.keys(pos).sort()).toEqual(['a','b','c']);
        expect(typeof pos.a.x).toBe('number');
        expect(typeof pos.a.y).toBe('number');
    });
    it('returns null when dagre undefined', () => {
        const saved = globalThis.dagre;
        delete globalThis.dagre;
        const pos = computeSugiyamaPositions([{name:'a'}], [], {});
        expect(pos).toBeNull();
        globalThis.dagre = saved;
    });
});
```

**Note:** в зависимости нужно `dagre` как devDep (`npm install --save-dev dagre@0.8.5` в `tests/`). Это даёт тестам ту же версию, что vendor.

Run:
```bash
cd /home/pv/Projects/uniset-panel/tests
npm install --save-dev dagre@0.8.5
npm run test:unit -- overview-layout 2>&1 | tail -15
```

Expected: 4 PASS.

- [ ] **Step 5: E2E smoke — schema still renders**

```bash
cd /home/pv/Projects/uniset-panel/tests
npx playwright test system-overview 2>&1 | tail -10
```

Expected: baseline. Layout may look different (Sugiyama instead of H/V) but schema not broken.

- [ ] **Step 6: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/58-overview-layout.js \
        ui/static/js/vendor/dagre.min.js \
        ui/static/js/src/58-system-overview.js \
        tests/unit/overview-layout.test.js \
        tests/package.json tests/package-lock.json \
        ui/templates/  # or wherever the HTML is
git commit -m "feat(overview): Sugiyama layout via dagre.js + extract 58-overview-layout"
```

---

## Task 5: Persistent state module `58-overview-state.js`

**Files:**
- Create: `ui/static/js/src/58-overview-state.js`
- Test: `tests/overview-state.spec.ts` (Playwright unit-ish)

State key pattern: `uniset-panel:overview:<serverId>`. Schema: `{zoom, offsetX, offsetY, toggles, searchQuery, manualPositions}`.

- [ ] **Step 1: Create `58-overview-state.js`**

```js
// ============================================================================
// System Overview — persistent view state (localStorage)
// ============================================================================
// Key:  uniset-panel:overview:<serverId>
// Schema: {zoom, offsetX, offsetY, toggles, searchQuery, manualPositions}
// ============================================================================

const OVERVIEW_STATE_VERSION = 1;
const OVERVIEW_STATE_DEBOUNCE_MS = 300;

function overviewStateKey(serverId) {
    return `uniset-panel:overview:${serverId}`;
}

function overviewStateDefault() {
    return {
        v: OVERVIEW_STATE_VERSION,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        toggles: { wires: true, values: true, minimap: false, groupBackgrounds: false },
        searchQuery: '',
        manualPositions: {},
    };
}

function loadOverviewState(serverId) {
    try {
        const raw = localStorage.getItem(overviewStateKey(serverId));
        if (!raw) return overviewStateDefault();
        const parsed = JSON.parse(raw);
        if (parsed.v !== OVERVIEW_STATE_VERSION) {
            console.warn('[overview-state] state version mismatch, resetting');
            return overviewStateDefault();
        }
        return Object.assign(overviewStateDefault(), parsed);
    } catch (e) {
        console.warn('[overview-state] load failed:', e);
        return overviewStateDefault();
    }
}

const _overviewStateSaveTimers = {};
function saveOverviewState(serverId, state) {
    clearTimeout(_overviewStateSaveTimers[serverId]);
    _overviewStateSaveTimers[serverId] = setTimeout(() => {
        try {
            localStorage.setItem(overviewStateKey(serverId), JSON.stringify(state));
        } catch (e) {
            console.warn('[overview-state] save failed:', e);
        }
    }, OVERVIEW_STATE_DEBOUNCE_MS);
}

function flushOverviewState(serverId, state) {
    clearTimeout(_overviewStateSaveTimers[serverId]);
    try {
        localStorage.setItem(overviewStateKey(serverId), JSON.stringify(state));
    } catch (e) {}
}

// Attach global beforeunload flusher at load time
window.addEventListener('beforeunload', () => {
    for (const sid of Object.keys(window.overviewInstances || {})) {
        const inst = window.overviewInstances[sid];
        if (inst && inst.state) flushOverviewState(sid, inst.state);
    }
});
```

- [ ] **Step 2: Vitest unit — serialize/deserialize/version-migration**

```js
// tests/unit/overview-state.test.js
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { loadSrc } from './helpers/load-src.js';

beforeAll(() => {
    loadSrc('ui/static/js/src/58-overview-state.js');
});

beforeEach(() => {
    localStorage.clear();
});

describe('overviewStateDefault', () => {
    it('has required shape', () => {
        const s = overviewStateDefault();
        expect(s.v).toBe(1);
        expect(s.zoom).toBe(1);
        expect(s.toggles.wires).toBe(true);
        expect(s.manualPositions).toEqual({});
    });
});

describe('load + save round-trip', () => {
    it('persists and reads back', () => {
        const s = overviewStateDefault();
        s.zoom = 2.5;
        s.searchQuery = 'foo';
        flushOverviewState('srv-1', s);
        const loaded = loadOverviewState('srv-1');
        expect(loaded.zoom).toBe(2.5);
        expect(loaded.searchQuery).toBe('foo');
    });

    it('returns default when key missing', () => {
        expect(loadOverviewState('missing').zoom).toBe(1);
    });

    it('resets on version mismatch', () => {
        localStorage.setItem('uniset-panel:overview:srv-1', JSON.stringify({v:999, zoom:42}));
        const loaded = loadOverviewState('srv-1');
        expect(loaded.v).toBe(1);
        expect(loaded.zoom).toBe(1);
    });

    it('returns default on malformed JSON', () => {
        localStorage.setItem('uniset-panel:overview:srv-1', 'not-json{{');
        expect(loadOverviewState('srv-1').zoom).toBe(1);
    });
});

describe('saveOverviewState debounce', () => {
    it('does not throw on quota failure', () => {
        const orig = localStorage.setItem;
        localStorage.setItem = () => { throw new Error('QuotaExceeded'); };
        expect(() => flushOverviewState('srv-x', {zoom:2})).not.toThrow();
        localStorage.setItem = orig;
    });
});
```

Run:
```bash
cd /home/pv/Projects/uniset-panel/tests
npm run test:unit -- overview-state 2>&1 | tail -15
```

Expected: 6 PASS.

- [ ] **Step 3: Write Playwright integration test `tests/overview-state.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';

test('overview state persists across reload', async ({ page }) => {
    await page.goto('/');
    // Open overview (this depends on mock-server setup, adjust).
    await page.evaluate(() => {
        if (typeof openSystemOverview === 'function') {
            openSystemOverview('srv-1', 'MockServer');
        }
    });

    await page.waitForFunction(() => window.overviewInstances && window.overviewInstances['srv-1']);

    // Modify state
    await page.evaluate(() => {
        const state = window.overviewInstances['srv-1'].state;
        state.zoom = 1.5;
        state.searchQuery = 'test';
        saveOverviewState('srv-1', state);
    });

    // Wait for debounce
    await page.waitForTimeout(400);

    // Reload
    await page.reload();

    // Re-open overview
    await page.evaluate(() => openSystemOverview('srv-1', 'MockServer'));
    await page.waitForFunction(() => window.overviewInstances && window.overviewInstances['srv-1']);

    // Verify restore
    const restored = await page.evaluate(() => {
        return window.overviewInstances['srv-1'].state;
    });
    expect(restored.zoom).toBe(1.5);
    expect(restored.searchQuery).toBe('test');
});

test('overview state survives localStorage quota failure', async ({ page }) => {
    await page.goto('/');
    // Simulate quota by stubbing setItem
    await page.evaluate(() => {
        const orig = localStorage.setItem;
        localStorage.setItem = () => { throw new Error('QuotaExceeded'); };
        window._origSetItem = orig;
    });

    // Should not throw
    await page.evaluate(() => {
        saveOverviewState('srv-test', { zoom: 2 });
    });

    await page.evaluate(() => { localStorage.setItem = window._origSetItem; });
});
```

- [ ] **Step 4: Wire load/save into core.js (minimal integration)**

В `createOverviewTab` (в `58-overview-core.js`) после инициализации:
```js
const state = loadOverviewState(serverId);
overviewInstances[serverId].state = state;
```

В places где меняется zoom/pan/toggles/searchQuery — вызывать `saveOverviewState(serverId, state)`.

- [ ] **Step 5: Run tests**

```bash
cd /home/pv/Projects/uniset-panel/tests
npm run test:unit -- overview-state 2>&1 | tail -5
npx playwright test overview-state 2>&1 | tail -10
```

Expected: unit 6 PASS, Playwright 2 PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/58-overview-state.js \
        ui/static/js/src/58-overview-core.js \
        tests/unit/overview-state.test.js \
        tests/overview-state.spec.ts
git commit -m "feat(overview): localStorage persistent view state + unit + E2E tests"
```

---

## Task 6: CustomEvent emission `58-overview-events.js`

**Files:**
- Create: `ui/static/js/src/58-overview-events.js`
- Modify: `ui/static/js/src/58-overview-core.js` (emit schema-opened/closed)
- Modify: `ui/static/js/src/58-overview-node.js` (emit click/dblclick)
- Test: `tests/overview-events.spec.ts`

- [ ] **Step 1: Create `58-overview-events.js`**

```js
// ============================================================================
// System Overview — CustomEvent emission (hooks for Spec 4 detail panel)
// ============================================================================

function emitSchemaOpened(serverId, serverName, objectNames) {
    document.dispatchEvent(new CustomEvent('uniset:schema-opened', {
        detail: { serverId, serverName, objectNames }
    }));
}

function emitSchemaClosed(serverId) {
    document.dispatchEvent(new CustomEvent('uniset:schema-closed', {
        detail: { serverId }
    }));
}

function emitNodeClicked(serverId, serverName, objectName, nodeId, element) {
    document.dispatchEvent(new CustomEvent('uniset:node-clicked', {
        detail: { serverId, serverName, objectName, nodeId, element }
    }));
}

function emitNodeDoubleClicked(serverId, serverName, objectName, nodeId) {
    document.dispatchEvent(new CustomEvent('uniset:node-double-clicked', {
        detail: { serverId, serverName, objectName, nodeId }
    }));
}
```

- [ ] **Step 2: Wire emissions in core.js and node.js**

В `createOverviewTab` после успешного init:
```js
emitSchemaOpened(serverId, serverName, Object.keys(nodeMap));
```

В `closeOverviewTab`:
```js
emitSchemaClosed(serverId);
```

В LiteGraph canvas click handler (найти где обрабатываются клики — LGraphCanvas имеет `onMouseDown` или аналогичный callback):
```js
canvas.onNodeSelected = function(node) {
    if (node && node.type === 'uniset/process') {
        emitNodeClicked(serverId, serverName, node.title, node.id, null);
    }
};
canvas.onNodeDblClicked = function(node) {
    if (node && node.type === 'uniset/process') {
        emitNodeDoubleClicked(serverId, serverName, node.title, node.id);
    }
};
```

- [ ] **Step 3: Playwright test `tests/overview-events.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';

test('node click emits uniset:node-clicked', async ({ page }) => {
    await page.goto('/');
    // Collect events
    await page.evaluate(() => {
        window._collectedEvents = [];
        document.addEventListener('uniset:node-clicked', (e) => {
            window._collectedEvents.push(e.detail);
        });
    });

    await page.evaluate(() => openSystemOverview('srv-1', 'MockServer'));
    await page.waitForFunction(() => window.overviewInstances && window.overviewInstances['srv-1']);

    // Simulate click on a node (find its canvas position from nodeMap).
    await page.evaluate(() => {
        const inst = window.overviewInstances['srv-1'];
        const firstNode = Object.values(inst.nodeMap)[0];
        if (inst.canvas.onNodeSelected) {
            inst.canvas.onNodeSelected(firstNode);
        }
    });

    const events = await page.evaluate(() => window._collectedEvents);
    expect(events.length).toBe(1);
    expect(events[0].serverId).toBe('srv-1');
    expect(events[0].objectName).toBeTruthy();
});

test('schema-opened fires when overview opens', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
        window._openedEvents = [];
        document.addEventListener('uniset:schema-opened', (e) => {
            window._openedEvents.push(e.detail);
        });
    });

    await page.evaluate(() => openSystemOverview('srv-1', 'MockServer'));
    await page.waitForFunction(() => window._openedEvents.length > 0);

    const events = await page.evaluate(() => window._openedEvents);
    expect(events[0].serverId).toBe('srv-1');
    expect(events[0].objectNames.length).toBeGreaterThan(0);
});
```

- [ ] **Step 4: Run tests**

```bash
cd /home/pv/Projects/uniset-panel/tests
npx playwright test overview-events 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/58-overview-events.js \
        ui/static/js/src/58-overview-core.js \
        ui/static/js/src/58-overview-node.js \
        tests/overview-events.spec.ts
git commit -m "feat(overview): CustomEvent hooks for Spec 4 (node-clicked/dblclicked/schema-*)"
```

---

## Task 7: Hotkeys + help overlay `58-overview-navigation.js`

**Files:**
- Create: `ui/static/js/src/58-overview-navigation.js` (hotkeys portion)
- Create: CSS for help overlay (inline in HTML template or existing overview.css)
- Test: `tests/overview-hotkeys.spec.ts`

- [ ] **Step 1: Create module**

```js
// ============================================================================
// System Overview — navigation (hotkeys + help overlay + minimap + LOD + zoom-around-cursor)
// ============================================================================

const OVERVIEW_HOTKEYS = {
    'f': 'fit',
    '0': 'reset-zoom',
    '+': 'zoom-in',
    '=': 'zoom-in',
    '-': 'zoom-out',
    'Home': 'scroll-origin',
    'v': 'toggle-values',
    'w': 'toggle-wires',
    'm': 'toggle-minimap',
    '/': 'focus-search',
    'Escape': 'clear-highlight',
    '?': 'toggle-help',
};

function attachOverviewHotkeys(serverId) {
    const handler = (e) => {
        // Ignore if focus is in input/textarea
        const t = document.activeElement;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
                  t.isContentEditable)) return;

        const key = e.key;
        const action = OVERVIEW_HOTKEYS[key];
        if (!action) return;
        e.preventDefault();

        const inst = window.overviewInstances && window.overviewInstances[serverId];
        if (!inst) return;

        switch (action) {
            case 'fit':          fitOverviewToScreen(inst); break;
            case 'reset-zoom':   resetOverviewZoom(inst); break;
            case 'zoom-in':      stepOverviewZoom(inst, 1.2); break;
            case 'zoom-out':     stepOverviewZoom(inst, 1/1.2); break;
            case 'scroll-origin': inst.canvas.offset = [0, 0]; inst.canvas.setDirty(true, true); break;
            case 'toggle-values': toggleOverviewValues(inst); break;
            case 'toggle-wires':  toggleOverviewWires(inst); break;
            case 'toggle-minimap': toggleOverviewMinimap(inst); break;
            case 'focus-search':  document.querySelector(`#fb-status-search-${serverId}`)?.focus(); break;
            case 'clear-highlight': clearOverviewHighlight(inst); break;
            case 'toggle-help':   toggleOverviewHelp(); break;
        }
    };
    document.addEventListener('keydown', handler);
    // Save handler so we can remove on closeOverviewTab
    return handler;
}

function fitOverviewToScreen(inst) {
    // Compute bounding box of all nodes, set canvas.scale + offset to fit.
    const nodes = Object.values(inst.nodeMap);
    if (nodes.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
        minX = Math.min(minX, n.pos[0]);
        minY = Math.min(minY, n.pos[1]);
        maxX = Math.max(maxX, n.pos[0] + n.size[0]);
        maxY = Math.max(maxY, n.pos[1] + n.size[1]);
    }
    const pad = 40;
    const w = maxX - minX + 2*pad;
    const h = maxY - minY + 2*pad;
    const cw = inst.canvas.canvas.width;
    const ch = inst.canvas.canvas.height;
    const scale = Math.min(cw / w, ch / h);
    inst.canvas.ds.scale = scale;
    inst.canvas.ds.offset = [-(minX - pad) * scale, -(minY - pad) * scale];
    inst.canvas.setDirty(true, true);
}

function resetOverviewZoom(inst) { inst.canvas.ds.scale = 1; inst.canvas.setDirty(true, true); }
function stepOverviewZoom(inst, factor) { inst.canvas.ds.scale *= factor; inst.canvas.setDirty(true, true); }

function toggleOverviewValues(inst) {
    inst.state.toggles.values = !inst.state.toggles.values;
    document.body.classList.toggle('overview-no-values', !inst.state.toggles.values);
    saveOverviewState(inst.serverId, inst.state);
}
function toggleOverviewWires(inst) {
    inst.state.toggles.wires = !inst.state.toggles.wires;
    document.body.classList.toggle('overview-no-wires', !inst.state.toggles.wires);
    saveOverviewState(inst.serverId, inst.state);
}
function toggleOverviewMinimap(inst) {
    inst.state.toggles.minimap = !inst.state.toggles.minimap;
    // Actual minimap show/hide — see Task 9
    saveOverviewState(inst.serverId, inst.state);
}

function toggleOverviewHelp() {
    const overlay = document.getElementById('overview-help-overlay');
    if (overlay) overlay.classList.toggle('hidden');
}
```

Add HTML for help overlay (в overview template):
```html
<div id="overview-help-overlay" class="hidden">
    <div class="help-content">
        <h3>Hotkeys</h3>
        <table>
            <tr><td><kbd>F</kbd></td><td>Fit to screen</td></tr>
            <tr><td><kbd>0</kbd></td><td>Reset zoom</td></tr>
            <tr><td><kbd>+</kbd> / <kbd>-</kbd></td><td>Zoom in/out</td></tr>
            <tr><td><kbd>Home</kbd></td><td>Scroll to origin</td></tr>
            <tr><td><kbd>V</kbd></td><td>Toggle Values</td></tr>
            <tr><td><kbd>W</kbd></td><td>Toggle Wires</td></tr>
            <tr><td><kbd>M</kbd></td><td>Toggle Minimap</td></tr>
            <tr><td><kbd>/</kbd></td><td>Focus search</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>Clear highlight / close help</td></tr>
            <tr><td><kbd>?</kbd></td><td>Toggle this help</td></tr>
        </table>
        <button onclick="document.getElementById('overview-help-overlay').classList.add('hidden')">Close</button>
    </div>
</div>
```

CSS:
```css
#overview-help-overlay { position: fixed; top: 20%; left: 30%; width: 40%; background: #222; padding: 20px; border-radius: 8px; z-index: 10000; }
#overview-help-overlay.hidden { display: none; }
#overview-help-overlay kbd { background: #444; padding: 2px 6px; border-radius: 3px; }
```

- [ ] **Step 2: Wire `attachOverviewHotkeys(serverId)` from core.js `createOverviewTab`**

Save returned handler in `inst.hotkeyHandler`. Remove on `closeOverviewTab` via `document.removeEventListener('keydown', inst.hotkeyHandler)`.

- [ ] **Step 3: Playwright test `tests/overview-hotkeys.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';

test('pressing ? toggles help overlay', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => openSystemOverview('srv-1', 'MockServer'));
    await page.waitForFunction(() => window.overviewInstances && window.overviewInstances['srv-1']);

    const overlay = page.locator('#overview-help-overlay');
    await expect(overlay).toHaveClass(/hidden/);

    await page.keyboard.press('?');
    await expect(overlay).not.toHaveClass(/hidden/);

    await page.keyboard.press('Escape');
    await expect(overlay).toHaveClass(/hidden/);
});

test('V toggle hides port values', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => openSystemOverview('srv-1', 'MockServer'));
    await page.waitForFunction(() => window.overviewInstances && window.overviewInstances['srv-1']);

    await page.keyboard.press('v');
    const bodyClass = await page.evaluate(() => document.body.className);
    expect(bodyClass).toContain('overview-no-values');
});

test('hotkeys ignored when focus is in input', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => openSystemOverview('srv-1', 'MockServer'));
    await page.waitForFunction(() => window.overviewInstances && window.overviewInstances['srv-1']);

    // Focus search input
    await page.locator('#fb-status-search-srv-1').focus();
    await page.keyboard.press('v');
    // Values NOT toggled
    const bodyClass = await page.evaluate(() => document.body.className);
    expect(bodyClass).not.toContain('overview-no-values');
});
```

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/58-overview-navigation.js \
        ui/templates/  \
        ui/static/css/  \
        ui/static/js/src/58-overview-core.js \
        tests/overview-hotkeys.spec.ts
git commit -m "feat(overview): hotkeys + help overlay"
```

---

## Task 8: Minimap

**Files:**
- Modify: `ui/static/js/src/58-overview-navigation.js` (append minimap functions)
- Modify: HTML/CSS (minimap container)

Logic:
- Canvas 200×150 floating bottom-right.
- Draws simplified rectangles for each node, scaled from actual positions.
- Viewport rectangle overlay, updated on canvas pan/zoom.
- Mouse click/drag within minimap → pan main canvas.

- [ ] **Step 1: Add minimap functions to `58-overview-navigation.js`**

```js
function initOverviewMinimap(inst) {
    const container = document.getElementById(`overview-minimap-${inst.serverId}`);
    if (!container) return;
    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 150;
    container.appendChild(canvas);
    inst.minimap = { canvas, ctx: canvas.getContext('2d') };

    // Redraw on each frame (LiteGraph dirty cycle)
    const redrawLoop = () => {
        if (!inst.minimap) return;
        drawOverviewMinimap(inst);
        requestAnimationFrame(redrawLoop);
    };
    redrawLoop();

    // Click/drag to pan
    canvas.addEventListener('mousedown', (e) => minimapPan(inst, e));
}

function drawOverviewMinimap(inst) {
    const {canvas, ctx} = inst.minimap;
    const nodes = Object.values(inst.nodeMap);
    if (nodes.length === 0) return;

    // Compute global bbox
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
        minX = Math.min(minX, n.pos[0]);
        minY = Math.min(minY, n.pos[1]);
        maxX = Math.max(maxX, n.pos[0] + n.size[0]);
        maxY = Math.max(maxY, n.pos[1] + n.size[1]);
    }
    const w = maxX - minX, h = maxY - minY;
    const scale = Math.min(canvas.width / w, canvas.height / h) * 0.9;
    const offX = (canvas.width - w * scale) / 2 - minX * scale;
    const offY = (canvas.height - h * scale) / 2 - minY * scale;

    // Clear
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Nodes as rects
    ctx.fillStyle = '#5a7b9a';
    for (const n of nodes) {
        ctx.fillRect(n.pos[0]*scale + offX, n.pos[1]*scale + offY,
                     n.size[0]*scale, n.size[1]*scale);
    }

    // Viewport rectangle
    const canvasW = inst.canvas.canvas.width;
    const canvasH = inst.canvas.canvas.height;
    const s = inst.canvas.ds.scale;
    const [ox, oy] = inst.canvas.ds.offset;
    const vx = (-ox/s) * scale + offX;
    const vy = (-oy/s) * scale + offY;
    const vw = (canvasW/s) * scale;
    const vh = (canvasH/s) * scale;
    ctx.strokeStyle = '#f0b040';
    ctx.lineWidth = 2;
    ctx.strokeRect(vx, vy, vw, vh);

    inst.minimap.scale = scale;
    inst.minimap.offX = offX;
    inst.minimap.offY = offY;
}

function minimapPan(inst, evt) {
    const {canvas, scale, offX, offY} = inst.minimap;
    const rect = canvas.getBoundingClientRect();
    const onMove = (e) => {
        const x = (e.clientX - rect.left - offX) / scale;
        const y = (e.clientY - rect.top - offY) / scale;
        const s = inst.canvas.ds.scale;
        inst.canvas.ds.offset = [
            -x * s + inst.canvas.canvas.width/2,
            -y * s + inst.canvas.canvas.height/2
        ];
        inst.canvas.setDirty(true, true);
    };
    onMove(evt);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', () => {
        document.removeEventListener('mousemove', onMove);
    }, { once: true });
}
```

Call `initOverviewMinimap(inst)` from `createOverviewTab` in core.js.

HTML addition:
```html
<div id="overview-minimap-<serverId>" class="overview-minimap"></div>
```
CSS:
```css
.overview-minimap { position: absolute; bottom: 10px; right: 10px; border: 1px solid #444; background: #111; z-index: 100; }
body.overview-minimap-hidden .overview-minimap { display: none; }
```

- [ ] **Step 2: Wire `toggleOverviewMinimap` to set body class**

In `toggleOverviewMinimap(inst)` в predыдущем task:
```js
document.body.classList.toggle('overview-minimap-hidden', !inst.state.toggles.minimap);
```

- [ ] **Step 3: Playwright test**

```typescript
test('minimap renders and click pans canvas', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => openSystemOverview('srv-1', 'MockServer'));
    await page.waitForFunction(() => window.overviewInstances && window.overviewInstances['srv-1']);

    const minimap = page.locator('.overview-minimap');
    await expect(minimap).toBeVisible();

    const initialOffset = await page.evaluate(() => {
        return window.overviewInstances['srv-1'].canvas.ds.offset.slice();
    });

    // Click on minimap
    await minimap.click({ position: { x: 20, y: 20 } });

    const newOffset = await page.evaluate(() => {
        return window.overviewInstances['srv-1'].canvas.ds.offset.slice();
    });
    expect(newOffset[0]).not.toBe(initialOffset[0]);
});
```

- [ ] **Step 4: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/58-overview-navigation.js ui/templates/ ui/static/css/ tests/
git commit -m "feat(overview): floating minimap with viewport rectangle + click-pan"
```

---

## Task 9: Zoom around cursor + LOD

**Files:**
- Modify: `ui/static/js/src/58-overview-navigation.js`
- Modify: CSS (LOD classes)

- [ ] **Step 1: Wire `Ctrl+wheel` zoom-around-cursor**

In `attachOverviewHotkeys` или в `initOverviewGraph`:
```js
inst.canvas.canvas.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const rect = inst.canvas.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const s = inst.canvas.ds.scale;
    // World coords under cursor
    const wx = (cx - inst.canvas.ds.offset[0]) / s;
    const wy = (cy - inst.canvas.ds.offset[1]) / s;
    const factor = e.deltaY < 0 ? 1.1 : 1/1.1;
    const newS = Math.max(0.1, Math.min(5, s * factor));
    inst.canvas.ds.scale = newS;
    inst.canvas.ds.offset = [cx - wx * newS, cy - wy * newS];
    inst.canvas.setDirty(true, true);
    applyLOD(inst);
    saveOverviewState(inst.serverId, inst.state);
});
```

- [ ] **Step 2: LOD class application**

```js
function applyLOD(inst) {
    const s = inst.canvas.ds.scale;
    document.body.classList.toggle('overview-lod-low', s < 0.5);
    document.body.classList.toggle('overview-lod-min', s < 0.25);
}
```

CSS:
```css
body.overview-lod-low .port-label { display: none; }
body.overview-lod-min .uniset-process-node-details { display: none; }
```

LiteGraph's `UniSetProcessNode.onDrawForeground` reads body class and skips drawing port values/labels when LOD applies. Modify `58-overview-node.js`:

```js
UniSetProcessNode.prototype.onDrawForeground = function(ctx) {
    if (document.body.classList.contains('overview-lod-min')) return;
    // existing render ...
};
```

- [ ] **Step 3: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/58-overview-navigation.js \
        ui/static/js/src/58-overview-node.js \
        ui/static/css/
git commit -m "feat(overview): zoom-around-cursor (Ctrl+wheel) + LOD at low zoom"
```

---

## Task 10: Click-to-highlight `58-overview-highlight.js`

**Files:**
- Create: `ui/static/js/src/58-overview-highlight.js`
- Modify: CSS (hi-* classes)
- Test: `tests/overview-highlight.spec.ts`

- [ ] **Step 1: Create module**

```js
// ============================================================================
// System Overview — click-to-highlight edges + neighbors
// ============================================================================

function applyOverviewHighlight(inst, clickedNode) {
    const edges = inst.data.edges || [];
    const neighbors = new Set();
    const hiEdges = new Set();

    for (const e of edges) {
        if (e.fromNode === clickedNode.title || e.toNode === clickedNode.title) {
            hiEdges.add(e.fromNode + '->' + e.toNode);
            neighbors.add(e.fromNode);
            neighbors.add(e.toNode);
        }
    }

    // Mark nodes
    for (const n of Object.values(inst.nodeMap)) {
        n.__hi = neighbors.has(n.title);
        n.__dim = !n.__hi && n.title !== clickedNode.title;
    }
    inst._hiEdges = hiEdges;
    inst._hiActive = true;
    inst.canvas.setDirty(true, true);
}

function clearOverviewHighlight(inst) {
    if (!inst._hiActive) return;
    for (const n of Object.values(inst.nodeMap)) {
        delete n.__hi; delete n.__dim;
    }
    inst._hiEdges = new Set();
    inst._hiActive = false;
    inst.canvas.setDirty(true, true);
}

// Hook into UniSetProcessNode render to apply hi/dim styling via color changes.
// In 58-overview-node.js render:
//    if (this.__dim) ctx.globalAlpha = 0.3;
//    if (this.__hi) { /* highlight color */ }
```

Modify node click handler to call `applyOverviewHighlight`:

```js
// In core.js: canvas.onNodeSelected handler
canvas.onNodeSelected = function(node) {
    if (node && node.type === 'uniset/process') {
        applyOverviewHighlight(inst, node);
        emitNodeClicked(...);
    }
};
```

Add Escape key handler in navigation.js `clear-highlight` — already done in Task 7, wire it:
```js
case 'clear-highlight': clearOverviewHighlight(inst); break;
```

- [ ] **Step 2: Double-click edge → signal info**

Add helper in highlight.js:
```js
function attachEdgeDblClick(inst) {
    inst.canvas.canvas.addEventListener('dblclick', (e) => {
        const edge = findEdgeAtCursor(inst, e);
        if (!edge) return;
        showEdgeInfoTooltip(inst, edge, e.clientX, e.clientY);
    });
}

function findEdgeAtCursor(inst, event) {
    // Walk edges, check hit-testing. LiteGraph doesn't expose this directly;
    // use a simple impl: iterate links in graph and test distance from cursor
    // (in world coords) to link line.
    // Returns edge data {fromNode, fromPort, toNode, toPort, value} or null.
    // For MVP: use LGraphCanvas.processMouseDblclick internals if available;
    // fallback: return null, feature deferred.
    return null; // TODO replace with actual hit-test when sound approach verified
}
```

NOTE: Edge hit-testing в LiteGraph нетривиально. Для MVP Спека 3 — базовая реализация может быть «empty», с полной реализацией в Спеке 4. Добавить TODO в header модуля: «двойной клик по рёбрам — deferred до Спека 4».

**Revised decision for MVP**: skip edge-dblclick для Спека 3. Отложить. Убрать `attachEdgeDblClick` в комментарий.

- [ ] **Step 3: CSS**

```css
.litegraph-node.hi { outline: 2px solid #f0b040 !important; }
.litegraph-node.dim { opacity: 0.3 !important; }
```

Since LiteGraph renders via canvas (not DOM), CSS классы не применимы напрямую к нодам. Вместо этого — render logic в `UniSetProcessNode.onDrawForeground` читает `this.__hi` / `this.__dim`.

Modify `58-overview-node.js`:
```js
UniSetProcessNode.prototype.onDrawForeground = function(ctx) {
    if (document.body.classList.contains('overview-lod-min')) return;

    if (this.__dim) { ctx.globalAlpha = 0.3; }
    // existing render ...
    if (this.__dim) { ctx.globalAlpha = 1; }
};
```

Edge highlighting — LiteGraph uses `connection` colors. Set via `node.link_color` или через `inst.canvas.drawConnections` override. Простое решение: не highlighting edges в canvas, только dim неsвязанных нод. Комментировать что edge-highlight — deferred.

- [ ] **Step 4: Vitest unit — applyOverviewHighlight pure logic**

```js
// tests/unit/overview-highlight.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import { loadSrc } from './helpers/load-src.js';

beforeAll(() => {
    loadSrc('ui/static/js/src/58-overview-highlight.js');
});

function makeInst() {
    const nodeMap = {
        A: { title: 'A' },
        B: { title: 'B' },
        C: { title: 'C' },
        D: { title: 'D' },
    };
    return {
        nodeMap,
        data: { edges: [
            { fromNode: 'A', toNode: 'B' },
            { fromNode: 'B', toNode: 'C' },
            { fromNode: 'A', toNode: 'D' },
        ]},
        canvas: { setDirty: () => {} },
        _hiActive: false,
        _hiEdges: new Set(),
    };
}

describe('applyOverviewHighlight', () => {
    it('marks neighbors as __hi and others as __dim', () => {
        const inst = makeInst();
        applyOverviewHighlight(inst, inst.nodeMap.A);
        expect(inst.nodeMap.B.__hi).toBe(true);
        expect(inst.nodeMap.D.__hi).toBe(true);
        expect(inst.nodeMap.C.__dim).toBe(true);
        expect(inst._hiActive).toBe(true);
        expect(inst._hiEdges.has('A->B')).toBe(true);
        expect(inst._hiEdges.has('A->D')).toBe(true);
        expect(inst._hiEdges.has('B->C')).toBe(false);
    });

    it('does not mark clicked node as __dim', () => {
        const inst = makeInst();
        applyOverviewHighlight(inst, inst.nodeMap.A);
        expect(inst.nodeMap.A.__dim).toBeFalsy();
    });

    it('handles node with no edges (isolated)', () => {
        const inst = makeInst();
        inst.nodeMap.Z = { title: 'Z' };
        applyOverviewHighlight(inst, inst.nodeMap.Z);
        expect(inst._hiActive).toBe(true);
        expect(inst._hiEdges.size).toBe(0);
        expect(inst.nodeMap.A.__dim).toBe(true);
    });
});

describe('clearOverviewHighlight', () => {
    it('restores all nodes and clears set', () => {
        const inst = makeInst();
        applyOverviewHighlight(inst, inst.nodeMap.A);
        clearOverviewHighlight(inst);
        for (const n of Object.values(inst.nodeMap)) {
            expect(n.__hi).toBeUndefined();
            expect(n.__dim).toBeUndefined();
        }
        expect(inst._hiActive).toBe(false);
        expect(inst._hiEdges.size).toBe(0);
    });

    it('noop when not active', () => {
        const inst = makeInst();
        expect(() => clearOverviewHighlight(inst)).not.toThrow();
    });
});
```

Run:
```bash
cd /home/pv/Projects/uniset-panel/tests
npm run test:unit -- overview-highlight 2>&1 | tail -10
```

Expected: 5 PASS.

- [ ] **Step 5: Playwright test**

```typescript
test('clicking a node highlights its neighbors', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => openSystemOverview('srv-1', 'MockServer'));
    await page.waitForFunction(() => window.overviewInstances && window.overviewInstances['srv-1']);

    await page.evaluate(() => {
        const inst = window.overviewInstances['srv-1'];
        const firstNode = Object.values(inst.nodeMap)[0];
        applyOverviewHighlight(inst, firstNode);
    });

    const state = await page.evaluate(() => {
        const inst = window.overviewInstances['srv-1'];
        return {
            active: inst._hiActive,
            dimCount: Object.values(inst.nodeMap).filter(n => n.__dim).length,
        };
    });
    expect(state.active).toBe(true);
    expect(state.dimCount).toBeGreaterThan(0);

    await page.keyboard.press('Escape');
    const clearedActive = await page.evaluate(() => window.overviewInstances['srv-1']._hiActive);
    expect(clearedActive).toBe(false);
});
```

- [ ] **Step 6: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/58-overview-highlight.js \
        ui/static/js/src/58-overview-node.js \
        ui/static/js/src/58-overview-core.js \
        ui/static/js/src/58-overview-navigation.js \
        tests/unit/overview-highlight.test.js \
        tests/overview-highlight.spec.ts
git commit -m "feat(overview): click-to-highlight node neighbors + Esc to clear"
```

---

## Task 11: FB Status panel `58-overview-fb-status.js`

**Files:**
- Create: `ui/static/js/src/58-overview-fb-status.js`
- Modify: HTML/CSS (panel container, styling)
- Test: `tests/overview-fb-status.spec.ts`

- [ ] **Step 1: Create module**

```js
// ============================================================================
// System Overview — FB Status panel (replaces old palette)
// ============================================================================

function initFBStatusPanel(inst) {
    const container = document.getElementById(`fb-status-panel-${inst.serverId}`);
    if (!container) return;

    container.innerHTML = `
        <h3>FB Status (<span class="fb-count">0</span>)</h3>
        <input type="text" id="fb-status-search-${inst.serverId}" placeholder="Filter (type :x)"/>
        <div class="fb-list"></div>
    `;

    const searchInput = container.querySelector(`#fb-status-search-${inst.serverId}`);
    const list = container.querySelector('.fb-list');

    searchInput.value = inst.state.searchQuery || '';
    searchInput.addEventListener('input', (e) => {
        inst.state.searchQuery = e.target.value;
        renderFBStatusList(inst);
        saveOverviewState(inst.serverId, inst.state);
    });

    inst.fbStatus = { container, searchInput, list };
    renderFBStatusList(inst);
}

function renderFBStatusList(inst) {
    const {list} = inst.fbStatus;
    const query = (inst.state.searchQuery || '').toLowerCase();
    const typeFilter = query.startsWith(':') ? query.slice(1) : null;
    const nameFilter = typeFilter ? null : query;

    const nodes = Object.values(inst.nodeMap);
    const filtered = nodes.filter(n => {
        if (typeFilter) return (n.__type || '').toLowerCase().includes(typeFilter);
        if (nameFilter) return n.title.toLowerCase().includes(nameFilter);
        return true;
    });

    list.innerHTML = filtered.length === 0
        ? '<div class="fb-empty">No matches</div>'
        : filtered.map(n => `
            <div class="fb-card" data-name="${n.title}">
                <span class="fb-name">${n.title}</span>
                ${n.__type ? `<span class="fb-type">(${n.__type})</span>` : ''}
            </div>
        `).join('');

    list.querySelectorAll('.fb-card').forEach(card => {
        card.addEventListener('click', () => {
            const name = card.getAttribute('data-name');
            const node = inst.nodeMap[name];
            if (node) {
                // Scroll to node + highlight
                applyOverviewHighlight(inst, node);
                scrollToOverviewNode(inst, node);
            }
        });
        card.addEventListener('dblclick', () => {
            const name = card.getAttribute('data-name');
            emitNodeDoubleClicked(inst.serverId, inst.serverName, name, null);
        });
    });

    inst.fbStatus.container.querySelector('.fb-count').textContent = filtered.length;
}

function scrollToOverviewNode(inst, node) {
    const s = inst.canvas.ds.scale;
    inst.canvas.ds.offset = [
        -node.pos[0] * s + inst.canvas.canvas.width / 2,
        -node.pos[1] * s + inst.canvas.canvas.height / 2,
    ];
    inst.canvas.setDirty(true, true);
}
```

HTML (в overview template):
```html
<div id="fb-status-panel-<serverId>" class="fb-status-panel"></div>
```

CSS:
```css
.fb-status-panel { position: absolute; right: 220px; top: 10px; width: 240px; max-height: 80vh; overflow-y: auto; background: #1a1a24; border: 1px solid #333; padding: 10px; }
.fb-status-panel .fb-card { padding: 6px 8px; border-bottom: 1px solid #2a2a34; cursor: pointer; }
.fb-status-panel .fb-card:hover { background: #252530; }
.fb-status-panel .fb-card .fb-type { color: #888; margin-left: 6px; font-size: 0.85em; }
.fb-status-panel .fb-empty { color: #666; padding: 8px; }
```

- [ ] **Step 2: Wire in core.js**

After `createOverviewTab` init:
```js
initFBStatusPanel(overviewInstances[serverId]);
```

- [ ] **Step 3: Playwright test**

```typescript
test('FB Status panel shows nodes and filters by name', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => openSystemOverview('srv-1', 'MockServer'));
    await page.waitForFunction(() => window.overviewInstances && window.overviewInstances['srv-1']);

    const panel = page.locator('.fb-status-panel');
    await expect(panel).toBeVisible();

    const initialCount = await panel.locator('.fb-card').count();
    expect(initialCount).toBeGreaterThan(0);

    const search = page.locator('#fb-status-search-srv-1');
    await search.fill('nonexistent');
    await expect(panel.locator('.fb-empty')).toBeVisible();

    await search.fill('');
    const restored = await panel.locator('.fb-card').count();
    expect(restored).toBe(initialCount);
});

test('FB Status card click highlights node on canvas', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => openSystemOverview('srv-1', 'MockServer'));
    await page.waitForFunction(() => window.overviewInstances && window.overviewInstances['srv-1']);

    const firstCard = page.locator('.fb-status-panel .fb-card').first();
    await firstCard.click();

    const active = await page.evaluate(() => window.overviewInstances['srv-1']._hiActive);
    expect(active).toBe(true);
});
```

- [ ] **Step 4: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/58-overview-fb-status.js \
        ui/static/js/src/58-overview-core.js \
        ui/templates/ ui/static/css/ \
        tests/overview-fb-status.spec.ts
git commit -m "feat(overview): FB Status panel replacing object palette"
```

---

## Task 12: trace SSE API `58-overview-trace.js`

**Files:**
- Create: `ui/static/js/src/58-overview-trace.js`
- Test: `tests/overview-trace.spec.ts`

- [ ] **Step 1: Create module**

```js
// ============================================================================
// System Overview — trace SSE subscription API (used by Spec 4 detail panel)
// ============================================================================

window.UnisetOverview = window.UnisetOverview || {};

window.UnisetOverview.trace = {
    _sources: {}, // token → EventSource

    subscribe(serverId, objectName, intervalMS, onBatch) {
        const token = `${serverId}:${objectName}:${Date.now()}:${Math.random().toString(36).slice(2,8)}`;
        const url = `/api/trace/events?object=${encodeURIComponent(objectName)}`
                  + `&server=${encodeURIComponent(serverId)}`
                  + `&interval=${intervalMS || 500}`;
        const es = new EventSource(url);
        es.addEventListener('trace', (e) => {
            try { onBatch(JSON.parse(e.data)); }
            catch (err) { console.warn('[trace] parse failed:', err); }
        });
        es.onerror = (err) => {
            console.warn('[trace] SSE error:', err);
        };
        this._sources[token] = es;
        return token;
    },

    unsubscribe(token) {
        const es = this._sources[token];
        if (es) { es.close(); delete this._sources[token]; }
    },

    async enable(serverId, objectName, size) {
        const url = `/api/trace/servers/${encodeURIComponent(serverId)}`
                  + `/objects/${encodeURIComponent(objectName)}`
                  + `/enable?size=${size}`;
        const resp = await fetch(url, { method: 'POST' });
        return { status: resp.status, body: await resp.json().catch(() => null) };
    },

    async disable(serverId, objectName) {
        const url = `/api/trace/servers/${encodeURIComponent(serverId)}`
                  + `/objects/${encodeURIComponent(objectName)}`
                  + `/disable`;
        const resp = await fetch(url, { method: 'POST' });
        return { status: resp.status, body: await resp.json().catch(() => null) };
    },

    _closeAll() {
        for (const t of Object.keys(this._sources)) this.unsubscribe(t);
    },
};
```

- [ ] **Step 2: Vitest unit — subscribe/unsubscribe lifecycle with mocked EventSource**

```js
// tests/unit/overview-trace.test.js
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadSrc } from './helpers/load-src.js';

// Mock EventSource до загрузки модуля
class FakeEventSource {
    constructor(url) {
        this.url = url;
        this.closed = false;
        this._listeners = {};
        FakeEventSource.instances.push(this);
    }
    addEventListener(type, fn) { this._listeners[type] = fn; }
    close() { this.closed = true; }
    // helper для теста: эмулировать приход batch
    _emit(type, data) {
        const fn = this._listeners[type];
        if (fn) fn({ data: JSON.stringify(data) });
    }
}
FakeEventSource.instances = [];

beforeAll(() => {
    globalThis.EventSource = FakeEventSource;
    // fetch stub для enable/disable
    globalThis.fetch = vi.fn(async () => ({
        status: 200,
        json: async () => ({ ok: true }),
    }));
    loadSrc('ui/static/js/src/58-overview-trace.js');
});

beforeEach(() => {
    FakeEventSource.instances = [];
    window.UnisetOverview.trace._sources = {};
});

describe('UnisetOverview.trace.subscribe', () => {
    it('returns a unique token and creates EventSource', () => {
        const token = window.UnisetOverview.trace.subscribe('srv-1', 'ObjA', 500, () => {});
        expect(typeof token).toBe('string');
        expect(FakeEventSource.instances.length).toBe(1);
        expect(FakeEventSource.instances[0].url).toContain('object=ObjA');
        expect(FakeEventSource.instances[0].url).toContain('server=srv-1');
        expect(FakeEventSource.instances[0].url).toContain('interval=500');
    });

    it('invokes callback when trace batch arrives', () => {
        let received = null;
        window.UnisetOverview.trace.subscribe('srv-1', 'ObjA', 500, (b) => { received = b; });
        FakeEventSource.instances[0]._emit('trace', { batch: [1, 2, 3] });
        expect(received).toEqual({ batch: [1, 2, 3] });
    });

    it('tolerates malformed JSON in batch', () => {
        let called = false;
        window.UnisetOverview.trace.subscribe('srv-1', 'ObjA', 500, () => { called = true; });
        const es = FakeEventSource.instances[0];
        // Напрямую — с невалидным data
        es._listeners['trace']({ data: 'not-json{{' });
        expect(called).toBe(false); // onBatch не позван, но и не throw
    });

    it('generates distinct tokens for same server+object', () => {
        const t1 = window.UnisetOverview.trace.subscribe('srv-1', 'ObjA', 500, () => {});
        const t2 = window.UnisetOverview.trace.subscribe('srv-1', 'ObjA', 500, () => {});
        expect(t1).not.toBe(t2);
    });
});

describe('UnisetOverview.trace.unsubscribe', () => {
    it('closes the EventSource and removes token', () => {
        const token = window.UnisetOverview.trace.subscribe('srv-1', 'ObjA', 500, () => {});
        const es = FakeEventSource.instances[0];
        window.UnisetOverview.trace.unsubscribe(token);
        expect(es.closed).toBe(true);
        expect(window.UnisetOverview.trace._sources[token]).toBeUndefined();
    });

    it('noop for unknown token', () => {
        expect(() => window.UnisetOverview.trace.unsubscribe('bogus')).not.toThrow();
    });
});

describe('UnisetOverview.trace.enable/disable', () => {
    it('enable calls POST with size', async () => {
        await window.UnisetOverview.trace.enable('srv-1', 'ObjA', 256);
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/enable?size=256'),
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('disable calls POST', async () => {
        await window.UnisetOverview.trace.disable('srv-1', 'ObjA');
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/disable'),
            expect.objectContaining({ method: 'POST' }),
        );
    });
});

describe('UnisetOverview.trace._closeAll', () => {
    it('closes every subscription', () => {
        const t1 = window.UnisetOverview.trace.subscribe('srv-1', 'A', 500, () => {});
        const t2 = window.UnisetOverview.trace.subscribe('srv-1', 'B', 500, () => {});
        const instances = [...FakeEventSource.instances];
        window.UnisetOverview.trace._closeAll();
        expect(instances[0].closed).toBe(true);
        expect(instances[1].closed).toBe(true);
        expect(Object.keys(window.UnisetOverview.trace._sources).length).toBe(0);
    });
});
```

Run:
```bash
cd /home/pv/Projects/uniset-panel/tests
npm run test:unit -- overview-trace 2>&1 | tail -15
```

Expected: 9 PASS.

- [ ] **Step 3: Playwright test with mock-server**

Assuming mock-server stubs `/api/trace/events`:

```typescript
test('UnisetOverview.trace subscribe/unsubscribe opens and closes SSE', async ({ page }) => {
    await page.goto('/');

    const token = await page.evaluate(() => {
        return new Promise((resolve) => {
            const t = window.UnisetOverview.trace.subscribe('srv-1', 'TestObj', 500, (batch) => {
                window._receivedTrace = batch;
            });
            setTimeout(() => resolve(t), 100);
        });
    });

    expect(token).toBeTruthy();

    await page.evaluate((t) => window.UnisetOverview.trace.unsubscribe(t), token);

    const still = await page.evaluate((t) => !!window.UnisetOverview.trace._sources[t], token);
    expect(still).toBe(false);
});
```

Note: trace может не стрелять реальные events, если mock-server не stub'ит; для MVP Спека 3 проверка что subscribe/unsubscribe корректно управляют EventSource — достаточно (unit-тесты уже покрыли batch-parse / mock-server ловит только integration).

- [ ] **Step 4: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/58-overview-trace.js \
        tests/unit/overview-trace.test.js \
        tests/overview-trace.spec.ts
git commit -m "feat(overview): trace SSE subscription API for Spec 4"
```

---

## Task 13: Replace text-labels with lines

**Files:**
- Modify: `ui/static/js/src/58-overview-node.js` (remove or conditional connection labels)
- Modify: `ui/static/js/src/58-overview-core.js` (stop calling populatePortConnections unconditionally)

В текущем `onDrawForeground` рисуются `formatPortConnectionLabel('←', conns)`. Spec 3 decision: заменить на линии (LiteGraph сам рисует links между slots). Conditional labels только при `zoom < 0.5` для ориентации.

- [ ] **Step 1: Modify `onDrawForeground` — conditional labels**

```js
// Skip connection labels unless at low zoom
const scale = ctx.ds ? ctx.ds.scale : 1;
const showConnLabels = scale < 0.5 && scale >= 0.25;
if (showConnLabels) {
    // existing formatPortConnectionLabel code path
}
// At scale >= 0.5, rely on LiteGraph's actual connection lines.
```

LiteGraph draws connections natively between slots — поэтому линии появятся автоматически без дополнительного кода, если добавить edges как actual LiteGraph link'и в `buildOverviewGraph` (core.js).

- [ ] **Step 2: Verify buildOverviewGraph creates actual LiteGraph links**

Read current `buildOverviewGraph` — возможно `connect(fromNode, fromSlot, toNode, toSlot)` не вызывается (только text labels сохранены в `portConnections`). Если так — добавить вызовы:

```js
// In buildOverviewGraph after nodes created:
for (const edge of data.edges) {
    const from = nodeMap[edge.fromNode];
    const to = nodeMap[edge.toNode];
    if (!from || !to) continue;
    const fromSlot = findSlotIndex(from.outputs, edge.fromPort);
    const toSlot = findSlotIndex(to.inputs, edge.toPort);
    if (fromSlot >= 0 && toSlot >= 0) {
        from.connect(fromSlot, to, toSlot);
    }
}
```

- [ ] **Step 3: E2E smoke — связи видны**

Open overview → проверить что канвас показывает линии между нодами.

- [ ] **Step 4: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/58-overview-node.js ui/static/js/src/58-overview-core.js
git commit -m "feat(overview): replace text-label connections with actual lines (LiteGraph links)"
```

---

## Task 14: View dropdown + SVG export

**Files:**
- Modify: `ui/static/js/src/58-overview-navigation.js` (view dropdown + SVG export)
- Modify: HTML template

- [ ] **Step 1: View dropdown**

HTML:
```html
<div class="overview-toolbar">
    <button id="overview-view-btn">View ▾</button>
    <div id="overview-view-menu" class="hidden">
        <label><input type="checkbox" data-toggle="wires"/> Wires</label>
        <label><input type="checkbox" data-toggle="values"/> Values</label>
        <label><input type="checkbox" data-toggle="minimap"/> Minimap</label>
    </div>
    <button id="overview-svg-export">SVG</button>
</div>
```

JS в navigation.js:
```js
function initViewDropdown(inst) {
    const btn = document.getElementById('overview-view-btn');
    const menu = document.getElementById('overview-view-menu');
    if (!btn || !menu) return;

    // Sync checkbox states with inst.state.toggles
    menu.querySelectorAll('[data-toggle]').forEach(cb => {
        const key = cb.getAttribute('data-toggle');
        cb.checked = !!inst.state.toggles[key];
        cb.addEventListener('change', () => {
            inst.state.toggles[key] = cb.checked;
            if (key === 'wires') toggleOverviewWires(inst);
            if (key === 'values') toggleOverviewValues(inst);
            if (key === 'minimap') toggleOverviewMinimap(inst);
        });
    });

    btn.addEventListener('click', () => menu.classList.toggle('hidden'));
    document.addEventListener('click', (e) => {
        if (!btn.contains(e.target) && !menu.contains(e.target)) menu.classList.add('hidden');
    });
}
```

- [ ] **Step 2: SVG export**

```js
function exportOverviewSVG(inst) {
    const nodes = Object.values(inst.nodeMap);
    if (nodes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
        minX = Math.min(minX, n.pos[0]);
        minY = Math.min(minY, n.pos[1]);
        maxX = Math.max(maxX, n.pos[0] + n.size[0]);
        maxY = Math.max(maxY, n.pos[1] + n.size[1]);
    }
    const pad = 20;
    const w = maxX - minX + 2*pad;
    const h = maxY - minY + 2*pad;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
    svg += `<rect width="100%" height="100%" fill="#1a1a1a"/>`;

    // Edges
    for (const e of inst.data.edges || []) {
        const from = inst.nodeMap[e.fromNode];
        const to = inst.nodeMap[e.toNode];
        if (!from || !to) continue;
        const fx = from.pos[0] + from.size[0] - minX + pad;
        const fy = from.pos[1] + from.size[1]/2 - minY + pad;
        const tx = to.pos[0] - minX + pad;
        const ty = to.pos[1] + to.size[1]/2 - minY + pad;
        svg += `<path d="M${fx},${fy} C${fx+40},${fy} ${tx-40},${ty} ${tx},${ty}" stroke="#555" fill="none"/>`;
    }

    // Nodes
    for (const n of nodes) {
        const x = n.pos[0] - minX + pad;
        const y = n.pos[1] - minY + pad;
        svg += `<g>`;
        svg += `<rect x="${x}" y="${y}" width="${n.size[0]}" height="${n.size[1]}" fill="#131320" stroke="#1c2836"/>`;
        svg += `<text x="${x+10}" y="${y+16}" fill="#fff" font-family="sans-serif" font-size="12">${n.title}</text>`;
        svg += `</g>`;
    }

    svg += '</svg>';

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `overview-${inst.serverId}.svg`;
    a.click();
    URL.revokeObjectURL(url);
}
```

Wire в View dropdown init:
```js
const svgBtn = document.getElementById('overview-svg-export');
if (svgBtn) svgBtn.addEventListener('click', () => exportOverviewSVG(inst));
```

- [ ] **Step 3: Playwright test (optional, SVG export is best-effort)**

```typescript
test('SVG export produces valid svg blob', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => openSystemOverview('srv-1', 'MockServer'));
    await page.waitForFunction(() => window.overviewInstances && window.overviewInstances['srv-1']);

    const svgContent = await page.evaluate(() => {
        // Stub download to capture content instead
        let captured = null;
        const origBlob = window.Blob;
        window.Blob = function(parts) {
            captured = parts[0];
            return new origBlob(parts, { type: 'image/svg+xml' });
        };
        exportOverviewSVG(window.overviewInstances['srv-1']);
        window.Blob = origBlob;
        return captured;
    });

    expect(svgContent).toContain('<svg');
    expect(svgContent).toContain('</svg>');
});
```

- [ ] **Step 4: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/58-overview-navigation.js ui/templates/ tests/
git commit -m "feat(overview): View dropdown (unified toggles) + SVG export"
```

---

## Task 15: Cleanup — delete `58-system-overview.js`, update HTML

**Files:**
- Delete: `ui/static/js/src/58-system-overview.js`
- Modify: overview HTML template (remove old palette, ensure all new modules loaded)

- [ ] **Step 1: Verify old file empty / duplicates modules**

```bash
cd /home/pv/Projects/uniset-panel
wc -l ui/static/js/src/58-system-overview.js
grep -c "^function\|^const" ui/static/js/src/58-system-overview.js
```

Expected: minimal or empty content (after Tasks 2-11 extracted everything).

- [ ] **Step 2: Delete old file**

```bash
rm ui/static/js/src/58-system-overview.js
```

- [ ] **Step 3: Update HTML template**

Ensure all new scripts loaded in dependency order:
```html
<script src="/static/js/vendor/litegraph.js"></script>
<script src="/static/js/vendor/dagre.min.js"></script>
<script src="/static/js/src/58-overview-events.js"></script>
<script src="/static/js/src/58-overview-state.js"></script>
<script src="/static/js/src/58-overview-node.js"></script>
<script src="/static/js/src/58-overview-layout.js"></script>
<script src="/static/js/src/58-overview-highlight.js"></script>
<script src="/static/js/src/58-overview-navigation.js"></script>
<script src="/static/js/src/58-overview-fb-status.js"></script>
<script src="/static/js/src/58-overview-trace.js"></script>
<script src="/static/js/src/58-overview-core.js"></script>
```

Remove old palette HTML block.

- [ ] **Step 4: Full test run (unit + E2E)**

```bash
cd /home/pv/Projects/uniset-panel/tests
npm run test:unit 2>&1 | tail -15
npx playwright test 2>&1 | tail -20
```

Expected: all Vitest unit tests pass (~25+ tests), Spec 3 E2E tests pass, existing tests not regressed.

- [ ] **Step 5: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/ tests/
git commit -m "refactor(overview): cleanup — delete 58-system-overview.js, update template"
```

---

## Self-review

**Spec coverage:**
- ✅ Vitest + jsdom infrastructure (Task 1).
- ✅ 9-file decomposition (Tasks 2-11).
- ✅ Sugiyama layout via dagre + unit tests (Task 4).
- ✅ Persistent state + unit tests (Task 5).
- ✅ CustomEvent contract (Task 6).
- ✅ Hotkeys + help (Task 7).
- ✅ Minimap (Task 8).
- ✅ Zoom-around-cursor + LOD (Task 9).
- ✅ Click-to-highlight + unit tests (Task 10).
- ✅ FB Status panel (Task 11).
- ✅ Trace SSE API + unit tests (Task 12).
- ✅ Replace text-labels with lines (Task 13).
- ✅ View dropdown + SVG export (Task 14).
- ✅ Cleanup (Task 15).
- ⚠️ Double-click edge → signal info — **DEFERRED** (LiteGraph edge hit-test нетривиален, в Спеке 3 MVP пропускается; добавится в 3.5 или 4).

**Test coverage:**
- Unit (Vitest/jsdom): `state.js`, `layout.js`, `highlight.js`, `trace.js` — 4 модуля pure-logic.
- Integration (Playwright): все 11 фичей + smoke во всех тасках.

**Placeholder scan:**
- Task 10 содержит явное `TODO replace with actual hit-test` для edge-dblclick — это осознанный deferred, задокументирован с рекомендацией.
- Других TBD/TODO нет.

**Type consistency:**
- `overviewInstances`, `inst.state`, `inst.canvas`, `inst.nodeMap`, `inst.data` — использование согласовано через все модули.
- CustomEvent detail schema (serverId, serverName, objectName, nodeId) — одинаковая во всех emits.
- `inst.state.toggles.{wires,values,minimap,groupBackgrounds}` — same structure везде.

---

## Dependencies

```
1 (branch + vitest infra + baseline)
  ↓
2 (extract node) → 3 (extract core) ─┐
                                      ↓
                                      4 (layout + dagre)
                                      ↓
                                      5 (state) ← parallel ─┐
                                      6 (events) ←──────────┤
                                      7 (hotkeys + help)    │
                                      ↓                     │
                                      8 (minimap)           │
                                      ↓                     │
                                      9 (zoom-cursor + LOD) │
                                      ↓                     │
                                      10 (highlight)        │
                                      ↓                     │
                                      11 (FB Status)        │
                                      ↓                     │
                                      12 (trace API) ───────┤
                                      ↓                     │
                                      13 (lines vs labels) ─┘
                                      ↓
                                      14 (view dropdown + SVG)
                                      ↓
                                      15 (cleanup)
```

Tasks 5 (state) и 6 (events) могут параллельно после task 3. Остальные преимущественно sequential.

---

## Known unknowns / risks

- **LiteGraph internals** (`canvas.ds.scale/offset`, `canvas.onNodeSelected`) — точные имена могут отличаться от тех, что использованы выше. Implementer проверит во время Task 6-9.
- **Overview HTML template location** — в проекте нужно найти где `#overview-tab` рендерится. Implementer сам разберётся.
- **dagre vendor fetch** из jsdelivr — если блокировано, альтернатива `npm install dagre` через `tests/package.json` и копирование в vendor. Для unit-тестов `dagre` всё равно ставится как devDep.
- **dagre версия vendor ≠ npm** — vendor `dagre.min.js` и `tests/node_modules/dagre` должны совпадать по major/minor. Закрепили `0.8.5` в обоих местах.
- **SVG export** — edge drawing — bezier curves approximation; может не идеально соответствовать canvas-render.
- **loadSrc helper** — исполнение vanilla-исходника через `new Function` в jsdom-контексте не эквивалентно `<script src>` (нет `document.currentScript`, порядок загрузки зависимостей ручной). Если модуль зависит от другого — загружать оба в `beforeAll`. На практике pure-logic модули (state/layout/highlight/trace) самодостаточны.
- **Стоимость Vitest setup** — одна задача (~30 мин implementer time) окупает 4 pure-logic модуля. Если implementer сталкивается с проблемами в Task 1 (Vitest несовместим с проектным Node, jsdom не поднимается) — отложить unit-тесты, оставить `tests/unit/smoke.test.js` как заглушку, фичи делать через Playwright, вернуться к Vitest в отдельном следующем PR. Не блокируем Spec 3 из-за инфраструктуры.
