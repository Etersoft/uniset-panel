import { test, expect, Page } from '@playwright/test';

// E2E smoke spec для IONC@server combobox в config-форме активных widget'ов.
//
// 3 сценария:
// 1. combo input рендерится, при фокусе показывает dropdown с IONC@server записями
// 2. кнопка ↻ (refresh) триггерит fetch /api/objects-by-type
// 3. orphan widget (serverId неизвестен) показывает "(offline)" в combo и data-orphan="true"

// ============================================================
// Shared helpers
// ============================================================

async function setupBaseEnv(page: Page) {
    // Мокаем control/status — нужен для ActiveDashboardWidget.isInteractive()
    await page.route('**/api/control/status', route => {
        route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ enabled: true, isController: true, hasController: true, timeoutSec: 60 }),
        });
    });

    // Мокаем /api/objects-by-type — 2 сервера с IONC-объектами.
    // Важно: 2+ entries чтобы combo input НЕ авто-выбрал single-match (не disabled),
    // и чтобы applySingleMatchOrPreselect() вызвала preselectFromConfig() для
    // orphan-сценария (проверка "(offline)" для неизвестного serverId).
    await page.route('**/api/objects-by-type**', route => {
        route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({
                type: 'IONotifyController',
                servers: [
                    {
                        serverId:    'mock-srv',
                        serverName:  'Mock Server',
                        connected:   true,
                        objects:     ['SharedMemory'],
                    },
                    {
                        serverId:    'mock-srv-2',
                        serverName:  'Mock Server 2',
                        connected:   true,
                        objects:     ['SharedMemory'],
                    },
                ],
            }),
        });
    });

    // IONC sensors — для sensor autocomplete
    await page.route('**/api/objects/SharedMemory/ionc/sensors**', route => {
        route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({
                sensors: [
                    { id: 100, name: 'PUMP', type: 'DO', value: 0 },
                    { id: 101, name: 'VALVE', type: 'AO', value: 0 },
                ],
            }),
        });
    });
}

async function waitForAppReady(page: Page) {
    await page.waitForFunction(() => {
        const w = window as any;
        return typeof w.dashboardState !== 'undefined'
            && typeof w.dashboardManager !== 'undefined'
            && typeof w.ToggleWidget !== 'undefined'
            && typeof w.PushButtonWidget !== 'undefined';
    });

    // Ждём подключения хотя бы одного сервера
    await page.waitForFunction(() => {
        const w = window as any;
        for (const [, srv] of (w.state?.servers || new Map())) {
            if (srv.connected) return true;
        }
        return false;
    }, { timeout: 15000 });

    // Форсируем control state
    await page.evaluate(() => {
        const w = window as any;
        w.state.control.token = 'admin';
        w.state.control.isController = true;
        w.state.control.hasController = true;
        w.state.control.enabled = true;
    });

    // Замещаем servers на известный mock-srv
    await page.evaluate(() => {
        const w = window as any;
        w.state.servers.clear();
        w.state.servers.set('mock-srv', { id: 'mock-srv', name: 'Mock Server', url: 'http://mock', connected: true });
    });

    // Чистим localStorage от предыдущих тестов
    await page.evaluate(() => {
        localStorage.removeItem('user-dashboards');
        localStorage.removeItem('last-dashboard');
        Object.keys(localStorage).filter(k => k.startsWith('dashboard:')).forEach(k => localStorage.removeItem(k));
    });
}

async function resetIONCRegistry(page: Page) {
    // Сбрасываем session-cache registry чтобы каждый тест начинал с чистого slate.
    // Нужно после page.goto, так как state инициализируется при загрузке страницы.
    await page.evaluate(() => {
        const reg = (window as any).state.ioncRegistry;
        reg.fetchedAt = 0;
        reg.isFetching = false;
        reg.fetchPromise = null;
        reg.servers.clear();
    });
}

async function createEmptyDashboardInEditMode(page: Page, dashName: string) {
    await page.evaluate((n) => {
        const w = window as any;
        const dashCfg = { meta: { name: n }, widgets: [] };
        w.dashboardState.dashboards.set(n, dashCfg);
        w.dashboardManager.loadDashboard(n);
        if (typeof w.switchView === 'function') w.switchView('dashboard');
        w.dashboardState.editMode = true;
        document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', { detail: { editMode: true } }));
    }, dashName);
}

async function openWidgetConfigViaPicker(page: Page, widgetType: string) {
    await page.locator('#dashboard-add-widget-btn').click();
    await page.locator('#widget-picker-overlay').waitFor({ state: 'visible' });
    await page.locator(`.widget-picker-item[data-type="${widgetType}"]`).click();
    const cfg = page.locator('#widget-config-overlay');
    await cfg.waitFor({ state: 'visible' });
    return cfg;
}

// ============================================================
// Tests
// ============================================================

