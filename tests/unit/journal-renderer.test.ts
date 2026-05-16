import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

function loadJournalRenderer() {
    const src = readFileSync(resolve(SRC_DIR, '35-journal.js'), 'utf8');
    new Function(`
        const JOURNAL_DEFAULT_LIMIT = 100;
        const JOURNAL_SEARCH_DEBOUNCE_DELAY = 300;
        const JOURNAL_HIGHLIGHT_DURATION = 2000;
        const JOURNAL_SCROLL_LOAD_RATIO = 0.8;
        const JOURNAL_CONTAINER_MIN_HEIGHT = 150;
        const JOURNAL_CONTAINER_MAX_HEIGHT = 800;
        ${src}
        globalThis.__JournalRenderer = JournalRenderer;
    `)();
    return (globalThis as any).__JournalRenderer;
}

describe('JournalRenderer', () => {
    it('escapes message cells rendered through innerHTML', () => {
        const JournalRenderer = loadJournalRenderer();
        const renderer = new JournalRenderer('j1', 'Journal');

        const html = renderer.renderMessageRow({
            timestamp: '2026-05-01T12:00:00Z',
            mtype: 'Alarm',
            message: '<img src=x onerror=alert(1)>',
            mcode: 'C<1',
            mgroup: 'G&1',
            name: 'Sensor"1',
            value: '<script>alert(1)</script>',
        });

        const host = document.createElement('table');
        host.innerHTML = `<tbody>${html}</tbody>`;

        expect(host.querySelector('img')).toBeNull();
        expect(host.querySelector('script')).toBeNull();
        expect(host.querySelector('.col-message')!.innerHTML).toContain('&lt;img');
        expect(host.querySelector('.col-value')!.innerHTML).toContain('&lt;script&gt;');
    });

    it('uses the same escaped cell renderer for live rows', () => {
        const JournalRenderer = loadJournalRenderer();
        const renderer = new JournalRenderer('j1', 'Journal');

        const html = renderer.renderMessageCells({
            timestamp: '2026-05-01T12:00:00Z',
            mtype: 'Normal',
            message: 'value changed',
            mcode: 0,
            mgroup: 'G1',
            name: 'Sensor1',
            value: 0,
        });

        const host = document.createElement('tr');
        host.innerHTML = html;

        expect(host.querySelector('.col-code')!.textContent).toBe('0');
        expect(host.querySelector('.col-value')!.textContent).toBe('0');
    });
});
