import { describe, it, expect, beforeEach, vi } from 'vitest';

// Node v24 has a built-in localStorage without .clear()/.setItem()/.getItem().
// Provide a proper in-memory mock so the test is environment-agnostic.
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem:    (key: string) => store[key] ?? null,
        setItem:    (key: string, val: string) => { store[key] = String(val); },
        removeItem: (key: string) => { delete store[key]; },
        clear:      () => { store = {}; },
    };
})();
vi.stubGlobal('localStorage', localStorageMock);

declare const canonicalizeZones: (zones: any) => string;
declare const getZonesHistory: () => any[];
declare const addZonesToHistory: (zones: any, type: string) => void;
declare const ZONES_HISTORY_STORAGE_KEY: string;
declare const ZONES_HISTORY_MAX: number;

describe('canonicalizeZones', () => {
    it('produces stable key independent of zone order', () => {
        const a = canonicalizeZones([
            { from: 0, to: 30, color: '#3B82F6' },
            { from: 30, to: 70, color: '#22c55e' },
        ]);
        const b = canonicalizeZones([
            { from: 30, to: 70, color: '#22C55E' },
            { from: 0, to: 30, color: '#3b82f6' },
        ]);
        expect(a).toBe(b);
    });

    it('normalizes color case and float precision', () => {
        const a = canonicalizeZones([{ from: 0.1, to: 0.2, color: '#FFFFFF' }]);
        const b = canonicalizeZones([{ from: 0.10000001, to: 0.2, color: '#ffffff' }]);
        expect(a).toBe(b);
    });

    it('differs for different zones', () => {
        const a = canonicalizeZones([{ from: 0, to: 100, color: '#ff0000' }]);
        const b = canonicalizeZones([{ from: 0, to: 100, color: '#00ff00' }]);
        expect(a).not.toBe(b);
    });
});

describe('getZonesHistory / addZonesToHistory', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('returns empty array when storage empty', () => {
        expect(getZonesHistory()).toEqual([]);
    });

    it('returns empty array on JSON parse error', () => {
        localStorage.setItem(ZONES_HISTORY_STORAGE_KEY, '{not json');
        expect(getZonesHistory()).toEqual([]);
    });

    it('addZonesToHistory persists entry', () => {
        addZonesToHistory([{ from: 0, to: 50, color: '#ff0000' }], 'gauge');
        const h = getZonesHistory();
        expect(h.length).toBe(1);
        expect(h[0].zones).toEqual([{ from: 0, to: 50, color: '#ff0000' }]);
        expect(h[0].sourceWidgetType).toBe('gauge');
        expect(typeof h[0].timestamp).toBe('number');
    });

    it('no-op for empty zones', () => {
        addZonesToHistory([], 'gauge');
        expect(getZonesHistory()).toEqual([]);
    });

    it('move-to-front on duplicate save (also refreshes timestamp)', () => {
        addZonesToHistory([{ from: 0, to: 50, color: '#aaa' }], 'gauge');
        addZonesToHistory([{ from: 0, to: 100, color: '#bbb' }], 'level');
        const before = getZonesHistory();
        const aaaTimestampBefore = before.find(it => it.zones[0].color === '#aaa').timestamp;
        // Spin ≥2ms so Date.now() differs reliably from the original save.
        const wait = Date.now() + 2;
        while (Date.now() < wait) { /* spin */ }
        addZonesToHistory([{ from: 0, to: 50, color: '#AAA' }], 'gauge'); // duplicate (color case-insensitive)
        const h = getZonesHistory();
        expect(h.length).toBe(2);
        expect(h[0].zones[0].color).toBe('#aaa'); // canonicalized to lowercase, moved to front
        expect(h[0].timestamp).toBeGreaterThanOrEqual(aaaTimestampBefore);
    });

    it('respects FIFO cap = ZONES_HISTORY_MAX', () => {
        for (let i = 0; i < ZONES_HISTORY_MAX + 5; i++) {
            addZonesToHistory([{ from: i, to: i + 1, color: '#000000' }], 'gauge');
        }
        const h = getZonesHistory();
        expect(h.length).toBe(ZONES_HISTORY_MAX);
        // Newest at front (loop pushed i=ZONES_HISTORY_MAX+4 last)
        expect(h[0].zones[0].from).toBe(ZONES_HISTORY_MAX + 4);
    });
});

