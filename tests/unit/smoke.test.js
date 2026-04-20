// tests/unit/smoke.test.js
import { describe, it, expect } from 'vitest';

describe('vitest infrastructure', () => {
    it('runs in jsdom', () => {
        expect(typeof window).toBe('object');
        expect(typeof document).toBe('object');
    });

    it('has localStorage', () => {
        localStorage.setItem('k', 'v');
        expect(localStorage.getItem('k')).toBe('v');
        localStorage.clear();
    });
});
