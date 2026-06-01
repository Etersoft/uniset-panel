# StateLabelWidget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать `StateLabelWidget` — passive dashboard widget с маппингом значения датчика на text+fg+bg+blink через список диапазонов (first-match wins, открытые границы).

**Architecture:** Чистая module-level функция `resolveStateLabel(value, states, fallbackCfg, prevState)` отдельно от widget-класса (testable без DOM). Widget — `class StateLabelWidget extends DashboardWidget` (passive). State list editor — новые helpers в `06-utils.js` (по аналогии с `renderColorZonesEditor`). Reorder через существующий CSS class `.section-move-btn`.

**Tech Stack:** Vanilla JS (concat-built), Vitest+jsdom unit tests, Playwright E2E (docker).

**Spec:** [docs/superpowers/specs/2026-06-01-state-label-widget-design.md](../specs/2026-06-01-state-label-widget-design.md)

---

## File Structure

**New:**
- `ui/static/js/src/61-dashboard-widget-state-label.js` — `StateLabelWidget` class + `resolveStateLabel` + `findStateOverlaps` (module-level pure functions)
- `tests/unit/state-label-resolve.test.ts` — pure function tests
- `tests/unit/state-label-render.test.ts` — DOM/blink tests
- `tests/single/dashboard-state-label.spec.ts` — E2E

**Modify:**
- `ui/static/js/src/00-constants.js` — добавить blink constants + default font size
- `ui/static/js/src/06-utils.js` — добавить `renderStateListEditor`, `parseStateList`, `setupStateListHandlers`
- `ui/static/js/src/62-dashboard-manager.js` — register `'state-label': StateLabelWidget` в `WIDGET_TYPES`
- `ui/static/css/style.css` — `.state-label-widget`, `.state-label-text`, `.state-list-editor`, `.state-list-row`, `.blink-mini-popover`
- `docs/dashboards.md` — раздел "State Label" с описанием и mapping table

---

## Phase 1 — Foundation (pure logic)

### Task 1: Constants

**Files:**
- Modify: `ui/static/js/src/00-constants.js`

- [ ] **Step 1: Добавить constants**

В `ui/static/js/src/00-constants.js` перед последним `Object.assign(globalThis, {...})` блоком добавить:

```javascript
// === State Label widget ===
const STATE_LABEL_BLINK_MIN_INTERVAL_MS    = 100;   // sanity floor для interval (иначе CPU spinner)
const STATE_LABEL_BLINK_DEFAULT_INTERVAL_MS = 500;
const STATE_LABEL_DEFAULT_FONT_SIZE_PX     = 14;
const STATE_LABEL_BLINK_FADED_OPACITY      = 0.25;  // opacity в "выключенной" половине blink цикла
```

В `Object.assign(globalThis, {...})` блок добавить:

```javascript
        STATE_LABEL_BLINK_MIN_INTERVAL_MS,
        STATE_LABEL_BLINK_DEFAULT_INTERVAL_MS,
        STATE_LABEL_DEFAULT_FONT_SIZE_PX,
        STATE_LABEL_BLINK_FADED_OPACITY,
```

- [ ] **Step 2: Rebuild app.js**

Run: `cd /home/pv/Projects/uniset-panel && make app`
Expected: `Generated static/js/app.js from N files`.

- [ ] **Step 3: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/00-constants.js ui/static/js/app.js
git commit -m "$(cat <<'EOF'
constants: state-label widget blink + font size

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `resolveStateLabel` + `findStateOverlaps` (pure functions, TDD)

**Files:**
- Create: `ui/static/js/src/61-dashboard-widget-state-label.js`
- Create: `tests/unit/state-label-resolve.test.ts`

- [ ] **Step 1: Failing test file**

Создать `tests/unit/state-label-resolve.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../../ui/static/js/src');

function loadModule() {
    const src = readFileSync(resolve(SRC, '61-dashboard-widget-state-label.js'), 'utf8');
    new Function(src)();
}

describe('resolveStateLabel', () => {
    beforeEach(() => loadModule());

    const states = [
        { from: 0, to: 0, text: 'OFF', fg: '#fff', bg: '#6b7280' },
        { from: 1, to: 1, text: 'RUN', fg: '#fff', bg: '#22c55e' },
        { from: 80, to: 100, text: 'HIGH', fg: '#111', bg: '#fbbf24' },
    ];

    it('matches closed range', () => {
        const r = (globalThis as any).resolveStateLabel(1, states, { policy: 'raw' }, null);
        expect(r.source).toBe('match');
        expect(r.state.text).toBe('RUN');
    });

    it('matches value at range boundary (inclusive)', () => {
        const r = (globalThis as any).resolveStateLabel(80, states, { policy: 'raw' }, null);
        expect(r.state.text).toBe('HIGH');
    });

    it('open from (only to) — matches all ≤ to', () => {
        const open = [{ to: 0, text: 'LOW', bg: '#3b82f6' }];
        const r = (globalThis as any).resolveStateLabel(-100, open, { policy: 'raw' }, null);
        expect(r.state.text).toBe('LOW');
    });

    it('open to (only from) — matches all ≥ from', () => {
        const open = [{ from: 100, text: 'OVER', bg: '#ef4444' }];
        const r = (globalThis as any).resolveStateLabel(999, open, { policy: 'raw' }, null);
        expect(r.state.text).toBe('OVER');
    });

    it('fully open (no from no to) — matches anything', () => {
        const open = [{ text: 'ANY' }];
        const r = (globalThis as any).resolveStateLabel(42, open, { policy: 'raw' }, null);
        expect(r.state.text).toBe('ANY');
    });

    it('first-match precedence on overlap', () => {
        const overlap = [
            { from: 0, to: 100, text: 'A' },
            { from: 50, to: 50, text: 'B' },
        ];
        const r = (globalThis as any).resolveStateLabel(50, overlap, { policy: 'raw' }, null);
        expect(r.state.text).toBe('A');
    });

    it('no match → fallback raw shows value as text', () => {
        const r = (globalThis as any).resolveStateLabel(42, states, { policy: 'raw' }, null);
        expect(r.source).toBe('raw');
        expect(r.state.text).toBe('42');
    });

    it('no match → fallback ignore (no hold) returns null state', () => {
        const r = (globalThis as any).resolveStateLabel(42, states, { policy: 'ignore' }, null);
        expect(r.source).toBe('ignore');
        expect(r.state).toBeNull();
    });

    it('no match → fallback ignore + hold returns prevState', () => {
        const prev = { text: 'RUN', bg: '#22c55e' };
        const r = (globalThis as any).resolveStateLabel(42, states, { policy: 'ignore', hold: true }, prev);
        expect(r.source).toBe('ignore');
        expect(r.state).toEqual(prev);
    });

    it('no match → fallback default returns configured default state', () => {
        const def = { text: '--', fg: '#9ca3af', bg: '#1f2937' };
        const r = (globalThis as any).resolveStateLabel(42, states, { policy: 'default', defaultState: def }, null);
        expect(r.source).toBe('default');
        expect(r.state).toEqual(def);
    });

    it('null value → fallback path', () => {
        const r = (globalThis as any).resolveStateLabel(null, states, { policy: 'raw' }, null);
        expect(r.source).toBe('raw');
    });

    it('NaN-string value → fallback path', () => {
        const r = (globalThis as any).resolveStateLabel('abc', states, { policy: 'raw' }, null);
        expect(r.source).toBe('raw');
    });
});

describe('findStateOverlaps', () => {
    beforeEach(() => loadModule());

    it('empty list → empty', () => {
        expect((globalThis as any).findStateOverlaps([])).toEqual([]);
    });

    it('no overlaps → empty', () => {
        const s = [{from:0,to:0},{from:1,to:1},{from:2,to:5}];
        expect((globalThis as any).findStateOverlaps(s)).toEqual([]);
    });

    it('two overlapping ranges → [[0,1]]', () => {
        const s = [{from:0,to:100},{from:50,to:50}];
        expect((globalThis as any).findStateOverlaps(s)).toEqual([[0, 1]]);
    });

    it('open-ended overlap', () => {
        const s = [{to:50},{from:0,to:0}];
        // (-∞..50) overlaps with (0..0)
        expect((globalThis as any).findStateOverlaps(s)).toEqual([[0, 1]]);
    });
});
```

