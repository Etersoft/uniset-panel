import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../../ui/static/js/src');

function loadModule() {
    // 61-dashboard-widget-state-label.js defines class StateLabelWidget extends DashboardWidget
    // at module-evaluation time, so DashboardWidget (from 60-dashboard-base.js) must be in scope.
    const base = readFileSync(resolve(SRC, '60-dashboard-base.js'), 'utf8');
    const src = readFileSync(resolve(SRC, '61-dashboard-widget-state-label.js'), 'utf8');
    new Function(`${base}\n${src}`)();
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
