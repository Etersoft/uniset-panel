import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

function loadSseHelpers() {
    const src = readFileSync(resolve(SRC_DIR, '04-sse.js'), 'utf8');
    new Function(`
        ${src}
        globalThis.sanitizeEventSourceUrlForLog = sanitizeEventSourceUrlForLog;
    `)();
}

describe('sanitizeEventSourceUrlForLog', () => {
    it('redacts token query value while preserving endpoint context', () => {
        loadSseHelpers();

        expect((globalThis as any).sanitizeEventSourceUrlForLog('/api/events?token=secret-value'))
            .toBe('/api/events?token=[redacted]');
    });

    it('leaves tokenless URLs readable', () => {
        loadSseHelpers();

        expect((globalThis as any).sanitizeEventSourceUrlForLog('/api/events')).toBe('/api/events');
    });
});
