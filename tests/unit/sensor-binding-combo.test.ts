import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadBindingModules } from './helpers/load-binding-modules';

const loadModule = () => loadBindingModules();

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

describe('setupIONCComboAutocomplete', () => {
    beforeEach(() => {
        loadModule();
        document.body.innerHTML = '';
        seedRegistry([
            { serverId: 's1', serverName: 'Server1', connected: true,  objects: ['SharedMemory', 'IMIT.MBI'] },
            { serverId: 's2', serverName: 'Server2', connected: false, objects: ['SharedMemory'] },
        ]);
    });

    afterEach(() => vi.restoreAllMocks());

    function mountForm(config: any = {}) {
        const html = (globalThis as any).renderSensorBindingFields(config, {});
        document.body.innerHTML = `<form>${html}</form>`;
        const form = document.querySelector('form')! as HTMLFormElement;
        return form;
    }

    it('preselects display string when (serverId, objectName) found in registry', () => {
        const form = mountForm({ serverId: 's1', objectName: 'SharedMemory' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        expect(input.value).toBe('SharedMemory @ Server1');
        expect(input.dataset.orphan).toBeUndefined();
    });

    it('marks orphan when pair not in registry', () => {
        const form = mountForm({ serverId: 'unknown', objectName: 'GhostObj' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        expect(input.value).toBe('GhostObj @ unknown (offline)');
        expect(input.dataset.orphan).toBe('true');
    });

    it('focus opens dropdown with all entries online-first', () => {
        const form = mountForm({ serverId: 's1', objectName: 'SharedMemory' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        input.dispatchEvent(new FocusEvent('focus'));
        const items = document.querySelectorAll('.ionc-combo-item');
        expect(items.length).toBe(3);
        expect(items[0].textContent).toContain('SharedMemory @ Server1');
    });

    it('typing filters by substring (matches both halves of @)', async () => {
        const form = mountForm({ serverId: 's1', objectName: 'SharedMemory' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        input.dispatchEvent(new FocusEvent('focus'));
        input.value = 'IMIT';
        input.dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 150));
        const items = document.querySelectorAll('.ionc-combo-item');
        expect(items.length).toBe(1);
        expect(items[0].textContent).toContain('IMIT.MBI @ Server1');
    });

    it('matches by server name half', async () => {
        const form = mountForm({ serverId: 's1', objectName: 'SharedMemory' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        input.dispatchEvent(new FocusEvent('focus'));
        input.value = 'Server2';
        input.dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 150));
        const items = document.querySelectorAll('.ionc-combo-item');
        expect(items.length).toBe(1);
        expect(items[0].textContent).toContain('Server2');
    });

    it('pickItem on offline entry shows (offline) suffix and keeps data-orphan', () => {
        // Empty config so single-match short-circuit doesn't fire (registry has 2 servers anyway).
        const form = mountForm({});
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        const hiddenServer = form.querySelector<HTMLInputElement>('input[name="serverId"]')!;
        const hiddenObject = form.querySelector<HTMLInputElement>('input[name="objectName"]')!;

        input.dispatchEvent(new FocusEvent('focus'));
        const items = document.querySelectorAll('.ionc-combo-item');
        // Pick the offline entry (Server2). seedRegistry has SharedMemory @ Server2 (offline).
        const offlineItem = Array.from(items).find(el => el.textContent?.includes('Server2'))! as HTMLElement;
        offlineItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

        // Hidden filled (user explicit pick).
        expect(hiddenServer.value).toBe('s2');
        expect(hiddenObject.value).toBe('SharedMemory');
        // Visible value carries (offline) suffix so user sees the chosen target is unreachable.
        expect(input.value).toBe('SharedMemory @ Server2 (offline)');
        // data-orphan preserved as visual marker.
        expect(input.dataset.orphan).toBe('true');
    });

    it('pickItem on online entry omits (offline) suffix and clears data-orphan', () => {
        // Start as orphan (so data-orphan=true initially), then pick an online entry.
        const form = mountForm({ serverId: 'ghost', objectName: 'Ghost' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        expect(input.dataset.orphan).toBe('true');

        input.dispatchEvent(new FocusEvent('focus'));
        const items = document.querySelectorAll('.ionc-combo-item');
        const onlineItem = Array.from(items).find(el => el.textContent?.includes('SharedMemory @ Server1'))! as HTMLElement;
        onlineItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

        expect(input.value).toBe('SharedMemory @ Server1');
        expect(input.dataset.orphan).toBeUndefined();
    });

    it('pickItem fills hidden inputs and fires change event', () => {
        const form = mountForm({ serverId: 's1', objectName: 'SharedMemory' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const hiddenServer = form.querySelector<HTMLInputElement>('input[name="serverId"]')!;
        const hiddenObject = form.querySelector<HTMLInputElement>('input[name="objectName"]')!;

        let changeFired = 0;
        hiddenServer.addEventListener('change', () => changeFired++);
        hiddenObject.addEventListener('change', () => changeFired++);

        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        input.dispatchEvent(new FocusEvent('focus'));
        const items = document.querySelectorAll('.ionc-combo-item');
        const target = Array.from(items).find(el => el.textContent?.includes('IMIT.MBI'))! as HTMLElement;
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

        expect(hiddenServer.value).toBe('s1');
        expect(hiddenObject.value).toBe('IMIT.MBI');
        expect(input.value).toBe('IMIT.MBI @ Server1');
        expect(changeFired).toBeGreaterThanOrEqual(2);
    });

    it('typing junk text marks input data-invalid="true" and does NOT touch hidden inputs', async () => {
        const form = mountForm({ serverId: 's1', objectName: 'SharedMemory' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        const hiddenServer = form.querySelector<HTMLInputElement>('input[name="serverId"]')!;
        const hiddenObject = form.querySelector<HTMLInputElement>('input[name="objectName"]')!;

        input.dispatchEvent(new FocusEvent('focus'));
        input.value = 'totally-bogus-text';
        input.dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 150));

        expect(input.dataset.invalid).toBe('true');
        // Hidden inputs untouched — Persistence Invariant
        expect(hiddenServer.value).toBe('s1');
        expect(hiddenObject.value).toBe('SharedMemory');
    });

    it('typing valid prefix clears data-invalid (matches an entry)', async () => {
        const form = mountForm({ serverId: 's1', objectName: 'SharedMemory' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;

        input.dispatchEvent(new FocusEvent('focus'));
        input.value = 'totally-bogus';
        input.dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 150));
        expect(input.dataset.invalid).toBe('true');

        // Now type a substring that exists in the registry.
        input.value = 'IMIT';
        input.dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 150));
        expect(input.dataset.invalid).toBeUndefined();
    });

    it('blur without picking restores last committed display and clears data-invalid', async () => {
        const form = mountForm({ serverId: 's1', objectName: 'SharedMemory' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        const hiddenServer = form.querySelector<HTMLInputElement>('input[name="serverId"]')!;
        const hiddenObject = form.querySelector<HTMLInputElement>('input[name="objectName"]')!;
        const committed = input.value;
        expect(committed).toBe('SharedMemory @ Server1');

        input.dispatchEvent(new FocusEvent('focus'));
        input.value = 'junkie';
        input.dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 150));
        expect(input.dataset.invalid).toBe('true');

        input.dispatchEvent(new Event('blur'));
        // SENSOR_AUTOCOMPLETE_BLUR_DELAY_MS = 150
        await new Promise(r => setTimeout(r, 200));

        // Restored to last committed display (preselect from config).
        expect(input.value).toBe(committed);
        expect(input.dataset.invalid).toBeUndefined();
        // Hidden never touched.
        expect(hiddenServer.value).toBe('s1');
        expect(hiddenObject.value).toBe('SharedMemory');
    });

    it('blur after typing valid (matching) text without pickItem still reverts', async () => {
        // Spec: only explicit pickItem commits. Even matching typed text reverts on blur.
        const form = mountForm({ serverId: 's1', objectName: 'SharedMemory' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        const committed = input.value;

        input.dispatchEvent(new FocusEvent('focus'));
        input.value = 'IMIT.MBI @ Server1';  // valid display string, but never picked
        input.dispatchEvent(new Event('input'));
        await new Promise(r => setTimeout(r, 150));

        input.dispatchEvent(new Event('blur'));
        await new Promise(r => setTimeout(r, 200));

        expect(input.value).toBe(committed);
    });

    it('dropdown shows error message when initial fetch fails', async () => {
        // Reset registry to empty so setupIONCComboAutocomplete will trigger initial fetch.
        const reg = (globalThis as any).state.ioncRegistry;
        reg.servers.clear();
        reg.fetchedAt = 0;
        reg.fetchPromise = null;
        reg.lastError = null;

        // Stub fetch to fail.
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));

        const form = mountForm({ serverId: 'foo', objectName: 'Bar' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        // Wait for ensureIONCRegistry rejection to settle.
        await new Promise(r => setTimeout(r, 50));

        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        // lastError should be populated.
        expect(reg.lastError).toBeTruthy();

        // Open dropdown — it should show error message.
        input.dispatchEvent(new FocusEvent('focus'));
        await new Promise(r => setTimeout(r, 0));
        const empty = document.querySelector('.ionc-combo-empty');
        expect(empty).not.toBeNull();
        expect(empty?.textContent).toMatch(/Не удалось загрузить/);
        expect(empty?.classList.contains('error')).toBe(true);
    });

    it('successful fetch clears lastError', async () => {
        const reg = (globalThis as any).state.ioncRegistry;
        reg.servers.clear();
        reg.fetchedAt = 0;
        reg.lastError = 'previous error';
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ type: 'IONotifyController', servers: [
                { serverId: 's1', serverName: 'Server1', connected: true, objects: ['SharedMemory'] },
            ] }),
        })));
        await (globalThis as any).ensureIONCRegistry();
        expect(reg.lastError).toBeNull();
    });

    it('refresh button triggers force fetch', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ type: 'IONotifyController', servers: [
                { serverId: 's1', serverName: 'Server1', connected: true, objects: ['SharedMemory'] },
            ] }),
        }));
        vi.stubGlobal('fetch', fetchMock);

        const form = mountForm({ serverId: 's1', objectName: 'SharedMemory' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const refreshBtn = form.querySelector<HTMLButtonElement>('.ionc-combo-refresh')!;
        refreshBtn.click();
        await new Promise(r => setTimeout(r, 0));
        await new Promise(r => setTimeout(r, 0));
        expect(fetchMock).toHaveBeenCalled();
    });

    it('single match does NOT overwrite existing binding (Persistence Invariant)', () => {
        // Reset registry to single entry
        const reg = (globalThis as any).state.ioncRegistry;
        reg.servers.clear();
        reg.servers.set('only', { serverName: 'Only', connected: true, objects: ['OnlyIONC'] });

        // Widget already has saved binding to a DIFFERENT server (orphan)
        const form = mountForm({ serverId: 'ghost-id', objectName: 'GhostObj' });
        (globalThis as any).setupIONCComboAutocomplete(form, '');

        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        const hiddenServer = form.querySelector<HTMLInputElement>('input[name="serverId"]')!;
        const hiddenObject = form.querySelector<HTMLInputElement>('input[name="objectName"]')!;

        // Existing binding preserved
        expect(hiddenServer.value).toBe('ghost-id');
        expect(hiddenObject.value).toBe('GhostObj');
        // Orphan UI shown (not single-match auto-fill)
        expect(input.value).toBe('GhostObj @ ghost-id (offline)');
        expect(input.dataset.orphan).toBe('true');
        // NOT disabled (so user can still pick a different value)
        expect(input.disabled).toBe(false);
    });

    it('single match → input disabled + auto-fill', () => {
        const reg = (globalThis as any).state.ioncRegistry;
        reg.servers.clear();
        reg.servers.set('only', { serverName: 'Only', connected: true, objects: ['OnlyIONC'] });

        const form = mountForm({});
        (globalThis as any).setupIONCComboAutocomplete(form, '');
        const input = form.querySelector<HTMLInputElement>('.ionc-combo-input')!;
        const hiddenServer = form.querySelector<HTMLInputElement>('input[name="serverId"]')!;
        expect(input.value).toBe('OnlyIONC @ Only');
        expect(input.disabled).toBe(true);
        expect(hiddenServer.value).toBe('only');
    });
});

