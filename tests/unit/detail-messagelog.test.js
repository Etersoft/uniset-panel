import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadSrc } from './helpers/load-src.js';
import { setupDetailDOM } from './helpers/detail-dom.js';

beforeAll(() => {
    // Task 3.x deps
    loadSrc('ui/static/js/src/60-detail-state.js');
    loadSrc('ui/static/js/src/60-detail-panel.js');
    loadSrc('ui/static/js/src/60-detail-messagelog.js');
    // window.UnisetOverview.trace not loaded — subscribeTraceForDetail
    // detects its absence gracefully. We test the unit behavior in isolation.
});

beforeEach(() => {
    setupDetailDOM();
    for (const k of Object.keys(detailInstances)) delete detailInstances[k];
    // Ensure the trace namespace is clean for subscribe-path tests.
    delete window.UnisetOverview;
});

describe('onTraceBatch', () => {
    it('appends records when not paused', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        onTraceBatch(inst, {
            enabled: true, overflow: false,
            records: [
                { time_us: 1000, event_time_us: 500, id: 101, value: 75,
                  supplier_id: 42, type: 'sensorInfo' }
            ]
        });
        expect(inst.logBuffer.length).toBe(1);
        expect(inst.logBuffer[0].type).toBe('sensorInfo');
    });

    it('does not append when paused', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        inst.logPaused = true;
        onTraceBatch(inst, {
            enabled: true, records: [{ time_us: 1, id: 1, type: 'timerInfo' }]
        });
        expect(inst.logBuffer.length).toBe(0);
    });

    it('respects 5000 hard cap', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        const bigBatch = { enabled: true, records: [] };
        for (let i = 0; i < 6000; i++) {
            bigBatch.records.push({ time_us: i, id: i, type: 'sensorInfo' });
        }
        onTraceBatch(inst, bigBatch);
        expect(inst.logBuffer.length).toBe(5000);
    });

    it('surfaces overflow flag', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        onTraceBatch(inst, { enabled: true, overflow: true, records: [] });
        expect(inst.logOverflow).toBe(true);
    });

    it('records enabled state from batch', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        onTraceBatch(inst, { enabled: false, records: [] });
        expect(inst.logEnabled).toBe(false);
        onTraceBatch(inst, { enabled: true, records: [] });
        expect(inst.logEnabled).toBe(true);
    });
});

describe('matchesLogFilter', () => {
    it('substring match on type/name/supplier', () => {
        const rec = { type: 'sensorInfo', name: 'Temp', supplier: 'Disp', value: 42 };
        expect(matchesLogFilter(rec, '')).toBe(true);
        expect(matchesLogFilter(rec, 'sensor')).toBe(true);
        expect(matchesLogFilter(rec, 'Disp')).toBe(true);
        expect(matchesLogFilter(rec, 'Temp')).toBe(true);
        expect(matchesLogFilter(rec, 'nothing')).toBe(false);
    });
});

describe('enrichLogRecord', () => {
    it('resolves sensor id → name from snapshot', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        inst.snapshot = {
            inputs: [{ id: 101, name: 'in_Temp', value: 10 }],
            outputs: [{ id: 205, name: 'out_Speed', value: 20 }]
        };
        const out1 = enrichLogRecord(inst, { id: 101, type: 'sensorInfo', value: 1 });
        expect(out1.name).toBe('in_Temp');
        const out2 = enrichLogRecord(inst, { id: 205, type: 'sensorInfo', value: 2 });
        expect(out2.name).toBe('out_Speed');
        const out3 = enrichLogRecord(inst, { id: 999, type: 'sensorInfo', value: 3 });
        expect(out3.name).toBeUndefined();
    });
});

describe('logToCsv', () => {
    it('serializes buffer to CSV', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        inst.logBuffer = [
            { time_us: 1000, type: 'sensorInfo', id: 101, value: 75,
              supplier_id: 42 }
        ];
        const csv = logToCsv(inst);
        expect(csv).toContain('time_us,type,id,value,supplier_id');
        expect(csv).toContain('1000,sensorInfo,101,75,42');
    });
});
