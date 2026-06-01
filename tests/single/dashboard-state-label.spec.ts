import { test, expect } from '@playwright/test';

test.describe('Dashboard State Label widget', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => {
            const w = (window as any);
            return typeof w.dashboardState !== 'undefined'
                && typeof w.dashboardManager !== 'undefined'
                && typeof w.StateLabelWidget === 'function';
        }, { timeout: 15000 });
        // Дождаться подключения хотя бы одного сервера
        await page.waitForFunction(() => (window as any).state?.servers?.size > 0, { timeout: 15000 });
    });

    async function setupDashboardWithStateLabel(page: any) {
        // Создаём dashboard с одним state-label widget'ом через injection
        await page.evaluate(() => {
            const w = (window as any);
            const dm = w.dashboardManager;
            w.dashboardState.dashboards.set('test-state-label', {
                version: 1,
                meta: { name: 'test-state-label' },
                grid: { cols: 24, rowHeight: 30, gap: 4 },
                widgets: [{
                    id: 'w-sl',
                    type: 'state-label',
                    position: { col: 1, row: 1, width: 6, height: 2 },
                    config: {
                        serverId: 'ghost', objectName: 'GhostObj',
                        sensor: 'Mode_S', sensorId: 1,
                        states: [
                            { from: 0, to: 0, text: 'OFF', fg: '#ffffff', bg: '#6b7280' },
                            { from: 1, to: 1, text: 'RUN', fg: '#ffffff', bg: '#22c55e' },
                            { from: 2, to: 2, text: 'FAULT', fg: '#ffffff', bg: '#ef4444', blink: { interval: 500 } },
                        ],
                        fallback: 'raw',
                    },
                }],
            });
            if (typeof w.switchView === 'function') w.switchView('dashboard');
            dm.loadDashboard('test-state-label');
        });
        // Дождаться пока виджет появится в dashboardState.widgets
        await page.waitForFunction(
            () => (window as any).dashboardState?.widgets?.size > 0,
            { timeout: 10000 }
        );
    }

    test('state-label updates text/bg when value matches state', async ({ page }) => {
        await setupDashboardWithStateLabel(page);

        // Дождаться появления виджета в DOM
        await expect(page.locator('.state-label-widget')).toBeVisible({ timeout: 5000 });

        // Симулируем обновление: value=1 → state RUN
        await page.evaluate(() => {
            const w = (window as any).dashboardState.widgets.get('w-sl');
            w?.update(1);
        });

        const text = page.locator('.state-label-widget .state-label-text');
        await expect(text).toHaveText('RUN', { timeout: 5000 });
    });

    test('state-label fallback raw shows value as text', async ({ page }) => {
        await setupDashboardWithStateLabel(page);

        await expect(page.locator('.state-label-widget')).toBeVisible({ timeout: 5000 });

        // value=99 — не подходит ни к одному state → fallback raw показывает число
        await page.evaluate(() => {
            const w = (window as any).dashboardState.widgets.get('w-sl');
            w?.update(99);
        });

        const text = page.locator('.state-label-widget .state-label-text');
        await expect(text).toHaveText('99', { timeout: 5000 });
    });

    test('config dialog renders state list editor + reorder buttons', async ({ page }) => {
        await setupDashboardWithStateLabel(page);

        await expect(page.locator('.state-label-widget')).toBeVisible({ timeout: 5000 });

        // Включаем edit mode и открываем config dialog
        await page.evaluate(() => {
            const dm = (window as any).dashboardManager;
            dm.toggleEditMode();
            dm.showWidgetConfig('w-sl');
        });

        // Ждём появления редактора списка states
        await page.waitForSelector('.state-list-editor', { timeout: 5000 });

        const rows = await page.locator('.state-list-row').count();
        expect(rows).toBeGreaterThanOrEqual(3);

        // Кнопки перемещения присутствуют
        await expect(page.locator('.state-list-row .section-move-btn[data-move="up"]').first()).toBeVisible();
        await expect(page.locator('.state-list-row .section-move-btn[data-move="down"]').first()).toBeVisible();
    });
});
