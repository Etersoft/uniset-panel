import { test, expect } from '@playwright/test';

// Smoke E2E для базового класса ActiveDashboardWidget.
// Использует test-only TestActiveWidget, регистрируемый через
// window.__DEBUG_REGISTER_TEST_WIDGET (см. 62-dashboard-manager.js).
//
// BASE_URL берётся из playwright.config.ts (use.baseURL).

test.describe('ActiveDashboardWidget — base class smoke', () => {
    test.beforeEach(async ({ page }) => {
        // Мокаем GET /api/control/status — viewer запущен с --control-token admin,
        // и без контроля canControl() === false → writeValue() пропускает POST.
        // Вынесено в beforeEach: SSE тоже спрашивает статус.
        await page.route('**/api/control/status', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    enabled: true, hasController: true, isController: true, timeoutSec: 60
                })
            });
        });

        await page.goto('/');

        // Дождаться, пока загрузится JS и появятся глобалы.
        await page.waitForFunction(() => {
            const w = window as any;
            return typeof w.dashboardState !== 'undefined'
                && typeof w.dashboardManager !== 'undefined'
                && typeof w.__DEBUG_REGISTER_TEST_WIDGET === 'function';
        });

        // Принудительно ставим состояние контроля в "isController:true" —
        // на случай если SSE-broadcast переключит обратно (см. control.spec.ts).
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

        // Регистрируем test-only widget.
        await page.evaluate(() => (window as any).__DEBUG_REGISTER_TEST_WIDGET());

        // Очищаем пользовательские дашборды для изоляции.
        await page.evaluate(() => {
            localStorage.removeItem('user-dashboards');
            localStorage.removeItem('last-dashboard');
            const keys = Object.keys(localStorage).filter(k => k.startsWith('dashboard:'));
            keys.forEach(k => localStorage.removeItem(k));
        });
    });

    async function loadTestDashboard(page, name: string) {
        await page.evaluate((dashboardName) => {
            const w = window as any;
            const cfg = {
                meta: { name: dashboardName, description: '' },
                widgets: [{
                    id: 'test-1',
                    type: 'test-active',
                    // backend /ionc/set десериализует sensor_id как int64 — кладём
                    // число (мокируем сам endpoint в тесте, реальный sensor не нужен).
                    config: { sensor: 1 },
                    position: { col: 0, row: 0, width: 4, height: 2 },
                }],
            };
            w.dashboardState.dashboards.set(dashboardName, cfg);
            w.dashboardManager.loadDashboard(dashboardName);
            if (typeof w.switchView === 'function') w.switchView('dashboard');
        }, name);
    }

    test('writeValue: POST → success → idle', async ({ page }) => {
        // Мокаем эндпоинт записи: backend → mock-uniset цепочка может
        // отвергать запрос (форматы sensor_id, валидация). Для smoke-теста
        // базового класса нам важна реакция виджета на 200 OK от сервера.
        await page.route('**/api/objects/SharedMemory/ionc/set**', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ status: 'ok', sensor_id: 1, value: 42 })
            });
        });

        await loadTestDashboard(page, 'TEST_BASE');

        const widgetBtn = page.locator('[data-test="write-btn"]').first();
        await expect(widgetBtn).toBeVisible({ timeout: 5000 });

        // Перехватываем POST до клика.
        const postPromise = page.waitForRequest(req =>
            req.url().includes('/ionc/set') && req.method() === 'POST'
        );

        // dispatchEvent вместо .click() — widget-header (position:absolute, z-index:10)
        // перекрывает верхнюю часть виджета и перехватывает pointer events даже
        // при force:true. Прямой dispatch на сам button обходит overlay-routing.
        await widgetBtn.dispatchEvent('click');

        const req = await postPromise;
        const body = JSON.parse(req.postData() || '{}');
        expect(body.sensor_id).toBe(1);
        expect(body.value).toBe(42);

        // State transitions: success eventually appears, затем idle (через WRITE_SUCCESS_DISPLAY_MS=1500).
        const stateEl = page.locator('[data-test="state"]').first();
        await expect(stateEl).toHaveText('success', { timeout: 5000 });
        await expect(stateEl).toHaveText('idle', { timeout: 5000 });

        // Command текст обновился.
        const commandEl = page.locator('[data-test="command"]').first();
        await expect(commandEl).toHaveText('42');
    });

    test('edit mode: клик не вызывает write', async ({ page }) => {
        await loadTestDashboard(page, 'TEST_EDIT');

        // Включаем edit mode после загрузки виджета.
        await page.evaluate(() => {
            (window as any).dashboardState.editMode = true;
        });

        let requestSent = false;
        page.on('request', req => {
            if (req.url().includes('/ionc/set')) requestSent = true;
        });

        const widgetBtn = page.locator('[data-test="write-btn"]').first();
        await expect(widgetBtn).toBeVisible({ timeout: 5000 });
        await widgetBtn.dispatchEvent('click');
        await page.waitForTimeout(800);

        expect(requestSent).toBe(false);

        // State не должен меняться — остаётся idle.
        const stateEl = page.locator('[data-test="state"]').first();
        await expect(stateEl).toHaveText('idle');
    });
});
