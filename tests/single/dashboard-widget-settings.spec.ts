import { test, expect, Page } from '@playwright/test';

// E2E для config-формы (settings dialog) активных widget'ов.
//
// Покрывает:
// - Открытие диалога через widget picker для каждого active типа.
// - Conditional поля (PushButton mode → pulseWidth/warning, Generator type → row'ы).
// - parseActiveConfigFields → правильно сохранённый persisted config.
// - Edit existing widget — форма pre-filled, save обновляет.
// - Regression #144: второй widget в той же сессии тоже имеет рабочий
//   autocomplete (раньше dataset.activeHandlersWired на персистентном
//   widget-config-content div'е блокировал второй initConfigHandlers).

async function setupDashboardEnv(page: Page) {
    // Базовые моки + state setup. Скопировано/упрощено из
    // dashboard-active-toggle.spec.ts beforeEach'а.
    await page.route('**/api/control/status', route => {
        route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ enabled: true, isController: true, hasController: true, timeoutSec: 60 })
        });
    });
    await page.route('**/api/objects?server=mock-srv&type=IONotifyController', route => {
        route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ objects: [{ name: 'SharedMemory' }] })
        });
    });
    await page.route('**/api/objects/SharedMemory/ionc/sensors**', route => {
        route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({
                sensors: [
                    { id: 100, name: 'PUMP', type: 'DO', value: 0 },
                    { id: 101, name: 'VALVE', type: 'AO', value: 0 },
                ]
            })
        });
    });

    await page.goto('/');
    await page.waitForFunction(() => {
        const w = window as any;
        return typeof w.dashboardState !== 'undefined'
            && typeof w.dashboardManager !== 'undefined'
            && typeof w.ToggleWidget !== 'undefined'
            && typeof w.PushButtonWidget !== 'undefined'
            && typeof w.SetpointWidget !== 'undefined'
            && typeof w.GeneratorWidget !== 'undefined';
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
        for (const [, srv] of (w.state?.servers || new Map())) {
            if (srv.connected) return true;
        }
        return false;
    }, { timeout: 15000 });
    await page.evaluate(() => {
        const w = window as any;
        w.state.servers.clear();
        w.state.servers.set('mock-srv', { id: 'mock-srv', name: 'Mock', url: 'http://mock', connected: true });
        // Чистим user-dashboards — каждый тест создаёт свой.
        localStorage.removeItem('user-dashboards');
        Object.keys(localStorage).filter(k => k.startsWith('dashboard:')).forEach(k => localStorage.removeItem(k));
    });
}

async function createEmptyDashboardAndEnterEditMode(page: Page, name: string) {
    await page.evaluate((n) => {
        const w = window as any;
        const dashCfg = { meta: { name: n }, widgets: [] };
        w.dashboardState.dashboards.set(n, dashCfg);
        w.dashboardManager.loadDashboard(n);
        if (typeof w.switchView === 'function') w.switchView('dashboard');
        w.dashboardState.editMode = true;
        document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', { detail: { editMode: true } }));
    }, name);
}

async function openWidgetConfigViaPicker(page: Page, widgetType: string) {
    await page.locator('#dashboard-add-widget-btn').click();
    await page.locator('#widget-picker-overlay').waitFor({ state: 'visible' });
    await page.locator(`.widget-picker-item[data-type="${widgetType}"]`).click();
    const cfg = page.locator('#widget-config-overlay');
    await cfg.waitFor({ state: 'visible' });
    return cfg;
}

async function applyConfig(page: Page) {
    await page.locator('#widget-config-apply').click();
    await page.locator('#widget-config-overlay').waitFor({ state: 'hidden' });
}

async function getSavedWidgetConfig(page: Page, dashName: string, widgetIndex = 0) {
    return page.evaluate(({ n, idx }) => {
        const w = window as any;
        const dash = w.dashboardState.dashboards.get(n);
        return dash?.widgets[idx]?.config;
    }, { n: dashName, idx: widgetIndex });
}

