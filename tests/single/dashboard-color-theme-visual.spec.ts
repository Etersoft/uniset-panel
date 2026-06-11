import { test, expect } from '@playwright/test';

const THEMES = ['primary', 'danger', 'warning', 'success', 'neutral'] as const;

test.describe('Color theme visual snapshots — compromise 10 frames', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/control/status', async (route) => {
            await route.fulfill({ json: { enabled: true, isController: true, hasController: true, timeoutSec: 60 } });
        });
        await page.goto('/');
        await page.waitForFunction(() =>
            typeof (window as any).dashboardState !== 'undefined' &&
            typeof (window as any).PushButtonWidget !== 'undefined' &&
            typeof (window as any).ToggleWidget !== 'undefined' &&
            typeof (window as any).dashboardManager !== 'undefined'
        );
        await page.waitForFunction(() => {
            const w: any = window;
            for (const [, srv] of (w.state?.servers || new Map())) {
                if (srv.connected) return true;
            }
            return false;
        }, { timeout: 10000 });
    });

    for (const theme of THEMES) {
        test(`PushButton flat × ${theme}`, async ({ page }) => {
            await page.evaluate((t) => {
                const w: any = window;
                w.dashboardState.dashboards.set('VISUAL_PB', {
                    meta: { name: 'VISUAL_PB', description: '' },
                    widgets: [{
                        id: 'pb-v', type: 'pushbutton',
                        config: { sensor: 'X', sensorId: 1, objectName: 'SharedMemory',
                                  style: 'flat', label: 'TEST', colorTheme: t },
                        position: { col: 0, row: 0, width: 3, height: 2 },
                    }],
                });
                w.dashboardManager.loadDashboard('VISUAL_PB');
                w.switchView('dashboard');
            }, theme);
            const btn = page.locator('.pushbutton-widget').first();
            await btn.waitFor({ state: 'visible' });
            await expect(btn).toHaveScreenshot(`pb-flat-${theme}.png`);
        });

        test(`Toggle slider × ${theme}`, async ({ page }) => {
            await page.evaluate((t) => {
                const w: any = window;
                w.dashboardState.dashboards.set('VISUAL_TOG', {
                    meta: { name: 'VISUAL_TOG', description: '' },
                    widgets: [{
                        id: 'tog-v', type: 'toggle',
                        config: { sensor: 'Y', sensorId: 2, objectName: 'SharedMemory',
                                  style: 'slider', valueOff: 0, valueOn: 1,
                                  labelOff: 'OFF', labelOn: 'ON', colorTheme: t },
                        position: { col: 0, row: 0, width: 3, height: 2 },
                    }],
                });
                w.dashboardManager.loadDashboard('VISUAL_TOG');
                w.switchView('dashboard');
                // Toggle в ON для visual ON-state.
                setTimeout(() => {
                    w.dashboardState.widgets.get('tog-v').update(1, null, null);
                }, 100);
            }, theme);
            const wg = page.locator('.toggle-widget').first();
            await wg.waitFor({ state: 'visible' });
            await page.locator('.toggle-track.fb-on').first().waitFor({ state: 'visible', timeout: 3000 });
            await expect(wg).toHaveScreenshot(`tog-slider-${theme}.png`);
        });
    }
});
