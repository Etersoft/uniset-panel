import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

function loadFormatValueHelpers() {
    const utils = readFileSync(resolve(SRC_DIR, '06-utils.js'), 'utf8');
    const render = readFileSync(resolve(SRC_DIR, '51-ui-render.js'), 'utf8');

    new Function(`
        function updateServerStatus() {}
        ${utils}
        ${render}
        globalThis.formatValue = formatValue;
        globalThis.formatValueHtml = formatValueHtml;
    `)();
}

describe('formatValueHtml', () => {
    it('preserves numeric formatting for HTML contexts', () => {
        loadFormatValueHelpers();

        expect((globalThis as any).formatValueHtml(42)).toBe('42');
        expect((globalThis as any).formatValueHtml(12.345)).toBe('12.35');
    });

    it('escapes formatted strings for innerHTML contexts', () => {
        loadFormatValueHelpers();

        const payload = '<img src=x onerror=alert(1)>';
        expect((globalThis as any).formatValue(payload)).toBe(payload);
        expect((globalThis as any).formatValueHtml(payload)).toBe('&lt;img src=x onerror=alert(1)&gt;');
    });
});
