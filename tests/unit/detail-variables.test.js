import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadSrc } from './helpers/load-src.js';

beforeAll(() => {
    loadSrc('ui/static/js/src/60-detail-state.js');
    loadSrc('ui/static/js/src/60-detail-panel.js');
    loadSrc('ui/static/js/src/60-detail-variables.js');
});

beforeEach(() => {
    document.body.innerHTML = '';
    for (const k of Object.keys(detailInstances)) delete detailInstances[k];
    localStorage.clear();
});

describe('buildVariablesSections', () => {
    it('splits snapshot into inputs/outputs/locals/fb_instances', () => {
        const snap = {
            inputs: [{ id: 101, name: 'in_Temp', value: 75 }],
            outputs: [{ id: 205, name: 'out_Speed', value: 1500 }],
            variables: {
                'state_main': 2,
                'Counter': 42,
                'FB1.State': 1,
                'FB1.Phase': 2
            }
        };
        const g = buildVariablesSections(snap);
        expect(g.inputs.map(x => x.name)).toEqual(['in_Temp']);
        expect(g.outputs.map(x => x.name)).toEqual(['out_Speed']);
        expect(g.locals.map(x => x.name).sort()).toEqual(['Counter', 'state_main']);
        expect(g.fb_instances.map(x => x.name).sort()).toEqual(['FB1.Phase', 'FB1.State']);
    });

    it('handles missing sections gracefully', () => {
        const g = buildVariablesSections({});
        expect(g.inputs).toEqual([]);
        expect(g.outputs).toEqual([]);
        expect(g.locals).toEqual([]);
        expect(g.fb_instances).toEqual([]);
    });
});

describe('renderVariables', () => {
    function makeInst() {
        openDetailPanel('srv-1', 'Server1', 'DG_Control');
        const inst = detailInstances['srv-1:DG_Control'];
        // Expand all sections so their rows are actually rendered in tests.
        inst.state.varsCollapsed = {
            inputs: false, outputs: false, locals: false, fb_instances: false
        };
        inst.snapshot = {
            object: 'DG_Control', server: 'srv-1',
            inputs: [{ id: 101, name: 'in_Temp', value: 75 }],
            outputs: [{ id: 205, name: 'out_Speed', value: 1500 }],
            variables: { Counter: 3 },
            timers: [], statistics: {},
            sm_object: 'SharedMemory'
        };
        return inst;
    }

    it('renders four sections (even when some are empty)', () => {
        const inst = makeInst();
        renderDetailVariables(inst);
        const root = document.querySelector('[data-inner-panel="variables"]');
        expect(root.querySelector('[data-section="inputs"]')).toBeTruthy();
        expect(root.querySelector('[data-section="outputs"]')).toBeTruthy();
        expect(root.querySelector('[data-section="locals"]')).toBeTruthy();
        expect(root.querySelector('[data-section="fb_instances"]')).toBeTruthy();
    });

    it('marks in_*/out_* rows as forcible with data-sensor-id', () => {
        const inst = makeInst();
        renderDetailVariables(inst);
        const inputRow = document.querySelector('tr[data-var="in_Temp"]');
        expect(inputRow.classList.contains('forcible')).toBe(true);
        expect(inputRow.dataset.sensorId).toBe('101');
        const localRow = document.querySelector('tr[data-var="Counter"]');
        expect(localRow.classList.contains('forcible')).toBe(false);
    });

    it('escapes HTML in variable names', () => {
        const inst = makeInst();
        inst.snapshot.variables['<script>evil</script>'] = 'bad';
        renderDetailVariables(inst);
        const root = document.querySelector('[data-inner-panel="variables"]');
        // No script element was actually injected into the DOM.
        expect(root.querySelector('script')).toBeNull();
        // Name is rendered in a text cell with entities, not as live markup.
        expect(root.innerHTML).toContain('&lt;script&gt;evil&lt;/script&gt;');
    });
});

describe('snapshot poll', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async () => ({
            ok: true,
            json: async () => ({
                object: 'X', server: 'srv-1',
                inputs: [], outputs: [],
                variables: { Counter: 1 },
                timers: [], statistics: {},
                sm_object: 'SharedMemory'
            })
        }));
    });

    it('startDetailSnapshotPoll calls /snapshot', async () => {
        openDetailPanel('srv-1', 'Server1', 'X');
        const inst = detailInstances['srv-1:X'];
        startDetailSnapshotPoll(inst);
        await new Promise(r => setTimeout(r, 10));
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/servers/srv-1/objects/X/snapshot')
        );
        stopDetailSnapshotPoll(inst);
    });
});

describe('force/unforce', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    });

    function makeInst() {
        openDetailPanel('srv-1', 'Server1', 'DG_Control');
        const inst = detailInstances['srv-1:DG_Control'];
        stopDetailSnapshotPoll(inst);
        fetch.mockClear();
        inst.snapshot = {
            inputs: [{ id: 101, name: 'in_Temp', value: 75 }],
            outputs: [{ id: 205, name: 'out_Speed', value: 1500 }],
            variables: { Counter: 3 },
            timers: [], statistics: {},
            sm_object: 'SharedMemory'
        };
        return inst;
    }

    it('postForce calls ionc/freeze with sensor_id + value', async () => {
        const inst = makeInst();
        await postForce(inst, 101, 42);
        expect(fetch).toHaveBeenCalledWith(
            '/api/objects/SharedMemory/ionc/freeze?server=srv-1',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ sensor_id: 101, value: 42 })
            })
        );
    });

    it('postUnforce calls ionc/unfreeze with sensor_id', async () => {
        const inst = makeInst();
        await postUnforce(inst, 205);
        expect(fetch).toHaveBeenCalledWith(
            '/api/objects/SharedMemory/ionc/unfreeze?server=srv-1',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ sensor_id: 205 })
            })
        );
    });

    it('showDetailVarContextMenu no-op for locals section', () => {
        const inst = makeInst();
        const before = document.getElementById('detail-var-ctxmenu');
        const fakeEvent = { preventDefault: () => {}, clientX: 0, clientY: 0 };
        showDetailVarContextMenu(inst, 'locals', 'Counter', null, fakeEvent);
        const after = document.getElementById('detail-var-ctxmenu');
        expect(after).toBe(before);
    });

    it('postForce no-op when sensorId is null', async () => {
        const inst = makeInst();
        const result = await postForce(inst, null, 99);
        expect(result).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('postForce surfaces 403 via alert', async () => {
        globalThis.fetch = vi.fn(async () => ({
            ok: false, status: 403,
            json: async () => ({ error: 'token required' })
        }));
        let alerted = null;
        const origAlert = window.alert;
        window.alert = (m) => { alerted = m; };
        try {
            openDetailPanel('srv-1', 'Server1', 'DG_Control');
            const inst = detailInstances['srv-1:DG_Control'];
            stopDetailSnapshotPoll(inst);
            inst.snapshot = { sm_object: 'SharedMemory' };
            const result = await postForce(inst, 101, 42);
            expect(result.status).toBe(403);
            expect(alerted).toContain('authentication required');
        } finally {
            window.alert = origAlert;
        }
    });

    it('lookupSnapshotValue finds value across inputs/outputs/variables', () => {
        const inst = makeInst();
        expect(lookupSnapshotValue(inst.snapshot, 'in_Temp')).toBe(75);
        expect(lookupSnapshotValue(inst.snapshot, 'out_Speed')).toBe(1500);
        expect(lookupSnapshotValue(inst.snapshot, 'Counter')).toBe(3);
        expect(lookupSnapshotValue(inst.snapshot, 'missing')).toBeNull();
    });
});