test.describe('Dashboard widget IONC@server combobox', () => {
    test.beforeEach(async ({ page }) => {
        await setupBaseEnv(page);
        await page.goto('/');
        await waitForAppReady(page);
        await resetIONCRegistry(page);
    });

    // Scenario 1: combo input рендерится, при фокусе показывает dropdown
    test('combo input renders and dropdown shows IONC@server entries', async ({ page }) => {
        await createEmptyDashboardInEditMode(page, 'COMBO_RENDER_TEST');

        const cfg = await openWidgetConfigViaPicker(page, 'toggle');

        // combo input должен быть виден
        const combo = cfg.locator('.ionc-combo-input');
        await expect(combo).toBeVisible();

        // refresh button тоже
        await expect(cfg.locator('.ionc-combo-refresh')).toBeVisible();

        // Ждём окончания async ensureIONCRegistry — registry должна иметь данные.
        // (focus до загрузки может попасть в empty-state, если fetch ещё in-flight)
        await page.waitForFunction(
            () => (window as any).state.ioncRegistry.servers.size > 0,
            { timeout: 8000 }
        );

        // При клике — dropdown появляется
        await combo.click();

        // Ждём dropdown с items (не empty-state)
        await page.waitForSelector('.ionc-combo-item', { timeout: 5000 });

        // В dropdown должны быть items — хотя бы один (SharedMemory @ Mock Server / Mock Server 2)
        const itemCount = await page.locator('.ionc-combo-item').count();
        expect(itemCount).toBeGreaterThan(0);

        // Проверяем текст одного из items — должен содержать objectName
        await expect(page.locator('.ionc-combo-item').first()).toContainText('SharedMemory');
    });

    // Scenario 2: refresh button триггерит fetch /api/objects-by-type
    test('refresh button triggers fetch /api/objects-by-type', async ({ page }) => {
        await createEmptyDashboardInEditMode(page, 'COMBO_REFRESH_TEST');

        const cfg = await openWidgetConfigViaPicker(page, 'toggle');

        // Дожидаемся начальной загрузки (initSensorBindingHandlers → ensureIONCRegistry)
        await page.waitForFunction(() => {
            const reg = (window as any).state.ioncRegistry;
            return reg.fetchedAt > 0 || reg.servers.size > 0;
        }, { timeout: 5000 }).catch(() => {
            // tolerate if registry populated already
        });

        // Перехватываем запросы к /api/objects-by-type после refresh
        const fetchedUrls: string[] = [];
        page.on('response', r => {
            if (r.url().includes('/api/objects-by-type')) {
                fetchedUrls.push(r.url());
            }
        });

        // Кликаем refresh — форсирует fetch даже если cache свежий
        await cfg.locator('.ionc-combo-refresh').click();

        // Ждём окончания spinning — spin удаляется когда fetch завершён
        await page.waitForFunction(
            () => !document.querySelector('.ionc-combo-refresh.spinning'),
            { timeout: 10000 }
        );

        // Должен был прилететь хотя бы один запрос
        expect(fetchedUrls.length).toBeGreaterThan(0);
        expect(fetchedUrls[0]).toContain('/api/objects-by-type');
    });

    // Scenario 3: orphan widget (serverId неизвестен) показывает "(offline)" + data-orphan
    test('orphan widget (unknown server) shows (offline) suffix and data-orphan', async ({ page }) => {
        // Создаём dashboard с orphan-widget (serverId = 'ghost-server-id' которого нет в registry)
        await page.evaluate(async () => {
            const w = window as any;
            const dashCfg = {
                meta: { name: 'ORPHAN_TEST' },
                widgets: [{
                    id: 'w-orphan',
                    type: 'toggle',
                    position: { col: 1, row: 1, width: 4, height: 3 },
                    config: {
                        serverId:   'ghost-server-id',
                        objectName: 'GhostObj',
                        sensor:     'X',
                        sensorId:   999,
                        valueOff:   0,
                        valueOn:    1,
                    },
                }],
            };
            w.dashboardState.dashboards.set('ORPHAN_TEST', dashCfg);
            w.dashboardManager.loadDashboard('ORPHAN_TEST');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
            w.dashboardState.editMode = true;
            document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', { detail: { editMode: true } }));
        });

        // Открываем config dialog для orphan-widget напрямую
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardManager.showWidgetConfig('w-orphan');
        });

        const cfg = page.locator('#widget-config-overlay');
        await cfg.waitFor({ state: 'visible' });

        // Ждём когда async ensureIONCRegistry завершится и preselectFromConfig отработает.
        // После fetch: ghost-server-id не в registry → preselectFromConfig выставляет
        // `${objectName} @ ${serverId} (offline)` и data-orphan='true'.
        const comboInput = cfg.locator('.ionc-combo-input');
        await expect(comboInput).toBeVisible();

        // Ждём появления "(offline)" в value (async preselectFromConfig после fetch)
        await page.waitForFunction(
            () => {
                const el = document.querySelector('#widget-config-overlay .ionc-combo-input') as HTMLInputElement;
                return el && (el.value.includes('(offline)') || el.dataset.orphan === 'true');
            },
            { timeout: 8000 }
        );

        const value = await comboInput.inputValue();
        expect(value).toContain('GhostObj');
        expect(value).toContain('(offline)');

        const orphanAttr = await comboInput.getAttribute('data-orphan');
        expect(orphanAttr).toBe('true');
    });
});