declare const getDashboardZoneSources: (dashId: string, excludeWidgetId: string) => any[];

describe('getDashboardZoneSources', () => {
    beforeEach(() => {
        const w: any = globalThis;
        w.dashboardState = {
            dashboards: new Map([
                ['dash1', {
                    widgets: [
                        { id: 'wA', type: 'gauge',    config: { sensor: 'Temp_S',   zones: [{ from: 0, to: 100, color: '#aaa' }] } },
                        { id: 'wB', type: 'level',    config: { sensor: 'Tank_A',   zones: [{ from: 0, to: 500, color: '#bbb' }] } },
                        { id: 'wC', type: 'gauge',    config: { sensor: 'NoZones', zones: [] } },
                        { id: 'wD', type: 'gauge',    config: { sensor: 'OmitMe',   zones: [{ from: 0, to: 1, color: '#ccc' }] } },
                        { id: 'wE', type: 'setpoint', config: { sensor: 'Setpt_1',  zones: [{ from: -10, to: 10, color: '#ddd' }] } },
                    ],
                }],
            ]),
        };
    });

    it('returns widgets with non-empty zones, excludes specified widget', () => {
        const result = getDashboardZoneSources('dash1', 'wD');
        expect(result.map((r: any) => r.widgetId).sort()).toEqual(['wA', 'wB', 'wE']);
    });

    it('returns empty for unknown dashboard', () => {
        expect(getDashboardZoneSources('nope', '')).toEqual([]);
    });

    it('returns empty for missing dashboardState', () => {
        delete (globalThis as any).dashboardState;
        expect(getDashboardZoneSources('dash1', '')).toEqual([]);
    });

    it('returns sensorLabel (prefers config.sensor, falls back to label, then id)', () => {
        const result = getDashboardZoneSources('dash1', '');
        const wA = result.find((r: any) => r.widgetId === 'wA');
        expect(wA.sensorLabel).toBe('Temp_S');
        expect(wA.widgetType).toBe('gauge');
        expect(wA.zones).toEqual([{ from: 0, to: 100, color: '#aaa' }]);
    });

    it('dedups widgets with identical zones (canonical key) — one chip per unique set', () => {
        const w: any = globalThis;
        w.dashboardState = {
            dashboards: new Map([
                ['dash2', {
                    widgets: [
                        { id: 'wA', type: 'gauge', config: { sensor: 'TempA',
                            zones: [{ from: 0, to: 50, color: '#3b82f6' }, { from: 50, to: 100, color: '#ef4444' }] } },
                        { id: 'wB', type: 'gauge', config: { sensor: 'TempB',
                            zones: [{ from: 50, to: 100, color: '#EF4444' }, { from: 0, to: 50, color: '#3B82F6' }] } }, // same set, different order/case
                        { id: 'wC', type: 'level', config: { sensor: 'TankA',
                            zones: [{ from: 0, to: 100, color: '#22c55e' }] } }, // distinct
                    ],
                }],
            ]),
        };
        const result = getDashboardZoneSources('dash2', '');
        // 2 unique sets (wA = wB by canonical key, wC distinct)
        expect(result.length).toBe(2);
        // First-occurrence wins for the dedup'd entry
        expect(result.find((r: any) => r.zones.length === 2)?.sensorLabel).toBe('TempA');
        expect(result.find((r: any) => r.zones.length === 1)?.sensorLabel).toBe('TankA');
    });
});

declare const renderZoneChipBar: (zones: any) => string;
declare const renderZonesReusePicker: (currentWidgetType: string, dashId: string, currentWidgetId: string) => string;

