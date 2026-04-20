import { describe, it, expect, beforeAll } from 'vitest';
import { loadSrc } from './helpers/load-src.js';

beforeAll(() => {
    loadSrc('ui/static/js/src/58-overview-highlight.js');
});

function makeInst() {
    const nodeMap = new Map([
        ['A', { title: 'A' }],
        ['B', { title: 'B' }],
        ['C', { title: 'C' }],
        ['D', { title: 'D' }],
    ]);
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
        applyOverviewHighlight(inst, inst.nodeMap.get('A'));
        expect(inst.nodeMap.get('B').__hi).toBe(true);
        expect(inst.nodeMap.get('D').__hi).toBe(true);
        expect(inst.nodeMap.get('C').__dim).toBe(true);
        expect(inst._hiActive).toBe(true);
        expect(inst._hiEdges.has('A->B')).toBe(true);
        expect(inst._hiEdges.has('A->D')).toBe(true);
        expect(inst._hiEdges.has('B->C')).toBe(false);
    });

    it('does not mark clicked node as __dim', () => {
        const inst = makeInst();
        applyOverviewHighlight(inst, inst.nodeMap.get('A'));
        expect(inst.nodeMap.get('A').__dim).toBeFalsy();
    });

    it('handles node with no edges (isolated)', () => {
        const inst = makeInst();
        inst.nodeMap.set('Z', { title: 'Z' });
        applyOverviewHighlight(inst, inst.nodeMap.get('Z'));
        expect(inst._hiActive).toBe(true);
        expect(inst._hiEdges.size).toBe(0);
        expect(inst.nodeMap.get('A').__dim).toBe(true);
    });
});

describe('clearOverviewHighlight', () => {
    it('restores all nodes and clears set', () => {
        const inst = makeInst();
        applyOverviewHighlight(inst, inst.nodeMap.get('A'));
        clearOverviewHighlight(inst);
        for (const n of inst.nodeMap.values()) {
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
