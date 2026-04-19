import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadSrc } from './helpers/load-src.js';
import { setupDetailDOM } from './helpers/detail-dom.js';

beforeAll(() => {
    loadSrc('ui/static/js/src/60-detail-state.js');
    loadSrc('ui/static/js/src/60-detail-panel.js');
});

beforeEach(() => {
    if (typeof detailInstances === 'object') {
        for (const k of Object.keys(detailInstances)) delete detailInstances[k];
    }
    setupDetailDOM();
    localStorage.clear();
});

describe('openDetailPanel', () => {
    it('creates instance with correct key', () => {
        openDetailPanel('srv-1', 'Server1', 'DG_Control');
        expect(detailInstances['srv-1:DG_Control']).toBeDefined();
        const inst = detailInstances['srv-1:DG_Control'];
        expect(inst.serverId).toBe('srv-1');
        expect(inst.objectName).toBe('DG_Control');
        expect(inst.serverName).toBe('Server1');
    });

    it('duplicate open does not create second instance', () => {
        openDetailPanel('srv-1', 'Server1', 'DG_Control');
        const first = detailInstances['srv-1:DG_Control'];
        openDetailPanel('srv-1', 'Server1', 'DG_Control');
        expect(detailInstances['srv-1:DG_Control']).toBe(first);
    });

    it('loads persisted state (activeInnerTab)', () => {
        localStorage.setItem(
            'uniset-panel:detail:srv-1:DG_Control',
            JSON.stringify({ ...detailStateDefault(), activeInnerTab: 'trends' })
        );
        openDetailPanel('srv-1', 'Server1', 'DG_Control');
        const inst = detailInstances['srv-1:DG_Control'];
        expect(inst.state.activeInnerTab).toBe('trends');
    });
});

describe('closeDetailPanel', () => {
    it('removes instance', () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        closeDetailPanel('srv-1:X');
        expect(detailInstances['srv-1:X']).toBeUndefined();
    });
});

describe('uniset:node-double-clicked listener', () => {
    it('opens detail panel on CustomEvent', () => {
        document.dispatchEvent(new CustomEvent('uniset:node-double-clicked', {
            detail: { serverId: 'srv-1', serverName: 'Server1', objectName: 'MyObj' }
        }));
        expect(detailInstances['srv-1:MyObj']).toBeDefined();
    });
});

describe('uniset:schema-closed cleanup', () => {
    it('closes all detail panels for the closed server', () => {
        openDetailPanel('srv-1', 'Server1', 'A');
        openDetailPanel('srv-1', 'Server1', 'B');
        openDetailPanel('srv-2', 'Server2', 'C');
        document.dispatchEvent(new CustomEvent('uniset:schema-closed', {
            detail: { serverId: 'srv-1' }
        }));
        expect(detailInstances['srv-1:A']).toBeUndefined();
        expect(detailInstances['srv-1:B']).toBeUndefined();
        expect(detailInstances['srv-2:C']).toBeDefined();
    });
});