describe('initSensorBindingHandlers — combo integration', () => {
    beforeEach(() => {
        loadModule();
        document.body.innerHTML = '';
        seedRegistry([
            { serverId: 's1', serverName: 'Server1', connected: true, objects: ['SharedMemory'] },
        ]);
    });

    it('wires combo and resets sensor input on object change', () => {
        const html = (globalThis as any).renderSensorBindingFields(
            { serverId: 's1', objectName: 'SharedMemory', sensor: 'OldSensor', sensorId: 99 }, {}
        );
        document.body.innerHTML = `<form>${html}</form>`;
        const form = document.querySelector('form')! as HTMLFormElement;

        (globalThis as any).initSensorBindingHandlers(form, {}, {});

        const hiddenObject = form.querySelector<HTMLInputElement>('input[name="objectName"]')!;
        const sensorInput  = form.querySelector<HTMLInputElement>('input[name="sensor"]')!;
        const sensorIdHidden = form.querySelector<HTMLInputElement>('input[name="sensorId"]')!;

        // Симулируем смену object (как делает pickItem)
        hiddenObject.value = 'OtherObj';
        hiddenObject.dispatchEvent(new Event('change', { bubbles: true }));

        // sensor должен быть сброшен (ac.resetOnObjectChange()):
        expect(sensorInput.value).toBe('');
        expect(sensorIdHidden.value).toBe('');
    });

    it('idempotent — second call no-op', () => {
        const html = (globalThis as any).renderSensorBindingFields(
            { serverId: 's1', objectName: 'SharedMemory' }, {}
        );
        document.body.innerHTML = `<form>${html}</form>`;
        const form = document.querySelector('form')! as HTMLFormElement;

        (globalThis as any).initSensorBindingHandlers(form, {}, {});
        expect(() => (globalThis as any).initSensorBindingHandlers(form, {}, {})).not.toThrow();
    });
});
