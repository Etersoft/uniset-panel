import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../../ui/static/js/src');

function loadAll() {
    const constants = readFileSync(resolve(SRC, '00-constants.js'), 'utf8');
    const utils     = readFileSync(resolve(SRC, '06-utils.js'), 'utf8');
    const ac        = readFileSync(resolve(SRC, '41-sensor-autocomplete.js'), 'utf8');
    const state     = readFileSync(resolve(SRC, '00-state.js'), 'utf8');
    const binding   = readFileSync(resolve(SRC, '60-widget-sensor-binding.js'), 'utf8');
    const base      = readFileSync(resolve(SRC, '60-dashboard-base.js'), 'utf8');
    const label     = readFileSync(resolve(SRC, '61-dashboard-widget-state-label.js'), 'utf8');
    new Function(`${constants}\n${state}\n${utils}\n${ac}\n${binding}\n${base}\n${label}`)();
}

describe('StateLabelWidget config form', () => {
    beforeEach(() => {
        document.body.innerHTML = '<form id="form"></form>';
        loadAll();
    });

    it('getConfigForm renders sensor binding + state list + fallback + appearance', () => {
        const form = document.getElementById('form')! as HTMLFormElement;
        const W = (globalThis as any).StateLabelWidget;
        form.innerHTML = W.getConfigForm({ states: [{ from: 0, to: 0, text: 'OFF' }] });
        // sensor binding (combo)
        expect(form.querySelector('.ionc-combo-input')).toBeTruthy();
        expect(form.querySelector('input[name="sensor"]')).toBeTruthy();
        // state list editor
        expect(form.querySelector('.state-list-editor')).toBeTruthy();
        expect(form.querySelector('.state-list-row')).toBeTruthy();
        // fallback radios
        expect(form.querySelector('input[name="fallback"][value="raw"]')).toBeTruthy();
        expect(form.querySelector('input[name="fallback"][value="ignore"]')).toBeTruthy();
        expect(form.querySelector('input[name="fallback"][value="default"]')).toBeTruthy();
        // appearance
        expect(form.querySelector('select[name="fontSize"]')).toBeTruthy();
        expect(form.querySelector('select[name="align"]')).toBeTruthy();
        expect(form.querySelector('input[name="bold"]')).toBeTruthy();
    });

    it('parseConfigForm round-trip: getConfigForm → parseConfigForm preserves states', () => {
        const form = document.getElementById('form')! as HTMLFormElement;
        const W = (globalThis as any).StateLabelWidget;
        const input = {
            serverId: 's1', objectName: 'SharedMemory', sensor: 'Mode_S', sensorId: 42,
            states: [
                { from: 0, to: 0, text: 'OFF', fg: '#ffffff', bg: '#6b7280', blink: 'none' },
                { from: 1, to: 1, text: 'RUN', fg: '#ffffff', bg: '#22c55e', blink: 'none' },
            ],
            fallback: 'raw',
            fontSize: 'auto',
            bold: true,
            align: 'center',
        };
        form.innerHTML = W.getConfigForm(input);
        const out = W.parseConfigForm(form);
        expect(out.states.length).toBe(2);
        expect(out.states[0].text).toBe('OFF');
        expect(out.fallback).toBe('raw');
        expect(out.bold).toBe(true);
        expect(out.align).toBe('center');
    });

    it('parseConfigForm fallback=ignore picks fallbackHold', () => {
        const form = document.getElementById('form')! as HTMLFormElement;
        const W = (globalThis as any).StateLabelWidget;
        form.innerHTML = W.getConfigForm({ fallback: 'ignore', fallbackHold: true });
        // Switch radio
        (form.querySelector('input[name="fallback"][value="ignore"]') as HTMLInputElement).checked = true;
        const out = W.parseConfigForm(form);
        expect(out.fallback).toBe('ignore');
        expect(out.fallbackHold).toBe(true);
    });
});
