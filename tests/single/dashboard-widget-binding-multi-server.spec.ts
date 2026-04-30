import { test, expect, Page } from '@playwright/test';

// 5 сценариев multi-IONC binding для всех dashboard widget'ов:
//   1. Gauge config dialog: server/object/sensor selectors + autocomplete + Apply
//      персистит полный triplet (serverId/objectName/sensor/sensorId).
//   2. StatusBar multi-item: два item на разных IONC объектах рендерятся независимо.
//   3. Backend subscribe: per-(serverId, objectName) группа → один POST с
//      sensor_ids массивом.
//   4. Add item: pre-fill server+object из last item (sensor пустой).
//   5. Legacy migration: legacy config (только sensor name) после warmup
//      sensorsByKey → автоматически получает полный triplet.

const setupCommon = async (page: Page) => {
    // Mock /api/control/status (для writeValue / контроля).
    await page.route('**/api/control/status', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                enabled: true, isController: true, hasController: true, timeoutSec: 60
            })
        });
    });

    // Mock /api/servers — 2 mocked серверов.
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

    // Mock /ionc/set — accept all writes.
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

    // Принудительно ставим control state и mock servers (override env / SSE).
    await page.evaluate(() => {
        const w = window as any;
        w.state.control.token = 'admin';
        w.state.control.isController = true;
        w.state.control.hasController = true;
        w.state.control.enabled = true;
        w.state.servers.clear();
        w.state.servers.set('mock1', { id: 'mock1', name: 'Mock-1', url: 'http://mock1', connected: true });
        w.state.servers.set('mock2', { id: 'mock2', name: 'Mock-2', url: 'http://mock2', connected: true });
    });

    // Очищаем localStorage от пользовательских dashboards.
    await page.evaluate(() => {
        localStorage.removeItem('user-dashboards');
        localStorage.removeItem('last-dashboard');
        const keys = Object.keys(localStorage).filter(k => k.startsWith('dashboard:'));
        keys.forEach(k => localStorage.removeItem(k));
    });
};

