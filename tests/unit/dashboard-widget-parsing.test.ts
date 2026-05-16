import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

function loadDashboardWidgetsForParsing() {
    const constants = readFileSync(resolve(SRC_DIR, '00-constants.js'), 'utf8');
    const utils = readFileSync(resolve(SRC_DIR, '06-utils.js'), 'utf8');
    const base = readFileSync(resolve(SRC_DIR, '60-dashboard-base.js'), 'utf8');
    const gaugeGeometry = readFileSync(resolve(SRC_DIR, '61-dashboard-gauge-geometry.js'), 'utf8');
    const gauge = readFileSync(resolve(SRC_DIR, '61-dashboard-widget-gauge.js'), 'utf8');
    const widgets = readFileSync(resolve(SRC_DIR, '61-dashboard-widgets.js'), 'utf8');
    new Function(`
        ${constants}
        ${utils}
        ${base}
        ${gaugeGeometry}
        ${gauge}
        ${widgets}
        globalThis.GaugeWidget = GaugeWidget;
        globalThis.LevelWidget = LevelWidget;
        globalThis.LabelWidget = LabelWidget;
        globalThis.DividerWidget = DividerWidget;
        globalThis.StatusBarWidget = StatusBarWidget;
        globalThis.BarGraphWidget = BarGraphWidget;
        globalThis.ChartWidget = ChartWidget;
    `)();
}

loadDashboardWidgetsForParsing();

declare const GaugeWidget: any;
declare const LevelWidget: any;
declare const LabelWidget: any;
declare const DividerWidget: any;
declare const StatusBarWidget: any;
declare const BarGraphWidget: any;
declare const ChartWidget: any;

function formWith(html: string) {
    const form = document.createElement('form');
    form.innerHTML = html;
    return form;
}

function bindingFields() {
    return `
        <select name="serverId"><option value="srv" selected></option></select>
        <select name="objectName"><option value="SharedMemory" selected></option></select>
        <input name="sensor" value="S">
        <input type="hidden" name="sensorId" value="1">
    `;
}

