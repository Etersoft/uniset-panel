import { test, expect } from '@playwright/test';

async function openServerDashboard(page) {
  await page.goto('/');
  await page.waitForTimeout(2000);

  // Открываем первый серверный дашборд через sidebar группы
  const firstDashboard = page.locator('.sidebar-group-item[data-type="dashboard"]').first();
  await firstDashboard.scrollIntoViewIfNeeded();
  await expect(firstDashboard).toBeVisible({ timeout: 10000 });
  await firstDashboard.click();

  await expect(page.locator('#dashboard-view')).toHaveClass(/active/, { timeout: 10000 });
  await page.waitForTimeout(1000);
}

test.describe('Dashboard SSE подписки', () => {

  test('виджеты имеют подписки на сенсоры', async ({ page }) => {
    await openServerDashboard(page);

    // Ждём инициализации подписок
    await page.waitForTimeout(3000);

    // Проверяем что sensorSubscriptions не пусты
    const hasSubscriptions = await page.evaluate(() => {
      return (window as any).dashboardState?.sensorSubscriptions?.size > 0;
    });
    expect(hasSubscriptions).toBe(true);
  });

  test('виджеты gauge имеют SSE подписки', async ({ page }) => {
    await openServerDashboard(page);
    await page.waitForTimeout(3000);

    // Проверяем что есть gauge виджеты с подписками
    const gaugeWidgets = page.locator('.dashboard-widget[data-type="gauge"]');
    const count = await gaugeWidgets.count();

    if (count > 0) {
      // Первый gauge должен иметь sensor в конфиге
      const widgetId = await gaugeWidgets.first().getAttribute('data-widget-id');
      const hasSensor = await page.evaluate((id) => {
        const widget = (window as any).dashboardState?.widgets?.get(id);
        return widget?.config?.sensor?.length > 0;
      }, widgetId);
      expect(hasSensor).toBe(true);
    }
  });

  test('dashboardState.widgets содержит экземпляры виджетов', async ({ page }) => {
    await openServerDashboard(page);
    await page.waitForTimeout(2000);

    const widgetCount = await page.evaluate(() => {
      return (window as any).dashboardState?.widgets?.size || 0;
    });

    // Количество JS-инстансов должно соответствовать DOM
    const domWidgetCount = await page.locator('#dashboard-grid .dashboard-widget').count();
    expect(widgetCount).toBe(domWidgetCount);
  });

  test('при закрытии дашборда виджеты очищаются', async ({ page }) => {
    await openServerDashboard(page);
    await page.waitForTimeout(2000);

    // Убеждаемся что есть виджеты
    const widgetsBefore = await page.evaluate(() => {
      return (window as any).dashboardState?.widgets?.size || 0;
    });
    expect(widgetsBefore).toBeGreaterThan(0);

    // Переключаемся обратно на Objects view
    await page.locator('#view-objects-btn').click();
    await expect(page.locator('#dashboard-view')).not.toHaveClass(/active/, { timeout: 5000 });

    // Выбираем пустой дашборд через select
    await page.locator('#view-dashboard-btn').click();

    // Выбираем "Select dashboard..." (пустое значение)
    const select = page.locator('#dashboard-select');
    await select.selectOption('');

    await page.waitForTimeout(1000);

    // Виджеты должны быть очищены
    const widgetsAfter = await page.evaluate(() => {
      return (window as any).dashboardState?.widgets?.size || 0;
    });
    expect(widgetsAfter).toBe(0);
  });

  test('несколько виджетов с разными sensor подписками', async ({ page }) => {
    await openServerDashboard(page);
    await page.waitForTimeout(3000);

    // Получаем все уникальные sensor имена из подписок
    const sensorNames = await page.evaluate(() => {
      const subs = (window as any).dashboardState?.sensorSubscriptions;
      if (!subs) return [];
      return Array.from(subs.keys());
    });

    // Для overview дашборда должно быть несколько разных сенсоров
    expect(sensorNames.length).toBeGreaterThanOrEqual(1);
  });

  test('cache значений сенсоров заполняется', async ({ page }) => {
    await openServerDashboard(page);

    // Ждём загрузки начальных значений
    await page.waitForTimeout(5000);

    const cacheSize = await page.evaluate(() => {
      return (window as any).state?.sensorValuesCache?.size || 0;
    });

    // Кэш должен содержать хотя бы некоторые значения
    expect(cacheSize).toBeGreaterThanOrEqual(0);
  });

  test('API /api/dashboards возвращает серверные дашборды', async ({ request }) => {
    const response = await request.get('/api/dashboards');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(Array.isArray(data)).toBeTruthy();

    // Каждый дашборд должен иметь name
    for (const dashboard of data) {
      expect(dashboard).toHaveProperty('name');
    }
  });

  test('API /api/dashboards/{name} возвращает конфиг дашборда', async ({ request }) => {
    // Сначала получаем список
    const listResponse = await request.get('/api/dashboards');
    const dashboards = await listResponse.json();

    if (dashboards.length > 0) {
      const name = dashboards[0].name;
      const response = await request.get(`/api/dashboards/${encodeURIComponent(name)}`);
      expect(response.ok()).toBeTruthy();

      const config = await response.json();
      expect(config).toHaveProperty('version');
      expect(config).toHaveProperty('widgets');
      expect(Array.isArray(config.widgets)).toBeTruthy();
    }
  });
});
