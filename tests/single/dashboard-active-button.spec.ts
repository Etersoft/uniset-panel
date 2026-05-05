import { test, expect, request as apiRequest } from '@playwright/test';

const VIEWER_URL = process.env.BASE_URL || 'http://localhost:8000';
const MOCK_URL = 'http://mock-uniset:9393';

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

    test('pulse mode: pulseWidth=2000 end-to-end real sensor on mock-uniset', async ({ page }) => {
        // Integration test: backend → mock-uniset realный flow (без mock'а на /ionc/set).
        // Проверяем что click PushButton реально проставляет sensor=valueOn в mock,
        // удерживает ~2с, потом проставляет valueOff.
        //
        // Sensor2_S — AO type (mock noise ±2/s). valueOn=999, valueOff=-999 далеко
        // от noise диапазона (±~6 за 3 тика), tolerance ±10 покрывает.
        const SENSOR_ID = 2;
        const VAL_ON = 999;
        const VAL_OFF = -999;
        const TOLERANCE = 10;
        const ADMIN_TOKEN = 'admin';

        // Backend требует active controller token для POST /ionc/set.
        // Mock из beforeEach — только для frontend; backend проверяет controlMgr.IsController.
        await page.unroute('**/ionc/set**');

        const ctx = await apiRequest.newContext();
        try {
            // 1. Take control on backend (по умолчанию enabled с --control-token admin).
            const takeResp = await ctx.post(`${VIEWER_URL}/api/control/take`, {
                data: { token: ADMIN_TOKEN },
            });
            // Может вернуть 409 если другой тест уже взял; в этом случае forsce-release+retry.
            if (!takeResp.ok()) {
                await ctx.post(`${VIEWER_URL}/api/control/release`, { data: { token: ADMIN_TOKEN } });
                const retake = await ctx.post(`${VIEWER_URL}/api/control/take`, { data: { token: ADMIN_TOKEN } });
                expect(retake.ok()).toBeTruthy();
            }

            // 2. Reset sensor to known baseline (mock direct).
            await ctx.get(`${MOCK_URL}/api/v2/SharedMemory/set?supplier=TestProc&${SENSOR_ID}=0`);

            const readMockSensor = async () => {
                const r = await ctx.get(`${MOCK_URL}/api/v2/SharedMemory/get?supplier=TestProc&filter=${SENSOR_ID}`);
                const d = await r.json();
                return d.sensors[0].value;
            };

            await createButtonDashboard(page, {
                sensor: 'Sensor2_S',
                sensorId: SENSOR_ID,
                mode: 'pulse',
                pulseWidth: 2000,
                valueOff: VAL_OFF,
                valueOn: VAL_ON,
            });

            // 3. Click — frontend POST /ionc/set с X-Control-Token: admin → backend
            //    → mock-uniset /set?2=999. Через 2s — backend POST {value:0} → mock.
            const t0 = Date.now();
            await page.evaluate(() => {
                const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
                btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });

            // 4. После 700ms — sensor=VAL_ON (с tolerance под mock noise).
            await page.waitForTimeout(700);
            const valueDuringPulse = await readMockSensor();
            expect(valueDuringPulse).toBeGreaterThanOrEqual(VAL_ON - TOLERANCE);
            expect(valueDuringPulse).toBeLessThanOrEqual(VAL_ON + TOLERANCE);

            // 5. После ~2300ms — sensor=VAL_OFF (импульс уже закончился).
            const elapsed = Date.now() - t0;
            await page.waitForTimeout(Math.max(0, 2400 - elapsed));
            const valueAfterPulse = await readMockSensor();
            expect(valueAfterPulse).toBeGreaterThanOrEqual(VAL_OFF - TOLERANCE);
            expect(valueAfterPulse).toBeLessThanOrEqual(VAL_OFF + TOLERANCE);
        } finally {
            await ctx.post(`${VIEWER_URL}/api/control/release`, { data: { token: ADMIN_TOKEN } });
            await ctx.dispose();
        }
    });

    test('pulse mode: pulseWidth=2000 holds sensor at valueOn for ~2s before reset', async ({ page }) => {
        // Регресс-тест против ситуации, когда pulseWidth-таймер съедался
        // bootstrap-багом (compaction Bug 1) или коротким clamp'ом. Проверяем
        // что user-настраиваемая ширина 2с реально удерживается.
        const posts: { value: number; time: number }[] = [];
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') {
                try {
                    const body = JSON.parse(req.postData() || '{}');
                    posts.push({ value: body.value, time: Date.now() });
                } catch {}
            }
        });

        await createButtonDashboard(page, { mode: 'pulse', pulseWidth: 2000, valueOff: 0, valueOn: 1 });
        const t0 = Date.now();
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        // Через 1с должен быть только ON (sensor удерживается).
        await page.waitForTimeout(1000);
        expect(posts.length).toBe(1);
        expect(posts[0].value).toBe(1);

        // Ждём до ~2.5с после клика — должен прийти OFF.
        await page.waitForFunction(() => true, { timeout: 1600 });
        await page.waitForTimeout(1600);

        expect(posts.length).toBe(2);
        expect(posts[1].value).toBe(0);

        // Tolerance ±200ms — setTimeout jitter, fetch задержки, page.evaluate overhead.
        const delta = posts[1].time - posts[0].time;
        expect(delta).toBeGreaterThanOrEqual(1800);
        expect(delta).toBeLessThanOrEqual(2300);

        // Sanity: первый POST уходит почти сразу после клика (<300ms).
        expect(posts[0].time - t0).toBeLessThanOrEqual(300);
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

    // Frozen sensor: button blocked + ❄ marker. Push-button фактически не
    // отображает feedback, но frozen всё равно блокирует click — иначе аварийная
    // STOP-команда уйдёт на frozen sensor silent no-op'ом и оператор не узнает.
    test('frozen sensor: blocks click, shows ❄ marker', async ({ page }) => {
        await createButtonDashboard(page, { mode: 'pulse', pulseWidth: 100 });

        // External freeze.
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('pb-1').update(0, null, { frozen: true });
        });

        const container = page.locator('.dashboard-widget[data-widget-id="pb-1"]').first();
        await expect(container).toHaveAttribute('data-frozen', 'true');
        await expect(container).toHaveClass(/active-disabled/);
        await expect(container).toHaveAttribute('title', /frozen/i);

        // Push-button не рисует value (renderFeedback no-op), но update() обязан
        // продолжать трекать состояние датчика — иначе после unfreeze стейт
        // виджета будет stale и interactivity не пересчитается.
        let feedbackValue = await page.evaluate(() => {
            const w: any = window;
            return w.dashboardState.widgets.get('pb-1').feedbackValue;
        });
        expect(feedbackValue).toBe(0);

        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('pb-1').update(1, null, { frozen: true });
        });
        feedbackValue = await page.evaluate(() => {
            const w: any = window;
            return w.dashboardState.widgets.get('pb-1').feedbackValue;
        });
        expect(feedbackValue).toBe(1);
        await expect(container).toHaveAttribute('data-frozen', 'true');

        let posted = false;
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') posted = true;
        });
        await page.evaluate(() => {
            const btn = document.querySelector('[data-test="btn"]') as HTMLElement;
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(300);
        expect(posted).toBe(false);
    });
});
