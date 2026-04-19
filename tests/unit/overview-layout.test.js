// tests/unit/overview-layout.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import { loadSrc } from './helpers/load-src.js';

beforeAll(async () => {
    const dagre = await import('dagre');
    globalThis.dagre = dagre.default || dagre;
    loadSrc('ui/static/js/src/58-overview-layout.js');
});

describe('autoOrientation', () => {
    it('chooses LR when edges > nodes', () => {
        const nodes = [{name:'a'},{name:'b'},{name:'c'}];
        const edges = [
            {fromNode:'a',toNode:'b'},
            {fromNode:'b',toNode:'c'},
            {fromNode:'a',toNode:'c'},
            {fromNode:'c',toNode:'a'},
        ];
        expect(autoOrientation(nodes, edges)).toBe('LR');
    });
    it('chooses TB when edges <= nodes', () => {
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