test.describe('Active widget settings — config dialog persistence', () => {
    test.beforeEach(async ({ page }) => {
        await setupDashboardEnv(page);
    });

    test('Toggle: open → change style + labels → save persists style/labelOn/labelOff', async ({ page }) => {
        await createEmptyDashboardAndEnterEditMode(page, 'TOG_CFG');
        const cfg = await openWidgetConfigViaPicker(page, 'toggle');

        // Default style — slider; меняем на checkbox.
        await cfg.locator('[data-test="cfg-style"]').selectOption('checkbox');
        // Меняем labelOff/On.
        await cfg.locator('[data-test="cfg-labelOff"]').fill('STOP');
        await cfg.locator('[data-test="cfg-labelOn"]').fill('GO');
        // valueOff/valueOn оставляем дефолты (0/1).

        await applyConfig(page);
        const saved = await getSavedWidgetConfig(page, 'TOG_CFG');
        expect(saved.style).toBe('checkbox');
        expect(saved.labelOff).toBe('STOP');
        expect(saved.labelOn).toBe('GO');
        expect(saved.serverId).toBe('mock-srv');
    });

    test('PushButton: mode=momentary hides pulseWidth + shows warning, save persists mode', async ({ page }) => {
        await createEmptyDashboardAndEnterEditMode(page, 'PB_CFG');
        const cfg = await openWidgetConfigViaPicker(page, 'pushbutton');

        // Default mode — pulse; pulseWidth field видим, warning скрыт.
        await expect(cfg.locator('[data-pulse-only]')).toBeVisible();
        await expect(cfg.locator('[data-momentary-warning]')).toBeHidden();

        // Меняем mode → momentary: warning visible, pulseWidth hidden.
        await cfg.locator('[data-test="cfg-mode"]').selectOption('momentary');
        await expect(cfg.locator('[data-pulse-only]')).toBeHidden();
        await expect(cfg.locator('[data-momentary-warning]')).toBeVisible();

        await cfg.locator('[data-test="cfg-valueOn"]').fill('255');

        await applyConfig(page);
        const saved = await getSavedWidgetConfig(page, 'PB_CFG');
        expect(saved.mode).toBe('momentary');
        expect(saved.valueOn).toBe(255);
    });

    test('Setpoint: min/max/step/unit/applyMode persist', async ({ page }) => {
        await createEmptyDashboardAndEnterEditMode(page, 'SP_CFG');
        const cfg = await openWidgetConfigViaPicker(page, 'setpoint');

        await cfg.locator('[data-test="cfg-style"]').selectOption('stepper');
        await cfg.locator('[data-test="cfg-min"]').fill('-50');
        await cfg.locator('[data-test="cfg-max"]').fill('200');
        await cfg.locator('[data-test="cfg-step"]').fill('5');
        await cfg.locator('[data-test="cfg-unit"]').fill('°C');
        await cfg.locator('[data-test="cfg-applyMode"]').selectOption('auto');

        await applyConfig(page);
        const saved = await getSavedWidgetConfig(page, 'SP_CFG');
        expect(saved.style).toBe('stepper');
        expect(saved.min).toBe(-50);
        expect(saved.max).toBe(200);
        expect(saved.step).toBe(5);
        expect(saved.unit).toBe('°C');
        expect(saved.applyMode).toBe('auto');
    });

    test('Setpoint: min>max swap (validation в parseActiveConfigFields)', async ({ page }) => {
        await createEmptyDashboardAndEnterEditMode(page, 'SP_VAL');
        const cfg = await openWidgetConfigViaPicker(page, 'setpoint');
        // Намеренно min>max — parser должен свапнуть.
        await cfg.locator('[data-test="cfg-min"]').fill('300');
        await cfg.locator('[data-test="cfg-max"]').fill('100');
        await applyConfig(page);

        const saved = await getSavedWidgetConfig(page, 'SP_VAL');
        expect(saved.min).toBe(100);
        expect(saved.max).toBe(300);
    });

    test('Generator: type change shows correct conditional rows', async ({ page }) => {
        await createEmptyDashboardAndEnterEditMode(page, 'GEN_CFG');
        const cfg = await openWidgetConfigViaPicker(page, 'generator');

        // Default type=square → cfg-row-square visible, lin/random hidden.
        await expect(cfg.locator('[data-test="cfg-row-square"]')).toBeVisible();
        await expect(cfg.locator('[data-test="cfg-row-step-pause"]')).toBeHidden();
        await expect(cfg.locator('[data-test="cfg-row-random"]')).toBeHidden();

        // Switch to linear → cfg-row-step-pause visible.
        await cfg.locator('[data-test="cfg-type"]').selectOption('linear');
        await expect(cfg.locator('[data-test="cfg-row-step-pause"]')).toBeVisible();
        await expect(cfg.locator('[data-test="cfg-row-square"]')).toBeHidden();
        await expect(cfg.locator('[data-test="cfg-row-random"]')).toBeHidden();

        // Switch to random → cfg-row-random visible.
        await cfg.locator('[data-test="cfg-type"]').selectOption('random');
        await expect(cfg.locator('[data-test="cfg-row-random"]')).toBeVisible();
        await expect(cfg.locator('[data-test="cfg-row-step-pause"]')).toBeHidden();
        await expect(cfg.locator('[data-test="cfg-row-square"]')).toBeHidden();

        // Save с random + period.
        await cfg.locator('[data-test="cfg-period"]').fill('2500');
        await applyConfig(page);

        const saved = await getSavedWidgetConfig(page, 'GEN_CFG');
        expect(saved.type).toBe('random');
        expect(saved.period).toBe(2500);
    });

    test('Edit existing widget: form pre-filled with current config', async ({ page }) => {
        // Создаём widget программно с нестандартным config, потом открываем
        // config через .config action button — поля должны быть pre-filled.
        await page.evaluate(() => {
            const w = window as any;
            const dashCfg = {
                meta: { name: 'EDIT_TEST' },
                widgets: [{
                    id: 'edit-w1',
                    type: 'toggle',
                    config: {
                        serverId: 'mock-srv',
                        sensor: 'PUMP', sensorId: 100,
                        objectName: 'SharedMemory',
                        valueOff: 0, valueOn: 1,
                        labelOff: 'OFF_X', labelOn: 'ON_X',
                        style: 'checkbox',
                        label: 'PRE_FILLED',
                    },
                    position: { col: 0, row: 0, width: 2, height: 1 },
                }]
            };
            w.dashboardState.dashboards.set('EDIT_TEST', dashCfg);
            w.dashboardManager.loadDashboard('EDIT_TEST');
            if (typeof w.switchView === 'function') w.switchView('dashboard');
            w.dashboardState.editMode = true;
            document.dispatchEvent(new CustomEvent('dashboardEditModeChanged', { detail: { editMode: true } }));
        });

        // showWidgetConfig программно (action btn зависит от точной разметки;
        // тестируем именно behavior pre-fill, не клик-flow).
        await page.evaluate(() => {
            const w = window as any;
            w.dashboardManager.showWidgetConfig('edit-w1');
        });
        const cfg = page.locator('#widget-config-overlay');
        await cfg.waitFor({ state: 'visible' });

        await expect(cfg.locator('[data-test="cfg-serverId"]')).toHaveValue('mock-srv');
        await expect(cfg.locator('[data-test="cfg-sensor"]')).toHaveValue('PUMP');
        await expect(cfg.locator('[data-test="cfg-sensorId"]')).toHaveValue('100');
        await expect(cfg.locator('[data-test="cfg-style"]')).toHaveValue('checkbox');
        await expect(cfg.locator('[data-test="cfg-labelOff"]')).toHaveValue('OFF_X');
        await expect(cfg.locator('[data-test="cfg-labelOn"]')).toHaveValue('ON_X');

        // Меняем labelOn и сохраняем — config должен обновиться (не создаём
        // новый widget, edit идёт по тому же id).
        await cfg.locator('[data-test="cfg-labelOn"]').fill('ON_Y');
        await applyConfig(page);
        const saved = await getSavedWidgetConfig(page, 'EDIT_TEST');
        expect(saved.labelOn).toBe('ON_Y');
        expect(saved.label).toBe('PRE_FILLED'); // не сброшен
    });

    test('Regression #144: второй active widget — autocomplete тоже работает', async ({ page }) => {
        // widget-config-content — персистентный <div>, dataset.activeHandlersWired
        // оставался true после первого open и блокировал initConfigHandlers
        // на втором widget'е → cfg-sensor focus не показывал dropdown.
        await createEmptyDashboardAndEnterEditMode(page, 'TWO_W');

        // Widget #1 — Toggle, добавляем через picker и сразу сохраняем.
        let cfg = await openWidgetConfigViaPicker(page, 'toggle');
        await cfg.locator('[data-test="cfg-sensor"]').click();
        await page.locator('.sensor-autocomplete-item').first()
            .waitFor({ state: 'visible', timeout: 3000 });
        await page.locator('.sensor-autocomplete-item').first().dispatchEvent('mousedown');
        await applyConfig(page);

        // Widget #2 — снова Toggle.
        cfg = await openWidgetConfigViaPicker(page, 'toggle');
        // Server dropdown должен иметь mock-srv (initConfigHandlers вызвался
        // повторно для свежей формы).
        await expect(cfg.locator('[data-test="cfg-serverId"]')).toHaveValue('mock-srv');

        // Focus → autocomplete dropdown должен появиться.
        await cfg.locator('[data-test="cfg-sensor"]').click();
        await expect(page.locator('.sensor-autocomplete-item').first())
            .toBeVisible({ timeout: 3000 });

        // Bonus: select sensor + sensorId заполняется.
        await page.locator('.sensor-autocomplete-item').first().dispatchEvent('mousedown');
        await expect(cfg.locator('[data-test="cfg-sensor"]')).toHaveValue('PUMP');
        await expect(cfg.locator('[data-test="cfg-sensorId"]')).toHaveValue('100');
    });
});
