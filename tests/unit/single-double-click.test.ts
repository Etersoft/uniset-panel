import { describe, it, expect, vi } from 'vitest';

describe('bindSingleDoubleClick', () => {
    it('runs single action after delay when no second click arrives', () => {
        vi.useFakeTimers();
        const button = document.createElement('button');
        const onSingle = vi.fn();
        const onDouble = vi.fn();

        (globalThis as any).bindSingleDoubleClick(button, onSingle, onDouble, 25);
        button.click();

        expect(onSingle).not.toHaveBeenCalled();
        vi.advanceTimersByTime(25);

        expect(onSingle).toHaveBeenCalledTimes(1);
        expect(onDouble).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('runs double action and cancels pending single action on second click', () => {
        vi.useFakeTimers();
        const button = document.createElement('button');
        const onSingle = vi.fn();
        const onDouble = vi.fn();

        (globalThis as any).bindSingleDoubleClick(button, onSingle, onDouble, 25);
        button.click();
        button.click();
        vi.advanceTimersByTime(25);

        expect(onSingle).not.toHaveBeenCalled();
        expect(onDouble).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});
