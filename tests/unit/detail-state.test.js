import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { loadSrc } from './helpers/load-src.js';

beforeAll(() => {
    loadSrc('ui/static/js/src/60-detail-state.js');
});

beforeEach(() => {
    localStorage.clear();
});

describe('detailStateDefault', () => {
    it('shape covers all required fields', () => {
        const d = detailStateDefault();
        expect(d).toMatchObject({
            v: 1,
            activeInnerTab: 'variables',
            selectedTrends: [],
            trendsWindow: 60,
            logFilter: '',
            logSize: 256,
            logPaused: false,
            logEnabled: false,
            varsCollapsed: { inputs: false, outputs: false, locals: true, fb_instances: true }
        });
    });
});

describe('loadDetailState / saveDetailState', () => {
    it('round-trip persists fields verbatim', () => {
        const state = {
            v: 1, activeInnerTab: 'trends', selectedTrends: ['in_Temp'],
            trendsWindow: 300, logFilter: 'sensor', logSize: 512,
            logPaused: true, logEnabled: true,
            varsCollapsed: { inputs: true, outputs: false, locals: false, fb_instances: true }
        };
        flushDetailStateImmediate('srv-1', 'DG_Control', state);
        const loaded = loadDetailState('srv-1', 'DG_Control');
        expect(loaded).toEqual(state);
    });

    it('returns defaults when key missing', () => {
        const d = loadDetailState('srv-9', 'Ghost');
        expect(d).toEqual(detailStateDefault());
    });

    it('version mismatch resets to defaults', () => {
        localStorage.setItem(
            'uniset-panel:detail:srv-1:X',
            JSON.stringify({ v: 99, activeInnerTab: 'trends' })
        );
        const d = loadDetailState('srv-1', 'X');
        expect(d).toEqual(detailStateDefault());
    });

    it('malformed JSON does not throw', () => {
        localStorage.setItem('uniset-panel:detail:srv-1:X', '{not-json{{');
        expect(() => loadDetailState('srv-1', 'X')).not.toThrow();
        expect(loadDetailState('srv-1', 'X')).toEqual(detailStateDefault());
    });

    it('save survives localStorage quota error', () => {
        const origSet = localStorage.setItem.bind(localStorage);
        localStorage.setItem = () => { throw new DOMException('QuotaExceeded'); };
        expect(() => {
            saveDetailState('srv-1', 'X', detailStateDefault());
            flushDetailStateImmediate('srv-1', 'X', detailStateDefault());
        }).not.toThrow();
        localStorage.setItem = origSet;
    });
});

describe('saveDetailState debounce', () => {
    afterEach(() => vi.useRealTimers());

    it('is debounced by 300ms', () => {
        vi.useFakeTimers();
        const key = 'uniset-panel:detail:srv-1:DG_Control';
        saveDetailState('srv-1', 'DG_Control',
            { ...detailStateDefault(), activeInnerTab: 'trends' });
        expect(localStorage.getItem(key)).toBeNull();
        vi.advanceTimersByTime(299);
        expect(localStorage.getItem(key)).toBeNull();
        vi.advanceTimersByTime(1);
        expect(localStorage.getItem(key)).toContain('"activeInnerTab":"trends"');
    });
});
