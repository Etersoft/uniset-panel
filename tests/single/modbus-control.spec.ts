import { test, expect } from '@playwright/test';

const MB_OBJECT = 'MBTCPMaster1';

// Перехватываем GET /api/control/status для защиты от race condition
// при параллельном выполнении тестов (broadcastStatus шлёт isController: false всем)
async function mockControlStatusAsController(page) {
    await page.route('**/api/control/status', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ enabled: true, hasController: true, isController: true, timeoutSec: 60 })
        });
    });
}

// Установка контроля через evaluate
async function setControlState(page) {
    await page.evaluate(() => {
        const w = window as any;
        w.state.control.token = 'admin';
        w.state.control.isController = true;
        w.state.control.hasController = true;
        w.state.control.enabled = true;
        if (w.renderControlStatus) w.renderControlStatus();
    });
}

async function openMBTCPMaster(page) {
  await page.goto('/');
  await page.waitForSelector('.sidebar-group-item[data-type="object"]', { timeout: 15000 });
  await page.locator('.sidebar-group-item[data-type="object"]', { hasText: MB_OBJECT }).click();
  await page.waitForSelector('.tab-panel.active', { timeout: 10000 });
  await page.waitForTimeout(1500);
}

test.describe('ModbusMaster HTTP Control (с --control-token)', () => {

  test('секция HTTP Control видна', async ({ page }) => {
    await openMBTCPMaster(page);

    const controlSection = page.locator(`#mb-control-section-${MB_OBJECT}`);
    await expect(controlSection).toBeVisible({ timeout: 5000 });
  });

  test('кнопки Take control и Release видны', async ({ page }) => {
    await openMBTCPMaster(page);

    const takeBtn = page.locator(`#mb-control-take-${MB_OBJECT}`);
    const releaseBtn = page.locator(`#mb-control-release-${MB_OBJECT}`);

    await expect(takeBtn).toBeVisible();
    await expect(releaseBtn).toBeVisible();
  });

  test('кнопки HTTP control disabled без глобального контроля', async ({ page }) => {
    await openMBTCPMaster(page);

    // Без acquireControl — кнопки должны быть disabled
    const takeBtn = page.locator(`#mb-control-take-${MB_OBJECT}`);
    await expect(takeBtn).toBeDisabled({ timeout: 10000 });
  });

  test('кнопки HTTP control enabled после получения контроля', async ({ page }) => {
    await openMBTCPMaster(page);
    await mockControlStatusAsController(page);
    await setControlState(page);

    const takeBtn = page.locator(`#mb-control-take-${MB_OBJECT}`);
    await expect(takeBtn).toBeEnabled({ timeout: 15000 });
  });

  test('кнопка params save disabled без контроля', async ({ page }) => {
    await openMBTCPMaster(page);

    const saveBtn = page.locator(`#mb-params-save-${MB_OBJECT}`);
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeDisabled();
  });

  test('кнопка params save enabled после получения контроля', async ({ page }) => {
    await openMBTCPMaster(page);
    await mockControlStatusAsController(page);
    await setControlState(page);

    const saveBtn = page.locator(`#mb-params-save-${MB_OBJECT}`);
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeEnabled({ timeout: 15000 });
  });

  test('секция параметров обмена отображается', async ({ page }) => {
    await openMBTCPMaster(page);

    const paramsSection = page.locator(`#mb-params-section-${MB_OBJECT}`);
    await expect(paramsSection).toBeVisible({ timeout: 5000 });

    // Таблица параметров внутри секции
    const paramsTable = paramsSection.locator('.mb-params-table');
    await expect(paramsTable).toBeVisible();
  });

  test('API /api/objects/{name}/modbus/control/take доступен', async ({ request }) => {
    const response = await request.post(`/api/objects/${MB_OBJECT}/modbus/control/take`);
    // Ожидаем НЕ 404 (endpoint существует)
    expect(response.status()).not.toBe(404);
  });

  test('API /api/objects/{name}/modbus/control/release доступен', async ({ request }) => {
    const response = await request.post(`/api/objects/${MB_OBJECT}/modbus/control/release`);
    expect(response.status()).not.toBe(404);
  });

  test('заметка (note) элемент существует', async ({ page }) => {
    await openMBTCPMaster(page);

    const noteEl = page.locator(`#mb-control-note-${MB_OBJECT}`);
    await expect(noteEl).toHaveCount(1);
  });
});
