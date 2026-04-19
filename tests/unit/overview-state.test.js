import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
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

describe('flushOverviewState', () => {
    it('does not throw on quota failure', () => {
        const orig = localStorage.setItem;
        localStorage.setItem = () => { throw new Error('QuotaExceeded'); };
        expect(() => flushOverviewState('srv-x', {zoom:2})).not.toThrow();
        localStorage.setItem = orig;
    });
});

describe('saveOverviewState debounce', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('saveOverviewState is debounced by 300ms', () => {
        vi.useFakeTimers();
        const state = overviewStateDefault();
        state.zoom = 3.0;
        saveOverviewState('srv-debounce', state);

        expect(localStorage.getItem('uniset-panel:overview:srv-debounce')).toBeNull();

        vi.advanceTimersByTime(299);
        expect(localStorage.getItem('uniset-panel:overview:srv-debounce')).toBeNull();

        vi.advanceTimersByTime(1);
        const stored = localStorage.getItem('uniset-panel:overview:srv-debounce');
        expect(stored).not.toBeNull();
        expect(JSON.parse(stored).zoom).toBe(3.0);
    });
});
