import { test, expect } from '@playwright/test';

// E2E для ToggleWidget — переключатель между двумя числовыми значениями.
// Покрывает: write-flow при клике, визуальные состояния (fb-on/fb-off/fb-unknown,
// diverge), edit-mode/control-token gating, кастомные labels, read-pathway по
// objectName.
//
// /ionc/set мокируется (backend → mock-uniset цепочка может отвергать запрос —
// нам важна реакция UI на 200 OK, плюс возможность инспектировать body запроса).

test.describe('ToggleWidget — first active widget', () => {
    test.beforeEach(async ({ page }) => {
        // Мокаем GET /api/control/status — viewer запущен с --control-token admin,
        // canControl() === false без контроля → writeValue() пропускает POST.
        await page.route('**/api/control/status', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    enabled: true, hasController: true, isController: true, timeoutSec: 60
                })
            });
        });

        // POST /ionc/set: возвращаем 200 OK без обращения к backend.
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

        // Дождаться, пока загрузится JS и появятся глобалы.
        await page.waitForFunction(() => {
            const w = window as any;
            return typeof w.dashboardState !== 'undefined'
                && typeof w.dashboardManager !== 'undefined'
                && typeof w.ToggleWidget !== 'undefined';
        });

        // Принудительно ставим состояние контроля в "isController:true" —
        // на случай если SSE-broadcast переключит обратно.
        await page.evaluate(() => {
            const w = window as any;
            w.state.control.token = 'admin';
            w.state.control.isController = true;
            w.state.control.hasController = true;
            w.state.control.enabled = true;
        });

        // Дождаться, пока хотя бы один сервер подключён —
        // ActiveDashboardWidget._resolveServerId() ищет первый connected сервер.
        await page.waitForFunction(() => {
            const w = window as any;
            if (!w.state?.servers) return false;
            for (const [, srv] of w.state.servers) {
                if (srv.connected) return true;
            }
            return false;
        }, { timeout: 15000 });

        // Принудительно ставим state.servers с известным mock id —
        // widget config будет явно указывать serverId='mock-srv', чтобы тесты
        // проверяли persist-path, а не legacy fallback на первый connected.
        await page.evaluate(() => {
            const w = window as any;
            w.state.servers.clear();
            w.state.servers.set('mock-srv', { id: 'mock-srv', name: 'Mock', url: 'http://mock', connected: true });
        });

        // Очищаем пользовательские дашборды для изоляции.
        await page.evaluate(() => {
            localStorage.removeItem('user-dashboards');
            localStorage.removeItem('last-dashboard');
            const keys = Object.keys(localStorage).filter(k => k.startsWith('dashboard:'));
            keys.forEach(k => localStorage.removeItem(k));
        });
    });

    async function createToggleDashboard(
        page,
        configOverrides: Record<string, unknown> = {}
    ) {
        await page.evaluate((overrides) => {
            const w = window as any;
            const widgetCfg = {
                id: 'tw-1',
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
                    ...overrides,
                },
                position: { col: 0, row: 0, width: 3, height: 2 },
            };
            const dashCfg = {
                meta: { name: 'TEST_TOGGLE', description: '' },
                widgets: [widgetCfg],
            };
            w.dashboardState.dashboards.set('TEST_TOGGLE', dashCfg);
            w.dashboardManager.loadDashboard('TEST_TOGGLE');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        }, configOverrides);

        // Ждём появления виджета в DOM.
        await page.locator('[data-test="track"]').first().waitFor({ state: 'visible', timeout: 5000 });
    }

    test('writes valueOn on click when feedback=valueOff', async ({ page }) => {
        await createToggleDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tw-1').update(0); // feedback = OFF
        });

        const postPromise = page.waitForRequest(req =>
            req.url().includes('/ionc/set') && req.method() === 'POST'
        );

        // dispatchEvent вместо .click() — widget-header (z-index:10) перекрывает
        // верхнюю часть виджета и перехватывает pointer events. Прямой dispatch
        // на сам track обходит overlay-routing.
        await page.evaluate(() => {
            const track = document.querySelector('[data-test="track"]') as HTMLElement;
            track.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const req = await postPromise;
        const body = JSON.parse(req.postData() || '{}');
        expect(body.sensor_id).toBe(100);
        expect(body.value).toBe(1);

        // URL должен указывать на сконфигурированный объект (SharedMemory по дефолту).
        expect(req.url()).toContain('/api/objects/SharedMemory/ionc/set');
    });

    test('shows fb-on green when feedback=valueOn, no diverge', async ({ page }) => {
        await createToggleDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tw-1').update(1);
        });
        const track = page.locator('[data-test="track"]');
        await expect(track).toHaveClass(/fb-on/);
        await expect(track).not.toHaveClass(/diverge/);
    });

    test('shows diverge yellow border when cmd != feedback', async ({ page }) => {
        await createToggleDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tw-1').update(0); // feedback OFF
        });
        // Клик → command становится ON, до того как обновится feedback.
        await page.evaluate(() => {
            const track = document.querySelector('[data-test="track"]') as HTMLElement;
            track.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        // pending: command=1, feedback всё ещё 0 → diverge.
        await expect(page.locator('[data-test="track"]')).toHaveClass(/diverge/);
    });

    test('shows fb-unknown for value not equal to valueOff or valueOn', async ({ page }) => {
        await createToggleDashboard(page, { valueOff: 0, valueOn: 100 });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tw-1').update(47);
        });
        const track = page.locator('[data-test="track"]');
        await expect(track).toHaveClass(/fb-unknown/);
        await expect(track).toHaveAttribute('title', /actual:\s*47/);
    });

    test('custom labels are displayed', async ({ page }) => {
        await createToggleDashboard(page, { labelOff: 'STOP', labelOn: 'START' });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tw-1').update(0);
        });
        await expect(page.locator('[data-test="state-text"]')).toHaveText('STOP');

        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tw-1').update(1);
        });
        await expect(page.locator('[data-test="state-text"]')).toHaveText('START');
    });

    test('edit mode: click does not write', async ({ page }) => {
        await createToggleDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.editMode = true;
            document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', { detail: { editMode: true } }));
        });

        let requestSent = false;
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') requestSent = true;
        });

        await page.evaluate(() => {
            const track = document.querySelector('[data-test="track"]') as HTMLElement;
            track.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(500);
        expect(requestSent).toBe(false);

        // Контейнер помечен как data-active-widget="true".
        const container = page.locator('.dashboard-widget[data-active-widget="true"]').first();
        await expect(container).toBeVisible();
    });

    test('control token absent: widget marked active-disabled', async ({ page }) => {
        await createToggleDashboard(page);
        await page.evaluate(() => {
            const w = window as any;
            w.state.control.enabled = true;
            w.state.control.isController = false;
            w.state.control.hasController = false;
            w.state.control.token = null;
            document.dispatchEvent(new CustomEvent('controlStatusChanged', { detail: { ...w.state.control } }));
        });

        const container = page.locator('.dashboard-widget[data-widget-id="tw-1"]').first();
        await expect(container).toHaveClass(/active-disabled/);
        await expect(container).toHaveAttribute('data-control-blocked', 'true');

        let requestSent = false;
        page.on('request', req => {
            if (req.url().includes('/ionc/set') && req.method() === 'POST') requestSent = true;
        });
        await page.evaluate(() => {
            const track = document.querySelector('[data-test="track"]') as HTMLElement;
            track.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await page.waitForTimeout(500);
        expect(requestSent).toBe(false);
    });

    test('read-pathway: writes use widget objectName, not hardcoded', async ({ page }) => {
        await createToggleDashboard(page, { objectName: 'SharedMemory2', sensorId: 200 });
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('tw-1').update(0);
        });

        const postPromise = page.waitForRequest(req =>
            req.url().includes('/ionc/set') && req.method() === 'POST'
        );
        await page.evaluate(() => {
            const track = document.querySelector('[data-test="track"]') as HTMLElement;
            track.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const req = await postPromise;
        expect(req.url()).toContain('/api/objects/SharedMemory2/ionc/set');
        // Проверяем что POST идёт именно на configured serverId, не fallback.
        const url = new URL(req.url());
        const serverParam = url.searchParams.get('server');
        expect(serverParam).toBe('mock-srv');
        const body = JSON.parse(req.postData() || '{}');
        expect(body.sensor_id).toBe(200);
    });
});

