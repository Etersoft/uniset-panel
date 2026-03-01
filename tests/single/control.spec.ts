import { test, expect } from '@playwright/test';

// Тесты контроля при включённом --control-token admin

// Перехватываем GET /api/control/status чтобы всегда возвращать isController: true.
// Это защищает от race condition при параллельном выполнении тестов:
// broadcastStatus() отправляет isController: false всем SSE-клиентам,
// а SSE handler делает GET /api/control/status для уточнения — но если
// другой тест уже освободил контроль, ответ будет isController: false.
async function mockControlStatusAsController(page) {
  await page.route('**/api/control/status', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled: true, hasController: true, isController: true, timeoutSec: 60 })
    });
  });
}

// Получение контроля через UI-диалог
// Мок GET /api/control/status ставится ПОСЛЕ открытия диалога (до — SSE broadcast переключит UI на Release)
async function acquireControlViaDialog(page) {
  const controlStatus = page.locator('#control-status');
  await expect(controlStatus).toBeVisible({ timeout: 10000 });

  await controlStatus.locator('.control-status-btn').click();
  await expect(page.locator('#control-dialog-overlay')).toHaveClass(/visible/, { timeout: 3000 });

  await page.locator('#control-token-input').fill('admin');

  // Ставим мок перед Acquire — защита от SSE broadcast после POST
  await mockControlStatusAsController(page);

  await page.locator('.control-btn-primary').click();

  await expect(page.locator('#control-dialog-overlay')).not.toHaveClass(/visible/, { timeout: 5000 });
  await expect(controlStatus).toHaveClass(/control-status-active/, { timeout: 10000 });
}

// Установка контроля через evaluate (для тестов проверяющих побочные эффекты, не UI диалога)
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