- [ ] **Step 2: Run — должен FAIL**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run state-label-resolve.test.ts
```
Expected: FAIL (`Cannot find module` или `resolveStateLabel is not a function`).

- [ ] **Step 3: Implement pure functions**

Создать `ui/static/js/src/61-dashboard-widget-state-label.js`:

```javascript
// ============================================================================
// StateLabelWidget — passive widget с маппингом value → {text, fg, bg, blink}
// через список диапазонов (first-match wins, открытые границы через
// optional from/to).
//
// Spec: docs/superpowers/specs/2026-06-01-state-label-widget-design.md
// ============================================================================

// resolveStateLabel — чистая функция. Возвращает { source, state }:
//   source: 'match' | 'raw' | 'ignore' | 'default'
//   state:  { text, fg?, bg?, blink? } | null (для 'ignore' без hold)
// prevState нужен только для fallback 'ignore' + hold path.
function resolveStateLabel(value, states, fallbackCfg, prevState) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return _applyStateLabelFallback(fallbackCfg, prevState, value);
    }
    const numValue = Number(value);
    if (Array.isArray(states)) {
        for (const s of states) {
            const lo = s.from !== undefined && s.from !== '' && s.from !== null ? Number(s.from) : -Infinity;
            const hi = s.to   !== undefined && s.to   !== '' && s.to   !== null ? Number(s.to)   : +Infinity;
            if (Number.isFinite(lo) === false && lo !== -Infinity) continue;  // garbage skip
            if (Number.isFinite(hi) === false && hi !== +Infinity) continue;
            if (numValue >= lo && numValue <= hi) {
                return { source: 'match', state: s };
            }
        }
    }
    return _applyStateLabelFallback(fallbackCfg, prevState, numValue);
}

function _applyStateLabelFallback(cfg, prevState, value) {
    const policy = cfg && cfg.policy ? cfg.policy : 'raw';
    if (policy === 'raw') {
        return { source: 'raw', state: { text: String(value == null ? '--' : value) } };
    }
    if (policy === 'ignore') {
        if (cfg && cfg.hold && prevState) return { source: 'ignore', state: prevState };
        return { source: 'ignore', state: null };
    }
    if (policy === 'default') {
        return { source: 'default', state: (cfg && cfg.defaultState) ? cfg.defaultState : { text: '--' } };
    }
    return { source: 'raw', state: { text: String(value) } };
}

// findStateOverlaps — возвращает массив [i, j] (i<j) пар индексов перекрывающихся
// state'ов. State #j потенциально никогда не сработает (first-match wins).
function findStateOverlaps(states) {
    const pairs = [];
    if (!Array.isArray(states)) return pairs;
    const norm = states.map(s => {
        const lo = s.from !== undefined && s.from !== '' && s.from !== null ? Number(s.from) : -Infinity;
        const hi = s.to   !== undefined && s.to   !== '' && s.to   !== null ? Number(s.to)   : +Infinity;
        return { lo, hi };
    });
    for (let i = 0; i < norm.length; i++) {
        for (let j = i + 1; j < norm.length; j++) {
            // ranges overlap iff a.lo <= b.hi && b.lo <= a.hi
            if (norm[i].lo <= norm[j].hi && norm[j].lo <= norm[i].hi) {
                pairs.push([i, j]);
            }
        }
    }
    return pairs;
}

if (typeof globalThis !== 'undefined') {
    globalThis.resolveStateLabel = resolveStateLabel;
    globalThis.findStateOverlaps = findStateOverlaps;
}
```

- [ ] **Step 4: Run — должен PASS**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run state-label-resolve.test.ts
```
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/61-dashboard-widget-state-label.js tests/unit/state-label-resolve.test.ts
git commit -m "$(cat <<'EOF'
state-label: pure resolveStateLabel + findStateOverlaps + tests

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Widget class

### Task 3: `StateLabelWidget` skeleton + `render()` (TDD)

**Files:**
- Modify: `ui/static/js/src/61-dashboard-widget-state-label.js`
- Create: `tests/unit/state-label-render.test.ts`

- [ ] **Step 1: Failing render test**

Создать `tests/unit/state-label-render.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../../ui/static/js/src');

function loadModule() {
    const constants = readFileSync(resolve(SRC, '00-constants.js'), 'utf8');
    const base = readFileSync(resolve(SRC, '60-dashboard-base.js'), 'utf8');
    const utils = readFileSync(resolve(SRC, '06-utils.js'), 'utf8');
    const state = readFileSync(resolve(SRC, '61-dashboard-widget-state-label.js'), 'utf8');
    new Function(`${constants}\n${utils}\n${base}\n${state}`)();
}

describe('StateLabelWidget render', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="container"></div>';
        loadModule();
    });

    it('static type/displayName/defaultSize', () => {
        const W = (globalThis as any).StateLabelWidget;
        expect(W.type).toBe('state-label');
        expect(W.displayName).toBe('State Label');
        expect(W.defaultSize).toEqual({ width: 6, height: 2 });
    });

    it('render() creates .state-label-widget + .state-label-text', () => {
        const container = document.getElementById('container')!;
        const W = (globalThis as any).StateLabelWidget;
        const w = new W('w1', { states: [] }, container);
        w.render();
        expect(container.querySelector('.state-label-widget')).toBeTruthy();
        expect(container.querySelector('.state-label-text')).toBeTruthy();
    });

    it('render() applies align and bold from config', () => {
        const container = document.getElementById('container')!;
        const W = (globalThis as any).StateLabelWidget;
        const w = new W('w2', { align: 'right', bold: true }, container);
        w.render();
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        const text = container.querySelector('.state-label-text') as HTMLElement;
        expect(root.style.justifyContent).toBe('flex-end');
        expect(text.style.fontWeight).toBe('700');
    });
});
```

- [ ] **Step 2: Run — должен FAIL** ("StateLabelWidget is not a constructor")

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run state-label-render.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Add StateLabelWidget class**

В `ui/static/js/src/61-dashboard-widget-state-label.js` добавить ПОСЛЕ pure functions (но перед `globalThis` exports блоком):

```javascript
// ============================================================================
// StateLabelWidget class
// ============================================================================

class StateLabelWidget extends DashboardWidget {
    static type = 'state-label';
    static usesNewSensorAutocomplete = true;
    static displayName = 'State Label';
    static description = 'Text + color + blink по значению датчика';
    static icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="12" rx="2"/><text x="12" y="15" text-anchor="middle" font-size="8" fill="currentColor" stroke="none">STATE</text></svg>';
    static defaultSize = { width: 6, height: 2 };

    constructor(id, config, container) {
        super(id, config, container);
        this._lastValidState = null;
        this._blinkTimer = null;
        this._blinkStopTimer = null;
        this._blinkVisible = true;
    }

    render() {
        const { align = 'center', bold = false, fontSize = 'auto' } = this.config;

        this.element = document.createElement('div');
        this.element.className = 'widget-content state-label-widget';
        this.element.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: ${align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'};
            height: 100%;
            padding: 4px 8px;
            border-radius: 4px;
            transition: background-color 0.15s;
        `;

        this.textEl = document.createElement('div');
        this.textEl.className = 'state-label-text';
        const fontSizePx = fontSize === 'auto'
            ? ''
            : `font-size: ${parseIntegerOrDefault(fontSize, STATE_LABEL_DEFAULT_FONT_SIZE_PX)}px;`;
        this.textEl.style.cssText = `
            font-weight: ${bold ? 700 : 500};
            ${fontSizePx}
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;

        this.element.appendChild(this.textEl);
        this.container.appendChild(this.element);
    }

    // update / blink — будут добавлены в Task 4/5
    update(value, error = null) {}
}
```

- [ ] **Step 4: Run — должен PASS**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run state-label-render.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/61-dashboard-widget-state-label.js tests/unit/state-label-render.test.ts
git commit -m "$(cat <<'EOF'
state-label: widget skeleton + render() + tests

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `update()` + `_applyState()` (TDD)

**Files:**
- Modify: `ui/static/js/src/61-dashboard-widget-state-label.js`
- Modify: `tests/unit/state-label-render.test.ts`

- [ ] **Step 1: Add failing test cases**

В `tests/unit/state-label-render.test.ts` добавить новый describe-блок:

