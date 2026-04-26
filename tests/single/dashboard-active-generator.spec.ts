import { test, expect } from '@playwright/test';

test.describe('GeneratorWidget — fifth active widget', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/control/status', async (route) => {
            await route.fulfill({ json: { enabled: true, isController: true, hasController: true, timeoutSec: 60 } });
        });
        await page.route('**/ionc/set**', async (route) => {
            if (route.request().method() === 'POST') {
                await route.fulfill({ json: { status: 'ok' } });
            } else {
                await route.continue();
            }
        });

        await page.goto('/');
        await page.waitForFunction(() =>
            typeof (window as any).dashboardState !== 'undefined' &&
            typeof (window as any).GeneratorWidget !== 'undefined' &&
            typeof (window as any).dashboardManager !== 'undefined' &&
            typeof (window as any).SignalGenerator !== 'undefined'
        );
        await page.evaluate(() => {
            const w: any = window;
            w.state.control.enabled = true;
            w.state.control.isController = true;
            w.state.control.hasController = true;
            w.state.control.token = 'admin';
        });
        await page.waitForFunction(() => {
            const w: any = window;
            for (const [, srv] of (w.state?.servers || new Map())) {
                if (srv.connected) return true;
            }
            return false;
        }, { timeout: 10000 });
    });

    async function createGeneratorDashboard(page, configOverrides: Record<string, unknown> = {}) {
        await page.evaluate((overrides) => {
            const w: any = window;
            const widgetCfg = {
                id: 'gen-1',
                type: 'generator',
                config: {
                    sensor: 'GEN_SENSOR',
                    sensorId: 100,
                    objectName: 'SharedMemory',
                    label: 'GEN',
                    type: 'random',
                    min: 0,
                    max: 100,
                    period: 200,
                    requireConfirmation: false,
                    ...overrides,
                },
                position: { col: 0, row: 0, width: 6, height: 2 },
            };
            const dashCfg = { meta: { name: 'TEST_GEN' }, widgets: [widgetCfg] };
            w.dashboardState.dashboards.set('TEST_GEN', dashCfg);
            w.dashboardManager.loadDashboard('TEST_GEN');
            w.switchView('dashboard');
        }, configOverrides);
        await page.locator('.generator-widget').first().waitFor({ state: 'visible', timeout: 5000 });
    }

    test('renders compact widget с label, value, toggle', async ({ page }) => {
        await createGeneratorDashboard(page, { label: 'MY GEN' });
        await expect(page.locator('.generator-widget').first()).toBeVisible();
        await expect(page.locator('[data-test="label"]').first()).toHaveText('MY GEN');
        await expect(page.locator('[data-test="value"]').first()).toHaveText('--');
        await expect(page.locator('[data-test="toggle"]').first()).toBeVisible();
        await expect(page.locator('[data-test="toggle"]').first()).not.toHaveClass(/running/);
    });

    test('toggle Start запускает SignalGenerator + первый POST', async ({ page }) => {
        const posts: any[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try { posts.push(JSON.parse(req.postData() || '{}')); } catch {}
            }
        });

        await createGeneratorDashboard(page, { type: 'random', period: 150 });

        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });

        await page.waitForTimeout(400);

        await expect(page.locator('[data-test="toggle"]').first()).toHaveClass(/running/);
        expect(posts.length).toBeGreaterThanOrEqual(1);
        expect(posts[0].sensor_id).toBe(100);
        expect(posts[0].value).toBeGreaterThanOrEqual(0);
        expect(posts[0].value).toBeLessThanOrEqual(100);
    });

    test('toggle Stop останавливает + value=--', async ({ page }) => {
        await createGeneratorDashboard(page, { type: 'random', period: 150 });

        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(300);

        const valueRunning = await page.evaluate(() =>
            document.querySelector('[data-test="value"]')?.textContent);
        expect(valueRunning).not.toBe('--');

        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(100);

        const valueStopped = await page.evaluate(() =>
            document.querySelector('[data-test="value"]')?.textContent);
        expect(valueStopped).toBe('--');
        await expect(page.locator('[data-test="toggle"]').first()).not.toHaveClass(/running/);

        const isNull = await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                return (w as any)._signalGen === null;
            }
            return false;
        });
        expect(isNull).toBe(true);
    });

    test('toggle disabled в edit mode — не запускается', async ({ page }) => {
        await createGeneratorDashboard(page, { type: 'random', period: 150 });
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.editMode = true;
            document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', { detail: { editMode: true } }));
        });

        let postSent = false;
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') postSent = true;
        });

        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(300);

        expect(postSent).toBe(false);
        await expect(page.locator('[data-test="toggle"]').first()).not.toHaveClass(/running/);
    });

    test('toggle disabled без controlToken — не запускается', async ({ page }) => {
        await createGeneratorDashboard(page, { type: 'random', period: 150 });
        await page.evaluate(() => {
            const w: any = window;
            w.state.control.hasController = false;
            w.state.control.isController = false;
            w.state.control.token = null;
            document.dispatchEvent(new CustomEvent('controlStatusChanged'));
        });

        let postSent = false;
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') postSent = true;
        });

        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(300);

        expect(postSent).toBe(false);
    });

    test('multiple ticks fire POST много раз', async ({ page }) => {
        const posts: any[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try { posts.push(JSON.parse(req.postData() || '{}')); } catch {}
            }
        });

        await createGeneratorDashboard(page, { type: 'random', period: 150 });

        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });

        await page.waitForTimeout(600);

        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });

        expect(posts.length).toBeGreaterThanOrEqual(3);
    });

    test('config dialog: type select показывает conditional поля', async ({ page }) => {
        await createGeneratorDashboard(page, { type: 'random' });
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.editMode = true;
            document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', { detail: { editMode: true } }));
            w.dashboardManager.showWidgetConfig('gen-1');
        });

        await expect(page.locator('[data-test="cfg-row-random"]')).toBeVisible();
        await expect(page.locator('[data-test="cfg-row-step-pause"]')).toBeHidden();
        await expect(page.locator('[data-test="cfg-row-square"]')).toBeHidden();

        await page.evaluate(() => {
            const sel = document.querySelector('[data-test="cfg-type"]') as HTMLSelectElement;
            sel.value = 'square';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await expect(page.locator('[data-test="cfg-row-square"]')).toBeVisible();
        await expect(page.locator('[data-test="cfg-row-random"]')).toBeHidden();

        await page.evaluate(() => {
            const sel = document.querySelector('[data-test="cfg-type"]') as HTMLSelectElement;
            sel.value = 'sin';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await expect(page.locator('[data-test="cfg-row-step-pause"]')).toBeVisible();
        await expect(page.locator('[data-test="cfg-row-square"]')).toBeHidden();
    });

    test('controlToken released во время работы → автостоп', async ({ page }) => {
        await createGeneratorDashboard(page, { type: 'random', period: 150 });

        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(200);
        await expect(page.locator('[data-test="toggle"]').first()).toHaveClass(/running/);

        await page.evaluate(() => {
            const w: any = window;
            w.state.control.hasController = false;
            w.state.control.isController = false;
            w.state.control.token = null;
            document.dispatchEvent(new CustomEvent('controlStatusChanged'));
        });
        await page.waitForTimeout(100);

        await expect(page.locator('[data-test="toggle"]').first()).not.toHaveClass(/running/);
        const isNull = await page.evaluate(() => {
            for (const [, w] of (window as any).dashboardState.widgets) {
                return (w as any)._signalGen === null;
            }
            return false;
        });
        expect(isNull).toBe(true);
    });

    test('destroy widget останавливает генератор', async ({ page }) => {
        await createGeneratorDashboard(page, { type: 'random', period: 150 });

        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(200);

        const isRunningBefore = await page.evaluate(() => {
            const w: any = window;
            const widget = w.dashboardState.widgets.get('gen-1');
            (window as any).__testWidgetRef = widget;
            return widget?._isRunning();
        });
        expect(isRunningBefore).toBe(true);

        // removeWidget shows a confirm dialog; click OK to proceed.
        const removePromise = page.evaluate(() => {
            (window as any).__removeResult = (window as any).dashboardManager.removeWidget('gen-1');
        });
        await page.locator('#confirm-dialog-ok').waitFor({ state: 'visible', timeout: 2000 });
        await page.locator('#confirm-dialog-ok').click();
        await removePromise;
        await page.waitForFunction(() => !(window as any).dashboardState.widgets.has('gen-1'), { timeout: 2000 });

        const isRunningAfter = await page.evaluate(() => {
            return ((window as any).__testWidgetRef as any)?._isRunning();
        });
        expect(isRunningAfter).toBe(false);
    });

    test('requireConfirmation один раз при Start, не каждый тик', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__confirmCount = 0;
            (window as any).confirm = () => { (window as any).__confirmCount++; return true; };
        });

        await createGeneratorDashboard(page, { type: 'random', period: 150, requireConfirmation: true });

        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(500);

        await page.evaluate(() => {
            const t = document.querySelector('[data-test="toggle"]') as HTMLElement;
            t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });

        const count = await page.evaluate(() => (window as any).__confirmCount);
        expect(count).toBe(1);
    });
});
