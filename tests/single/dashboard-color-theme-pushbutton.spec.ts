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

    test('theme=custom: inline vars set, container получает awc-theme-custom', async ({ page }) => {
        await createPbDashboard(page, { colorTheme: 'custom', customBg: '#ff6600', customFg: '#000000' });
        const container = page.locator('.dashboard-widget').filter({ has: page.locator('.pushbutton-widget') }).first();
        await expect(container).toHaveClass(/awc-theme-custom/);
        await expect(container).toHaveAttribute('data-color-theme', 'custom');

        const vars = await container.evaluate((el: HTMLElement) => ({
            bg: el.style.getPropertyValue('--awc-bg'),
            fg: el.style.getPropertyValue('--awc-fg'),
        }));
        expect(vars.bg).toBe('#ff6600');
        expect(vars.fg).toBe('#000000');

        const btn = page.locator('.pushbutton-widget .pb-btn').first();
        const bg = await btn.evaluate((el) => getComputedStyle(el).backgroundColor);
        // #ff6600 → rgb(255, 102, 0)
        expect(bg).toMatch(/rgb\(\s*255,\s*102,\s*0\s*\)/);
    });

    test('switching: danger → custom → default cleanup (inline vars cleared)', async ({ page }) => {
        await createPbDashboard(page, { colorTheme: 'danger' });
        // applyWidgetConfig() в реальной реализации читает config из dialog DOM —
        // напрямую вызывать с config не получается. Воспроизводим его внутренний
        // re-render path: cfg mutate + className reset + widget.config + render().
        // Это то же самое, что делает 62-dashboard-manager.js applyWidgetConfig
        // в ветке "Update existing widget" (см. строки 1213+).
        await page.evaluate(() => {
            const w: any = window;
            const dash = w.dashboardState.dashboards.get('TEST_PB_THEME');
            const wc = dash.widgets[0];
            wc.config = { ...wc.config, colorTheme: 'custom', customBg: '#ff6600', customFg: '#000000' };
            const widget = w.dashboardState.widgets.get(wc.id);
            widget.config = wc.config;
            // applyWidgetConfig wipe'ает className до базового + transparent.
            // _applyColorTheme (вызываемый из render()) восстановит theme class.
            widget.container.className = `dashboard-widget widget-${wc.position.width}x${wc.position.height} transparent`;
            widget.container.querySelector('.widget-title-label')?.remove();
            widget.container.querySelector('.widget-content')?.remove();
            w.dashboardManager.renderWidgetContent(widget, wc);
        });
        const container = page.locator('.dashboard-widget').filter({ has: page.locator('.pushbutton-widget') }).first();
        await expect(container).toHaveClass(/awc-theme-custom/);

        // Переключаемся обратно в default — inline vars должны очиститься.
        await page.evaluate(() => {
            const w: any = window;
            const dash = w.dashboardState.dashboards.get('TEST_PB_THEME');
            const wc = dash.widgets[0];
            wc.config = { ...wc.config, colorTheme: 'default', customBg: undefined, customFg: undefined };
            const widget = w.dashboardState.widgets.get(wc.id);
            widget.config = wc.config;
            widget.container.className = `dashboard-widget widget-${wc.position.width}x${wc.position.height} transparent`;
            widget.container.querySelector('.widget-title-label')?.remove();
            widget.container.querySelector('.widget-content')?.remove();
            w.dashboardManager.renderWidgetContent(widget, wc);
        });
        await expect(container).not.toHaveClass(/awc-theme-/);
        const vars = await container.evaluate((el: HTMLElement) => ({
            bg: el.style.getPropertyValue('--awc-bg'),
            fg: el.style.getPropertyValue('--awc-fg'),
        }));
        expect(vars.bg).toBe('');
        expect(vars.fg).toBe('');
    });

    test('pill idle: tема перекрашивает border/color без hover (touchscreen-friendly)', async ({ page }) => {
        // Regression: до этого фикса pill в idle оставался серым outline
        // даже с темой — оператор не видел SCADA-семантику без hover'а
        // (что не работает на touchscreen). Fix: var(--awc-bg) теперь
        // применяется и в idle, не только на hover/pressed.
        await createPbDashboard(page, { style: 'pill', colorTheme: 'danger' });
        const btn = page.locator('.pushbutton-widget .pb-btn').first();
        const styles = await btn.evaluate((el) => ({
            color: getComputedStyle(el).color,
            border: getComputedStyle(el).borderColor,
        }));
        // #ef4444 → rgb(239, 68, 68) на color и border-color
        expect(styles.color).toMatch(/rgb\(\s*239,\s*68,\s*68\s*\)/);
        expect(styles.border).toMatch(/rgb\(\s*239,\s*68,\s*68\s*\)/);
    });

    test('pill idle backwards-compat: без темы — старый нейтральный outline', async ({ page }) => {
        await createPbDashboard(page, { style: 'pill' }); // no colorTheme
        const btn = page.locator('.pushbutton-widget .pb-btn').first();
        const styles = await btn.evaluate((el) => ({
            color: getComputedStyle(el).color,
            border: getComputedStyle(el).borderColor,
        }));
        // #d8dce2 → rgb(216, 220, 226) color, #6b7280 → rgb(107, 114, 128) border
        expect(styles.color).toMatch(/rgb\(\s*216,\s*220,\s*226\s*\)/);
        expect(styles.border).toMatch(/rgb\(\s*107,\s*114,\s*128\s*\)/);
    });
});
