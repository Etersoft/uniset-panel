import { describe, it, expect } from 'vitest';

describe('color zone helpers', () => {
    it('renders zone editor items consistently', () => {
        const html = (globalThis as any).renderColorZonesEditor(
            [{ from: 10, to: 20, color: '#123456' }],
            '#abcdef'
        );

        const host = document.createElement('div');
        host.innerHTML = html;

        expect(host.querySelector('.zones-editor')).not.toBeNull();
        expect(host.querySelector<HTMLInputElement>('.zone-color')!.value).toBe('#123456');
        expect(host.querySelectorAll('.zone-input')[0]).toHaveProperty('value', '10');
        expect(host.querySelectorAll('.zone-input')[1]).toHaveProperty('value', '20');
    });

    it('parses valid zone rows and skips incomplete ones', () => {
        const host = document.createElement('div');
        host.innerHTML = `
            <div class="zone-item">
                <input class="zone-color" value="#111111">
                <input class="zone-input" value="1">
                <input class="zone-input" value="2">
            </div>
            <div class="zone-item">
                <input class="zone-color" value="#222222">
                <input class="zone-input" value="">
                <input class="zone-input" value="5">
            </div>
        `;

        expect((globalThis as any).parseColorZones(host)).toEqual([
            { from: 1, to: 2, color: '#111111' },
        ]);
    });
});