describe('read-only dashboard widget config parsing', () => {
    it('preserves zero decimals in GaugeWidget', () => {
        const form = formWith(`
            ${bindingFields()}
            <input name="label" value="">
            <select name="style"><option value="default" selected></option></select>
            <input name="min" value="0">
            <input name="max" value="100">
            <input name="unit" value="">
            <input name="decimals" value="0">
        `);

        expect(GaugeWidget.parseConfigForm(form).decimals).toBe(0);
    });

    it('uses defaults for empty numeric fields in GaugeWidget', () => {
        const form = formWith(`
            ${bindingFields()}
            <input name="label" value="">
            <select name="style"><option value="default" selected></option></select>
            <input name="min" value="">
            <input name="max" value="">
            <input name="unit" value="">
            <input name="decimals" value="">
        `);

        expect(GaugeWidget.parseConfigForm(form)).toMatchObject({
            min: 0,
            max: 100,
            decimals: 1,
        });
    });

    it('keeps GaugeWidget numeric output finite when min equals max', () => {
        const container = document.createElement('div');
        const widget = new GaugeWidget('gauge-flat', {
            min: 5,
            max: 5,
            style: 'default',
            decimals: 0,
        }, container);

        widget.render();
        widget.update(5);

        expect(widget.needleEl.style.transform).toBe('rotate(-90deg)');
        expect(widget.arcEl.style.strokeDasharray).not.toContain('NaN');
        expect(widget.valueEl.textContent).toBe('5');
    });

    it('preserves zero threshold in StatusBarWidget items', () => {
        const form = formWith(`
            <select name="layout"><option value="horizontal" selected></option></select>
            <div class="statusbar-item" data-idx="0">
                <select name="item-0-serverId"><option value="srv" selected></option></select>
                <select name="item-0-objectName"><option value="SharedMemory" selected></option></select>
                <input name="item-0-sensor" value="S">
                <input type="hidden" name="item-0-sensorId" value="1">
                <input name="item-0-label" value="OK">
                <input name="item-0-threshold" value="0">
                <input name="item-0-onColor" value="#22c55e">
                <input name="item-0-offColor" value="#6b7280">
            </div>
        `);

        expect(StatusBarWidget.parseConfigForm(form).items[0].threshold).toBe(0);
    });

    it('preserves zero max in BarGraphWidget items', () => {
        const form = formWith(`
            <select name="orientation"><option value="vertical" selected></option></select>
            <input type="checkbox" name="showValues" checked>
            <input type="checkbox" name="showLabels" checked>
            <div class="bargraph-item" data-idx="0">
                <select name="item-0-serverId"><option value="srv" selected></option></select>
                <select name="item-0-objectName"><option value="SharedMemory" selected></option></select>
                <input name="item-0-sensor" value="S">
                <input type="hidden" name="item-0-sensorId" value="1">
                <input name="item-0-label" value="Bar">
                <input name="item-0-min" value="-10">
                <input name="item-0-max" value="0">
                <input name="item-0-unit" value="">
                <input name="item-0-color" value="#3b82f6">
            </div>
        `);

        expect(BarGraphWidget.parseConfigForm(form).items[0].max).toBe(0);
    });

    it('preserves zero max in LevelWidget', () => {
        const form = formWith(`
            ${bindingFields()}
            <input name="label" value="">
            <input name="min" value="-10">
            <input name="max" value="0">
            <select name="orientation"><option value="vertical" selected></option></select>
            <input name="unit" value="%">
        `);

        expect(LevelWidget.parseConfigForm(form).max).toBe(0);
    });

    it('keeps LevelWidget fill finite when min equals max', () => {
        const container = document.createElement('div');
        const widget = new LevelWidget('level-flat', {
            min: 5,
            max: 5,
            orientation: 'vertical',
        }, container);

        widget.render();
        widget.update(5);

        expect(widget.fillEl.style.height).toBe('0%');
        expect(widget.textEl.textContent).toBe('5%');
    });

    it('keeps zero values when reopening LabelWidget and DividerWidget config forms', () => {
        const labelForm = formWith(LabelWidget.getConfigForm({
            border: true,
            borderWidth: 1,
            borderRadius: 0,
        }));
        const dividerForm = formWith(DividerWidget.getConfigForm({
            thickness: 1,
            margin: 0,
        }));

        expect((labelForm.querySelector('[name="borderRadius"]') as HTMLInputElement).value).toBe('0');
        expect((dividerForm.querySelector('[name="margin"]') as HTMLInputElement).value).toBe('0');
    });

    it('preserves ChartWidget table and zones heights through config parsing', () => {
        const form = formWith(ChartWidget.getConfigForm({
            label: '',
            timeRange: 900000,
            showTable: true,
            tableHeight: 177,
            zonesHeight: 266,
            zones: [{ id: 'zone-0', sensors: [] }],
        }));

        expect(ChartWidget.parseConfigForm(form)).toMatchObject({
            tableHeight: 177,
            zonesHeight: 266,
        });
    });

    it('uses server/object scoped sensor metadata for ChartWidget tables', () => {
        const previousGetSensorInfo = (globalThis as any).getSensorInfo;
        const previousGetSensorInfoByKey = (globalThis as any).getSensorInfoByKey;
        (globalThis as any).getSensorInfo = () => ({ id: 1, iotype: 'AI', textname: 'Wrong' });
        (globalThis as any).getSensorInfoByKey = (serverId: string, objectName: string, sensorName: string) => ({
            id: `${serverId}:${objectName}:${sensorName}`,
            iotype: serverId === 'mock2' ? 'AO' : 'AI',
            textname: serverId === 'mock2' ? 'Right B' : 'Right A',
        });
        try {
            const container = document.createElement('div');
            const widget = new ChartWidget('chart1', {
                useTextname: true,
                zones: [{
                    id: 'zone-0',
                    sensors: [
                        { serverId: 'mock1', objectName: 'SM_A', name: 'Temp', sensor: 'Temp', color: '#3b82f6' },
                        { serverId: 'mock2', objectName: 'SM_B', name: 'Temp', sensor: 'Temp', color: '#22c55e' },
                    ],
                }],
            }, container);
            widget.element = document.createElement('div');
            widget.element.innerHTML = '<table><tbody id="chart-table-chart1"></tbody></table>';

            widget.initTable();

            const rows = Array.from(widget.element.querySelectorAll('tbody tr'));
            expect(rows.map((row: Element) => row.querySelector('.col-id')?.textContent)).toEqual([
                'mock1:SM_A:Temp',
                'mock2:SM_B:Temp',
            ]);
            expect(rows.map((row: Element) => row.querySelector('.col-name')?.textContent)).toEqual([
                'Right A',
                'Right B',
            ]);
        } finally {
            (globalThis as any).getSensorInfo = previousGetSensorInfo;
            (globalThis as any).getSensorInfoByKey = previousGetSensorInfoByKey;
        }
    });

    it('loads ChartWidget history through object and server scoped API', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ points: [{ timestamp: '2026-05-01T00:00:00Z', value: 12 }] }),
        });
        const previousFetch = globalThis.fetch;
        (globalThis as any).fetch = fetchMock;
        try {
            const widget = new ChartWidget('chart1', {
                zones: [{
                    id: 'zone-0',
                    sensors: [
                        { serverId: 'mock2', objectName: 'SM_B', name: 'Temp', sensor: 'Temp', color: '#22c55e' },
                    ],
                }],
            }, document.createElement('div'));
            const update = vi.fn();
            widget.charts.set('zone-0', {
                chart: { data: { datasets: [{ data: [] }] }, update },
                sensors: widget.config.zones[0].sensors,
            });

            await widget.loadHistory();

            expect(fetchMock).toHaveBeenCalledWith('/api/objects/SM_B/variables/Temp/history?count=200&server=mock2');
            expect(widget.charts.get('zone-0').chart.data.datasets[0].data).toEqual([
                { x: Date.parse('2026-05-01T00:00:00Z'), y: 12 },
            ]);
            expect(update).toHaveBeenCalledWith('none');
        } finally {
            globalThis.fetch = previousFetch;
        }
    });
});
