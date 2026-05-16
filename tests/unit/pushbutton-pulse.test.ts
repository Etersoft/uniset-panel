import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

function loadDashboardButtonSources() {
    const files = [
        '00-constants.js',
        '00-state.js',
        '06-utils.js',
        '09-sensor-key.js',
        '60-dashboard-base.js',
        '60-widget-sensor-binding.js',
        '61-dashboard-active-base.js',
        '61-dashboard-active-button.js',
    ];
    const src = files.map(f => readFileSync(resolve(SRC_DIR, f), 'utf8')).join('\n');
    new Function(src)();
}

describe('PushButtonWidget pulse timing', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        const dom = new JSDOM('<!doctype html><html><body></body></html>');
        (globalThis as any).window = dom.window;
        (globalThis as any).document = dom.window.document;
        loadDashboardButtonSources();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('waits pulseWidth after valueOn write completes before sending valueOff', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const PushButtonWidget = (window as any).PushButtonWidget;
        const widget = new PushButtonWidget('pb', {
            sensor: 'CMD',
            sensorId: 100,
            serverId: 'srv',
            objectName: 'SharedMemory',
            mode: 'pulse',
            pulseWidth: 500,
            valueOn: 1,
            valueOff: 0,
        }, container);

        const writes: Array<{ value: number; at: number }> = [];
        widget._doWrite = async (value: number) => {
            if (value === 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            writes.push({ value, at: Date.now() });
            return true;
        };

        widget.render();
        container.querySelector('[data-test="btn"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        await vi.advanceTimersByTimeAsync(600);
        expect(writes).toEqual([]);

        await vi.advanceTimersByTimeAsync(400);
        expect(writes).toEqual([{ value: 1, at: expect.any(Number) }]);

        await vi.advanceTimersByTimeAsync(499);
        expect(writes).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(1);
        expect(writes.map(w => w.value)).toEqual([1, 0]);
    });

    it('sends valueOff after pulseWidth without waiting for sensor feedback', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const widget = new (window as any).PushButtonWidget('pb', {
            sensor: 'CMD',
            sensorId: 100,
            serverId: 'srv',
            objectName: 'SharedMemory',
            mode: 'pulse',
            pulseWidth: 250,
            valueOn: 1,
            valueOff: 0,
        }, container);

        const writes: number[] = [];
        widget._doWrite = async (value: number) => {
            writes.push(value);
            return true;
        };

        widget.render();
        container.querySelector('[data-test="btn"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        await vi.advanceTimersByTimeAsync(249);
        expect(writes).toEqual([1]);

        await vi.advanceTimersByTimeAsync(1);
        expect(writes).toEqual([1, 0]);
    });
});
