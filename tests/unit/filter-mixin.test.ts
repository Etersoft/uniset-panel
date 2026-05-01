import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

function loadBaseRenderer() {
    const constants = readFileSync(resolve(SRC_DIR, '00-constants.js'), 'utf8');
    const utils = readFileSync(resolve(SRC_DIR, '06-utils.js'), 'utf8');
    const state = readFileSync(resolve(SRC_DIR, '00-state.js'), 'utf8');
    const base = readFileSync(resolve(SRC_DIR, '10-base-renderer.js'), 'utf8');
    new Function(`
        function getElementInTab() { return null; }
        function setupChartsResize() {}
        function updateChartLegends() {}
        function renderObjectInfo() {}
        ${constants}
        ${utils}
        ${state}
        ${base}
        globalThis.FilterMixin = FilterMixin;
    `)();
}

describe('FilterMixin pinned filter state', () => {
    it('treats type and status filters as active filters', () => {
        loadBaseRenderer();
        const mixin = (globalThis as any).FilterMixin;

        expect(mixin.shouldShowPinnedOnly.call({
            filter: '',
            typeFilter: 'AI',
            statusFilter: 'all',
        }, true)).toBe(false);

        expect(mixin.shouldShowPinnedOnly.call({
            filter: '',
            typeFilter: 'all',
            statusFilter: 'warn',
        }, true)).toBe(false);
    });

    it('shows pinned-only mode only when no filters are active', () => {
        loadBaseRenderer();
        const mixin = (globalThis as any).FilterMixin;

        expect(mixin.shouldShowPinnedOnly.call({
            filter: '  ',
            typeFilter: 'all',
            statusFilter: 'all',
        }, true)).toBe(true);

        expect(mixin.shouldShowPinnedOnly.call({
            filter: '',
            typeFilter: 'all',
            statusFilter: 'all',
        }, false)).toBe(false);
    });
});
