import { test, expect } from '@playwright/test';

test.describe('PushButton color theme', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/control/status', async (route) => {
            await route.fulfill({ json: { enabled: true, isController: true, hasController: true, timeoutSec: 60 } });
        });
        await page.goto('/');
        await page.waitForFunction(() =>
            typeof (window as any).dashboardState !== 'undefined' &&
            typeof (window as any).PushButtonWidget !== 'undefined' &&
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

    async function createPbDashboard(page: any, overrides: any = {}) {
        await page.evaluate((cfgOverrides: any) => {
            const w: any = window;
            const widgetCfg = {
                id: 'pb-theme-1',
                type: 'pushbutton',
                config: {
                    sensor: 'TEST_BTN',
                    sensorId: 100,
                    objectName: 'SharedMemory',
                    style: 'flat',
                    label: 'TEST',
                    ...cfgOverrides,
                },
                position: { col: 0, row: 0, width: 2, height: 1 },
            };
            w.dashboardState.dashboards.set('TEST_PB_THEME', {
                meta: { name: 'TEST_PB_THEME', description: '' },
                widgets: [widgetCfg],
            });
            w.dashboardManager.loadDashboard('TEST_PB_THEME');
            w.switchView('dashboard');
        }, overrides);
        await page.locator('[data-test="btn"]').first().waitFor({ state: 'visible', timeout: 5000 });
    }

    test('theme=danger: container получает awc-theme-danger class + data-color-theme', async ({ page }) => {
        await createPbDashboard(page, { colorTheme: 'danger' });
        const container = page.locator('.dashboard-widget').filter({ has: page.locator('.pushbutton-widget') }).first();
        await expect(container).toHaveClass(/awc-theme-danger/);
        await expect(container).toHaveAttribute('data-color-theme', 'danger');
    });

    test('theme=danger: computed background — красный (#ef4444)', async ({ page }) => {
        await createPbDashboard(page, { colorTheme: 'danger', style: 'flat' });
        const btn = page.locator('.pushbutton-widget .pb-btn').first();
        const bg = await btn.evaluate((el) => getComputedStyle(el).backgroundColor);
        // #ef4444 → rgb(239, 68, 68)
        expect(bg).toMatch(/rgb\(\s*239,\s*68,\s*68\s*\)/);
    });

    test('backwards-compat: без colorTheme — нет awc-theme-* класса, цвет = текущий flat blue', async ({ page }) => {
        await createPbDashboard(page); // no colorTheme
        const container = page.locator('.dashboard-widget').filter({ has: page.locator('.pushbutton-widget') }).first();
        await expect(container).not.toHaveClass(/awc-theme-/);
        const hasDataAttr = await container.evaluate((el) => 'colorTheme' in (el as HTMLElement).dataset);
        expect(hasDataAttr).toBe(false);

        const btn = page.locator('.pushbutton-widget .pb-btn').first();
        const bg = await btn.evaluate((el) => getComputedStyle(el).backgroundColor);
        // #3b82f6 → rgb(59, 130, 246)
        expect(bg).toMatch(/rgb\(\s*59,\s*130,\s*246\s*\)/);
    });
});