test.describe('Control token (enabled mode)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Ждём инициализации UI и получения статуса контроля через SSE
    await page.waitForTimeout(2000);
  });

  test('индикатор контроля виден', async ({ page }) => {
    const controlStatus = page.locator('#control-status');
    await expect(controlStatus).toBeVisible({ timeout: 10000 });
    // Не должен быть скрыт
    await expect(controlStatus).not.toHaveClass(/hidden/);
  });

  test('начальное состояние — Read-only', async ({ page }) => {
    const controlStatus = page.locator('#control-status');
    await expect(controlStatus).toBeVisible({ timeout: 10000 });

    // Должен быть в режиме readonly
    await expect(controlStatus).toHaveClass(/control-status-readonly/);

    // Текст "Read-only"
    await expect(controlStatus.locator('.control-status-text')).toHaveText('Read-only');

    // Кнопка "Take"
    await expect(controlStatus.locator('.control-status-btn')).toHaveText('Take');
  });

  test('state.control.enabled = true', async ({ page }) => {
    const enabled = await page.evaluate(() => {
      return (window as any).state?.control?.enabled;
    });
    expect(enabled).toBe(true);
  });

  test('canControl() возвращает false до получения контроля', async ({ page }) => {
    const canControl = await page.evaluate(() => {
      return (window as any).canControl?.();
    });
    expect(canControl).toBe(false);
  });

  test('диалог контроля открывается по клику на Take', async ({ page }) => {
    const controlStatus = page.locator('#control-status');
    await expect(controlStatus).toBeVisible({ timeout: 10000 });

    // Кликаем Take
    await controlStatus.locator('.control-status-btn').click();

    // Диалог открылся
    const overlay = page.locator('#control-dialog-overlay');
    await expect(overlay).toHaveClass(/visible/, { timeout: 3000 });

    // Input для токена виден
    await expect(page.locator('#control-token-input')).toBeVisible();

    // Закрываем
    await page.keyboard.press('Escape');
  });

  test('ввод неверного токена показывает ошибку', async ({ page }) => {
    const controlStatus = page.locator('#control-status');
    await expect(controlStatus).toBeVisible({ timeout: 10000 });

    // Открываем диалог
    await controlStatus.locator('.control-status-btn').click();
    await expect(page.locator('#control-dialog-overlay')).toHaveClass(/visible/, { timeout: 3000 });

    // Вводим неверный токен
    await page.locator('#control-token-input').fill('wrong-token');
    await page.locator('.control-btn-primary').click();

    // Ждём ошибку
    const errorEl = page.locator('#control-error');
    await expect(errorEl).not.toBeEmpty({ timeout: 5000 });
  });

  test('получение контроля через верный токен', async ({ page }) => {
    await acquireControlViaDialog(page);

    const controlStatus = page.locator('#control-status');
    await expect(controlStatus.locator('.control-status-text')).toHaveText('Control');
    await expect(controlStatus.locator('.control-status-btn')).toHaveText('Release');
  });

  test('canControl() возвращает true после получения контроля', async ({ page }) => {
    await acquireControlViaDialog(page);

    await page.waitForFunction(() => (window as any).canControl?.() === true, { timeout: 10000 });
  });

  test('освобождение контроля через Release', async ({ page }) => {
    // Берём контроль на сервере + мок GET /api/control/status
    await mockControlStatusAsController(page);
    await page.evaluate(async () => {
      await fetch('/api/control/take', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'admin' })
      });
    });
    await setControlState(page);

    // Ждём пока UI покажет "Control" с кнопкой "Release"
    const controlStatus = page.locator('#control-status');
    await expect(controlStatus).toHaveClass(/control-status-active/, { timeout: 10000 });
    await expect(controlStatus.locator('.control-status-btn')).toHaveText('Release');

    // Меняем mock: теперь возвращаем released state (для SSE handler после release)
    await page.unroute('**/api/control/status');
    await page.route('**/api/control/status', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true, hasController: false, isController: false, timeoutSec: 60 })
      });
    });

    // Отпускаем контроль
    await controlStatus.locator('.control-status-btn').click();

    // Статус сменился на readonly
    await expect(controlStatus).toHaveClass(/control-status-readonly/, { timeout: 5000 });
    await expect(controlStatus.locator('.control-status-text')).toHaveText('Read-only');
  });

  test('кнопки disabled до получения контроля', async ({ page }) => {
    // Открываем SharedMemory
    await page.waitForSelector('.sidebar-group-item[data-type="object"]', { timeout: 15000 });
    const smItem = page.locator('.sidebar-group-item[data-type="object"]', { hasText: 'SharedMemory' });
    if (!(await smItem.isVisible().catch(() => false))) return;

    await smItem.click();
    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });
    await page.waitForSelector('.ionc-sensors-tbody tr.ionc-sensor-row', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Кнопки freeze/set должны быть disabled (не readonly строки)
    const freezeBtn = page.locator('.ionc-sensors-tbody tr.ionc-sensor-row:not(.ionc-sensor-readonly) .ionc-btn-freeze').first();
    if (await freezeBtn.count() > 0) {
      await expect(freezeBtn).toBeDisabled({ timeout: 5000 });
    }
  });

  test('кнопки enabled после получения контроля', async ({ page }) => {
    await mockControlStatusAsController(page);
    await setControlState(page);

    // Открываем SharedMemory
    await page.waitForSelector('.sidebar-group-item[data-type="object"]', { timeout: 15000 });
    const smItem = page.locator('.sidebar-group-item[data-type="object"]', { hasText: 'SharedMemory' });
    if (!(await smItem.isVisible().catch(() => false))) return;

    await smItem.click();
    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });
    await page.waitForSelector('.ionc-sensors-tbody tr.ionc-sensor-row', { timeout: 10000 });

    // Ожидаем что кнопки станут enabled при следующем рендере
    const freezeBtn = page.locator('.ionc-sensors-tbody tr.ionc-sensor-row:not(.ionc-sensor-readonly) .ionc-btn-freeze').first();
    if (await freezeBtn.count() > 0) {
      await expect(freezeBtn).toBeEnabled({ timeout: 15000 });
    }
  });

  test('params save disabled до получения контроля', async ({ page }) => {
    await page.waitForSelector('.sidebar-group-item[data-type="object"]', { timeout: 15000 });
    await page.locator('.sidebar-group-item[data-type="object"]', { hasText: 'MBTCPMaster1' }).click();
    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });
    await page.waitForTimeout(1500);

    const saveBtn = page.locator('[id^="mb-params-save-"]').first();
    if (await saveBtn.count() > 0) {
      await expect(saveBtn).toBeDisabled();
    }
  });

  test('params save enabled после получения контроля', async ({ page }) => {
    await mockControlStatusAsController(page);
    await setControlState(page);

    await page.waitForSelector('.sidebar-group-item[data-type="object"]', { timeout: 15000 });
    await page.locator('.sidebar-group-item[data-type="object"]', { hasText: 'MBTCPMaster1' }).click();
    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // Ждём цикл loadStatus() → updateParamsAccessibility() (раз в секунду)
    const saveBtn = page.locator('[id^="mb-params-save-"]').first();
    if (await saveBtn.count() > 0) {
      await expect(saveBtn).toBeEnabled({ timeout: 15000 });
    }
  });

  test('диалог контроля существует в DOM', async ({ page }) => {
    const overlay = page.locator('#control-dialog-overlay');
    await expect(overlay).toHaveCount(1);
    // Изначально не видим
    await expect(overlay).not.toHaveClass(/visible/);
  });

  test('API /api/control/status отвечает корректно', async ({ request }) => {
    const response = await request.get('/api/control/status');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('enabled');
    expect(data.enabled).toBe(true);
    expect(data).toHaveProperty('hasController');
    expect(data).toHaveProperty('isController');
  });
});
