import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

function loadAutocomplete() {
    const constants = readFileSync(resolve(SRC_DIR, '00-constants.js'), 'utf8');
    const src = readFileSync(resolve(SRC_DIR, '41-sensor-autocomplete.js'), 'utf8');
    new Function(`${constants}\n${src}`)();
}

describe('setupSensorAutocomplete', () => {
    beforeEach(() => {
        document.body.innerHTML = '<input id="sensor"><input id="sensor-id" type="hidden">';
        loadAutocomplete();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('escapes sensor value before rendering suggestions', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({
                sensors: [{
                    id: 42,
                    name: 'Sensor42',
                    type: 'AI',
                    value: '<img src=x onerror=alert(1)>',
                }],
            }),
        })));

        const input = document.querySelector<HTMLInputElement>('#sensor')!;
        const hidden = document.querySelector<HTMLInputElement>('#sensor-id')!;
        (window as any).setupSensorAutocomplete(input, hidden, () => 'SharedMemory', () => 'srv1');

        input.dispatchEvent(new FocusEvent('focus'));
        await new Promise(resolve => setTimeout(resolve, 0));
        await new Promise(resolve => setTimeout(resolve, 0));

        const dropdown = document.querySelector('.sensor-autocomplete-dropdown')!;
        expect(dropdown.querySelector('img')).toBeNull();
        expect(dropdown.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });
});