```typescript
describe('StateLabelWidget update', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="container"></div>';
        loadModule();
    });

    function mount(config: any = {}) {
        const W = (globalThis as any).StateLabelWidget;
        const container = document.getElementById('container')!;
        const w = new W('wU', config, container);
        w.render();
        return { w, container };
    }

    const states = [
        { from: 0, to: 0, text: 'OFF', fg: '#fff', bg: '#6b7280' },
        { from: 1, to: 1, text: 'RUN', fg: '#fff', bg: '#22c55e' },
    ];

    it('matched state → text/fg/bg applied', () => {
        const { w, container } = mount({ states });
        w.update(1);
        const text = container.querySelector('.state-label-text') as HTMLElement;
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        expect(text.textContent).toBe('RUN');
        expect(text.style.color).toBe('rgb(255, 255, 255)');
        expect(root.style.background).toBe('rgb(34, 197, 94)');
    });

    it('no match + fallback raw → raw value text, no bg', () => {
        const { w, container } = mount({ states, fallback: 'raw' });
        w.update(42);
        const text = container.querySelector('.state-label-text') as HTMLElement;
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        expect(text.textContent).toBe('42');
        expect(root.style.background).toBe('');
    });

    it('no match + fallback ignore (no hold) → blank text + no bg', () => {
        const { w, container } = mount({ states, fallback: 'ignore', fallbackHold: false });
        w.update(42);
        const text = container.querySelector('.state-label-text') as HTMLElement;
        expect(text.textContent).toBe('');
    });

    it('no match + fallback ignore + hold → keeps prev state', () => {
        const { w, container } = mount({ states, fallback: 'ignore', fallbackHold: true });
        w.update(1);     // OFF=0, RUN=1 → matches RUN
        w.update(999);   // no match → hold RUN
        const text = container.querySelector('.state-label-text') as HTMLElement;
        expect(text.textContent).toBe('RUN');
    });

    it('no match + fallback default → defaultState applied', () => {
        const { w, container } = mount({
            states, fallback: 'default',
            defaultState: { text: 'UNKNOWN', fg: '#aaa', bg: '#333' },
        });
        w.update(999);
        const text = container.querySelector('.state-label-text') as HTMLElement;
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        expect(text.textContent).toBe('UNKNOWN');
        expect(root.style.background).toBe('rgb(51, 51, 51)');
    });

    it('error path → fallback', () => {
        const { w, container } = mount({ states, fallback: 'raw' });
        w.update(1, 'sse error');
        const text = container.querySelector('.state-label-text') as HTMLElement;
        // null → raw shows '--'
        expect(text.textContent).toBe('--');
    });
});
```

- [ ] **Step 2: Run — должен FAIL**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run state-label-render.test.ts
```
Expected: 6 FAIL (no update() impl).

- [ ] **Step 3: Implement update() + _applyState()**

В `61-dashboard-widget-state-label.js` заменить заглушку `update(value, error)` в классе `StateLabelWidget` на:

```javascript
    update(value, error = null) {
        const v = error ? null : value;
        const { states = [], fallback = 'raw', fallbackHold = false, defaultState } = this.config;
        const fallbackCfg = { policy: fallback, hold: fallbackHold, defaultState };

        const { source, state } = resolveStateLabel(v, states, fallbackCfg, this._lastValidState);

        if (source === 'match' || source === 'default') {
            this._lastValidState = state;
        }
        this._applyState(state, source);
    }

    _applyState(state, source) {
        this._stopBlink();
        if (!state) {  // 'ignore' + no hold
            this.textEl.textContent = '';
            this.element.style.background = '';
            this.textEl.style.color = '';
            return;
        }
        this.textEl.textContent = state.text != null ? String(state.text) : '';
        this.textEl.style.color = state.fg || '';
        this.element.style.background = (source === 'raw') ? '' : (state.bg || '');
        // blink starts in Task 5
    }

    _stopBlink() {
        // Stub for now; implemented in Task 5
    }
```

- [ ] **Step 4: Run — все тесты PASS**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run state-label-render.test.ts
```
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/61-dashboard-widget-state-label.js tests/unit/state-label-render.test.ts
git commit -m "$(cat <<'EOF'
state-label: update() + _applyState() + fallback paths

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Blink — start/stop/duration (TDD with fake timers)

**Files:**
- Modify: `ui/static/js/src/61-dashboard-widget-state-label.js`
- Modify: `tests/unit/state-label-render.test.ts`

- [ ] **Step 1: Add failing blink tests**

В `tests/unit/state-label-render.test.ts` добавить:

```typescript
import { vi } from 'vitest';

describe('StateLabelWidget blink', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="container"></div>';
        loadModule();
        vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    function mount(config: any) {
        const W = (globalThis as any).StateLabelWidget;
        const container = document.getElementById('container')!;
        const w = new W('wB', config, container);
        w.render();
        return { w, container };
    }

    it('blink {interval} — opacity toggles each interval', () => {
        const states = [{ from: 1, to: 1, text: 'A', blink: { interval: 500 } }];
        const { w, container } = mount({ states });
        w.update(1);
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        expect(root.style.opacity).toBe('1');
        vi.advanceTimersByTime(500);
        expect(root.style.opacity).toBe(String((globalThis as any).STATE_LABEL_BLINK_FADED_OPACITY));
        vi.advanceTimersByTime(500);
        expect(root.style.opacity).toBe('1');
    });

    it('blink {interval, duration} — stops after duration ms', () => {
        const states = [{ from: 1, to: 1, text: 'A', blink: { interval: 500, duration: 1200 } }];
        const { w, container } = mount({ states });
        w.update(1);
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        vi.advanceTimersByTime(1300);
        expect(root.style.opacity).toBe('1');
        // After stop, interval не должен продолжаться
        vi.advanceTimersByTime(2000);
        expect(root.style.opacity).toBe('1');
    });

    it('blink interval < min floor → no blink', () => {
        const states = [{ from: 1, to: 1, text: 'A', blink: { interval: 50 } }];
        const { w, container } = mount({ states });
        w.update(1);
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        vi.advanceTimersByTime(2000);
        expect(root.style.opacity).toBe('1');  // никогда не fade
    });

    it('state change → blink stops (timer cleared)', () => {
        const states = [
            { from: 1, to: 1, text: 'A', blink: { interval: 500 } },
            { from: 2, to: 2, text: 'B' },   // no blink
        ];
        const { w, container } = mount({ states });
        w.update(1);
        vi.advanceTimersByTime(500);
        w.update(2);
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        expect(root.style.opacity).toBe('1');
        vi.advanceTimersByTime(2000);
        expect(root.style.opacity).toBe('1');  // не мигает
    });

    it('destroy() stops blink', () => {
        const states = [{ from: 1, to: 1, text: 'A', blink: { interval: 500 } }];
        const { w, container } = mount({ states });
        w.update(1);
        vi.advanceTimersByTime(500);
        w.destroy?.();
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        vi.advanceTimersByTime(2000);
        // После destroy не должно быть timer toggling
        // (если element остался) — opacity reset на 1 в _stopBlink
        expect(root?.style.opacity).toBe('1');
    });

    it('raw fallback ignores blink', () => {
        const states = [{ from: 1, to: 1, text: 'A', blink: { interval: 500 } }];
        const { w, container } = mount({ states });
        w.update(999);  // no match → raw fallback
        vi.advanceTimersByTime(2000);
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        expect(root.style.opacity).toBe('1');  // raw fallback не мигает
    });
});
```

- [ ] **Step 2: Run — должен FAIL**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run state-label-render.test.ts
```
Expected: 6 FAIL (blink не реализован).

- [ ] **Step 3: Implement blink**

В `61-dashboard-widget-state-label.js` заменить `_stopBlink` stub и добавить `_startBlink` + `destroy`:

```javascript
    _applyState(state, source) {
        this._stopBlink();
        if (!state) {
            this.textEl.textContent = '';
            this.element.style.background = '';
            this.textEl.style.color = '';
            return;
        }
        this.textEl.textContent = state.text != null ? String(state.text) : '';
        this.textEl.style.color = state.fg || '';
        this.element.style.background = (source === 'raw') ? '' : (state.bg || '');
        if (state.blink && state.blink !== 'none' && source !== 'raw') {
            this._startBlink(state.blink);
        }
    }

    _startBlink(blinkCfg) {
        if (!blinkCfg || typeof blinkCfg !== 'object') return;
        const interval = parseIntegerOrDefault(blinkCfg.interval, STATE_LABEL_BLINK_DEFAULT_INTERVAL_MS);
        if (interval < STATE_LABEL_BLINK_MIN_INTERVAL_MS) return;
        this._blinkVisible = true;
        this.element.style.opacity = '1';
        this._blinkTimer = setInterval(() => {
            this._blinkVisible = !this._blinkVisible;
            this.element.style.opacity = this._blinkVisible ? '1' : String(STATE_LABEL_BLINK_FADED_OPACITY);
        }, interval);
        if (blinkCfg.duration && blinkCfg.duration > 0) {
            this._blinkStopTimer = setTimeout(() => this._stopBlink(), blinkCfg.duration);
        }
    }

    _stopBlink() {
        if (this._blinkTimer) { clearInterval(this._blinkTimer); this._blinkTimer = null; }
        if (this._blinkStopTimer) { clearTimeout(this._blinkStopTimer); this._blinkStopTimer = null; }
        if (this.element) this.element.style.opacity = '1';
    }

    destroy() {
        this._stopBlink();
        if (super.destroy) super.destroy();
    }