describe('renderZoneChipBar', () => {
    it('renders one span per zone with proportional flex and from-to text', () => {
        const html = renderZoneChipBar([
            { from: 0,  to: 30,  color: '#3b82f6' },
            { from: 30, to: 70,  color: '#22c55e' },
            { from: 70, to: 100, color: '#ef4444' },
        ]);
        const host = document.createElement('div');
        host.innerHTML = html;
        const bar = host.querySelector('.zone-bar')!;
        const spans = bar.querySelectorAll<HTMLSpanElement>('span');
        expect(spans.length).toBe(3);
        expect(spans[0].textContent).toBe('0–30');
        expect(spans[1].textContent).toBe('30–70');
        expect(spans[2].textContent).toBe('70–100');
        expect(spans[0].style.background).toContain('rgb(59, 130, 246)'); // #3b82f6 normalized
        expect(spans[0].style.flex).not.toBe('');
    });

    it('returns empty bar for empty zones', () => {
        const html = renderZoneChipBar([]);
        const host = document.createElement('div');
        host.innerHTML = html;
        expect(host.querySelectorAll('.zone-bar > span').length).toBe(0);
    });

    it('uses unique flex weight proportional to (to - from)', () => {
        const html = renderZoneChipBar([
            { from: 0, to: 10, color: '#000' },
            { from: 10, to: 90, color: '#fff' }, // 8x wider
        ]);
        const host = document.createElement('div');
        host.innerHTML = html;
        const spans = host.querySelectorAll<HTMLSpanElement>('.zone-bar > span');
        expect(spans[0].style.flex).toContain('10');
        expect(spans[1].style.flex).toContain('80');
    });
});

describe('renderZonesReusePicker', () => {
    beforeEach(() => {
        localStorage.clear();
        const w: any = globalThis;
        w.WIDGET_TYPES = {
            gauge:    { displayName: 'Gauge' },
            level:    { displayName: 'Level' },
            setpoint: { displayName: 'Setpoint' },
        };
        w.dashboardState = {
            dashboards: new Map([
                ['dash1', {
                    widgets: [
                        { id: 'wA', type: 'gauge', config: { sensor: 'Temp_S', zones: [{ from: 0, to: 100, color: '#aaa' }] } },
                        { id: 'wB', type: 'level', config: { sensor: 'Tank_A', zones: [{ from: 0, to: 500, color: '#bbb' }] } },
                    ],
                }],
            ]),
        };
    });

    it('returns empty string when no sources and no history', () => {
        (globalThis as any).dashboardState = { dashboards: new Map() };
        expect(renderZonesReusePicker('gauge', 'none', '')).toBe('');
    });

    it('renders block with sticky group label per widget type', () => {
        const html = renderZonesReusePicker('gauge', 'dash1', '');
        const host = document.createElement('div');
        host.innerHTML = html;
        expect(host.querySelector('.reuse-picker')).not.toBeNull();
        const labels = Array.from(host.querySelectorAll('.group-label')).map(el => el.textContent || '');
        expect(labels.some(l => l.includes('Gauge'))).toBe(true);
        expect(labels.some(l => l.includes('Level'))).toBe(true);
    });

    it('marks same-class group with group-same-class class', () => {
        const html = renderZonesReusePicker('gauge', 'dash1', '');
        const host = document.createElement('div');
        host.innerHTML = html;
        const sameClass = host.querySelector('.group-same-class');
        expect(sameClass).not.toBeNull();
        expect(sameClass!.textContent!.includes('Gauge')).toBe(true);
    });

    it('includes Recent group when history is non-empty', () => {
        addZonesToHistory([{ from: 0, to: 50, color: '#ff0000' }], 'gauge');
        const html = renderZonesReusePicker('gauge', 'dash1', '');
        const host = document.createElement('div');
        host.innerHTML = html;
        expect(host.querySelector('.group-recent')).not.toBeNull();
    });

    it('excludes currentWidgetId from dashboard sources', () => {
        const html = renderZonesReusePicker('gauge', 'dash1', 'wA');
        const host = document.createElement('div');
        host.innerHTML = html;
        const chips = host.querySelectorAll('.zone-chip');
        const sourceLabels = Array.from(chips).map(c => c.querySelector('.chip-source')?.textContent || '');
        expect(sourceLabels.every(l => !l.includes('Temp_S'))).toBe(true);
    });

    it('embeds zones as JSON in data-zones-json attribute', () => {
        const html = renderZonesReusePicker('gauge', 'dash1', '');
        const host = document.createElement('div');
        host.innerHTML = html;
        const chip = host.querySelector('.zone-chip') as HTMLElement;
        expect(chip).not.toBeNull();
        const parsed = JSON.parse(chip.dataset.zonesJson || 'null');
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBeGreaterThan(0);
    });

    it('dedups dashboard sources against Recent — zones already in history not shown again in type-blocks', () => {
        // Same zone-set as wA on dash1 (color case differs; canonical key matches)
        addZonesToHistory([{ from: 0, to: 100, color: '#AAA' }], 'gauge');
        const html = renderZonesReusePicker('gauge', 'dash1', '');
        const host = document.createElement('div');
        host.innerHTML = html;
        // Recent group present
        expect(host.querySelector('.group-recent')).not.toBeNull();
        // wA's zones are now ONLY in Recent — no second chip with sensor 'Temp_S' under Gauge type
        const sourceLabels = Array.from(host.querySelectorAll('.chip-source'))
            .map(el => el.textContent || '');
        expect(sourceLabels.includes('Temp_S')).toBe(false);
        // wB (different zones) still visible under Level
        expect(sourceLabels.includes('Tank_A')).toBe(true);
    });
});

