import { test, expect } from '@playwright/test';

test.describe('Zones reuse picker', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/control/status', async (route) => {
            await route.fulfill({ json: { enabled: true, isController: true, hasController: true, timeoutSec: 60 } });
        });
        await page.goto('/');
        await page.waitForFunction(() =>
            typeof (window as any).dashboardState !== 'undefined' &&
            typeof (window as any).dashboardManager !== 'undefined' &&
            typeof (window as any).renderZonesReusePicker === 'function'
        );
        await page.evaluate(() => {
            const w: any = window;
            w.state.control.enabled = true;
            w.state.control.isController = true;
            w.state.control.hasController = true;
            w.state.control.token = 'admin';
            localStorage.removeItem('uniset.zonesHistory');
        });
        await page.waitForFunction(() => {
            const w: any = window;
            for (const [, srv] of (w.state?.servers || new Map())) {
                if (srv.connected) return true;
            }
            return false;
        }, { timeout: 10000 });
    });

    async function setupDashboardWithGaugeZones(page) {
        await page.evaluate(() => {
            const w: any = window;
            const dashCfg = {
                meta: { name: 'TEST_REUSE' },
                widgets: [{
                    id: 'gauge-src',
                    type: 'gauge',
                    position: { col: 0, row: 0, width: 4, height: 4 },
                    config: {
                        serverId: '385205fb',
                        objectName: 'SharedMemory',
                        sensor: 'Temp_S',
                        sensorId: 100,
                        min: 0, max: 100,
                        zones: [
                            { from: 0,  to: 30,  color: '#3b82f6' },
                            { from: 30, to: 70,  color: '#22c55e' },
                            { from: 70, to: 100, color: '#ef4444' },
                        ],
                    },
                }],
            };
            w.dashboardState.dashboards.set('TEST_REUSE', dashCfg);
            w.dashboardManager.loadDashboard('TEST_REUSE');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        });
    }

    test('cross-widget reuse from dashboard: click chip → zones applied to new Level widget', async ({ page }) => {
        await setupDashboardWithGaugeZones(page);
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardManager.showWidgetConfig(null, 'level');
        });
        await page.locator('.reuse-picker').waitFor({ state: 'visible', timeout: 2000 });

        const chip = page.locator('.zone-chip').filter({ hasText: 'Temp_S' }).first();
        await chip.click();

        const colors = await page.locator('.zone-color').evaluateAll((els: HTMLInputElement[]) =>
            els.map(e => e.value.toLowerCase())
        );
        expect(colors).toEqual(['#3b82f6', '#22c55e', '#ef4444']);
    });

    test('history push: saving widget with zones adds them to Recent', async ({ page }) => {
        await page.evaluate(() => {
            const w: any = window;
            const dashCfg = { meta: { name: 'TEST_PUSH' }, widgets: [] };
            w.dashboardState.dashboards.set('TEST_PUSH', dashCfg);
            w.dashboardManager.loadDashboard('TEST_PUSH');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        });

        await page.evaluate(() => {
            const w: any = window;
            w.dashboardManager.showWidgetConfig(null, 'gauge');
        });

        await page.locator('#widget-config-content').waitFor({ state: 'visible' });

        await page.evaluate(() => {
            const form = document.getElementById('widget-config-content')!;
            (window as any).applyZonesToEditor(form, [
                { from: 0,  to: 50,  color: '#abcdef' },
                { from: 50, to: 100, color: '#fedcba' },
            ]);
        });

        await page.evaluate(() => {
            (window as any).dashboardManager.applyWidgetConfig();
        });

        const history = await page.evaluate(() =>
            (window as any).getZonesHistory()
        );
        expect(history.length).toBe(1);
        expect(history[0].zones).toEqual([
            { from: 0, to: 50, color: '#abcdef' },
            { from: 50, to: 100, color: '#fedcba' },
        ]);
        expect(history[0].sourceWidgetType).toBe('gauge');
    });

    test('history dedup: re-saving same zones moves them to front, length unchanged', async ({ page }) => {
        await page.evaluate(() => {
            const w: any = window;
            w.addZonesToHistory([{ from: 0, to: 10, color: '#aaaaaa' }], 'gauge');
            w.addZonesToHistory([{ from: 0, to: 20, color: '#bbbbbb' }], 'level');
        });
        const before = await page.evaluate(() => (window as any).getZonesHistory());
        expect(before.length).toBe(2);
        expect(before[0].zones[0].color).toBe('#bbbbbb');

        await page.evaluate(() => {
            (window as any).addZonesToHistory([{ from: 0, to: 10, color: '#AAAAAA' }], 'gauge');
        });
        const after = await page.evaluate(() => (window as any).getZonesHistory());
        expect(after.length).toBe(2);
        expect(after[0].zones[0].color).toBe('#aaaaaa');
        expect(after[1].zones[0].color).toBe('#bbbbbb');
    });

    test('FIFO cap: history length never exceeds ZONES_HISTORY_MAX', async ({ page }) => {
        const cap = await page.evaluate(() => (window as any).ZONES_HISTORY_MAX);
        await page.evaluate((cap: number) => {
            for (let i = 0; i < cap + 5; i++) {
                (window as any).addZonesToHistory(
                    [{ from: i, to: i + 1, color: '#000000' }],
                    'gauge'
                );
            }
        }, cap);
        const history = await page.evaluate(() => (window as any).getZonesHistory());
        expect(history.length).toBe(cap);
        expect(history[0].zones[0].from).toBe(cap + 4);
    });

    test('empty state: no dashboard zones + no history → picker block not rendered', async ({ page }) => {
        await page.evaluate(() => {
            const w: any = window;
            const dashCfg = { meta: { name: 'TEST_EMPTY' }, widgets: [] };
            w.dashboardState.dashboards.set('TEST_EMPTY', dashCfg);
            w.dashboardManager.loadDashboard('TEST_EMPTY');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
            localStorage.removeItem('uniset.zonesHistory');
        });

        await page.evaluate(() => {
            const w: any = window;
            w.dashboardManager.showWidgetConfig(null, 'gauge');
        });

        await page.locator('#widget-config-content').waitFor({ state: 'visible' });
        const pickerCount = await page.locator('.reuse-picker').count();
        expect(pickerCount).toBe(0);
    });

    test('same-type-first: editing Gauge → Gauge group precedes Level group', async ({ page }) => {
        await page.evaluate(() => {
            const w: any = window;
            const dashCfg = {
                meta: { name: 'TEST_ORDER' },
                widgets: [
                    { id: 'L1', type: 'level',
                      position: { col: 0, row: 0, width: 4, height: 4 },
                      config: { sensor: 'Tank_A', zones: [{ from: 0, to: 100, color: '#aaaaaa' }] } },
                    { id: 'G1', type: 'gauge',
                      position: { col: 4, row: 0, width: 4, height: 4 },
                      config: { sensor: 'Temp_S', zones: [{ from: 0, to: 100, color: '#bbbbbb' }] } },
                ],
            };
            w.dashboardState.dashboards.set('TEST_ORDER', dashCfg);
            w.dashboardManager.loadDashboard('TEST_ORDER');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
            localStorage.removeItem('uniset.zonesHistory');
        });

        await page.evaluate(() => {
            (window as any).dashboardManager.showWidgetConfig(null, 'gauge');
        });
        await page.locator('.reuse-picker').waitFor({ state: 'visible' });

        const groupTexts = await page.locator('.reuse-picker .group-label').evaluateAll(els =>
            els.map(el => (el.textContent || '').trim())
        );

        const gaugeIdx = groupTexts.findIndex(t => t.includes('Gauge'));
        const levelIdx = groupTexts.findIndex(t => t.includes('Level'));
        expect(gaugeIdx).toBeGreaterThanOrEqual(0);
        expect(levelIdx).toBeGreaterThanOrEqual(0);
        expect(gaugeIdx).toBeLessThan(levelIdx);

        const sameClassCount = await page.locator('.reuse-picker .group-same-class').count();
        expect(sameClassCount).toBe(1);
    });

    test('edit-self exclusion: editing a widget with zones does NOT show itself in dashboard sources', async ({ page }) => {
        await page.evaluate(() => {
            const w: any = window;
            const dashCfg = {
                meta: { name: 'TEST_SELF' },
                widgets: [
                    { id: 'editing-me', type: 'gauge',
                      position: { col: 0, row: 0, width: 4, height: 4 },
                      config: { sensor: 'Self_Sensor', zones: [{ from: 0, to: 50, color: '#aaaaaa' }] } },
                    { id: 'other-one',  type: 'gauge',
                      position: { col: 4, row: 0, width: 4, height: 4 },
                      config: { sensor: 'Other_Sensor', zones: [{ from: 0, to: 100, color: '#bbbbbb' }] } },
                ],
            };
            w.dashboardState.dashboards.set('TEST_SELF', dashCfg);
            w.dashboardManager.loadDashboard('TEST_SELF');
            w.switchView('dashboard');
            localStorage.removeItem('uniset.zonesHistory');
        });

        // Open config editor for the existing 'editing-me' widget by widgetId
        await page.evaluate(() => {
            (window as any).dashboardManager.showWidgetConfig('editing-me');
        });

        await page.locator('.reuse-picker').waitFor({ state: 'visible', timeout: 2000 });

        const sourceLabels = await page.locator('.reuse-picker .zone-chip .chip-source').evaluateAll(els =>
            els.map(el => (el.textContent || '').trim())
        );

        // Self_Sensor (the widget being edited) MUST be absent.
        expect(sourceLabels).not.toContain('Self_Sensor');
        // The OTHER widget MUST be present.
        expect(sourceLabels).toContain('Other_Sensor');
    });
});