```

- [ ] **Step 4: Run — все тесты PASS**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run state-label-render.test.ts
```
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/61-dashboard-widget-state-label.js tests/unit/state-label-render.test.ts
git commit -m "$(cat <<'EOF'
state-label: blink start/stop/duration + destroy cleanup + tests

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Config form helpers

### Task 6: `renderStateListEditor` + `parseStateList` (TDD)

**Files:**
- Modify: `ui/static/js/src/06-utils.js`
- Create: `tests/unit/state-list-editor.test.ts`

- [ ] **Step 1: Failing test**

Создать `tests/unit/state-list-editor.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../../ui/static/js/src');

function loadUtils() {
    const constants = readFileSync(resolve(SRC, '00-constants.js'), 'utf8');
    const utils = readFileSync(resolve(SRC, '06-utils.js'), 'utf8');
    new Function(`${constants}\n${utils}`)();
}

describe('renderStateListEditor', () => {
    beforeEach(() => {
        document.body.innerHTML = '<form id="form"></form>';
        loadUtils();
    });

    it('renders header + add button + zero rows for empty list', () => {
        const form = document.getElementById('form')!;
        form.innerHTML = (globalThis as any).renderStateListEditor([]);
        expect(form.querySelector('.state-list-editor')).toBeTruthy();
        expect(form.querySelector('.state-list-add-btn')).toBeTruthy();
        expect(form.querySelectorAll('.state-list-row').length).toBe(0);
    });

    it('renders one row per state with section-move-btn reorder', () => {
        const form = document.getElementById('form')!;
        form.innerHTML = (globalThis as any).renderStateListEditor([
            { from: 0, to: 0, text: 'OFF', fg: '#fff', bg: '#6b7280' },
            { from: 1, to: 1, text: 'RUN', fg: '#fff', bg: '#22c55e' },
        ]);
        const rows = form.querySelectorAll('.state-list-row');
        expect(rows.length).toBe(2);
        // each row has up/down buttons in section-reorder-buttons
        const firstRow = rows[0];
        expect(firstRow.querySelector('.section-move-btn[data-move="up"]')).toBeTruthy();
        expect(firstRow.querySelector('.section-move-btn[data-move="down"]')).toBeTruthy();
        // up disabled on first row, down disabled on last
        expect(firstRow.querySelector<HTMLButtonElement>('.section-move-btn[data-move="up"]')!.disabled).toBe(true);
        expect(rows[1].querySelector<HTMLButtonElement>('.section-move-btn[data-move="down"]')!.disabled).toBe(true);
    });

    it('renders open from/to placeholders', () => {
        const form = document.getElementById('form')!;
        form.innerHTML = (globalThis as any).renderStateListEditor([
            { to: 0, text: 'LOW' },        // open from
            { from: 100, text: 'OVER' },   // open to
        ]);
        const inputs = form.querySelectorAll<HTMLInputElement>('.state-list-row input[name^="state-from-"], .state-list-row input[name^="state-to-"]');
        // first row: from empty (placeholder), to=0
        expect((inputs[0] as HTMLInputElement).value).toBe('');
        expect((inputs[1] as HTMLInputElement).value).toBe('0');
    });
});

describe('parseStateList', () => {
    beforeEach(() => {
        document.body.innerHTML = '<form id="form"></form>';
        loadUtils();
    });

    it('round-trip: render then parse returns same shape', () => {
        const form = document.getElementById('form')! as HTMLFormElement;
        const input = [
            { from: 0, to: 0, text: 'OFF', fg: '#ffffff', bg: '#6b7280' },
            { from: 1, to: 1, text: 'RUN', fg: '#ffffff', bg: '#22c55e' },
        ];
        form.innerHTML = (globalThis as any).renderStateListEditor(input);
        const out = (globalThis as any).parseStateList(form);
        expect(out.length).toBe(2);
        expect(out[0].text).toBe('OFF');
        expect(out[0].from).toBe(0);
        expect(out[0].to).toBe(0);
        expect(out[1].text).toBe('RUN');
    });

    it('parses open from/to (empty inputs) as undefined', () => {
        const form = document.getElementById('form')! as HTMLFormElement;
        form.innerHTML = (globalThis as any).renderStateListEditor([
            { to: 0, text: 'LOW' },
            { from: 100, text: 'OVER' },
        ]);
        const out = (globalThis as any).parseStateList(form);
        expect(out[0].from).toBeUndefined();
        expect(out[0].to).toBe(0);
        expect(out[1].from).toBe(100);
        expect(out[1].to).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run — должен FAIL**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run state-list-editor.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement helpers**

В `ui/static/js/src/06-utils.js` добавить ПЕРЕД блоком `if (typeof globalThis !== 'undefined') { ... }` в конце файла:

```javascript
// ============================================================================
// State list editor — для StateLabelWidget.
// Аналог renderColorZonesEditor, но row содержит: reorder buttons, from/to
// inputs (open-ended via empty), text input, fg/bg color pickers, blink
// popover trigger, remove button.
// ============================================================================

function renderStateListEditor(states = []) {
    const rows = states.map((s, idx) => renderStateListRow(s, idx, states.length)).join('');
    return `
        <div class="state-list-editor">
            <div class="state-list-header">
                <label>States (first-match wins)</label>
                <button type="button" class="state-list-add-btn">+ Add State</button>
            </div>
            <div class="state-list-rows">
                ${rows}
            </div>
        </div>
    `;
}

function renderStateListRow(s = {}, idx = 0, total = 1) {
    const fromVal = s.from !== undefined && s.from !== null ? String(s.from) : '';
    const toVal   = s.to   !== undefined && s.to   !== null ? String(s.to)   : '';
    const blink = s.blink || 'none';
    const blinkActive = blink !== 'none' && typeof blink === 'object';
    return `
        <div class="state-list-row" data-idx="${idx}">
            <div class="section-reorder-buttons">
                <button type="button" class="section-move-btn" data-move="up"   title="Move up"  ${idx === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="section-move-btn" data-move="down" title="Move down" ${idx === total - 1 ? 'disabled' : ''}>↓</button>
            </div>
            <input type="text"   class="state-list-input state-list-from" name="state-from-${idx}" placeholder="−∞" value="${escapeAttr(fromVal)}">
            <span class="state-list-sep">→</span>
            <input type="text"   class="state-list-input state-list-to"   name="state-to-${idx}"   placeholder="+∞" value="${escapeAttr(toVal)}">
            <input type="text"   class="state-list-text" name="state-text-${idx}" placeholder="Text" value="${escapeAttr(s.text || '')}">
            <input type="color"  class="state-list-color state-list-fg" name="state-fg-${idx}" value="${escapeAttr(s.fg || '#ffffff')}" title="Text color">
            <input type="color"  class="state-list-color state-list-bg" name="state-bg-${idx}" value="${escapeAttr(s.bg || '#1f2937')}" title="Background color">
            <button type="button" class="state-list-blink-btn ${blinkActive ? 'active' : ''}" data-idx="${idx}" title="Blink settings">⏱</button>
            <input type="hidden" class="state-list-blink-data" name="state-blink-${idx}" value="${escapeAttr(JSON.stringify(blink))}">
            <button type="button" class="state-list-remove" data-idx="${idx}" title="Remove">×</button>
        </div>
    `;
}

function parseStateList(form) {
    const out = [];
    form.querySelectorAll('.state-list-row').forEach((row) => {
        const idx = parseIntegerOrDefault(row.dataset.idx, NaN);
        if (!Number.isFinite(idx)) return;
        const fromRaw = (row.querySelector('.state-list-from')?.value ?? '').trim();
        const toRaw   = (row.querySelector('.state-list-to')?.value ?? '').trim();
        const text    = row.querySelector('.state-list-text')?.value ?? '';
        const fg      = row.querySelector('.state-list-fg')?.value || '';
        const bg      = row.querySelector('.state-list-bg')?.value || '';
        const blinkRaw = row.querySelector('.state-list-blink-data')?.value || '"none"';
        let blink;
        try { blink = JSON.parse(blinkRaw); } catch { blink = 'none'; }

        const s = { text, fg, bg, blink };
        if (fromRaw !== '') {
            const n = Number(fromRaw);
            if (Number.isFinite(n)) s.from = n;
        }
        if (toRaw !== '') {
            const n = Number(toRaw);
            if (Number.isFinite(n)) s.to = n;
        }
        out.push(s);
    });
    return out;
}
```

В `globalThis` exports блок в конце файла добавить:

```javascript
    globalThis.renderStateListEditor = renderStateListEditor;
    globalThis.parseStateList = parseStateList;
