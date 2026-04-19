import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadSrc } from './helpers/load-src.js';

beforeAll(() => {
    loadSrc('ui/static/js/src/60-detail-state.js');
    loadSrc('ui/static/js/src/60-detail-panel.js');
    loadSrc('ui/static/js/src/60-detail-trends.js');
});

beforeEach(() => {
    document.body.innerHTML = '';
    for (const k of Object.keys(detailInstances)) delete detailInstances[k];
});

describe('toggleTrendForDetail', () => {
    it('adds on first call, removes on second (no fetch)', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        toggleTrendForDetail(inst, 'in_Temp');
        expect(inst.selectedTrends.has('in_Temp')).toBe(true);
        expect(inst.trendsBuffer['in_Temp']).toEqual([]);
        toggleTrendForDetail(inst, 'in_Temp');
        expect(inst.selectedTrends.has('in_Temp')).toBe(false);
        expect(inst.trendsBuffer['in_Temp']).toBeUndefined();
    });
});

describe('updateTrendsFromSnapshot', () => {
    it('picks value from inputs array if present', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        inst.state.trendsWindow = 60;
        inst.selectedTrends.add('in_Temp');
        inst.trendsBuffer['in_Temp'] = [];
        inst.snapshot = {
            inputs: [{ id: 101, name: 'in_Temp', value: 42 }],
            outputs: [],
            variables: {}
        };
        updateTrendsFromSnapshot(inst);
        expect(inst.trendsBuffer['in_Temp'].length).toBe(1);
        expect(inst.trendsBuffer['in_Temp'][0].v).toBe(42);
    });

    it('picks value from variables map for local', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        inst.state.trendsWindow = 60;
        inst.selectedTrends.add('Counter');
        inst.trendsBuffer['Counter'] = [];
        inst.snapshot = { inputs: [], outputs: [], variables: { Counter: 5 } };
        updateTrendsFromSnapshot(inst);
        expect(inst.trendsBuffer['Counter'][0].v).toBe(5);
    });

    it('prunes points older than window', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        inst.state.trendsWindow = 1; // 1 second
        inst.selectedTrends.add('X');
        const now = Date.now();
        inst.trendsBuffer['X'] = [
            { t: now - 5000, v: 10 },
            { t: now - 500,  v: 20 }
        ];
        inst.snapshot = { inputs: [], outputs: [], variables: { X: 30 } };
        updateTrendsFromSnapshot(inst);
        const buf = inst.trendsBuffer['X'];
        expect(buf.length).toBe(2);
        expect(buf[buf.length - 1].v).toBe(30);
    });

    it('does nothing for unselected variables', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        inst.snapshot = { inputs: [], outputs: [], variables: { Other: 99 } };
        updateTrendsFromSnapshot(inst);
        expect(inst.trendsBuffer['Other']).toBeUndefined();
    });
});

describe('trendsToCsv', () => {
    it('serializes buffers to CSV', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        inst.selectedTrends.add('in_Temp');
        inst.trendsBuffer['in_Temp'] = [{ t: 1000, v: 10 }, { t: 2000, v: 20 }];
        const csv = trendsToCsv(inst);
        expect(csv).toContain('timestamp_ms,variable,value');
        expect(csv).toContain('1000,in_Temp,10');
        expect(csv).toContain('2000,in_Temp,20');
    });
});
