import { test, expect } from '@playwright/test';

// 4 сценария multi-server isolation для dashboard.
// Используем page.route mocks — два «сервера» mock1/mock2 с одинаковым
// sensor name `Temp` но разными values. Verifies:
//   1. cache isolation (sensorKey-based Map)
//   2. subscription routing (SSE на mock1 → widget с serverId=mock1 only)
//   3. write routing (POST URL содержит ?server=mock2 для widget с serverId=mock2)
//   4. auto-migration (legacy widget config без serverId → first connected)

test.describe('Dashboard multi-server isolation', () => {
    test.beforeEach(async ({ page }) => {
        // Mock /api/control/status → controller (для writeValue)
        await page.route('**/api/control/status', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    enabled: true, isController: true, hasController: true, timeoutSec: 60
                })
            });
        });

        // Mock /api/servers — два сервера. Поскольку реальный backend всё равно
        // вернёт реальный список (env-зависимый), мы переопределяем state.servers
        // вручную ниже.
        await page.route('**/api/servers**', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    servers: [
                        { id: 'mock1', name: 'Mock-1', url: 'http://mock1', connected: true },
                        { id: 'mock2', name: 'Mock-2', url: 'http://mock2', connected: true }
                    ]
                })
            });
        });

        // Mock /ionc/set — POST always 200 OK; для inspect URL/body в write routing test.
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
                && typeof w.makeSensorKey === 'function';
        }, { timeout: 10000 });

        // Принудительно ставим control state — без этого writeValue() пропустит POST.
        // Force-overrides любой SSE-broadcast от backend.
        await page.evaluate(() => {
            const w = window as any;
            w.state.control.token = 'admin';
            w.state.control.isController = true;
            w.state.control.hasController = true;
            w.state.control.enabled = true;
        });

        // Принудительно ставим state.servers — mock /api/servers может опоздать,
        // или backend может уже подгрузить реальный список к моменту goto.
        await page.evaluate(() => {
            const w = window as any;
            w.state.servers.clear();
            w.state.servers.set('mock1', { id: 'mock1', name: 'Mock-1', url: 'http://mock1', connected: true });
            w.state.servers.set('mock2', { id: 'mock2', name: 'Mock-2', url: 'http://mock2', connected: true });
        });

        // Очищаем dashboards для изоляции.
        await page.evaluate(() => {
            localStorage.removeItem('user-dashboards');
            localStorage.removeItem('last-dashboard');
            const keys = Object.keys(localStorage).filter(k => k.startsWith('dashboard:'));
            keys.forEach(k => localStorage.removeItem(k));
        });
    });

    test('cache isolation: same sensor name на двух серверах не смешивается', async ({ page }) => {
        await page.evaluate(() => {
            const w = window as any;
            w.state.sensorValuesCache.clear();
            const k1 = w.makeSensorKey('mock1', 'SharedMemory', 'Temp');
            const k2 = w.makeSensorKey('mock2', 'SharedMemory', 'Temp');
            w.state.sensorValuesCache.set(k1, { value: 100, timestamp: Date.now() });
            w.state.sensorValuesCache.set(k2, { value: 200, timestamp: Date.now() });
        });
        const result = await page.evaluate(() => {
            const w = window as any;
            return {
                v1: w.state.sensorValuesCache.get(w.makeSensorKey('mock1', 'SharedMemory', 'Temp')).value,
                v2: w.state.sensorValuesCache.get(w.makeSensorKey('mock2', 'SharedMemory', 'Temp')).value
            };
        });
        expect(result.v1).toBe(100);
        expect(result.v2).toBe(200);
    });

    test('subscription routing: SSE на mock1 обновляет только widget с serverId=mock1', async ({ page }) => {
        // Создаём dashboard с двумя toggle widget'ами — same sensor name Temp,
        // разные serverId. Используем loadDashboard, чтобы пройти весь flow
        // (createWidget + updateSensorSubscriptions).
        await page.evaluate(async () => {
            const w = window as any;
            const cfg = {
                meta: { name: 'TEST_MULTI_SUB', description: '' },
                widgets: [
                    {
                        id: 'w-mock1',
                        type: 'toggle',
                        config: {
                            serverId: 'mock1', objectName: 'SharedMemory',
                            sensor: 'Temp', sensorId: 1,
                            valueOff: 0, valueOn: 1
                        },
                        position: { col: 0, row: 0, width: 3, height: 2 }
                    },
                    {
                        id: 'w-mock2',
                        type: 'toggle',
                        config: {
                            serverId: 'mock2', objectName: 'SharedMemory',
                            sensor: 'Temp', sensorId: 1,
                            valueOff: 0, valueOn: 1
                        },
                        position: { col: 3, row: 0, width: 3, height: 2 }
                    }
                ]
            };
            w.dashboardState.dashboards.set('TEST_MULTI_SUB', cfg);
            await w.dashboardManager.loadDashboard('TEST_MULTI_SUB');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        });

        // Симулируем SSE event с serverId=mock1 — должен обновить только w-mock1.
        await page.evaluate(() => {
            const w = window as any;
            w.updateDashboardWidgets(
                [{ name: 'Temp', value: 100 }],
                { serverId: 'mock1', objectName: 'SharedMemory', timestamp: Date.now() }
            );
        });

        const result = await page.evaluate(() => {
            const w = window as any;
            return {
                w1: w.dashboardState.widgets.get('w-mock1')?.feedbackValue ?? null,
                w2: w.dashboardState.widgets.get('w-mock2')?.feedbackValue ?? null
            };
        });
        expect(result.w1).toBe(100);
        expect(result.w2).toBeNull();
    });

    test('write routing: click по widget с serverId=mock2 → POST на ?server=mock2', async ({ page }) => {
        await page.evaluate(async () => {
            const w = window as any;
            const cfg = {
                meta: { name: 'TEST_MULTI_WRITE', description: '' },
                widgets: [{
                    id: 'w-mock2',
                    type: 'toggle',
                    config: {
                        serverId: 'mock2', objectName: 'SharedMemory',
                        sensor: 'Temp', sensorId: 1,
                        valueOff: 0, valueOn: 1
                    },
                    position: { col: 0, row: 0, width: 3, height: 2 }
                }]
            };
            w.dashboardState.dashboards.set('TEST_MULTI_WRITE', cfg);
            await w.dashboardManager.loadDashboard('TEST_MULTI_WRITE');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        });

        const postPromise = page.waitForRequest(req =>
            req.url().includes('/ionc/set') && req.method() === 'POST'
        );
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardState.widgets.get('w-mock2').writeValue(1);
        });
        const req = await postPromise;
        expect(req.url()).toContain('server=mock2');
        expect(req.url()).not.toContain('server=mock1');
    });

    test('two IONC objects same server: SSE routing по objectName', async ({ page }) => {
        // Сценарий: один сервер, два IONC объекта 'SM_A' и 'SM_B', оба с
        // одинаковым sensor name 'Temp'. Widget1 подписан на SM_A.Temp,
        // widget2 — на SM_B.Temp. SSE event для SM_A не должен обновить SM_B.
        await page.evaluate(async () => {
            const w = window as any;
            const cfg = {
                meta: { name: 'TEST_TWO_OBJECTS', description: '' },
                widgets: [
                    {
                        id: 'w-sm-a',
                        type: 'toggle',
                        config: {
                            serverId: 'mock1', objectName: 'SM_A',
                            sensor: 'Temp', sensorId: 1,
                            valueOff: 0, valueOn: 1
                        },
                        position: { col: 0, row: 0, width: 3, height: 2 }
                    },
                    {
                        id: 'w-sm-b',
                        type: 'toggle',
                        config: {
                            serverId: 'mock1', objectName: 'SM_B',
                            sensor: 'Temp', sensorId: 1,
                            valueOff: 0, valueOn: 1
                        },
                        position: { col: 3, row: 0, width: 3, height: 2 }
                    }
                ]
            };
            w.dashboardState.dashboards.set('TEST_TWO_OBJECTS', cfg);
            await w.dashboardManager.loadDashboard('TEST_TWO_OBJECTS');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        });

        // SSE с objectName=SM_A → только w-sm-a.
        await page.evaluate(() => {
            const w = window as any;
            w.updateDashboardWidgets(
                [{ name: 'Temp', value: 42 }],
                { serverId: 'mock1', objectName: 'SM_A', timestamp: Date.now() }
            );
        });
        let result = await page.evaluate(() => {
            const w = window as any;
            return {
                a: w.dashboardState.widgets.get('w-sm-a')?.feedbackValue ?? null,
                b: w.dashboardState.widgets.get('w-sm-b')?.feedbackValue ?? null
            };
        });
        expect(result.a).toBe(42);
        expect(result.b).toBeNull();

        // SSE с objectName=SM_B → только w-sm-b (a остаётся 42).
        await page.evaluate(() => {
            const w = window as any;
            w.updateDashboardWidgets(
                [{ name: 'Temp', value: 77 }],
                { serverId: 'mock1', objectName: 'SM_B', timestamp: Date.now() }
            );
        });
        result = await page.evaluate(() => {
            const w = window as any;
            return {
                a: w.dashboardState.widgets.get('w-sm-a')?.feedbackValue ?? null,
                b: w.dashboardState.widgets.get('w-sm-b')?.feedbackValue ?? null
            };
        });
        expect(result.a).toBe(42); // не изменился
        expect(result.b).toBe(77);
    });

    test('full matrix 2×2: 2 servers × 2 objects, same sensor name — independent routing', async ({ page }) => {
        // Полная матрица: каждый из 4 widget'ов получает SSE только для своего
        // (serverId, objectName, sensorName) триплета.
        await page.evaluate(async () => {
            const w = window as any;
            const mk = (id: string, srv: string, obj: string) => ({
                id, type: 'toggle',
                config: {
                    serverId: srv, objectName: obj,
                    sensor: 'Temp', sensorId: 1,
                    valueOff: 0, valueOn: 1
                },
                position: { col: 0, row: 0, width: 3, height: 2 }
            });
            const cfg = {
                meta: { name: 'TEST_MATRIX', description: '' },
                widgets: [
                    mk('w-1a', 'mock1', 'SM_A'),
                    mk('w-1b', 'mock1', 'SM_B'),
                    mk('w-2a', 'mock2', 'SM_A'),
                    mk('w-2b', 'mock2', 'SM_B'),
                ]
            };
            w.dashboardState.dashboards.set('TEST_MATRIX', cfg);
            await w.dashboardManager.loadDashboard('TEST_MATRIX');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        });

        // Серия 4 SSE events — каждый на свою точку матрицы. Уникальное value
        // на каждую, чтобы matched widget гарантированно отличался от unmatched.
        await page.evaluate(() => {
            const w = window as any;
            w.updateDashboardWidgets([{ name: 'Temp', value: 11 }],
                { serverId: 'mock1', objectName: 'SM_A', timestamp: Date.now() });
            w.updateDashboardWidgets([{ name: 'Temp', value: 22 }],
                { serverId: 'mock1', objectName: 'SM_B', timestamp: Date.now() });
            w.updateDashboardWidgets([{ name: 'Temp', value: 33 }],
                { serverId: 'mock2', objectName: 'SM_A', timestamp: Date.now() });
            w.updateDashboardWidgets([{ name: 'Temp', value: 44 }],
                { serverId: 'mock2', objectName: 'SM_B', timestamp: Date.now() });
        });

        const values = await page.evaluate(() => {
            const w = window as any;
            return {
                a1: w.dashboardState.widgets.get('w-1a')?.feedbackValue ?? null,
                b1: w.dashboardState.widgets.get('w-1b')?.feedbackValue ?? null,
                a2: w.dashboardState.widgets.get('w-2a')?.feedbackValue ?? null,
                b2: w.dashboardState.widgets.get('w-2b')?.feedbackValue ?? null,
            };
        });
        expect(values.a1).toBe(11);
        expect(values.b1).toBe(22);
        expect(values.a2).toBe(33);
        expect(values.b2).toBe(44);
    });

    test("initial fetch routing: 4 widget'а → 4 GET'а на правильные (server, object) пары", async ({ page }) => {
        // Перехватываем все GET /api/objects/*/ionc/sensors. После
        // loadDashboard fetchSensorValues должен сделать запрос для каждой
        // уникальной (serverId, objectName, sensorName) с правильным URL.
        const captured: Array<{ object: string; server: string; search: string }> = [];
        await page.route('**/api/objects/*/ionc/sensors**', async (route, req) => {
            if (req.method() !== 'GET') return route.continue();
            const url = new URL(req.url());
            // Path: /api/objects/{object}/ionc/sensors
            const m = url.pathname.match(/^\/api\/objects\/([^/]+)\/ionc\/sensors$/);
            captured.push({
                object: m ? decodeURIComponent(m[1]) : '',
                server: url.searchParams.get('server') || '',
                search: url.searchParams.get('search') || '',
            });
            await route.fulfill({
                status: 200, contentType: 'application/json',
                body: JSON.stringify({ sensors: [{ id: 1, name: 'Temp', value: 0 }] })
            });
        });

        await page.evaluate(async () => {
            const w = window as any;
            const mk = (id: string, srv: string, obj: string) => ({
                id, type: 'toggle',
                config: {
                    serverId: srv, objectName: obj,
                    sensor: 'Temp', sensorId: 1,
                    valueOff: 0, valueOn: 1
                },
                position: { col: 0, row: 0, width: 3, height: 2 }
            });
            const cfg = {
                meta: { name: 'TEST_FETCH_MATRIX' },
                widgets: [
                    mk('w-1a', 'mock1', 'SM_A'),
                    mk('w-1b', 'mock1', 'SM_B'),
                    mk('w-2a', 'mock2', 'SM_A'),
                    mk('w-2b', 'mock2', 'SM_B'),
                ]
            };
            w.dashboardState.dashboards.set('TEST_FETCH_MATRIX', cfg);
            await w.dashboardManager.loadDashboard('TEST_FETCH_MATRIX');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        });
        // Дать fetchSensorValues отработать (он async внутри loadDashboard).
        await page.waitForTimeout(800);

        // Ожидаем по одному запросу на каждую (server, object) пару — sensor
        // name везде 'Temp', search должен быть 'Temp'.
        const wanted = [
            { server: 'mock1', object: 'SM_A' },
            { server: 'mock1', object: 'SM_B' },
            { server: 'mock2', object: 'SM_A' },
            { server: 'mock2', object: 'SM_B' },
        ];
        for (const w of wanted) {
            const found = captured.find(c =>
                c.server === w.server && c.object === w.object && c.search === 'Temp'
            );
            expect(found, `fetch missing for server=${w.server} object=${w.object}`).toBeDefined();
        }
    });

    test("write routing matrix: каждый widget POST'ит на свой (server, object)", async ({ page }) => {
        // 4 widget'а, каждый при writeValue должен POST'ить на:
        //   /api/objects/{configured object}/ionc/set?server={configured server}
        await page.evaluate(async () => {
            const w = window as any;
            const mk = (id: string, srv: string, obj: string) => ({
                id, type: 'toggle',
                config: {
                    serverId: srv, objectName: obj,
                    sensor: 'Temp', sensorId: 1,
                    valueOff: 0, valueOn: 1
                },
                position: { col: 0, row: 0, width: 3, height: 2 }
            });
            const cfg = {
                meta: { name: 'TEST_WRITE_MATRIX' },
                widgets: [
                    mk('w-1a', 'mock1', 'SM_A'),
                    mk('w-1b', 'mock1', 'SM_B'),
                    mk('w-2a', 'mock2', 'SM_A'),
                    mk('w-2b', 'mock2', 'SM_B'),
                ]
            };
            w.dashboardState.dashboards.set('TEST_WRITE_MATRIX', cfg);
            await w.dashboardManager.loadDashboard('TEST_WRITE_MATRIX');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        });

        const checkWrite = async (wid: string, expectServer: string, expectObject: string) => {
            const postPromise = page.waitForRequest(req =>
                req.url().includes('/ionc/set') && req.method() === 'POST'
            );
            await page.evaluate((id) => {
                const w = window as any;
                w.dashboardState.widgets.get(id).writeValue(1);
            }, wid);
            const req = await postPromise;
            const url = new URL(req.url());
            expect(url.pathname).toBe(`/api/objects/${expectObject}/ionc/set`);
            expect(url.searchParams.get('server')).toBe(expectServer);
        };

        await checkWrite('w-1a', 'mock1', 'SM_A');
        await checkWrite('w-1b', 'mock1', 'SM_B');
        await checkWrite('w-2a', 'mock2', 'SM_A');
        await checkWrite('w-2b', 'mock2', 'SM_B');
    });

    test("backend subscribe: каждый active widget POST'ит /ionc/subscribe со своим sensorId", async ({ page }) => {
        // Без явного subscribe backend BasePoller.poll() не poll'ит объект
        // (subsSnapshot пустой) → SSE не приходит → widget вечно '--'.
        // Проверяем: после loadDashboard для каждой пары (serverId, objectName)
        // уходит POST /ionc/subscribe с правильным телом sensor_ids.
        const captured: Array<{ object: string; server: string; sensorIds: number[] }> = [];
        await page.route('**/api/objects/*/ionc/subscribe**', async (route, req) => {
            if (req.method() !== 'POST') return route.continue();
            const url = new URL(req.url());
            const m = url.pathname.match(/^\/api\/objects\/([^/]+)\/ionc\/subscribe$/);
            const body = JSON.parse(req.postData() || '{}');
            captured.push({
                object: m ? decodeURIComponent(m[1]) : '',
                server: url.searchParams.get('server') || '',
                sensorIds: Array.isArray(body.sensor_ids) ? body.sensor_ids : [],
            });
            await route.fulfill({
                status: 200, contentType: 'application/json',
                body: JSON.stringify({ status: 'subscribed' })
            });
        });

        await page.evaluate(async () => {
            const w = window as any;
            const mk = (id: string, srv: string, obj: string, sid: number) => ({
                id, type: 'toggle',
                config: {
                    serverId: srv, objectName: obj,
                    sensor: 'Temp', sensorId: sid,
                    valueOff: 0, valueOn: 1
                },
                position: { col: 0, row: 0, width: 3, height: 2 }
            });
            const cfg = {
                meta: { name: 'TEST_SUB_BACKEND' },
                widgets: [
                    mk('w-1a', 'mock1', 'SM_A', 101),
                    mk('w-1b', 'mock1', 'SM_B', 201),
                    mk('w-2a', 'mock2', 'SM_A', 301),
                ]
            };
            w.dashboardState.dashboards.set('TEST_SUB_BACKEND', cfg);
            await w.dashboardManager.loadDashboard('TEST_SUB_BACKEND');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        });
        await page.waitForTimeout(500);

        // Ждём subscribe POST для каждой уникальной (server, object) пары.
        const wanted = [
            { server: 'mock1', object: 'SM_A', sensorId: 101 },
            { server: 'mock1', object: 'SM_B', sensorId: 201 },
            { server: 'mock2', object: 'SM_A', sensorId: 301 },
        ];
        for (const w of wanted) {
            const found = captured.find(c =>
                c.server === w.server && c.object === w.object && c.sensorIds.includes(w.sensorId)
            );
            expect(found, `subscribe missing for server=${w.server} object=${w.object} sensorId=${w.sensorId}`).toBeDefined();
        }
    });

    test('backend subscribe: widget с одинаковыми (server, object) группируются в один POST', async ({ page }) => {
        // Два widget'а на одной (server, object) паре → один POST с обоими sensor_ids
        // (а не два отдельных). Проверяет batching по (serverId, objectName).
        const captured: Array<{ object: string; server: string; sensorIds: number[] }> = [];
        await page.route('**/api/objects/*/ionc/subscribe**', async (route, req) => {
            if (req.method() !== 'POST') return route.continue();
            const url = new URL(req.url());
            const m = url.pathname.match(/^\/api\/objects\/([^/]+)\/ionc\/subscribe$/);
            const body = JSON.parse(req.postData() || '{}');
            captured.push({
                object: m ? decodeURIComponent(m[1]) : '',
                server: url.searchParams.get('server') || '',
                sensorIds: Array.isArray(body.sensor_ids) ? body.sensor_ids : [],
            });
            await route.fulfill({
                status: 200, contentType: 'application/json',
                body: JSON.stringify({ status: 'subscribed' })
            });
        });

        await page.evaluate(async () => {
            const w = window as any;
            const cfg = {
                meta: { name: 'TEST_SUB_BATCH' },
                widgets: [
                    {
                        id: 'w-pump',
                        type: 'toggle',
                        config: {
                            serverId: 'mock1', objectName: 'SharedMemory',
                            sensor: 'PUMP', sensorId: 100,
                            valueOff: 0, valueOn: 1
                        },
                        position: { col: 0, row: 0, width: 3, height: 2 }
                    },
                    {
                        id: 'w-valve',
                        type: 'toggle',
                        config: {
                            serverId: 'mock1', objectName: 'SharedMemory',
                            sensor: 'VALVE', sensorId: 200,
                            valueOff: 0, valueOn: 1
                        },
                        position: { col: 3, row: 0, width: 3, height: 2 }
                    }
                ]
            };
            w.dashboardState.dashboards.set('TEST_SUB_BATCH', cfg);
            await w.dashboardManager.loadDashboard('TEST_SUB_BATCH');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        });
        await page.waitForTimeout(500);

        // Ровно один POST для (mock1, SharedMemory) с обоими sensorId внутри.
        const sm = captured.filter(c => c.server === 'mock1' && c.object === 'SharedMemory');
        expect(sm.length).toBe(1);
        expect(sm[0].sensorIds.sort()).toEqual([100, 200]);
    });

    test('auto-migration: legacy config без serverId → resolved через sensorsByKey', async ({ page }) => {
        await page.evaluate(async () => {
            const w = window as any;
            // Зарегистрируем 'Temp' в sensorsByKey на mock1 — _migrateLegacyBinding
            // должен подобрать serverId по lookup'у sensorName.
            if (!w.state.sensorsByKey) w.state.sensorsByKey = new Map();
            w.state.sensorsByKey.set('mock1|SharedMemory|Temp', { id: 1, name: 'Temp' });

            // Legacy config: widget без serverId — _migrateLegacyBinding должен
            // подставить mock1 через sensorsByKey lookup.
            w.dashboardState.dashboards.set('legacy-test', {
                meta: { name: 'legacy-test', description: '' },
                widgets: [{
                    id: 'legacy-w1',
                    type: 'toggle',
                    config: {
                        sensor: 'Temp', sensorId: 1, objectName: 'SharedMemory',
                        valueOff: 0, valueOn: 1
                    },
                    position: { col: 0, row: 0, width: 3, height: 2 }
                }]
            });
            await w.dashboardManager.loadDashboard('legacy-test');
        });
        const cfgServerId = await page.evaluate(() => {
            const w = window as any;
            return w.dashboardState.widgets.get('legacy-w1')?.config?.serverId ?? null;
        });
        expect(cfgServerId).toBe('mock1');
    });
});