```

- [ ] **Step 4: Run — должен PASS**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run state-list-editor.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/06-utils.js tests/unit/state-list-editor.test.ts
git commit -m "$(cat <<'EOF'
utils: renderStateListEditor + parseStateList + tests

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `setupStateListHandlers` — reorder + add/remove + blink popover + overlap warning

**Files:**
- Modify: `ui/static/js/src/06-utils.js`
- Modify: `tests/unit/state-list-editor.test.ts`

- [ ] **Step 1: Failing tests for interactivity**

Добавить в `tests/unit/state-list-editor.test.ts`:

```typescript
describe('setupStateListHandlers', () => {
    beforeEach(() => {
        document.body.innerHTML = '<form id="form"></form>';
        loadUtils();
        // findStateOverlaps used by overlap warning — need to load state-label module
        const labelSrc = require('fs').readFileSync(
            require('path').resolve(__dirname, '../../ui/static/js/src/61-dashboard-widget-state-label.js'),
            'utf8',
        );
        new Function(labelSrc)();
    });

    function mount(states: any[]) {
        const form = document.getElementById('form')! as HTMLFormElement;
        form.innerHTML = (globalThis as any).renderStateListEditor(states);
        (globalThis as any).setupStateListHandlers(form);
        return form;
    }

    it('Add button appends new row', () => {
        const form = mount([{ from: 0, to: 0, text: 'OFF' }]);
        (form.querySelector('.state-list-add-btn') as HTMLButtonElement).click();
        expect(form.querySelectorAll('.state-list-row').length).toBe(2);
    });

    it('Remove button removes row', () => {
        const form = mount([
            { from: 0, to: 0, text: 'OFF' },
            { from: 1, to: 1, text: 'RUN' },
        ]);
        (form.querySelector('.state-list-row[data-idx="0"] .state-list-remove') as HTMLButtonElement).click();
        const rows = form.querySelectorAll('.state-list-row');
        expect(rows.length).toBe(1);
        expect((rows[0].querySelector('.state-list-text') as HTMLInputElement).value).toBe('RUN');
    });

    it('Move down swaps rows', () => {
        const form = mount([
            { from: 0, to: 0, text: 'OFF' },
            { from: 1, to: 1, text: 'RUN' },
        ]);
        (form.querySelector('.state-list-row[data-idx="0"] .section-move-btn[data-move="down"]') as HTMLButtonElement).click();
        const rows = form.querySelectorAll('.state-list-row');
        expect((rows[0].querySelector('.state-list-text') as HTMLInputElement).value).toBe('RUN');
        expect((rows[1].querySelector('.state-list-text') as HTMLInputElement).value).toBe('OFF');
    });

    it('Move up button disabled on first, down on last', () => {
        const form = mount([
            { from: 0, to: 0, text: 'A' },
            { from: 1, to: 1, text: 'B' },
        ]);
        const rows = form.querySelectorAll('.state-list-row');
        expect((rows[0].querySelector('.section-move-btn[data-move="up"]') as HTMLButtonElement).disabled).toBe(true);
        expect((rows[rows.length - 1].querySelector('.section-move-btn[data-move="down"]') as HTMLButtonElement).disabled).toBe(true);
    });

    it('Overlap warning shown when ranges overlap', () => {
        const form = mount([
            { from: 0, to: 100, text: 'WIDE' },
            { from: 50, to: 50, text: 'NARROW' },  // shadowed by WIDE
        ]);
        const rows = form.querySelectorAll('.state-list-row');
        // second row should have .has-overlap class
        expect(rows[1].classList.contains('has-overlap')).toBe(true);
        // warning element rendered
        expect(form.querySelector('.state-list-overlap-warn')).toBeTruthy();
    });

    it('Blink popover toggles', () => {
        const form = mount([{ from: 1, to: 1, text: 'A' }]);
        (form.querySelector('.state-list-blink-btn') as HTMLButtonElement).click();
        expect(form.querySelector('.state-list-blink-popover')).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run — должен FAIL**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run state-list-editor.test.ts
```
Expected: 6 FAIL.

- [ ] **Step 3: Implement setupStateListHandlers**

В `06-utils.js` после `parseStateList` добавить:

```javascript
function setupStateListHandlers(form) {
    if (!form || form.dataset.stateListWired === '1') return;
    form.dataset.stateListWired = '1';

    const editor = form.querySelector('.state-list-editor');
    if (!editor) return;

    function rerender() {
        const states = parseStateList(form);
        const rowsContainer = editor.querySelector('.state-list-rows');
        rowsContainer.innerHTML = states.map((s, i) => renderStateListRow(s, i, states.length)).join('');
        _updateStateListOverlaps(editor, states);
    }

    function _updateStateListOverlaps(editor, states) {
        const overlaps = (typeof findStateOverlaps === 'function') ? findStateOverlaps(states) : [];
        editor.querySelectorAll('.state-list-row').forEach(r => r.classList.remove('has-overlap'));
        editor.querySelectorAll('.state-list-overlap-warn').forEach(w => w.remove());
        if (overlaps.length === 0) return;
        const shadowedIdx = new Set(overlaps.map(([, j]) => j));
        editor.querySelectorAll('.state-list-row').forEach((row) => {
            const idx = parseIntegerOrDefault(row.dataset.idx, NaN);
            if (shadowedIdx.has(idx)) {
                row.classList.add('has-overlap');
                const warn = document.createElement('div');
                warn.className = 'state-list-overlap-warn';
                const pair = overlaps.find(([, j]) => j === idx);
                warn.textContent = pair
                    ? `⚠ Overlaps state #${pair[0] + 1} — first-match wins, this state may not trigger`
                    : '⚠ Overlap';
                row.insertAdjacentElement('afterend', warn);
            }
        });
    }

    // Initial overlap render
    rerender();

    // Add
    editor.addEventListener('click', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;

        // Add new state
        if (target.classList.contains('state-list-add-btn')) {
            const states = parseStateList(form);
            states.push({ text: '', fg: '#ffffff', bg: '#1f2937', blink: 'none' });
            const rowsContainer = editor.querySelector('.state-list-rows');
            rowsContainer.innerHTML = states.map((s, i) => renderStateListRow(s, i, states.length)).join('');
            _updateStateListOverlaps(editor, states);
            return;
        }

        // Remove
        if (target.classList.contains('state-list-remove')) {
            const row = target.closest('.state-list-row');
            if (row) {
                row.nextElementSibling?.classList.contains('state-list-overlap-warn') && row.nextElementSibling.remove();
                row.remove();
                rerender();
            }
            return;
        }

        // Reorder up/down
        if (target.classList.contains('section-move-btn')) {
            const direction = target.dataset.move;
            const states = parseStateList(form);
            const row = target.closest('.state-list-row');
            const idx = parseIntegerOrDefault(row?.dataset.idx, -1);
            if (idx < 0 || idx >= states.length) return;
            if (direction === 'up' && idx > 0) {
                [states[idx], states[idx - 1]] = [states[idx - 1], states[idx]];
            } else if (direction === 'down' && idx < states.length - 1) {
                [states[idx], states[idx + 1]] = [states[idx + 1], states[idx]];
            } else {
                return;
            }
            const rowsContainer = editor.querySelector('.state-list-rows');
            rowsContainer.innerHTML = states.map((s, i) => renderStateListRow(s, i, states.length)).join('');
            _updateStateListOverlaps(editor, states);
            return;
        }

        // Blink popover toggle
        if (target.classList.contains('state-list-blink-btn')) {
            const row = target.closest('.state-list-row');
            const existing = row?.querySelector('.state-list-blink-popover');
            if (existing) { existing.remove(); return; }
            if (!row) return;
            const hiddenInput = row.querySelector('.state-list-blink-data');
            let blink;
            try { blink = JSON.parse(hiddenInput?.value || '"none"'); } catch { blink = 'none'; }
            const popover = _renderBlinkPopover(blink);
            row.insertAdjacentElement('afterend', popover);
            _wireBlinkPopover(popover, hiddenInput, target, row);
            return;
        }
    });

    // Recompute overlaps on from/to/text change
    editor.addEventListener('input', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.matches('.state-list-from, .state-list-to')) {
            const states = parseStateList(form);
            _updateStateListOverlaps(editor, states);
        }
    });
}

function _renderBlinkPopover(blink) {
    const isObj = blink && typeof blink === 'object';
    const mode = blink === 'none' || !isObj ? 'none' : (blink.duration ? 'duration' : 'forever');
    const interval = isObj ? (blink.interval || STATE_LABEL_BLINK_DEFAULT_INTERVAL_MS) : STATE_LABEL_BLINK_DEFAULT_INTERVAL_MS;
    const duration = isObj && blink.duration ? blink.duration : '';
    const pop = document.createElement('div');
    pop.className = 'state-list-blink-popover';
    pop.innerHTML = `
        <label class="state-list-blink-row"><input type="radio" name="blink-mode" value="none"     ${mode==='none'?'checked':''}> None</label>
        <label class="state-list-blink-row"><input type="radio" name="blink-mode" value="forever"  ${mode==='forever'?'checked':''}> Forever</label>
        <label class="state-list-blink-row"><input type="radio" name="blink-mode" value="duration" ${mode==='duration'?'checked':''}> For duration</label>
        <div class="state-list-blink-fields">
            <label>Interval (ms) <input type="number" class="blink-interval" value="${interval}" min="${STATE_LABEL_BLINK_MIN_INTERVAL_MS}" step="50"></label>
            <label>Duration (ms) <input type="number" class="blink-duration" value="${duration}" min="100" step="100"></label>
        </div>
    `;
    return pop;
}

function _wireBlinkPopover(popover, hiddenInput, blinkBtn, row) {
    function commit() {
        const mode = popover.querySelector('input[name="blink-mode"]:checked')?.value || 'none';
        if (mode === 'none') {
            hiddenInput.value = JSON.stringify('none');
            blinkBtn.classList.remove('active');
            return;
        }
        const interval = parseIntegerOrDefault(popover.querySelector('.blink-interval')?.value, STATE_LABEL_BLINK_DEFAULT_INTERVAL_MS);
        const obj = { interval };
        if (mode === 'duration') {
            const d = parseIntegerOrDefault(popover.querySelector('.blink-duration')?.value, 0);
            if (d > 0) obj.duration = d;
        }
        hiddenInput.value = JSON.stringify(obj);
        blinkBtn.classList.add('active');
    }
    popover.addEventListener('change', commit);
    popover.addEventListener('input', commit);
}
```

В `globalThis` exports добавить:

```javascript
    globalThis.setupStateListHandlers = setupStateListHandlers;
```

- [ ] **Step 4: Run — должен PASS**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run state-list-editor.test.ts
```
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/06-utils.js tests/unit/state-list-editor.test.ts
git commit -m "$(cat <<'EOF'
utils: setupStateListHandlers — add/remove/reorder/blink popover/overlap

Reorder через section-move-btn (reuse). Blink popover (none/forever/duration).
Overlap warning после каждого change.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `getConfigForm` / `parseConfigForm` / `initConfigHandlers` (single combined task)

**Files:**
- Modify: `ui/static/js/src/61-dashboard-widget-state-label.js`
- Create: `tests/unit/state-label-config-form.test.ts`

- [ ] **Step 1: Failing config form test**

Создать `tests/unit/state-label-config-form.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../../ui/static/js/src');

function loadAll() {
    const constants = readFileSync(resolve(SRC, '00-constants.js'), 'utf8');
    const utils     = readFileSync(resolve(SRC, '06-utils.js'), 'utf8');
    const ac        = readFileSync(resolve(SRC, '41-sensor-autocomplete.js'), 'utf8');
    const state     = readFileSync(resolve(SRC, '00-state.js'), 'utf8');
    const binding   = readFileSync(resolve(SRC, '60-widget-sensor-binding.js'), 'utf8');
    const base      = readFileSync(resolve(SRC, '60-dashboard-base.js'), 'utf8');
    const label     = readFileSync(resolve(SRC, '61-dashboard-widget-state-label.js'), 'utf8');
    new Function(`${constants}\n${state}\n${utils}\n${ac}\n${binding}\n${base}\n${label}`)();
}

describe('StateLabelWidget config form', () => {
    beforeEach(() => {
        document.body.innerHTML = '<form id="form"></form>';
        loadAll();
    });

    it('getConfigForm renders sensor binding + state list + fallback + appearance', () => {
        const form = document.getElementById('form')! as HTMLFormElement;
        const W = (globalThis as any).StateLabelWidget;
        form.innerHTML = W.getConfigForm({ states: [{ from: 0, to: 0, text: 'OFF' }] });
        // sensor binding (combo)
        expect(form.querySelector('.ionc-combo-input')).toBeTruthy();
        expect(form.querySelector('input[name="sensor"]')).toBeTruthy();
        // state list editor
        expect(form.querySelector('.state-list-editor')).toBeTruthy();
        expect(form.querySelector('.state-list-row')).toBeTruthy();
        // fallback radios
        expect(form.querySelector('input[name="fallback"][value="raw"]')).toBeTruthy();
        expect(form.querySelector('input[name="fallback"][value="ignore"]')).toBeTruthy();
        expect(form.querySelector('input[name="fallback"][value="default"]')).toBeTruthy();
        // appearance
        expect(form.querySelector('select[name="fontSize"]')).toBeTruthy();
        expect(form.querySelector('select[name="align"]')).toBeTruthy();
        expect(form.querySelector('input[name="bold"]')).toBeTruthy();
    });

    it('parseConfigForm round-trip: getConfigForm → parseConfigForm preserves states', () => {
        const form = document.getElementById('form')! as HTMLFormElement;
        const W = (globalThis as any).StateLabelWidget;
        const input = {
            serverId: 's1', objectName: 'SharedMemory', sensor: 'Mode_S', sensorId: 42,
            states: [
                { from: 0, to: 0, text: 'OFF', fg: '#ffffff', bg: '#6b7280', blink: 'none' },
                { from: 1, to: 1, text: 'RUN', fg: '#ffffff', bg: '#22c55e', blink: 'none' },
            ],
            fallback: 'raw',
            fontSize: 'auto',
            bold: true,
            align: 'center',
        };
        form.innerHTML = W.getConfigForm(input);
        const out = W.parseConfigForm(form);
        expect(out.states.length).toBe(2);
        expect(out.states[0].text).toBe('OFF');
        expect(out.fallback).toBe('raw');
        expect(out.bold).toBe(true);
        expect(out.align).toBe('center');
    });

    it('parseConfigForm fallback=ignore picks fallbackHold', () => {
        const form = document.getElementById('form')! as HTMLFormElement;
        const W = (globalThis as any).StateLabelWidget;
        form.innerHTML = W.getConfigForm({ fallback: 'ignore', fallbackHold: true });
        // Switch radio
        (form.querySelector('input[name="fallback"][value="ignore"]') as HTMLInputElement).checked = true;
        const out = W.parseConfigForm(form);
        expect(out.fallback).toBe('ignore');
        expect(out.fallbackHold).toBe(true);
    });
});
```

- [ ] **Step 2: Run — должен FAIL**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run state-label-config-form.test.ts
```
Expected: FAIL (`getConfigForm is not a function`).

- [ ] **Step 3: Implement `getConfigForm`, `parseConfigForm`, `initConfigHandlers`**

В `StateLabelWidget` class в `61-dashboard-widget-state-label.js` добавить (после `destroy()`):

```javascript
    static getConfigForm(config = {}) {
        const states = Array.isArray(config.states) && config.states.length > 0
            ? config.states
            : [
                { from: 0, to: 0, text: 'OFF', fg: '#ffffff', bg: '#6b7280', blink: 'none' },
                { from: 1, to: 1, text: 'RUN', fg: '#ffffff', bg: '#22c55e', blink: 'none' },
            ];
        const fallback = config.fallback || 'raw';
        const fallbackHold = !!config.fallbackHold;
        const def = config.defaultState || { text: '--', fg: '#9ca3af', bg: '#1f2937', blink: 'none' };
        const fontSize = config.fontSize || 'auto';
        const bold = !!config.bold;
        const align = config.align || 'center';

        return `
            ${renderSensorBindingFields(config)}
            ${renderStateListEditor(states)}
            <div class="widget-config-field">
                <label>Fallback (no match)</label>
                <div class="state-label-fallback-options">
                    <label class="widget-checkbox-label">
                        <input type="radio" name="fallback" value="raw" ${fallback === 'raw' ? 'checked' : ''}>
                        <span>Show raw value</span>
                    </label>
                    <label class="widget-checkbox-label">
                        <input type="radio" name="fallback" value="ignore" ${fallback === 'ignore' ? 'checked' : ''}>
                        <span>Ignore</span>
                        <label class="widget-checkbox-label state-label-hold">
                            <input type="checkbox" name="fallbackHold" ${fallbackHold ? 'checked' : ''}>
                            <span>Hold last state</span>
                        </label>
                    </label>
                    <label class="widget-checkbox-label">
                        <input type="radio" name="fallback" value="default" ${fallback === 'default' ? 'checked' : ''}>
                        <span>Default state</span>
                    </label>
                </div>
                <div class="state-label-default-editor" style="${fallback === 'default' ? '' : 'display:none'}">
                    <input type="text"  name="defaultState-text" placeholder="--"      value="${escapeAttr(def.text || '--')}" class="widget-input">
                    <input type="color" name="defaultState-fg"   value="${escapeAttr(def.fg || '#9ca3af')}">
                    <input type="color" name="defaultState-bg"   value="${escapeAttr(def.bg || '#1f2937')}">
                </div>
            </div>
            <div class="widget-config-row">
                <div class="widget-config-field">
                    <label>Font size</label>
                    <select class="widget-select" name="fontSize">
                        <option value="auto" ${fontSize === 'auto' ? 'selected' : ''}>auto</option>
                        <option value="12"   ${fontSize === '12'   ? 'selected' : ''}>12px</option>
                        <option value="14"   ${fontSize === '14'   ? 'selected' : ''}>14px</option>
                        <option value="16"   ${fontSize === '16'   ? 'selected' : ''}>16px</option>
                        <option value="20"   ${fontSize === '20'   ? 'selected' : ''}>20px</option>
                        <option value="24"   ${fontSize === '24'   ? 'selected' : ''}>24px</option>
                        <option value="32"   ${fontSize === '32'   ? 'selected' : ''}>32px</option>
                    </select>
                </div>
                <div class="widget-config-field">
                    <label>Align</label>
                    <select class="widget-select" name="align">
                        <option value="left"   ${align === 'left'   ? 'selected' : ''}>Left</option>
                        <option value="center" ${align === 'center' ? 'selected' : ''}>Center</option>
                        <option value="right"  ${align === 'right'  ? 'selected' : ''}>Right</option>
                    </select>
                </div>
                <div class="widget-config-field">
                    <label class="widget-checkbox-label">
                        <input type="checkbox" name="bold" ${bold ? 'checked' : ''}>
                        <span>Bold</span>
                    </label>
                </div>
            </div>
        `;
    }

    static initConfigHandlers(form, config = {}) {
        if (typeof initSensorBindingHandlers === 'function') initSensorBindingHandlers(form, config);
        if (typeof setupStateListHandlers === 'function')    setupStateListHandlers(form);

        const defaultEditor = form.querySelector('.state-label-default-editor');
        form.querySelectorAll('input[name="fallback"]').forEach((radio) => {
            radio.addEventListener('change', () => {
                if (defaultEditor) {
                    defaultEditor.style.display =
                        form.querySelector('input[name="fallback"]:checked')?.value === 'default' ? '' : 'none';
                }
            });
        });
    }

    static parseConfigForm(form) {
        const binding = parseSensorBindingFields(form);
        const states  = parseStateList(form);
        const fallback = (form.querySelector('input[name="fallback"]:checked'))?.value || 'raw';
        const fallbackHold = (form.querySelector('input[name="fallbackHold"]'))?.checked || false;
        const defaultState = {
            text: (form.querySelector('[name="defaultState-text"]'))?.value || '--',
            fg:   (form.querySelector('[name="defaultState-fg"]'))?.value || '#9ca3af',
            bg:   (form.querySelector('[name="defaultState-bg"]'))?.value || '#1f2937',
            blink: 'none',
        };
        return {
            ...binding,
            states,
            fallback,
            fallbackHold,
            defaultState,
            fontSize: (form.querySelector('[name="fontSize"]') as HTMLSelectElement)?.value || 'auto',
            align:    (form.querySelector('[name="align"]')    as HTMLSelectElement)?.value || 'center',
            bold:     (form.querySelector('[name="bold"]')     as HTMLInputElement)?.checked  || false,
        };
    }
```

**Note:** В JS файле убрать TypeScript кастинги (`as HTMLSelectElement` и т.п.) — они нужны только в TS-тестах. Финальные строки для JS:

```javascript
            fontSize: form.querySelector('[name="fontSize"]')?.value || 'auto',
            align:    form.querySelector('[name="align"]')?.value || 'center',
            bold:     form.querySelector('[name="bold"]')?.checked  || false,
```

- [ ] **Step 4: Rebuild + run tests**

```bash
cd /home/pv/Projects/uniset-panel && make app
cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run state-label-config-form.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/61-dashboard-widget-state-label.js ui/static/js/app.js tests/unit/state-label-config-form.test.ts
git commit -m "$(cat <<'EOF'
state-label: getConfigForm/parseConfigForm/initConfigHandlers + tests

Reuse sensor binding helpers + state list editor. Fallback radios
скрывают/показывают defaultState editor.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — CSS + Registration

### Task 9: CSS

**Files:**
- Modify: `ui/static/css/style.css`

- [ ] **Step 1: Append CSS**

В конец `ui/static/css/style.css`:

```css
/* === State Label widget === */
.state-label-widget {
    border-radius: 4px;
}
.state-label-text {
    line-height: 1.2;
    user-select: none;
}

/* State list editor */
.state-list-editor { display: flex; flex-direction: column; gap: 6px; }
.state-list-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.state-list-add-btn {
    background: transparent; color: #60a5fa;
    border: 1px dashed #374151; border-radius: 4px;
    padding: 4px 10px; font-size: 12px; cursor: pointer;
}
.state-list-rows { display: flex; flex-direction: column; gap: 4px; max-height: 280px; overflow-y: auto; padding-right: 4px; }
.state-list-rows::-webkit-scrollbar { width: 6px; }
.state-list-rows::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 3px; }

.state-list-row {
    display: grid;
    grid-template-columns: 50px 70px 16px 70px 1fr 32px 32px 28px 24px;
    gap: 6px; align-items: center;
    padding: 4px 2px;
    border-radius: 3px;
    background: #0b1220;
}
.state-list-row.has-overlap { border-left: 2px solid #fbbf24; padding-left: 4px; }

.state-list-input,
.state-list-text {
    background: #1f2937; border: 1px solid #374151; border-radius: 3px;
    color: #d1d5db; padding: 5px 6px; font-size: 12px;
}
.state-list-input { width: 60px; text-align: right; }
.state-list-sep { color: #6b7280; text-align: center; }
.state-list-text { width: 100%; font-weight: 600; }
.state-list-color { width: 28px; height: 28px; border-radius: 3px; border: 1px solid #374151; cursor: pointer; padding: 0; }
.state-list-blink-btn {
    width: 28px; height: 28px; background: transparent;
    border: 1px solid #374151; border-radius: 3px; cursor: pointer; color: #6b7280;
}
.state-list-blink-btn.active { color: #fbbf24; border-color: #fbbf24; }
.state-list-remove {
    background: transparent; border: none; color: #6b7280;
    cursor: pointer; font-size: 16px;
}
.state-list-overlap-warn {
    margin: 2px 0 4px;
    padding: 4px 8px;
    background: rgba(251,191,36,.08);
    border-left: 3px solid #fbbf24;
    font-size: 11px; color: #fbbf24;
}

/* Blink popover */
.state-list-blink-popover {
    margin: 4px 0 6px;
    padding: 8px 10px;
    background: #111827; border: 1px solid #374151; border-radius: 4px;
    display: flex; flex-direction: column; gap: 4px;
}
.state-list-blink-row { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #d1d5db; }
.state-list-blink-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
.state-list-blink-fields label { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: #6b7280; }
.state-list-blink-fields input { background: #1f2937; border: 1px solid #374151; border-radius: 3px; color: #d1d5db; padding: 5px 6px; }

/* Default-state editor */
.state-label-default-editor {
    display: flex; gap: 8px; margin-top: 6px; align-items: center;
}
.state-label-default-editor input[type="text"] { flex: 1; }

/* Inline "Hold last state" sub-option */
.state-label-hold { margin-left: 24px; }
```

- [ ] **Step 2: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/css/style.css
git commit -m "$(cat <<'EOF'
css: state-label widget + state list editor + blink popover

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Register в WIDGET_TYPES + rebuild app.js

**Files:**
- Modify: `ui/static/js/src/62-dashboard-manager.js`

- [ ] **Step 1: Add to WIDGET_TYPES**

В `ui/static/js/src/62-dashboard-manager.js` строки 5-19 (внутри `WIDGET_TYPES` объекта) добавить новую запись (после `'label': LabelWidget`):

```javascript
const WIDGET_TYPES = {
    'gauge': GaugeWidget,
    'level': LevelWidget,
    'led': LedWidget,
    'label': LabelWidget,
    'state-label': StateLabelWidget,
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

- [ ] **Step 2: Rebuild app.js**

Run:
```bash
cd /home/pv/Projects/uniset-panel && make app
```
Expected: `Generated static/js/app.js from N files` (N увеличится на 1 из-за нового файла `61-dashboard-widget-state-label.js`).

- [ ] **Step 3: Verify app.js contains StateLabelWidget**

```bash
grep -c "class StateLabelWidget" /home/pv/Projects/uniset-panel/ui/static/js/app.js
```
Expected: `1`.

- [ ] **Step 4: Run full unit suite — sanity**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run
```
Expected: All PASS (incl. existing tests).

- [ ] **Step 5: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add ui/static/js/src/62-dashboard-manager.js ui/static/js/app.js
git commit -m "$(cat <<'EOF'
manager: register 'state-label' widget type

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — E2E + Docs

### Task 11: Playwright E2E spec

**Files:**
- Create: `tests/single/dashboard-state-label.spec.ts`

- [ ] **Step 1: Create E2E spec**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Dashboard State Label widget', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => (window as any).state?.servers?.size > 0);
    });

    async function setupDashboardWithStateLabel(page: any) {
        // Создаём dashboard с одним state-label widget'ом через injection
        await page.evaluate(() => {
            const dm = (window as any).dashboardManager;
            dm.switchView('dashboard');
            (window as any).dashboardState.dashboards.set('test-state-label', {
                version: 1,
                meta: { name: 'test-state-label' },
                grid: { cols: 24, rowHeight: 30, gap: 4 },
                widgets: [{
                    id: 'w-sl',
                    type: 'state-label',
                    position: { col: 1, row: 1, width: 6, height: 2 },
                    config: {
                        serverId: 'ghost', objectName: 'GhostObj',
                        sensor: 'Mode_S', sensorId: 1,
                        states: [
                            { from: 0, to: 0, text: 'OFF', fg: '#ffffff', bg: '#6b7280' },
                            { from: 1, to: 1, text: 'RUN', fg: '#ffffff', bg: '#22c55e' },
                            { from: 2, to: 2, text: 'FAULT', fg: '#ffffff', bg: '#ef4444', blink: { interval: 500 } },
                        ],
                        fallback: 'raw',
                    },
                }],
            });
            return dm.loadDashboard('test-state-label');
        });
    }

    test('state-label updates text/bg when value matches state', async ({ page }) => {
        await setupDashboardWithStateLabel(page);
        // simulate update for matching state
        await page.evaluate(() => {
            const w = (window as any).dashboardState.widgets.get('w-sl');
            w?.update(1);
        });
        const text = page.locator('.state-label-widget .state-label-text');
        await expect(text).toHaveText('RUN');
    });

    test('state-label fallback raw shows value as text', async ({ page }) => {
        await setupDashboardWithStateLabel(page);
        await page.evaluate(() => {
            const w = (window as any).dashboardState.widgets.get('w-sl');
            w?.update(99);
        });
        const text = page.locator('.state-label-widget .state-label-text');
        await expect(text).toHaveText('99');
    });

    test('config dialog renders state list editor + reorder buttons', async ({ page }) => {
        await setupDashboardWithStateLabel(page);
        await page.evaluate(() => (window as any).dashboardManager.toggleEditMode());
        await page.evaluate(() => (window as any).dashboardManager.showWidgetConfig('w-sl'));
        await page.waitForSelector('.state-list-editor');
        const rows = await page.locator('.state-list-row').count();
        expect(rows).toBeGreaterThanOrEqual(3);
        // section-move-btn present
        await expect(page.locator('.state-list-row .section-move-btn[data-move="up"]').first()).toBeVisible();
        await expect(page.locator('.state-list-row .section-move-btn[data-move="down"]').first()).toBeVisible();
    });
});
```

- [ ] **Step 2: Run E2E spec**

```bash
cd /home/pv/Projects/uniset-panel && docker compose down 2>&1 | tail -3
make js-tests TEST=single/dashboard-state-label.spec.ts 2>&1 | tail -25
```
Expected: 3 PASS.

- [ ] **Step 3: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add tests/single/dashboard-state-label.spec.ts
git commit -m "$(cat <<'EOF'
e2e: state-label widget — render, fallback raw, config editor

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: docs/dashboards.md секция

**Files:**
- Modify: `docs/dashboards.md`

- [ ] **Step 1: Identify insertion point**

Найди в `docs/dashboards.md` место после раздела `### Label` (или похожего passive widget). State Label идёт в семействе passive widgets.

