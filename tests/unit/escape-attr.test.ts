import { describe, it, expect } from 'vitest';

declare global {
    var escapeAttr: (s: unknown) => string;
}

describe('escapeAttr', () => {
    it('handles null/undefined/empty as empty string', () => {
        expect(escapeAttr(null)).toBe('');
        expect(escapeAttr(undefined)).toBe('');
        expect(escapeAttr('')).toBe('');
    });

    it('passes plain ascii through unchanged', () => {
        expect(escapeAttr('hello world')).toBe('hello world');
        expect(escapeAttr('Sensor_42-OK')).toBe('Sensor_42-OK');
    });

    it('escapes double quote so attribute boundary stays intact', () => {
        expect(escapeAttr('a"b')).toBe('a&quot;b');
        expect(escapeAttr('"')).toBe('&quot;');
    });

    it('escapes single quote', () => {
        expect(escapeAttr("o'clock")).toBe('o&#39;clock');
    });

    it('escapes ampersand first to avoid double-encoding', () => {
        expect(escapeAttr('a & b')).toBe('a &amp; b');
        expect(escapeAttr('&amp;')).toBe('&amp;amp;');
    });

    it('escapes angle brackets', () => {
        expect(escapeAttr('<script>')).toBe('&lt;script&gt;');
    });

    it('coerces numbers and booleans to string', () => {
        expect(escapeAttr(42)).toBe('42');
        expect(escapeAttr(0)).toBe('0');
        expect(escapeAttr(true)).toBe('true');
    });

    it('blocks attribute injection via quote payload', () => {
        const userInput = '" onerror="alert(1)';
        const html = `<img alt="${escapeAttr(userInput)}">`;
        expect(html).toBe('<img alt="&quot; onerror=&quot;alert(1)">');
        expect(html).not.toContain('onerror="alert');
    });
});
