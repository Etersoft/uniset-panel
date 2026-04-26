import { test, expect } from '@playwright/test';

test.describe('PushButtonWidget — third active widget', () => {
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
            typeof (window as any).PushButtonWidget !== 'undefined' &&
            typeof (window as any).dashboardManager !== 'undefined'
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

    async function createButtonDashboard(page, configOverrides: Record<string, unknown> = {}) {
        await page.evaluate((overrides) => {
            const w: any = window;
            const widgetCfg = {
                id: 'pb-1',
                type: 'pushbutton',
                config: {
                    sensor: 'TEST_RESET',
                    sensorId: 100,
                    objectName: 'SharedMemory',
                    style: 'flat',
                    mode: 'pulse',
                    pulseWidth: 200,
                    valueOff: 0,
                    valueOn: 1,
                    label: 'RESET',
                    ...overrides,
                },
                position: { col: 0, row: 0, width: 2, height: 1 },
            };
            const dashCfg = {
                meta: { name: 'TEST_PB', description: '' },
                widgets: [widgetCfg],
            };
            w.dashboardState.dashboards.set('TEST_PB', dashCfg);
            w.dashboardManager.loadDashboard('TEST_PB');
            w.switchView('dashboard');
        }, configOverrides);
        await page.locator('[data-test="btn"]').first().waitFor({ state: 'visible', timeout: 5000 });
    }

    test('renders correct style class for each style', async ({ page }) => {
        await createButtonDashboard(page, { style: 'flat' });
        await expect(page.locator('.pushbutton-style-flat').first()).toBeVisible();
        await expect(page.locator('[data-test="btn"]').first()).toHaveText('RESET');
    });

    test('mushroom style renders with style class', async ({ page }) => {
        await createButtonDashboard(page, { style: 'mushroom', label: 'STOP' });
        await expect(page.locator('.pushbutton-style-mushroom').first()).toBeVisible();
        await expect(page.locator('[data-test="btn"]').first()).toHaveText('STOP');
    });

    test('pill style renders with style class', async ({ page }) => {
        await createButtonDashboard(page, { style: 'pill', label: 'ACK' });
        await expect(page.locator('.pushbutton-style-pill').first()).toBeVisible();
        await expect(page.locator('[data-test="btn"]').first()).toHaveText('ACK');
    });

    test('pulse mode: click → POST valueOn → wait → POST valueOff', async ({ page }) => {
        const posts: { value: number; time: number }[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try {
                    const body = JSON.parse(req.postData() || '{}');
                    posts.push({ value: body.value, time: Date.now() });
                } catch {}
            }
        });

        await createButtonDashboard(page, { mode: 'pulse', pulseWidth: 200, valueOff: 0, valueOn: 1 });
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(500);

        expect(posts.length).toBeGreaterThanOrEqual(2);
        expect(posts[0].value).toBe(1);
        expect(posts[1].value).toBe(0);
        expect(posts[1].time - posts[0].time).toBeGreaterThanOrEqual(150);
    });

    test('momentary mode: mousedown → POST valueOn; window mouseup → POST valueOff', async ({ page }) => {
        const posts: { value: number }[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try {
                    const body = JSON.parse(req.postData() || '{}');
                    posts.push({ value: body.value });
                } catch {}
            }
        });

        await createButtonDashboard(page, { mode: 'momentary', valueOff: 0, valueOn: 1 });

        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        });
        await page.waitForTimeout(100);
        await page.evaluate(() => {
            window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        });
        await page.waitForTimeout(200);

        expect(posts.length).toBeGreaterThanOrEqual(2);
        expect(posts[0].value).toBe(1);
        expect(posts[1].value).toBe(0);
    });

    test('edit mode: click does not write', async ({ page }) => {
        await createButtonDashboard(page);
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.editMode = true;
            document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', { detail: { editMode: true } }));
        });

        let requestSent = false;
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') requestSent = true;
        });

        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(500);
        expect(requestSent).toBe(false);
    });

    test('control token absent: click does not write', async ({ page }) => {
        await createButtonDashboard(page);
        await page.evaluate(() => {
            const w: any = window;
            w.state.control.enabled = true;
            w.state.control.isController = false;
            w.state.control.hasController = false;
            w.state.control.token = null;
            document.dispatchEvent(new CustomEvent('controlStatusChanged', { detail: w.state.control }));
        });

        let requestSent = false;
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') requestSent = true;
        });
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(500);
        expect(requestSent).toBe(false);
    });

    test('custom valueOn/valueOff sent in pulse', async ({ page }) => {
        const posts: { value: number }[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try {
                    const body = JSON.parse(req.postData() || '{}');
                    posts.push({ value: body.value });
                } catch {}
            }
        });

        await createButtonDashboard(page, { mode: 'pulse', pulseWidth: 100, valueOff: 5, valueOn: 42 });
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(400);

        expect(posts.length).toBeGreaterThanOrEqual(2);
        expect(posts[0].value).toBe(42);
        expect(posts[1].value).toBe(5);
    });
});