declare const applyZonesToEditor: (form: Element, zones: any) => void;
declare const setupZonesReusePicker: (form: Element) => void;

describe('applyZonesToEditor', () => {
    it('replaces .zones-list contents with new zone items', () => {
        const form = document.createElement('div');
        form.innerHTML = (globalThis as any).renderColorZonesEditor(
            [{ from: 0, to: 50, color: '#aaa' }], '#888'
        );
        // Sanity check
        expect(form.querySelectorAll('.zone-item').length).toBe(1);

        applyZonesToEditor(form, [
            { from: 0, to: 30, color: '#3b82f6' },
            { from: 30, to: 100, color: '#ef4444' },
        ]);

        const items = form.querySelectorAll('.zone-item');
        expect(items.length).toBe(2);
        const colors = Array.from(form.querySelectorAll<HTMLInputElement>('.zone-color')).map(i => i.value.toLowerCase());
        expect(colors).toEqual(['#3b82f6', '#ef4444']);
    });

    it('no-op when no .zones-list in form', () => {
        const form = document.createElement('div');
        form.innerHTML = '<div>no zones</div>';
        expect(() => applyZonesToEditor(form, [{ from: 0, to: 1, color: '#fff' }])).not.toThrow();
    });
});

describe('setupZonesReusePicker', () => {
    it('on chip click → applies that chip\'s zones to editor', () => {
        const form = document.createElement('div');
        const pickerHtml = `<div class="reuse-picker"><div class="zone-chip" data-zones-json='[{"from":0,"to":30,"color":"#3b82f6"},{"from":30,"to":100,"color":"#22c55e"}]'><span>chip</span></div></div>`;
        const editorHtml = (globalThis as any).renderColorZonesEditor([], '#888');
        form.innerHTML = pickerHtml + editorHtml;

        setupZonesReusePicker(form);

        const chip = form.querySelector('.zone-chip') as HTMLElement;
        chip.click();

        const items = form.querySelectorAll('.zone-item');
        expect(items.length).toBe(2);
        const colors = Array.from(form.querySelectorAll<HTMLInputElement>('.zone-color')).map(i => i.value.toLowerCase());
        expect(colors).toEqual(['#3b82f6', '#22c55e']);
    });

    it('idempotent — calling twice does not double-fire on click', () => {
        const form = document.createElement('div');
        form.innerHTML = `<div class="reuse-picker"><div class="zone-chip" data-zones-json='[{"from":0,"to":1,"color":"#fff"}]'>chip</div></div>` + (globalThis as any).renderColorZonesEditor([], '#888');
        setupZonesReusePicker(form);
        setupZonesReusePicker(form); // second call must be no-op
        const chip = form.querySelector('.zone-chip') as HTMLElement;
        chip.click();
        expect(form.querySelectorAll('.zone-item').length).toBe(1);
    });

    it('does nothing if data-zones-json is missing or malformed', () => {
        const form = document.createElement('div');
        form.innerHTML = `<div class="reuse-picker"><div class="zone-chip">no data</div></div>` + (globalThis as any).renderColorZonesEditor([], '#888');
        setupZonesReusePicker(form);
        const chip = form.querySelector('.zone-chip') as HTMLElement;
        expect(() => chip.click()).not.toThrow();
        expect(form.querySelectorAll('.zone-item').length).toBe(0);
    });
});