- [ ] **Step 2: Add section**

Вставить новый раздел:

```markdown
### State Label

Привязывает к значению датчика человеко-читаемый текст с цветом и опциональным
миганием. Используется для status indicator'ов (RUN / STOP / FAULT / WARN).

![State Label](images/widget-state-label.png)

**Конфигурация:**

| Поле | Описание |
|---|---|
| `states` | Список диапазонов `{from, to, text, fg, bg, blink}`. First-match wins. |
| `from` / `to` | Числа или пусто (`-∞` / `+∞`). Inclusive. |
| `blink` | `'none'` или `{ interval: ms, duration?: ms }`. |
| `fallback` | `'raw'` (default), `'ignore'` (+ `fallbackHold`), `'default'` (+ `defaultState`). |
| `fontSize` | `'auto'` (default) или px. |
| `align` | `'left' | 'center' | 'right'`. |
| `bold` | bool. |

**Reorder диапазонов** через кнопки `↑` / `↓` (тот же стиль что и reorder
секций в tab-панели). Когда диапазоны перекрываются — Editor показывает
warning под "поглощённым" state.

**Blink behavior:** `interval` — толщина мигания (ms), `duration` — на сколько
ms мигать при transition в state (omit для вечного). Sanity floor — interval
не менее 100ms.

**Fallback policies:**
- `raw` — показывает голое число без fg/bg (визуальный сигнал «не сконфигурировано»)
- `ignore` — пусто (или удержать последний valid state при `fallbackHold: true`)
- `default` — отдельный configurable defaultState
```