test.describe('Dashboard widget binding — multi-IONC server', () => {
    test.beforeEach(async ({ page }) => {
        await setupCommon(page);
    });

    test('Gauge UI-flow: server/object/sensor selectors render → autocomplete pick → Apply persists triplet', async ({ page }) => {
        // Mock IONC objects list для cfg-objectName dropdown'а.
        await page.route('**/api/objects?server=mock1&type=IONotifyController', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ objects: [{ name: 'SharedMemory' }, { name: 'SharedMemory2' }] })
            });
        });
        // Mock sensor autocomplete API.
        await page.route('**/api/objects/SharedMemory/ionc/sensors**', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    sensors: [
                        { id: 100, name: 'AI70_S', type: 'AI', value: 25.5 },
                        { id: 101, name: 'AI71_S', type: 'AI', value: 1013 },
                    ]
                })
            });
        });

        // Создаём пустой dashboard и переключаемся в edit-mode.
        await page.evaluate(async () => {
            const w = window as any;
            const cfg = { meta: { name: 'GAUGE_UI_TEST' }, widgets: [] };
            w.dashboardState.dashboards.set('GAUGE_UI_TEST', cfg);
            await w.dashboardManager.loadDashboard('GAUGE_UI_TEST');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
            w.dashboardState.editMode = true;
            document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', { detail: { editMode: true } }));
        });

        // Открыть widget picker → выбрать gauge.
        await page.locator('#dashboard-add-widget-btn').click();
        await page.locator('#widget-picker-overlay').waitFor({ state: 'visible' });
        await page.locator('.widget-picker-item[data-type="gauge"]').click();

        const cfgDialog = page.locator('#widget-config-overlay');
        await cfgDialog.waitFor({ state: 'visible' });

        // Triplet selectors должны присутствовать.
        await expect(cfgDialog.locator('[data-test="cfg-serverId"]')).toBeVisible();
        await expect(cfgDialog.locator('[data-test="cfg-objectName"]')).toBeVisible();
        await expect(cfgDialog.locator('[data-test="cfg-sensor"]')).toBeVisible();

        // Server selector — выбираем mock1 (если ещё не выбран).
        await cfgDialog.locator('[data-test="cfg-serverId"]').selectOption('mock1');

        // Дождаться загрузки IONC objects dropdown'а (mock возвращает 2 шт).
        await page.waitForFunction(() => {
            const sel = document.querySelector('[data-test="cfg-objectName"]') as HTMLSelectElement;
            return sel && sel.options.length >= 2;
        }, { timeout: 3000 });
        await cfgDialog.locator('[data-test="cfg-objectName"]').selectOption('SharedMemory');

        // Сфокусировать sensor input → autocomplete dropdown появится (focus
        // дёргает fetchAndShow без search).
        await cfgDialog.locator('[data-test="cfg-sensor"]').click();
        const dropdownItem = page.locator('.sensor-autocomplete-item').first();
        await dropdownItem.waitFor({ state: 'visible', timeout: 3000 });

        // mousedown — иначе input blur'ится до клика и dropdown исчезает.
        await dropdownItem.dispatchEvent('mousedown');

        await expect(cfgDialog.locator('[data-test="cfg-sensor"]')).toHaveValue('AI70_S');
        await expect(cfgDialog.locator('[data-test="cfg-sensorId"]')).toHaveValue('100');

        // Apply → dialog закроется + конфиг персистится.
        await page.locator('#widget-config-apply').click();
        await cfgDialog.waitFor({ state: 'hidden', timeout: 3000 });

        const saved = await page.evaluate(() => {
            const w = window as any;
            const dash = w.dashboardState.dashboards.get('GAUGE_UI_TEST');
            return dash.widgets[0]?.config;
        });
        expect(saved).toMatchObject({
            serverId: 'mock1',
            objectName: 'SharedMemory',
            sensor: 'AI70_S',
            sensorId: 100,
        });
    });

    test('StatusBar: два item на разных IONC объектах рендерятся как два индикатора', async ({ page }) => {
        // Программно загружаем dashboard с StatusBar widget'ом, где items[]
        // ссылаются на разные IONC объекты на одном сервере.
        await page.evaluate(async () => {
            const w = window as any;
            const cfg = {
                meta: { name: 'SB_TWO_OBJECTS' },
                widgets: [{
                    id: 'sb-1',
                    type: 'statusbar',
                    config: {
                        layout: 'horizontal',
                        items: [
                            { serverId: 'mock1', objectName: 'SM_A', sensor: 'AI70_S', sensorId: 100, label: 'Temp', threshold: 0.5 },
                            { serverId: 'mock1', objectName: 'SM_B', sensor: 'AI71_S', sensorId: 101, label: 'Press', threshold: 0.5 },
                        ]
                    },
                    position: { col: 0, row: 0, width: 8, height: 4 }
                }]
            };
            w.dashboardState.dashboards.set('SB_TWO_OBJECTS', cfg);
            await w.dashboardManager.loadDashboard('SB_TWO_OBJECTS');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        });

        // StatusBar render() создаёт по одному .statusbar-indicator на item.
        const indicators = page.locator('.statusbar-indicator');
        await expect(indicators).toHaveCount(2);

        // Метки должны соответствовать тем, что задали в конфиге.
        const labels = await page.locator('.statusbar-label').allTextContents();
        expect(labels).toEqual(['Temp', 'Press']);

        // Конфиг widget'а в state.dashboards сохраняет items[].objectName.
        const items = await page.evaluate(() => {
            const w = window as any;
            return w.dashboardState.dashboards.get('SB_TWO_OBJECTS')?.widgets[0]?.config?.items;
        });
        expect(items).toHaveLength(2);
        expect(items[0].objectName).toBe('SM_A');
        expect(items[1].objectName).toBe('SM_B');
    });

    test('Backend subscribe: каждая (serverId, objectName) пара получает свой POST с sensor_ids массивом', async ({ page }) => {
        // Перехватываем POST /api/objects/{name}/ionc/subscribe
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

        // 3 виджета: 2 шарят (mock1, SharedMemory) → должны попасть в один
        // POST с обоими sensorId; 1 на (mock2, OtherIONC) → отдельный POST.
        await page.evaluate(async () => {
            const w = window as any;
            const cfg = {
                meta: { name: 'SUBS_TEST' },
                widgets: [
                    {
                        id: 'g-x', type: 'gauge',
                        config: { serverId: 'mock1', objectName: 'SharedMemory', sensor: 'X', sensorId: 100 },
                        position: { col: 0, row: 0, width: 4, height: 4 }
                    },
                    {
                        id: 'g-y', type: 'gauge',
                        config: { serverId: 'mock1', objectName: 'SharedMemory', sensor: 'Y', sensorId: 101 },
                        position: { col: 4, row: 0, width: 4, height: 4 }
                    },
                    {
                        id: 'g-z', type: 'gauge',
                        config: { serverId: 'mock2', objectName: 'OtherIONC', sensor: 'Z', sensorId: 999 },
                        position: { col: 0, row: 5, width: 4, height: 4 }
                    },
                ]
            };
            w.dashboardState.dashboards.set('SUBS_TEST', cfg);
            await w.dashboardManager.loadDashboard('SUBS_TEST');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        });
        await page.waitForTimeout(800);

        // Группа 1: (mock1, SharedMemory) с [100, 101] — один POST.
        const grp1 = captured.find(c => c.server === 'mock1' && c.object === 'SharedMemory');
        expect(grp1, 'subscribe POST for (mock1, SharedMemory)').toBeDefined();
        expect(grp1!.sensorIds.sort()).toEqual([100, 101]);

        // Группа 2: (mock2, OtherIONC) с [999] — отдельный POST.
        const grp2 = captured.find(c => c.server === 'mock2' && c.object === 'OtherIONC');
        expect(grp2, 'subscribe POST for (mock2, OtherIONC)').toBeDefined();
        expect(grp2!.sensorIds).toEqual([999]);

        // Ровно 2 группы (никаких лишних POST'ов на не-existent server/object).
        const uniqueGroups = new Set(captured.map(c => `${c.server}|${c.object}`));
        expect(uniqueGroups.size).toBe(2);
    });

    test('StatusBar Add Indicator: pre-fill serverId+objectName из последнего item, sensor пустой', async ({ page }) => {
        // Mock IONC objects list для cfg-objectName dropdown'ов rows.
        await page.route('**/api/objects?server=mock1&type=IONotifyController', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ objects: [{ name: 'SharedMemory' }, { name: 'CustomObj' }] })
            });
        });

        // Создаём пустой dashboard и переключаемся в edit-mode.
        await page.evaluate(async () => {
            const w = window as any;
            const cfg = { meta: { name: 'SB_ADD_TEST' }, widgets: [] };
            w.dashboardState.dashboards.set('SB_ADD_TEST', cfg);
            await w.dashboardManager.loadDashboard('SB_ADD_TEST');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
            w.dashboardState.editMode = true;
            document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', { detail: { editMode: true } }));
        });

        // Open widget picker → выбрать statusbar.
        await page.locator('#dashboard-add-widget-btn').click();
        await page.locator('#widget-picker-overlay').waitFor({ state: 'visible' });
        await page.locator('.widget-picker-item[data-type="statusbar"]').click();

        const cfgDialog = page.locator('#widget-config-overlay');
        await cfgDialog.waitFor({ state: 'visible' });

        // Дождаться рендера хотя бы одной item-row (default — 1 item).
        await cfgDialog.locator('.statusbar-item').first().waitFor({ state: 'visible' });

        // Установить server в первой row + дождаться появления опции CustomObj
        // в objectName dropdown (loadIONCObjects async).
        await cfgDialog.locator('[name="item-0-serverId"]').selectOption('mock1');
        await page.waitForFunction(() => {
            const sel = document.querySelector('[name="item-0-objectName"]') as HTMLSelectElement;
            return sel && Array.from(sel.options).some(o => o.value === 'CustomObj');
        }, { timeout: 3000 });
        await cfgDialog.locator('[name="item-0-objectName"]').selectOption('CustomObj');

        // Click + Add Indicator.
        await page.locator('#add-statusbar-item').click();

        // Должна появиться вторая row.
        await cfgDialog.locator('.statusbar-item[data-idx="1"]').waitFor({ state: 'visible' });

        // Pre-filled serverId + objectName из item-0.
        const srvVal = await cfgDialog.locator('[name="item-1-serverId"]').inputValue();
        const objVal = await cfgDialog.locator('[name="item-1-objectName"]').inputValue();
        expect(srvVal).toBe('mock1');
        expect(objVal).toBe('CustomObj');

        // Sensor должен быть пустым в новой row.
        const sensorVal = await cfgDialog.locator('[name="item-1-sensor"]').inputValue();
        expect(sensorVal).toBe('');
    });

    test('Legacy widget config: bare sensor name → migration via state.sensorsByKey заполняет triplet', async ({ page }) => {
        // Прогреваем sensorsByKey ДО loadDashboard — _migrateLegacyBinding
        // в renderDashboard сразу подберёт serverId/objectName/sensorId по имени.
        await page.evaluate(async () => {
            const w = window as any;
            if (!w.state.sensorsByKey) w.state.sensorsByKey = new Map();
            w.state.sensorsByKey.set('mock1|SharedMemory|AI70_S', { id: 1, name: 'AI70_S' });

            // Legacy widget config: только sensor name, без triplet.
            const cfg = {
                meta: { name: 'LEGACY_TEST' },
                widgets: [{
                    id: 'legacy-w1',
                    type: 'gauge',
                    config: { sensor: 'AI70_S' },
                    position: { col: 0, row: 0, width: 4, height: 4 }
                }]
            };
            w.dashboardState.dashboards.set('LEGACY_TEST', cfg);
            await w.dashboardManager.loadDashboard('LEGACY_TEST');
        });

        // Проверяем, что миграция дополнила config.
        const migrated = await page.evaluate(() => {
            const w = window as any;
            const widget = w.dashboardState.widgets.get('legacy-w1');
            return widget?.config;
        });
        expect(migrated.serverId).toBe('mock1');
        expect(migrated.objectName).toBe('SharedMemory');
        expect(migrated.sensorId).toBe(1);
        expect(migrated.sensor).toBe('AI70_S');
    });
});
