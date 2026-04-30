import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

function loadSignalGenerator() {
    const src = readFileSync(resolve(SRC_DIR, '08-signal-generator.js'), 'utf8');
    new Function(`${src}\nglobalThis.SignalGenerator = SignalGenerator;`)();
}

describe('SignalGenerator square pulse timing', () => {
    beforeEach(() => {
        loadSignalGenerator();
    });

    it('uses pulseWidth for high phase and pause for low phase', () => {
        const gen = new (globalThis as any).SignalGenerator({
            type: 'square',
            min: 0,
            max: 1,
            pulseWidth: 200,
            pause: 300,
            onTick: () => {},
        });

        expect(gen.computeValue(0)).toBe(1);
        expect(gen.computeValue(199)).toBe(1);
        expect(gen.computeValue(200)).toBe(0);
        expect(gen.computeValue(499)).toBe(0);
        expect(gen.computeValue(500)).toBe(1);
    });
});
