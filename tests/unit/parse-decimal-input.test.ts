import { describe, it, expect } from 'vitest';

describe('parseDecimalInputOrDefault', () => {
    it('accepts comma and dot decimals for operator numeric inputs', () => {
        const parseDecimalInputOrDefault = (globalThis as any).parseDecimalInputOrDefault;

        expect(parseDecimalInputOrDefault('1,5', 0)).toBe(1.5);
        expect(parseDecimalInputOrDefault('1.5', 0)).toBe(1.5);
        expect(parseDecimalInputOrDefault('-2,25', 0)).toBe(-2.25);
    });

    it('returns fallback for empty or invalid values', () => {
        const parseDecimalInputOrDefault = (globalThis as any).parseDecimalInputOrDefault;

        expect(parseDecimalInputOrDefault('', 7)).toBe(7);
        expect(parseDecimalInputOrDefault('abc', 7)).toBe(7);
    });
});
