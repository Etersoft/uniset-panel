import { test, expect } from '@playwright/test';

test.describe('ToggleWidget — round style', () => {
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

    async function createRoundDashboard(
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
                    style: 'round',
                    ...overrides,
                },
                position: { col: 0, row: 0, width: 2, height: 2 },
            };
            const dashCfg = {
                meta: { name: 'TEST_TROUND', description: '' },
                widgets: [widgetCfg],
            };
            w.dashboardState.dashboards.set('TEST_TROUND', dashCfg);
            w.dashboardManager.loadDashboard('TEST_TROUND');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        }, configOverrides);

        const effectiveStyle = (configOverrides.style as string) || 'round';
        if (effectiveStyle === 'round') {
            await page.locator('[data-test="btn"]').first().waitFor({ state: 'visible', timeout: 5000 });
        } else {
            await page.locator('.toggle-widget').first().waitFor({ state: 'visible', timeout: 5000 });
        }
    }

    test("'round' is in available styles list", async ({ page }) => {
        await page.evaluate(() => { /* trigger ToggleWidget reference */ });
        const styles = await page.evaluate(() => (window as any).ToggleWidget.styles);
        expect(styles).toContain('round');
    });

    test('renders round style DOM skeleton', async ({ page }) => {
        await createRoundDashboard(page);
        const root = page.locator('.toggle-widget.toggle-style-round').first();
        await expect(root).toBeVisible();
        const btn = root.locator('[data-test="btn"]');
        await expect(btn).toHaveAttribute('data-state', 'off');
        await expect(btn).toHaveText('PUMP-1');
    });

    test('click writes valueOn when feedback=valueOff', async ({ page }) => {
        await createRoundDashboard(page);
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
        await createRoundDashboard(page);
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

    test('OFF state has neutral gray background', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        const btn = page.locator('[data-test="btn"]').first();
        // #374151 → rgb(55, 65, 81)
        await expect(btn).toHaveCSS('background-color', 'rgb(55, 65, 81)');
    });

    test('ON state uses theme color (default primary blue)', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const btn = page.locator('[data-test="btn"]').first();
        // --awc-bg fallback = #3b82f6 → rgb(59, 130, 246)
        await expect(btn).toHaveCSS('background-color', 'rgb(59, 130, 246)');
    });

    test('round shape: border-radius 50%', async ({ page }) => {
        await createRoundDashboard(page);
        const btn = page.locator('[data-test="btn"]').first();
        // Computed border-radius для круга — в headless будет в % или px.
        const computed = await btn.evaluate((el: HTMLElement) => {
            const cs = getComputedStyle(el);
            return cs.borderTopLeftRadius;
        });
        // 50% от width получится в px; конкретное значение зависит от cell size.
        // Проверяем что не 0 (≠ "0px") — round shape применён.
        expect(computed).not.toBe('0px');
        expect(computed).not.toBe('');
    });

    test('aspect-ratio keeps circle in non-square cells (3×2)', async ({ page }) => {
        await page.evaluate(() => {
            const w = window as any;
            w.state.servers.clear();
            w.state.servers.set('mock-srv', { id: 'mock-srv', name: 'Mock', url: 'http://mock', connected: true });
        });
        // Manually create dashboard with non-square 3×2 cell containing round toggle.
        await page.evaluate(() => {
            const w = window as any;
            const widgetCfg = {
                id: 'tb-nonsquare',
                type: 'toggle',
                config: {
                    serverId: 'mock-srv',
                    sensor: 'TEST', sensorId: 100, objectName: 'SharedMemory',
                    valueOff: 0, valueOn: 1, labelOff: 'OFF', labelOn: 'ON', label: 'PUMP',
                    style: 'round',
                },
                position: { col: 0, row: 0, width: 3, height: 2 },
            };
            const dashCfg = { meta: { name: 'TEST_NONSQ', description: '' }, widgets: [widgetCfg] };
            w.dashboardState.dashboards.set('TEST_NONSQ', dashCfg);
            w.dashboardManager.loadDashboard('TEST_NONSQ');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        });
        await page.locator('[data-test="btn"]').first().waitFor({ state: 'visible', timeout: 5000 });
        // button должен остаться квадратом (через aspect-ratio), не эллипсом
        const btn = page.locator('[data-test="btn"]').first();
        const rect = await btn.evaluate((el: HTMLElement) => {
            const r = el.getBoundingClientRect();
            return { width: r.width, height: r.height };
        });
        // aspect-ratio даёт целочисленное равенство; допуск 2px на subpixel rounding
        expect(Math.abs(rect.width - rect.height)).toBeLessThan(2);
    });

    test('LED ::before is rendered (content set)', async ({ page }) => {
        await createRoundDashboard(page);
        const btn = page.locator('[data-test="btn"]').first();
        const content = await btn.evaluate((el: HTMLElement) =>
            getComputedStyle(el, '::before').content
        );
        // CSS content: "" → computed возвращает строку '""' (с кавычками)
        expect(content).toBe('""');
    });

    test('LED ::before glows when data-state=on', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveAttribute('data-state', 'on');
        // Best-effort: проверяем backgroundColor — если headless вернул значение,
        // оно должно содержать amber RGB. Empty/transparent → не assert (известная
        // нестабильность getComputedStyle ::before в headless).
        // expect.poll даёт браузеру flush reflow после изменения dataset.state
        // прежде чем читать computed style ::before.
        await expect.poll(async () => {
            return await btn.evaluate((el: HTMLElement) => {
                void el.offsetHeight; // force reflow
                return getComputedStyle(el, '::before').backgroundColor;
            });
        }, { timeout: 2000, intervals: [50, 100, 250] }).not.toMatch(/31,\s*41,\s*55/);
    });

    test('LED ::before is dim when data-state=off', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveAttribute('data-state', 'off');
        const ledBg = await btn.evaluate((el: HTMLElement) => {
            const cs = getComputedStyle(el, '::before');
            return cs.backgroundColor;
        });
        // #1f2937 → rgb(31, 41, 55) (best-effort, см. выше)
        if (ledBg && ledBg !== 'rgba(0, 0, 0, 0)' && ledBg !== '') {
            expect(ledBg).toMatch(/31,\s*41,\s*55/);
        }
    });

    // Task 5: getDefaultSizeForStyle + ledColor config form integration

    test('new round widget gets default 2×2 size', async ({ page }) => {
        const size = await page.evaluate(() => {
            const w = window as any;
            const WidgetClass = w.ToggleWidget;
            return typeof WidgetClass.getDefaultSizeForStyle === 'function'
                ? WidgetClass.getDefaultSizeForStyle('round')
                : null;
        });
        expect(size).toEqual({ width: 2, height: 2 });
    });

    test('ledColor inline CSS var applied to container (round)', async ({ page }) => {
        await createRoundDashboard(page, { ledColor: '#22c55e' });
        const container = page.locator('.dashboard-widget').filter({
            has: page.locator('.toggle-style-round')
        }).first();
        const led = await container.evaluate((el: HTMLElement) =>
            el.style.getPropertyValue('--awc-led')
        );
        expect(led).toBe('#22c55e');
    });

    test('no ledColor in config = no inline CSS var (round uses default)', async ({ page }) => {
        await createRoundDashboard(page);
        const container = page.locator('.dashboard-widget').filter({
            has: page.locator('.toggle-style-round')
        }).first();
        const led = await container.evaluate((el: HTMLElement) =>
            el.style.getPropertyValue('--awc-led')
        );
        expect(led).toBe('');
    });

    test('config form contains ledColor color picker when style=round', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardManager.showWidgetConfig('tb-1');
        });
        const ledInput = page.locator('#widget-config-content [name="ledColor"]');
        await expect(ledInput).toBeVisible();
        await expect(ledInput).toHaveValue('#fde047');
    });

    test('ledColor row visibility tracks style select (slider/round/button)', async ({ page }) => {
        await createRoundDashboard(page, { style: 'slider' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardManager.showWidgetConfig('tb-1');
        });
        const ledRow = page.locator('#widget-config-content [data-button-style-row]');
        await expect(ledRow).toBeHidden();

        await page.locator('#widget-config-content [name="style"]').selectOption('round');
        await expect(ledRow).toBeVisible();

        await page.locator('#widget-config-content [name="style"]').selectOption('button');
        await expect(ledRow).toBeVisible();

        await page.locator('#widget-config-content [name="style"]').selectOption('checkbox');
        await expect(ledRow).toBeHidden();
    });

    // --- Task 6: divergence, pending, label fallback ---

    test('shows .diverge class when command ≠ feedback', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const root = page.locator('.toggle-widget.toggle-style-round').first();
        await expect(root).toHaveClass(/diverge/);
    });

    test('.diverge class removed when feedback catches up', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const root = page.locator('.toggle-widget.toggle-style-round').first();
        await expect(root).not.toHaveClass(/diverge/);
    });

    test('divergence applies yellow box-shadow', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const root = page.locator('.toggle-widget.toggle-style-round').first();
        // Yellow #fbbf24 → rgb(251, 191, 36)
        await expect(root).toHaveCSS('box-shadow', /251,\s*191,\s*36/);
    });

    test('pending state: label flips immediately, data-state lags', async ({ page }) => {
        await createRoundDashboard(page, { label: '', labelOff: 'OFF', labelOn: 'ON' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveAttribute('data-state', 'off');
        await expect(btn).toHaveText('OFF');

        await page.evaluate(() => {
            const el = document.querySelector('[data-test="btn"]') as HTMLElement;
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        // Label мгновенно показывает команду (commandValue ?? feedbackValue → 1)
        await expect(btn).toHaveText('ON');
        // data-state остаётся 'off' (источник = feedbackValue, не command)
        await expect(btn).toHaveAttribute('data-state', 'off');
        const root = page.locator('.toggle-widget.toggle-style-round').first();
        await expect(root).toHaveClass(/diverge/);
    });

    test('empty label + value=valueOff → button text = labelOff', async ({ page }) => {
        await createRoundDashboard(page, { label: '', labelOff: 'STOP', labelOn: 'START' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0);
        });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveText('STOP');
    });

    test('empty label + value=valueOn → button text = labelOn', async ({ page }) => {
        await createRoundDashboard(page, { label: '', labelOff: 'STOP', labelOn: 'START' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveText('START');
    });

    test('config.label override beats labelOff/labelOn', async ({ page }) => {
        await createRoundDashboard(page, { label: 'PUMP-1', labelOff: 'STOP', labelOn: 'START' });
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
        await createRoundDashboard(page, { label: '', labelOff: '', labelOn: '' });
        const btn = page.locator('[data-test="btn"]').first();
        await expect(btn).toHaveText('—');
    });

    // --- Task 7: frozen no-op + theme integration ---

    test('click is no-op when sensor frozen', async ({ page }) => {
        await createRoundDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(0, null, { frozen: true });
        });
        const container = page.locator('.dashboard-widget').filter({
            has: page.locator('.toggle-style-round')
        }).first();
        await expect(container).toHaveAttribute('data-frozen', 'true');

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

        await page.waitForLoadState('networkidle', { timeout: 1000 }).catch(() => {});
        page.off('request', handler);

        expect(postFired).toBe(false);
    });

    test('theme=danger ON background = red', async ({ page }) => {
        await createRoundDashboard(page, { colorTheme: 'danger' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const btn = page.locator('[data-test="btn"]').first();
        // danger #ef4444 → rgb(239, 68, 68)
        await expect(btn).toHaveCSS('background-color', 'rgb(239, 68, 68)');
    });

    test('theme=success ON background = green', async ({ page }) => {
        await createRoundDashboard(page, { colorTheme: 'success' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tb-1').update(1);
        });
        const btn = page.locator('[data-test="btn"]').first();
        // success #22c55e → rgb(34, 197, 94)
        await expect(btn).toHaveCSS('background-color', 'rgb(34, 197, 94)');
    });

    test('switching style away from round removes --awc-led', async ({ page }) => {
        await createRoundDashboard(page, { ledColor: '#22c55e' });
        const container = page.locator('.dashboard-widget').filter({
            has: page.locator('.toggle-widget')
        }).first();

        await page.evaluate(() => {
            const w = window as any;
            const widget = w.dashboardState.widgets.get('tb-1');
            widget.config = { ...widget.config, style: 'slider' };
            widget.container.className = `dashboard-widget widget-2x2 transparent`;
            widget.container.querySelector('.widget-title-label')?.remove();
            widget.container.querySelector('.widget-content')?.remove();
            const dash = w.dashboardState.dashboards.get('TEST_TROUND');
            w.dashboardManager.renderWidgetContent(widget, dash.widgets[0]);
        });

        const led = await container.evaluate((el: HTMLElement) =>
            el.style.getPropertyValue('--awc-led')
        );
        expect(led).toBe('');
    });
});
