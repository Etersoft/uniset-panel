import { describe, it, expect } from 'vitest';

declare const computeSensorChunkPagination: (currentItemsLength: number, data: any, chunkSize: number) => { total: number; hasMore: boolean };

describe('computeSensorChunkPagination', () => {
    it('uses data.size as total when present', () => {
        const meta = computeSensorChunkPagination(3, { size: 100, sensors: [{}, {}, {}] }, 50);
        expect(meta.total).toBe(100);
        expect(meta.hasMore).toBe(true);
    });

    it('hasMore=false when currentItemsLength reaches reported total', () => {
        const meta = computeSensorChunkPagination(50, { size: 50, sensors: [{}] }, 50);
        expect(meta.total).toBe(50);
        expect(meta.hasMore).toBe(false);
    });

    it('ignores data.count (which is chunk size, not total)', () => {
        // count=20 is misleading; size=237 is what matters.
        const meta = computeSensorChunkPagination(20, { size: 237, count: 20, sensors: Array(20).fill({}) }, 50);
        expect(meta.total).toBe(237);
        expect(meta.hasMore).toBe(true);
    });

    it('fallback heuristic: full chunk → hasMore=true (no size field)', () => {
        const meta = computeSensorChunkPagination(50, { sensors: Array(50).fill({}) }, 50);
        expect(meta.hasMore).toBe(true);
        expect(meta.total).toBe(51); // best-effort placeholder for footer
    });

    it('fallback heuristic: partial chunk → hasMore=false (no size field)', () => {
        const meta = computeSensorChunkPagination(7, { sensors: Array(7).fill({}) }, 50);
        expect(meta.hasMore).toBe(false);
        expect(meta.total).toBe(7);
    });

    it('handles missing data.sensors gracefully', () => {
        const meta = computeSensorChunkPagination(0, { size: 0 }, 50);
        expect(meta.hasMore).toBe(false);
    });

    it('handles size=0 by falling through to heuristic', () => {
        // size=0 treated as "not reported" — heuristic kicks in.
        const meta = computeSensorChunkPagination(50, { size: 0, sensors: Array(50).fill({}) }, 50);
        expect(meta.hasMore).toBe(true);
    });

    it('null data does not crash', () => {
        const meta = computeSensorChunkPagination(0, null, 50);
        expect(meta.hasMore).toBe(false);
    });
});
