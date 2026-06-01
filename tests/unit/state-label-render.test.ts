import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../../ui/static/js/src');

function loadModule() {
    const constants = readFileSync(resolve(SRC, '00-constants.js'), 'utf8');
    const base = readFileSync(resolve(SRC, '60-dashboard-base.js'), 'utf8');
    const utils = readFileSync(resolve(SRC, '06-utils.js'), 'utf8');
    const state = readFileSync(resolve(SRC, '61-dashboard-widget-state-label.js'), 'utf8');
    new Function(`${constants}\n${utils}\n${base}\n${state}`)();
}

describe('StateLabelWidget render', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="container"></div>';
        loadModule();
    });

    it('static type/displayName/defaultSize', () => {
        const W = (globalThis as any).StateLabelWidget;
        expect(W.type).toBe('state-label');
        expect(W.displayName).toBe('State Label');
        expect(W.defaultSize).toEqual({ width: 6, height: 2 });
    });

    it('render() creates .state-label-widget + .state-label-text', () => {
        const container = document.getElementById('container')!;
        const W = (globalThis as any).StateLabelWidget;
        const w = new W('w1', { states: [] }, container);
        w.render();
        expect(container.querySelector('.state-label-widget')).toBeTruthy();
        expect(container.querySelector('.state-label-text')).toBeTruthy();
    });

    it('render() applies align and bold from config', () => {
        const container = document.getElementById('container')!;
        const W = (globalThis as any).StateLabelWidget;
        const w = new W('w2', { align: 'right', bold: true }, container);
        w.render();
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        const text = container.querySelector('.state-label-text') as HTMLElement;
        expect(root.style.justifyContent).toBe('flex-end');
        expect(text.style.fontWeight).toBe('700');
    });
});

describe('StateLabelWidget update', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="container"></div>';
        loadModule();
    });

    function mount(config: any = {}) {
        const W = (globalThis as any).StateLabelWidget;
        const container = document.getElementById('container')!;
        const w = new W('wU', config, container);
        w.render();
        return { w, container };
    }

    const states = [
        { from: 0, to: 0, text: 'OFF', fg: '#fff', bg: '#6b7280' },
        { from: 1, to: 1, text: 'RUN', fg: '#fff', bg: '#22c55e' },
    ];

    it('matched state → text/fg/bg applied', () => {
        const { w, container } = mount({ states });
        w.update(1);
        const text = container.querySelector('.state-label-text') as HTMLElement;
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        expect(text.textContent).toBe('RUN');
        expect(text.style.color).toBe('rgb(255, 255, 255)');
        expect(root.style.background).toBe('rgb(34, 197, 94)');
    });

    it('no match + fallback raw → raw value text, no bg', () => {
        const { w, container } = mount({ states, fallback: 'raw' });
        w.update(42);
        const text = container.querySelector('.state-label-text') as HTMLElement;
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        expect(text.textContent).toBe('42');
        expect(root.style.background).toBe('');
    });

    it('no match + fallback ignore (no hold) → blank text + no bg', () => {
        const { w, container } = mount({ states, fallback: 'ignore', fallbackHold: false });
        w.update(42);
        const text = container.querySelector('.state-label-text') as HTMLElement;
        expect(text.textContent).toBe('');
    });

    it('no match + fallback ignore + hold → keeps prev state', () => {
        const { w, container } = mount({ states, fallback: 'ignore', fallbackHold: true });
        w.update(1);     // OFF=0, RUN=1 → matches RUN
        w.update(999);   // no match → hold RUN
        const text = container.querySelector('.state-label-text') as HTMLElement;
        expect(text.textContent).toBe('RUN');
    });

    it('no match + fallback default → defaultState applied', () => {
        const { w, container } = mount({
            states, fallback: 'default',
            defaultState: { text: 'UNKNOWN', fg: '#aaa', bg: '#333' },
        });
        w.update(999);
        const text = container.querySelector('.state-label-text') as HTMLElement;
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        expect(text.textContent).toBe('UNKNOWN');
        expect(root.style.background).toBe('rgb(51, 51, 51)');
    });

    it('error path → fallback', () => {
        const { w, container } = mount({ states, fallback: 'raw' });
        w.update(1, 'sse error');
        const text = container.querySelector('.state-label-text') as HTMLElement;
        // null → raw shows '--'
        expect(text.textContent).toBe('--');
    });
});

describe('StateLabelWidget blink', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="container"></div>';
        loadModule();
        vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    function mount(config: any) {
        const W = (globalThis as any).StateLabelWidget;
        const container = document.getElementById('container')!;
        const w = new W('wB', config, container);
        w.render();
        return { w, container };
    }

    it('blink {interval} — opacity toggles each interval', () => {
        const states = [{ from: 1, to: 1, text: 'A', blink: { interval: 500 } }];
        const { w, container } = mount({ states });
        w.update(1);
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        expect(root.style.opacity).toBe('1');
        vi.advanceTimersByTime(500);
        expect(root.style.opacity).toBe(String((globalThis as any).STATE_LABEL_BLINK_FADED_OPACITY));
        vi.advanceTimersByTime(500);
        expect(root.style.opacity).toBe('1');
    });

    it('blink {interval, duration} — stops after duration ms', () => {
        const states = [{ from: 1, to: 1, text: 'A', blink: { interval: 500, duration: 1200 } }];
        const { w, container } = mount({ states });
        w.update(1);
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        vi.advanceTimersByTime(1300);
        expect(root.style.opacity).toBe('1');
        // After stop, interval не должен продолжаться
        vi.advanceTimersByTime(2000);
        expect(root.style.opacity).toBe('1');
    });

    it('blink interval < min floor → no blink', () => {
        const states = [{ from: 1, to: 1, text: 'A', blink: { interval: 50 } }];
        const { w, container } = mount({ states });
        w.update(1);
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        vi.advanceTimersByTime(2000);
        expect(root.style.opacity).toBe('1');  // никогда не fade
    });

    it('state change → blink stops (timer cleared)', () => {
        const states = [
            { from: 1, to: 1, text: 'A', blink: { interval: 500 } },
            { from: 2, to: 2, text: 'B' },   // no blink
        ];
        const { w, container } = mount({ states });
        w.update(1);
        vi.advanceTimersByTime(500);
        w.update(2);
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        expect(root.style.opacity).toBe('1');
        vi.advanceTimersByTime(2000);
        expect(root.style.opacity).toBe('1');  // не мигает
    });

    it('destroy() stops blink', () => {
        const states = [{ from: 1, to: 1, text: 'A', blink: { interval: 500 } }];
        const { w, container } = mount({ states });
        w.update(1);
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        // Capture opacity reference BEFORE destroy
        vi.advanceTimersByTime(500);
        // Mid-blink state — opacity should have toggled
        const opacityBeforeDestroy = root.style.opacity;
        w.destroy?.();
        // After destroy, advancing timers should not produce further opacity changes
        // (the timer was cleared). The element may have been removed by super.destroy(),
        // which is fine — what matters is no timer fires.
        vi.advanceTimersByTime(2000);
        // Internal timer field should be cleared
        expect((w as any)._blinkTimer).toBeNull();
    });

    it('raw fallback ignores blink', () => {
        const states = [{ from: 1, to: 1, text: 'A', blink: { interval: 500 } }];
        const { w, container } = mount({ states });
        w.update(999);  // no match → raw fallback
        vi.advanceTimersByTime(2000);
        const root = container.querySelector('.state-label-widget') as HTMLElement;
        expect(root.style.opacity).toBe('1');  // raw fallback не мигает
    });
});
