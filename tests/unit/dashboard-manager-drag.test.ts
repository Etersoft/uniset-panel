import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../../ui/static/js/src');

function loadDashboardManager() {
    const constants = readFileSync(resolve(SRC_DIR, '00-constants.js'), 'utf8');
    const utils = readFileSync(resolve(SRC_DIR, '06-utils.js'), 'utf8');
    const state = readFileSync(resolve(SRC_DIR, '00-state.js'), 'utf8');
    const base = readFileSync(resolve(SRC_DIR, '60-dashboard-base.js'), 'utf8');
    const manager = readFileSync(resolve(SRC_DIR, '62-dashboard-manager.js'), 'utf8');
    new Function(`
        class GaugeWidget {}
        class LevelWidget {}
        class LedWidget {}
        class LabelWidget {}
        class DividerWidget {}
        class StatusBarWidget {}
        class BarGraphWidget {}
        class DigitalWidget {}
        class ToggleWidget {}
        class PushButtonWidget {}
        class SetpointWidget {}
        class GeneratorWidget {}
        class ChartWidget {}
        class ActiveDashboardWidget {}
        function closeWidgetPicker() {}
        function closeWidgetConfig() {}
        function closeDashboardNameDialog() {}
        function closeDashboardImport() {}
        async function showConfirmDialog() { return true; }
        function renderDashboardsList() {}
        function migrateDashboardBindings() { return { changed: false, total: 0 }; }
        function getSensorInfoByKey() { return null; }
        function parseSensorKey() { return null; }
        function makeSensorKey(serverId, objectName, sensorName) { return [serverId, objectName, sensorName].join('|'); }
        function setupNumberInputs() {}
        ${constants}
        ${utils}
        ${state}
        ${base}
        ${manager}
        globalThis.DashboardManager = DashboardManager;
        globalThis.dashboardState = dashboardState;
        globalThis.registerDashboardWidgetType = window.registerDashboardWidgetType;
    `)();
}

describe('DashboardManager drag positioning', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="dashboard-grid"></div><div id="widget"></div>';
        loadDashboardManager();
    });

    it('keeps concrete widget size after shift-drag free positioning', () => {
        const grid = document.getElementById('dashboard-grid') as HTMLElement;
        const container = document.getElementById('widget') as HTMLElement;
        grid.appendChild(container);

        Object.defineProperty(grid, 'getBoundingClientRect', {
            value: () => ({ left: 10, top: 20, width: 484, height: 400, right: 494, bottom: 420 }),
        });
        Object.defineProperty(container, 'getBoundingClientRect', {
            value: () => ({ left: 58, top: 50, width: 48, height: 30, right: 106, bottom: 80 }),
        });
        vi.spyOn(window, 'getComputedStyle').mockReturnValue({
            paddingLeft: '0px',
            paddingTop: '0px',
        } as CSSStyleDeclaration);

        const manager = Object.create((globalThis as any).DashboardManager.prototype);
        manager.gridEl = grid;
        manager.saveDashboard = vi.fn();
        manager.selectWidget = vi.fn();

        const widgetConfig = {
            id: 'w1',
            position: { col: 1, row: 1, width: 2, height: 1 },
        };
        (globalThis as any).dashboardState.currentDashboard = 'D';
        (globalThis as any).dashboardState.selectedWidgetId = 'w1';
        (globalThis as any).dashboardState.dashboards.set('D', { widgets: [widgetConfig] });

        manager.startDrag('w1', container, { clientX: 60, clientY: 52, shiftKey: true });
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 120, clientY: 90, shiftKey: true }));
        document.dispatchEvent(new MouseEvent('mouseup', { clientX: 120, clientY: 90, shiftKey: true }));

        expect(container.style.width).toBe('48px');
        expect(container.style.height).toBe('30px');
        expect(container.style.width).not.toContain('undefined');
        expect(container.style.height).not.toContain('undefined');
        expect(widgetConfig.position.freePosition).toEqual({ left: 108, top: 68 });
    });

    it('removes widgets that do not implement destroy', async () => {
        const widgetEl = document.getElementById('widget') as HTMLElement;
        const manager = Object.create((globalThis as any).DashboardManager.prototype);
        manager.saveDashboard = vi.fn();
        manager.updateSensorSubscriptions = vi.fn();

        const dashboard = {
            widgets: [{ id: 'w1', type: 'label', position: { col: 0, row: 0, width: 1, height: 1 }, config: {} }],
        };
        (globalThis as any).dashboardState.currentDashboard = 'D';
        (globalThis as any).dashboardState.dashboards.set('D', dashboard);
        (globalThis as any).dashboardState.widgets.set('w1', {
            container: widgetEl,
        });

        await manager.removeWidget('w1');

        expect(dashboard.widgets).toEqual([]);
        expect((globalThis as any).dashboardState.widgets.has('w1')).toBe(false);
        expect(widgetEl.isConnected).toBe(false);
        expect(manager.saveDashboard).toHaveBeenCalledOnce();
        expect(manager.updateSensorSubscriptions).toHaveBeenCalledOnce();
    });

    it('clears stale multi-sensor config wiring flags between openings', () => {
        document.body.innerHTML = `
            <div id="widget-config-overlay" class="hidden"></div>
            <div id="widget-config-title"></div>
            <div id="widget-config-content"></div>
        `;
        loadDashboardManager();

        const content = document.getElementById('widget-config-content') as HTMLElement;
        content.dataset.sensorItemList_fake_item_wired = 'true';

        let seenFlag: string | undefined;
        (globalThis as any).registerDashboardWidgetType('fake-list', {
            displayName: 'Fake List',
            defaultSize: { width: 1, height: 1 },
            getConfigForm: () => '<button type="button" id="add-fake-item"></button>',
            parseConfigForm: () => ({}),
            initConfigHandlers: (form: HTMLElement) => {
                seenFlag = form.dataset.sensorItemList_fake_item_wired;
                form.dataset.sensorItemList_fake_item_wired = 'true';
            },
        });

        const manager = Object.create((globalThis as any).DashboardManager.prototype);
        manager.showWidgetConfig(null, 'fake-list');

        expect(seenFlag).toBeUndefined();
        expect(content.dataset.sensorItemList_fake_item_wired).toBe('true');
    });
});
