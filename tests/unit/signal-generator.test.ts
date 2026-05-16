import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

function loadSignalGenerator() {
    const constants = readFileSync(resolve(SRC_DIR, '00-constants.js'), 'utf8');
    const utils = readFileSync(resolve(SRC_DIR, '06-utils.js'), 'utf8');
    const src = readFileSync(resolve(SRC_DIR, '08-signal-generator.js'), 'utf8');
    new Function(`${constants}\n${utils}\n${src}\nglobalThis.SignalGenerator = SignalGenerator; globalThis.normalizeSignalGeneratorConfig = typeof normalizeSignalGeneratorConfig === 'function' ? normalizeSignalGeneratorConfig : undefined; globalThis.validateSignalGeneratorConfig = typeof validateSignalGeneratorConfig === 'function' ? validateSignalGeneratorConfig : undefined;`)();
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

    it('does not schedule wave generators faster than the minimum update interval', () => {
        const gen = new (globalThis as any).SignalGenerator({
            type: 'linear',
            min: 0,
            max: 100,
            step: 1,
            pause: 10,
            onTick: () => {},
        });

        expect(gen.computeUpdateInterval()).toBe(50);
    });

    it('normalizes generator config consistently for all generator UIs', () => {
        const normalize = (globalThis as any).normalizeSignalGeneratorConfig;

        expect(normalize({
            type: 'sin',
            min: '100',
            max: '0',
            step: '2',
            pause: '1',
        })).toEqual({
            type: 'sin',
            min: 0,
            max: 100,
            step: 4,
            pause: 10,
        });

        expect(normalize({
            type: 'square',
            min: '0',
            max: '1',
            pulseWidth: '0',
            pause: '0',
        })).toEqual({
            type: 'square',
            min: 0,
            max: 1,
            pulseWidth: 1,
            pause: 1,
        });
    });

    it('validates strict generator config for IONC dialogs', () => {
        const validate = (globalThis as any).validateSignalGeneratorConfig;

        expect(validate({
            type: 'square',
            min: '100',
            max: '50',
            pulseWidth: '10',
            pause: '10',
        })).toBe('Min должен быть меньше Max');

        expect(validate({
            type: 'random',
            min: '0',
            max: '100',
            period: '50',
        })).toBe('Период должен быть не менее 100мс');

        expect(validate({
            type: 'linear',
            min: '0',
            max: '100',
            step: '0',
            pause: '10',
        })).toBe('Шаг не может быть равен 0');

        expect(validate({
            type: 'square',
            min: '0',
            max: '1',
            pulseWidth: '1',
            pause: '1',
        })).toBe('');
    });
});
