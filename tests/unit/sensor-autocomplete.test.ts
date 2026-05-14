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

    it('shows count footer with total when partial list returned', async () => {
        // First chunk: 2 sensors out of 50 total
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({
                count: 50,
                size: 2,
                sensors: [
                    { id: 1, name: 'A', type: 'AI', value: 0 },
                    { id: 2, name: 'B', type: 'AI', value: 0 },
                ],
            }),
        })));

        const input = document.querySelector<HTMLInputElement>('#sensor')!;
        const hidden = document.querySelector<HTMLInputElement>('#sensor-id')!;
        (window as any).setupSensorAutocomplete(input, hidden, () => 'SharedMemory', () => 'srv1');
        input.dispatchEvent(new FocusEvent('focus'));
        await new Promise(r => setTimeout(r, 0));
        await new Promise(r => setTimeout(r, 0));

        const footer = document.querySelector('.sensor-autocomplete-footer')!;
        expect(footer).not.toBeNull();
        expect(footer.textContent).toContain('2 из 50');
        expect(footer.textContent).toContain('прокрутите');
    });

    it('infinite scroll: fetchMore appends next chunk and updates offset', async () => {
        // Chunk 1: ids 1..3 (offset 0) | Chunk 2: ids 4..5 (offset 3, end of list)
        const fetchMock = vi.fn(async (urlIn: any) => {
            const url = String(urlIn);
            const offsetMatch = url.match(/[&?]offset=(\d+)/);
            const offset = offsetMatch ? parseInt(offsetMatch[1], 10) : 0;
            if (offset === 0) {
                return {
                    ok: true,
                    json: async () => ({
                        count: 5, size: 3,
                        sensors: [
                            { id: 1, name: 'A1', type: 'AI', value: 0 },
                            { id: 2, name: 'A2', type: 'AI', value: 0 },
                            { id: 3, name: 'A3', type: 'AI', value: 0 },
                        ],
                    }),
                } as any;
            }
            return {
                ok: true,
                json: async () => ({
                    count: 5, size: 2,
                    sensors: [
                        { id: 4, name: 'A4', type: 'AI', value: 0 },
                        { id: 5, name: 'A5', type: 'AI', value: 0 },
                    ],
                }),
            } as any;
        });
        vi.stubGlobal('fetch', fetchMock);

        const input = document.querySelector<HTMLInputElement>('#sensor')!;
        const hidden = document.querySelector<HTMLInputElement>('#sensor-id')!;
        (window as any).setupSensorAutocomplete(input, hidden, () => 'SharedMemory', () => 'srv1');
        input.dispatchEvent(new FocusEvent('focus'));
        await new Promise(r => setTimeout(r, 0));
        await new Promise(r => setTimeout(r, 0));

        // Initial fetch: 3 items rendered
        let items = document.querySelectorAll('.sensor-autocomplete-item');
        expect(items.length).toBe(3);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Fire scroll near bottom — jsdom doesn't compute scrollHeight realistically,
        // so simulate by directly invoking the dropdown's scroll handler via dispatching
        const dropdown = document.querySelector('.sensor-autocomplete-dropdown')! as HTMLElement;
        // Stub scrollHeight/clientHeight/scrollTop so threshold check passes
        Object.defineProperty(dropdown, 'scrollHeight', { configurable: true, get: () => 200 });
        Object.defineProperty(dropdown, 'clientHeight', { configurable: true, get: () => 100 });
        Object.defineProperty(dropdown, 'scrollTop',    { configurable: true, get: () => 100 }); // remaining=0 → trigger
        dropdown.dispatchEvent(new Event('scroll'));
        await new Promise(r => setTimeout(r, 0));
        await new Promise(r => setTimeout(r, 0));

        // After load-more: 5 items
        items = document.querySelectorAll('.sensor-autocomplete-item');
        expect(items.length).toBe(5);
        expect(fetchMock).toHaveBeenCalledTimes(2);

        // Footer: «5 из 5 — весь список»
        const footer = document.querySelector('.sensor-autocomplete-footer')!;
        expect(footer.textContent).toContain('5 из 5');
        expect(footer.textContent).toContain('весь список');

        // Verify offset=3 in second fetch URL
        const secondCall = fetchMock.mock.calls[1][0];
        expect(String(secondCall)).toContain('offset=3');
    });

    it('typing aborts in-flight fetch via requestId guard', async () => {
        // First fetch resolves slowly with stale data; second resolves fast with fresh.
        let firstResolve: any;
        const fetchMock = vi.fn(async (urlIn: any) => {
            const url = String(urlIn);
            if (url.includes('search=old')) {
                return new Promise((res) => {
                    firstResolve = () => res({
                        ok: true,
                        json: async () => ({ count: 1, size: 1, sensors: [{ id: 100, name: 'STALE', type: 'AI', value: 0 }] }),
                    });
                });
            }
            return {
                ok: true,
                json: async () => ({ count: 1, size: 1, sensors: [{ id: 200, name: 'FRESH', type: 'AI', value: 0 }] }),
            };
        });
        vi.stubGlobal('fetch', fetchMock);

        const input = document.querySelector<HTMLInputElement>('#sensor')!;
        const hidden = document.querySelector<HTMLInputElement>('#sensor-id')!;
        (window as any).setupSensorAutocomplete(input, hidden, () => 'SharedMemory', () => 'srv1');

        input.value = 'old';
        input.dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 200)); // wait past debounce 150ms

        // Trigger second search BEFORE first resolves
        input.value = 'new';
        input.dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 200));

        // Now resolve the stale first fetch
        firstResolve();
        await new Promise(r => setTimeout(r, 0));
        await new Promise(r => setTimeout(r, 0));

        // Dropdown must show FRESH, not STALE
        const items = document.querySelectorAll('.sensor-autocomplete-name');
        expect(items.length).toBe(1);
        expect(items[0].textContent).toBe('FRESH');
    });
});
