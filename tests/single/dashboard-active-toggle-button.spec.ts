import { test, expect } from '@playwright/test';

// E2E для ToggleWidget style='button' — material flat button с LED индикатором.
// Покрытие: render skeleton, click → writeValue (обе ветки),
// divergence add/clear, CSS visuals (OFF/ON + danger theme), ledColor inline
// var + cleanup, config form picker + conditional visibility, label fallback
// chain (4 branches), frozen click no-op, pending state visual.

test.describe('ToggleWidget — button style', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/control/status', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    enabled: true, hasController: true, isController: true, timeoutSec: 60
                })
            });
        });

        await page.route('**/ionc/set**', route => {
            if (route.request().method() === 'POST') {
                route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ status: 'ok' })
                });
            } else {
                route.continue();
            }
        });

        await page.goto('/');

        await page.waitForFunction(() => {
            const w = window as any;
            return typeof w.dashboardState !== 'undefined'
                && typeof w.dashboardManager !== 'undefined'
                && typeof w.ToggleWidget !== 'undefined';
        });

        await page.evaluate(() => {
            const w = window as any;
            w.state.control.token = 'admin';
            w.state.control.isController = true;
            w.state.control.hasController = true;
            w.state.control.enabled = true;
        });

        await page.waitForFunction(() => {
            const w = window as any;
            if (!w.state?.servers) return false;
            for (const [, srv] of w.state.servers) {
                if (srv.connected) return true;
            }
            return false;
        }, { timeout: 15000 });

        await page.evaluate(() => {
            const w = window as any;
            w.state.servers.clear();
            w.state.servers.set('mock-srv', { id: 'mock-srv', name: 'Mock', url: 'http://mock', connected: true });
        });

        await page.evaluate(() => {
            localStorage.removeItem('user-dashboards');
            localStorage.removeItem('last-dashboard');
            const keys = Object.keys(localStorage).filter(k => k.startsWith('dashboard:'));
            keys.forEach(k => localStorage.removeItem(k));
        });
    });

    async function createButtonDashboard(
        page,
        configOverrides: Record<string, unknown> = {}
    ) {
        await page.evaluate((overrides) => {
            const w = window as any;
            const widgetCfg = {
                id: 'tb-1',
                type: 'toggle',
                config: {
                    serverId: 'mock-srv',
                    sensor: 'TEST_PUMP',
                    sensorId: 100,
                    objectName: 'SharedMemory',
                    valueOff: 0,
                    valueOn: 1,
                    labelOff: 'OFF',
                    labelOn: 'ON',
                    label: 'PUMP-1',
                    style: 'button',
                    ...overrides,
                },
                position: { col: 0, row: 0, width: 3, height: 2 },
            };
            const dashCfg = {
                meta: { name: 'TEST_TBUTTON', description: '' },
                widgets: [widgetCfg],
            };
            w.dashboardState.dashboards.set('TEST_TBUTTON', dashCfg);
            w.dashboardManager.loadDashboard('TEST_TBUTTON');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        }, configOverrides);

        const effectiveStyle = (configOverrides.style as string) || 'button';
        if (effectiveStyle === 'button') {
            await page.locator('[data-test="btn"]').first().waitFor({ state: 'visible', timeout: 5000 });
        } else {
            await page.locator('.toggle-widget').first().waitFor({ state: 'visible', timeout: 5000 });
        }
    }

    test('renders button style DOM skeleton', async ({ page }) => {
        await createButtonDashboard(page);
        const root = page.locator('.toggle-widget.toggle-style-button').first();
        await expect(root).toBeVisible();
        const btn = root.locator('[data-test="btn"]');
        await expect(btn).toHaveAttribute('data-state', 'off');
        await expect(btn).toHaveText('PUMP-1');
    });

    test('click writes valueOn when feedback=valueOff', async ({ page }) => {
        await createButtonDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });

        const postPromise = page.waitForRequest(req =>
            req.url().includes('/ionc/set') && req.method() === 'POST'
        );

        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const req = await postPromise;
        const body = JSON.parse(req.postData() || '{}');
        expect(body.sensor_id).toBe(100);
        expect(body.value).toBe(1);
        expect(req.url()).toContain('/api/objects/SharedMemory/ionc/set');
    });

    test('click writes valueOff when feedback=valueOn', async ({ page }) => {
        await createButtonDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });

        const postPromise = page.waitForRequest(req =>
            req.url().includes('/ionc/set') && req.method() === 'POST'
        );

        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const req = await postPromise;
        const body = JSON.parse(req.postData() || '{}');
        expect(body.sensor_id).toBe(100);
        expect(body.value).toBe(0);
        expect(req.url()).toContain('/api/objects/SharedMemory/ionc/set');
    });

    test('shows .diverge class when command ≠ feedback', async ({ page }) => {
        await createButtonDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        // Click → commandValue=1, feedbackValue остаётся 0.
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const root = page.locator('.toggle-widget.toggle-style-button').first();
        await expect(root).toHaveClass(/diverge/);
    });

    test('.diverge class removed when feedback catches up', async ({ page }) => {
        await createButtonDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        // Имитация прихода feedback'а = command'у.
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });

        const root = page.locator('.toggle-widget.toggle-style-button').first();
        await expect(root).not.toHaveClass(/diverge/);
    });

    test('OFF state has neutral gray background', async ({ page }) => {
        await createButtonDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        const btn = page.locator('[data-test="btn"]').first();
        // #374151 → rgb(55, 65, 81)
        await expect(btn).toHaveCSS('background-color', 'rgb(55, 65, 81)');
    });

    test('ON state uses theme color (default = primary blue)', async ({ page }) => {
        await createButtonDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const btn = page.locator('[data-test="btn"]').first();
        // default --awc-bg fallback = #3b82f6 → rgb(59, 130, 246)
        await expect(btn).toHaveCSS('background-color', 'rgb(59, 130, 246)');
    });

    test('theme=danger ON background = red', async ({ page }) => {
        await createButtonDashboard(page, { colorTheme: 'danger' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const btn = page.locator('[data-test="btn"]').first();
        // danger #ef4444 → rgb(239, 68, 68)
        await expect(btn).toHaveCSS('background-color', 'rgb(239, 68, 68)');
    });

    test('divergence applies yellow box-shadow', async ({ page }) => {
        await createButtonDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const root = page.locator('.toggle-widget.toggle-style-button').first();
        // Yellow ≈ #fbbf24 → rgb(251, 191, 36); box-shadow contains these values.
        await expect(root).toHaveCSS('box-shadow', /251,\s*191,\s*36/);
    });

    test('ledColor inline CSS var applied to container', async ({ page }) => {
        await createButtonDashboard(page, { ledColor: '#22c55e' });
        const container = page.locator('.dashboard-widget').filter({
            has: page.locator('.toggle-style-button')
        }).first();
        const led = await container.evaluate((el: HTMLElement) =>
            el.style.getPropertyValue('--awc-led')
        );
        expect(led).toBe('#22c55e');
    });

    test('no ledColor in config = no inline CSS var (uses default)', async ({ page }) => {
        await createButtonDashboard(page);
        const container = page.locator('.dashboard-widget').filter({
            has: page.locator('.toggle-style-button')
        }).first();
        const led = await container.evaluate((el: HTMLElement) =>
            el.style.getPropertyValue('--awc-led')
        );
        expect(led).toBe('');

        // А кнопка в ON-состоянии — data-state="on" проставляется корректно.
        // (computed ::before CSS var не проверяем — pseudo-element computed styles
        //  через getComputedStyle ненадёжны в headless для CSS custom properties)
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const btn = container.locator('[data-test="btn"]');
        await expect(btn).toHaveAttribute('data-state', 'on');
    });

    test('switching style away from button removes --awc-led', async ({ page }) => {
        await createButtonDashboard(page, { ledColor: '#22c55e' });
        const container = page.locator('.dashboard-widget').filter({
            has: page.locator('.toggle-widget')
        }).first();

        await page.evaluate(() => {
            const w = window as any;
            const widget = w.dashboardState.widgets.get('tb-1');
            widget.config = { ...widget.config, style: 'slider' };
            widget.container.className = `dashboard-widget widget-3x2 transparent`;
            widget.container.querySelector('.widget-title-label')?.remove();
            widget.container.querySelector('.widget-content')?.remove();
            const dash = w.dashboardState.dashboards.get('TEST_TBUTTON');
            w.dashboardManager.renderWidgetContent(widget, dash.widgets[0]);
        });

        const led = await container.evaluate((el: HTMLElement) =>
            el.style.getPropertyValue('--awc-led')
        );
        expect(led).toBe('');
    });

    test('config form contains ledColor color picker when style=button', async ({ page }) => {
        await createButtonDashboard(page);
        // Open widget config dialog programmatically.
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardManager.showWidgetConfig('tb-1');
        });
        const ledInput = page.locator('#widget-config-content [name="ledColor"]');
        await expect(ledInput).toBeVisible();
        await expect(ledInput).toHaveValue('#fde047');
    });

    test('ledColor row hidden when style=slider, shown when style=button', async ({ page }) => {
        await createButtonDashboard(page, { style: 'slider' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardManager.showWidgetConfig('tb-1');
        });

        const ledRow = page.locator('#widget-config-content [data-button-style-row]');
        await expect(ledRow).toBeHidden();

        // Switch style to button via select change
        await page.locator('#widget-config-content [name="style"]').selectOption('button');
        await expect(ledRow).toBeVisible();

        // Back to slider
        await page.locator('#widget-config-content [name="style"]').selectOption('slider');
        await expect(ledRow).toBeHidden();
    });

    test('empty label + value=valueOff → button text = labelOff', async ({ page }) => {
        await createButtonDashboard(page, { label: '', labelOff: 'STOP', labelOn: 'START' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveText('STOP');
    });

    test('empty label + value=valueOn → button text = labelOn', async ({ page }) => {
        await createButtonDashboard(page, { label: '', labelOff: 'STOP', labelOn: 'START' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveText('START');
    });

    test('config.label override beats labelOff/labelOn', async ({ page }) => {
        await createButtonDashboard(page, { label: 'PUMP-1', labelOff: 'STOP', labelOn: 'START' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveText('PUMP-1');

        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        await expect(btn).toHaveText('PUMP-1');
    });

    test('all labels empty → button text = "—"', async ({ page }) => {
        await createButtonDashboard(page, { label: '', labelOff: '', labelOn: '' });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveText('—');
    });

    test('click is no-op when sensor frozen', async ({ page }) => {
        await createButtonDashboard(page);
        // Имитация SSE update с meta.frozen=true — _applyFeedbackMeta
        // ставит data-frozen="true" и блокирует isInteractive().
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0, null, { frozen: true });
        });
        const container = page.locator('.dashboard-widget').filter({
            has: page.locator('.toggle-style-button')
        }).first();
        await expect(container).toHaveAttribute('data-frozen', 'true');

        // Listener на POST — он НЕ должен сработать
        let postFired = false;
        const handler = (req: any) => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                postFired = true;
            }
        };
        page.on('request', handler);

        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        // Дать клику отработать (фрозен-гард synchronous; reqs тоже async-fire'ятся быстро)
        await page.waitForLoadState('networkidle', { timeout: 1000 }).catch(() => {});
        page.off('request', handler);

        expect(postFired).toBe(false);
    });

    test('pending state: label flips immediately, data-state lags until feedback', async ({ page }) => {
        await createButtonDashboard(page, { label: '', labelOff: 'OFF', labelOn: 'ON' });
        // Initial: feedback=0 (OFF)
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveAttribute('data-state', 'off');
        await expect(btn).toHaveText('OFF');

        // Click → commandValue=1, feedback still 0 (pending window)
        await page.evaluate(() => {
            const el = document.querySelector('[data-test="btn"]') as HTMLElement;
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        // Label мгновенно отражает команду (commandValue ?? feedbackValue → 1 → 'ON')
        await expect(btn).toHaveText('ON');
        // data-state остаётся 'off' (источник = feedbackValue, не commandValue)
        await expect(btn).toHaveAttribute('data-state', 'off');
        // Root показывает divergence
        const root = page.locator('.toggle-widget.toggle-style-button').first();
        await expect(root).toHaveClass(/diverge/);
    });
});
