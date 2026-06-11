import { test, expect } from '@playwright/test';

test.describe('Toggle color theme', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/control/status', async (route) => {
            await route.fulfill({ json: { enabled: true, isController: true, hasController: true, timeoutSec: 60 } });
        });
        await page.goto('/');
        await page.waitForFunction(() =>
            typeof (window as any).dashboardState !== 'undefined' &&
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

    async function createToggleDashboard(page: any, overrides: any = {}) {
        await page.evaluate((cfgOverrides: any) => {
            const w: any = window;
            const widgetCfg = {
                id: 'tog-theme-1',
                type: 'toggle',
                config: {
                    sensor: 'TEST_TOG',
                    sensorId: 200,
                    objectName: 'SharedMemory',
                    style: 'slider',
                    valueOff: 0,
                    valueOn: 1,
                    labelOff: 'OFF',
                    labelOn: 'ON',
                    ...cfgOverrides,
                },
                position: { col: 0, row: 0, width: 3, height: 2 },
            };
            w.dashboardState.dashboards.set('TEST_TOG_THEME', {
                meta: { name: 'TEST_TOG_THEME', description: '' },
                widgets: [widgetCfg],
            });
            w.dashboardManager.loadDashboard('TEST_TOG_THEME');
            w.switchView('dashboard');
        }, overrides);
        await page.locator('.toggle-widget').first().waitFor({ state: 'visible', timeout: 5000 });
    }

    test('slider theme=warning: ON track — amber (#fbbf24)', async ({ page }) => {
        await createToggleDashboard(page, { style: 'slider', colorTheme: 'warning' });
        // Set state to ON
        await page.evaluate(() => {
            const w: any = window;
            const wg = w.dashboardState.widgets.get('tog-theme-1');
            wg.update(1, null, null);
        });
        await expect(page.locator('.toggle-track.fb-on').first()).toBeVisible();
        const track = page.locator('.toggle-track.fb-on').first();
        // toggle-track has CSS transition (background 0.15s) — poll until steady-state.
        // #fbbf24 → rgb(251, 191, 36)
        await expect.poll(
            async () => track.evaluate((el) => getComputedStyle(el).backgroundColor),
            { timeout: 5000, intervals: [50, 100, 200] },
        ).toMatch(/rgb\(\s*251,\s*191,\s*36\s*\)/);
    });

    test('slider OFF track НЕ меняется при theme — gray-neutral regression', async ({ page }) => {
        await createToggleDashboard(page, { style: 'slider', colorTheme: 'danger' });
        await page.evaluate(() => {
            const w: any = window;
            const wg = w.dashboardState.widgets.get('tog-theme-1');
            wg.update(0, null, null);
        });
        await expect(page.locator('.toggle-track.fb-off').first()).toBeVisible();
        const track = page.locator('.toggle-track.fb-off').first();
        // #374151 → rgb(55, 65, 81)
        await expect.poll(
            async () => track.evaluate((el) => getComputedStyle(el).backgroundColor),
            { timeout: 5000, intervals: [50, 100, 200] },
        ).toMatch(/rgb\(\s*55,\s*65,\s*81\s*\)/);
    });

    test('checkbox theme=danger: ON background = #ef4444, checkmark = #fff', async ({ page }) => {
        await createToggleDashboard(page, { style: 'checkbox', colorTheme: 'danger' });
        await page.evaluate(() => {
            const w: any = window;
            const wg = w.dashboardState.widgets.get('tog-theme-1');
            wg.update(1, null, null);
        });
        await expect(page.locator('.toggle-cb.fb-on').first()).toBeVisible();
        const cb = page.locator('.toggle-cb.fb-on').first();
        // .toggle-cb имеет transition: background 0.15s, border-color 0.15s — poll.
        // #ef4444 → rgb(239, 68, 68); checkmark #fff → rgb(255, 255, 255).
        await expect.poll(
            async () => cb.evaluate((el) => {
                const after = window.getComputedStyle(el, '::after');
                return {
                    bg: getComputedStyle(el).backgroundColor,
                    checkmark: after.color,
                };
            }),
            { timeout: 5000, intervals: [50, 100, 200] },
        ).toMatchObject({
            bg: expect.stringMatching(/rgb\(\s*239,\s*68,\s*68\s*\)/),
            checkmark: expect.stringMatching(/rgb\(\s*255,\s*255,\s*255\s*\)/),
        });
    });

    test('backwards-compat: без colorTheme — нет awc-theme-* класса, ON цвет = #22c55e', async ({ page }) => {
        await createToggleDashboard(page); // no colorTheme
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('tog-theme-1').update(1, null, null);
        });
        const container = page.locator('.dashboard-widget').filter({ has: page.locator('.toggle-widget') }).first();
        await expect(container).not.toHaveClass(/awc-theme-/);
        const track = page.locator('.toggle-track.fb-on').first();
        // #22c55e → rgb(34, 197, 94)
        await expect.poll(
            async () => track.evaluate((el) => getComputedStyle(el).backgroundColor),
            { timeout: 5000, intervals: [50, 100, 200] },
        ).toMatch(/rgb\(\s*34,\s*197,\s*94\s*\)/);
    });
});
