import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

function loadModule() {
    const constants = readFileSync(resolve(SRC_DIR, '00-constants.js'), 'utf8');
    const stateSrc  = readFileSync(resolve(SRC_DIR, '00-state.js'), 'utf8');
    const utils     = readFileSync(resolve(SRC_DIR, '06-utils.js'), 'utf8');
    const ac        = readFileSync(resolve(SRC_DIR, '41-sensor-autocomplete.js'), 'utf8');
    const binding   = readFileSync(resolve(SRC_DIR, '60-widget-sensor-binding.js'), 'utf8');
    new Function(`${constants}\n${stateSrc}\n${utils}\n${ac}\n${binding}`)();
}

function seedRegistry(entries: Array<{serverId:string, serverName:string, connected:boolean, objects:string[]}>) {
    const reg = (globalThis as any).state.ioncRegistry;
    reg.fetchedAt = Date.now();
    reg.servers.clear();
    entries.forEach(e => reg.servers.set(e.serverId, {
        serverName: e.serverName, connected: e.connected, objects: e.objects,
    }));
}

describe('renderSensorBindingFields — combo shape', () => {
    beforeEach(() => { loadModule(); document.body.innerHTML = ''; });

    it('renders combo input + hidden serverId/objectName + refresh button', () => {
        const html = (globalThis as any).renderSensorBindingFields(
            { serverId: 's1', objectName: 'SharedMemory' }, {}
        );
        document.body.innerHTML = `<form>${html}</form>`;
        const form = document.querySelector('form')!;
        expect(form.querySelector<HTMLInputElement>('.ionc-combo-input')).not.toBeNull();
        expect(form.querySelector<HTMLInputElement>('input[type="hidden"][name="serverId"]')?.value).toBe('s1');
        expect(form.querySelector<HTMLInputElement>('input[type="hidden"][name="objectName"]')?.value).toBe('SharedMemory');
        expect(form.querySelector('.ionc-combo-refresh')).not.toBeNull();
    });

    it('respects fieldPrefix for hidden inputs', () => {
        const html = (globalThis as any).renderSensorBindingFields(
            { serverId: 's2', objectName: 'IMIT' }, { fieldPrefix: 'item-3-' }
        );
        document.body.innerHTML = `<form>${html}</form>`;
        const form = document.querySelector('form')!;
        expect(form.querySelector<HTMLInputElement>('input[type="hidden"][name="item-3-serverId"]')?.value).toBe('s2');
        expect(form.querySelector<HTMLInputElement>('input[type="hidden"][name="item-3-objectName"]')?.value).toBe('IMIT');
    });

    it('still renders sensor input + hidden sensorId (existing contract)', () => {
        const html = (globalThis as any).renderSensorBindingFields(
            { serverId: 's1', objectName: 'X', sensor: 'AI42_S', sensorId: 42 }, {}
        );
        document.body.innerHTML = `<form>${html}</form>`;
        const form = document.querySelector('form')!;
        expect(form.querySelector<HTMLInputElement>('input[name="sensor"]')?.value).toBe('AI42_S');
        expect(form.querySelector<HTMLInputElement>('input[type="hidden"][name="sensorId"]')?.value).toBe('42');
    });
});

describe('parseSensorBindingFields — preserves contract', () => {
    beforeEach(() => { loadModule(); document.body.innerHTML = ''; });

    it('reads hidden serverId/objectName + sensor/sensorId', () => {
        document.body.innerHTML = `
            <form>
                <input type="hidden" name="serverId" value="srv7">
                <input type="hidden" name="objectName" value="MyIONC">
                <input type="text" name="sensor" value="Temp_S">
                <input type="hidden" name="sensorId" value="123">
            </form>
        `;
        const form = document.querySelector('form')!;
        const parsed = (globalThis as any).parseSensorBindingFields(form, {});
        expect(parsed).toEqual({ serverId: 'srv7', objectName: 'MyIONC', sensor: 'Temp_S', sensorId: 123 });
    });
});
