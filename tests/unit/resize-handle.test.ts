import { describe, expect, it, vi } from 'vitest';

describe('setupResizeHandle', () => {
    function makeFixture(height = 120) {
        const handle = document.createElement('div');
        const container = document.createElement('div');
        Object.defineProperty(container, 'offsetHeight', {
            configurable: true,
            get: () => parseInt(container.style.height || String(height), 10),
        });
        container.style.height = `${height}px`;
        document.body.append(handle, container);
        return { handle, container };
    }

    it('resizes downward and saves the final height', () => {
        const { handle, container } = makeFixture(120);
        const onSave = vi.fn();

        (globalThis as any).setupResizeHandle(handle, container, 100, onSave, 200);

        handle.dispatchEvent(new MouseEvent('mousedown', { clientY: 10, bubbles: true }));
        document.dispatchEvent(new MouseEvent('mousemove', { clientY: 50, bubbles: true }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        expect(container.style.height).toBe('160px');
        expect(onSave).toHaveBeenCalledWith(160);
    });

    it('supports inverted vertical resize for handles dragged upward', () => {
        const { handle, container } = makeFixture(120);
        const onSave = vi.fn();

        (globalThis as any).setupResizeHandle(handle, container, 50, onSave, 300, null, { direction: -1 });

        handle.dispatchEvent(new MouseEvent('mousedown', { clientY: 100, bubbles: true }));
        document.dispatchEvent(new MouseEvent('mousemove', { clientY: 70, bubbles: true }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        expect(container.style.height).toBe('150px');
        expect(onSave).toHaveBeenCalledWith(150);
    });
});