test.describe('ToggleWidget — checkbox style', () => {
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
            typeof (window as any).ToggleWidget !== 'undefined' &&
            typeof (window as any).dashboardManager !== 'undefined'
        );
        // In-place mutation (matches existing slider tests pattern)
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

        // Принудительно ставим state.servers с известным mock id для consistency
        // с slider-блоком — widget config явно указывает serverId='mock-srv'.
        await page.evaluate(() => {
            const w: any = window;
            w.state.servers.clear();
            w.state.servers.set('mock-srv', { id: 'mock-srv', name: 'Mock', url: 'http://mock', connected: true });
        });
    });

    async function createCheckboxDashboard(page, configOverrides: Record<string, unknown> = {}) {
        await page.evaluate((overrides) => {
            const w: any = window;
            const widgetCfg = {
                id: 'cb-1',
                type: 'toggle',
                config: {
                    serverId: 'mock-srv',
                    sensor: 'TEST_PUMP',
                    sensorId: 100,
                    objectName: 'SharedMemory',
                    style: 'checkbox',
                    valueOff: 0,
                    valueOn: 1,
                    labelOff: 'OFF',
                    labelOn: 'ON',
                    label: 'PUMP',
                    ...overrides,
                },
                position: { col: 0, row: 0, width: 2, height: 1 },
            };
            const dashCfg = {
                meta: { name: 'TEST_CB', description: '' },
                widgets: [widgetCfg],
            };
            w.dashboardState.dashboards.set('TEST_CB', dashCfg);
            w.dashboardManager.loadDashboard('TEST_CB');
            w.switchView('dashboard');
        }, configOverrides);
        await page.locator('[data-test="cb"]').first().waitFor({ state: 'visible', timeout: 5000 });
    }

    test('renders .toggle-cb (not .toggle-track) when style=checkbox', async ({ page }) => {
        await createCheckboxDashboard(page);
        await expect(page.locator('[data-test="cb"]').first()).toBeVisible();
        await expect(page.locator('[data-test="track"]')).toHaveCount(0);
        const container = page.locator('.toggle-widget.toggle-style-checkbox').first();
        await expect(container).toBeVisible();
    });

    test('click anywhere on widget triggers writeValue', async ({ page }) => {
        await createCheckboxDashboard(page);
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('cb-1').update(0);
        });
        const postPromise = page.waitForRequest(req =>
            req.url().includes('/ionc/set') && req.method() === 'POST'
        );
        // Click on the name (not the checkbox itself) — should still trigger
        await page.evaluate(() => {
            const name = document.querySelector('[data-test="name"]') as HTMLElement;
            name.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const req = await postPromise;
        const body = JSON.parse(req.postData() || '{}');
        expect(body.value).toBe(1);
    });

    test('shows fb-on green check when feedback=valueOn', async ({ page }) => {
        await createCheckboxDashboard(page);
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('cb-1').update(1);
        });
        const cb = page.locator('[data-test="cb"]').first();
        await expect(cb).toHaveClass(/fb-on/);
    });

    test('shows fb-unknown dashed for non-binary value', async ({ page }) => {
        await createCheckboxDashboard(page, { valueOff: 0, valueOn: 100 });
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('cb-1').update(47);
        });
        const cb = page.locator('[data-test="cb"]').first();
        await expect(cb).toHaveClass(/fb-unknown/);
        await expect(cb).toHaveAttribute('title', /actual:\s*47/);
    });

    test('diverge yellow border on root .toggle-widget (not .toggle-cb)', async ({ page }) => {
        await createCheckboxDashboard(page);
        await page.evaluate(() => {
            const w: any = window;
            w.dashboardState.widgets.get('cb-1').update(0);
        });
        await page.evaluate(() => {
            const cb = document.querySelector('[data-test="cb"]') as HTMLElement;
            cb.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        // diverge на корневом .toggle-widget
        await expect(page.locator('.toggle-widget.toggle-style-checkbox').first()).toHaveClass(/diverge/);
        // НЕ на .toggle-cb
        await expect(page.locator('[data-test="cb"]').first()).not.toHaveClass(/diverge/);
    });
});
