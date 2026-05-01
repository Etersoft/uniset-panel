import { describe, expect, it } from 'vitest';

declare global {
    var escapeHtml: (s: unknown) => string;
}

describe('escapeHtml', () => {
    it('escapes HTML text and preserves scalar values', () => {
        expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
        expect(escapeHtml(0)).toBe('0');
        expect(escapeHtml(false)).toBe('false');
    });

    it('handles null and undefined as empty text', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });
});