- [ ] **Step 3: Commit**

```bash
cd /home/pv/Projects/uniset-panel
git add docs/dashboards.md
git commit -m "$(cat <<'EOF'
docs: section про StateLabelWidget в dashboards.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6 — Final

### Task 13: Full test run + push

**Files:** только команды.

- [ ] **Step 1: Run всё**

```bash
cd /home/pv/Projects/uniset-panel/tests/unit && npx vitest run 2>&1 | tail -20
```
Expected: All PASS (включая 16 + 15 + 11 + 3 new = ~45 новых tests).

```bash
cd /home/pv/Projects/uniset-panel && go test ./... 2>&1 | tail -10
```
Expected: All PASS (мы не трогали Go).

- [ ] **Step 2: Push**

```bash
cd /home/pv/Projects/uniset-panel
git push -u github story/state-label-widget 2>&1 | tail -5
```
Expected: branch pushed.

- [ ] **Step 3: Verify**

```bash
git log --oneline master..HEAD | head -20
```
Ожидание: ~13 коммитов (по одному на Task 1-12 + spec/visual commits ранее).

---

## Self-Review

| Spec section | Реализовано в task'е |
|---|---|
| Architecture (resolveStateLabel as pure function) | Task 2 |
| File structure | Tasks 1-12 (per-file) |
| Config Schema (states/fallback/appearance/blink) | Tasks 6, 8 (form), 4-5 (engine + render) |
| `resolveStateLabel` pure | Task 2 |
| `findStateOverlaps` | Task 2, Task 7 (usage) |
| Rendering (DOM, _applyState, fontSize/align/bold) | Task 3, 4 |
| Blink (interval, optional duration, sanity floor, cleanup) | Task 5 |
| Config Form + State List Editor | Tasks 6, 7, 8 |
| Reorder UX (section-move-btn, disabled на крайних) | Tasks 6 (markup), 7 (handler) |
| Overlap warning | Task 7 |
| Edge cases (null, NaN, error, destroy) | Tasks 2, 4, 5 |
| Testing (unit pure, unit DOM, E2E) | Tasks 2, 3-5, 6-8, 11 |
| Constants | Task 1 |

Все секции спека покрыты. Migration/breaking change — нет (новый widget).
