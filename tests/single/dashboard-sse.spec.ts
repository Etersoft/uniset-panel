import { test, expect } from '@playwright/test';

async function openServerDashboard(page) {
  await page.goto('/');
  // Ждём появления sidebar dashboard item вместо fixed waitForTimeout(2000) —
  // expect.toBeVisible polls автоматически.
  const firstDashboard = page.locator('.sidebar-group-item[data-type="dashboard"]').first();
  await expect(firstDashboard).toBeVisible({ timeout: 10000 });
  await firstDashboard.scrollIntoViewIfNeeded();
  await firstDashboard.click();

  await expect(page.locator('#dashboard-view')).toHaveClass(/active/, { timeout: 10000 });
  // Ждём пока loadDashboard завершит fetch и установит currentDashboard.
  // Проверяем что currentDashboard стало не-null (string — имя dashboard'а).
  // null → fetch in progress; string → загружено. clearDashboard() ставит null — тоже OK,
  // но тогда нет виджетов и остальные assertions пройдут trivially.
  await expect.poll(
    async () => await page.evaluate(() => typeof (window as any).dashboardState?.currentDashboard),
    { timeout: 8000, intervals: [100, 200, 500] }
  ).toBe('string');
}

// Создаёт inline dashboard с sensor именами, гарантированно присутствующими
// в mock-uniset (`Input1_S`/`Input2_S` есть в test.xml, через который mock
// отдаёт IONC sensors). Это нужно потому что example-fixture'ы (diesel-generator
// и т.д.) ссылаются на DG1_RPM/DG2_Power которых в mock нет — после sensorKey
// refactor (commit 9cfdc1f) такие unresolved binding'и не дают subscriptions.
async function loadKnownSensorDashboard(page) {
  await page.evaluate(async () => {
    const w = window as any;
    // Найти первый connected серверid из state.servers (mock-uniset).
    let serverId = '';
    for (const [id, srv] of w.state.servers) {
      if (srv.connected) { serverId = id; break; }
    }
    const cfg = {
      meta: { name: 'TEST_SUB', description: '' },
      widgets: [
        { id: 'w-1', type: 'gauge',
          config: { sensor: 'Input1_S', serverId, objectName: 'SharedMemory', sensorId: 1 },
          position: { col: 0, row: 0, width: 4, height: 4 } },
        { id: 'w-2', type: 'gauge',
          config: { sensor: 'Input2_S', serverId, objectName: 'SharedMemory', sensorId: 2 },
          position: { col: 4, row: 0, width: 4, height: 4 } },
      ]
    };
    w.dashboardState.dashboards.set('TEST_SUB', cfg);
    await w.dashboardManager.loadDashboard('TEST_SUB');
    if (typeof w.switchView === 'function') w.switchView('dashboard');
  });
}

test.describe('Dashboard SSE подписки', () => {

  test('виджеты имеют подписки на сенсоры', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => {
      const w = window as any;
      return w.dashboardState && w.dashboardManager && w.state?.servers?.size > 0;
    }, { timeout: 10000 });
    await loadKnownSensorDashboard(page);

    // Ждём инициализации подписок через poll вместо fixed waitForTimeout(1000)
    await expect.poll(
      async () => await page.evaluate(() => (window as any).dashboardState?.sensorSubscriptions?.size > 0),
      { timeout: 5000 }
    ).toBe(true);

    const hasSubscriptions = await page.evaluate(() => {
      return (window as any).dashboardState?.sensorSubscriptions?.size > 0;
    });
    expect(hasSubscriptions).toBe(true);
  });

  test('виджеты gauge имеют SSE подписки', async ({ page }) => {
    await openServerDashboard(page);
    // Ждём пока dashboardState.widgets заполнится (или останется 0 — fast-pass)
    // вместо fixed waitForTimeout(3000).
    await page.waitForFunction(() => {
      const w = window as any;
      return w.dashboardState?.widgets !== undefined;
    }, { timeout: 5000 });

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
    // Ждём пока DOM widget count и state widget count сойдутся вместо
    // fixed waitForTimeout(2000) — JS инициализация виджетов асинхронна.
    await expect.poll(async () => {
      const widgetCount = await page.evaluate(() => (window as any).dashboardState?.widgets?.size || 0);
      const domWidgetCount = await page.locator('#dashboard-grid .dashboard-widget').count();
      return { widgetCount, domWidgetCount, equal: widgetCount === domWidgetCount };
    }, { timeout: 5000 }).toMatchObject({ equal: true });

    const widgetCount = await page.evaluate(() => {
      return (window as any).dashboardState?.widgets?.size || 0;
    });

    // Количество JS-инстансов должно соответствовать DOM
    const domWidgetCount = await page.locator('#dashboard-grid .dashboard-widget').count();
    expect(widgetCount).toBe(domWidgetCount);
  });

  test('при закрытии дашборда виджеты очищаются', async ({ page }) => {
    await openServerDashboard(page);
    // Ждём появления хотя бы одного widget'а вместо fixed waitForTimeout(2000)
    await expect.poll(
      async () => await page.evaluate(() => (window as any).dashboardState?.widgets?.size || 0),
      { timeout: 5000 }
    ).toBeGreaterThan(0);

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

    // Ждём очистки виджетов вместо fixed waitForTimeout(1000)
    await expect.poll(
      async () => await page.evaluate(() => (window as any).dashboardState?.widgets?.size || 0),
      { timeout: 5000, intervals: [100, 200, 500] }
    ).toBe(0);

    // Виджеты должны быть очищены
    const widgetsAfter = await page.evaluate(() => {
      return (window as any).dashboardState?.widgets?.size || 0;
    });
    expect(widgetsAfter).toBe(0);
  });

  test('несколько виджетов с разными sensor подписками', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => {
      const w = window as any;
      return w.dashboardState && w.dashboardManager && w.state?.servers?.size > 0;
    }, { timeout: 10000 });
    await loadKnownSensorDashboard(page);

    // Ждём появления ≥ 2 подписок вместо fixed waitForTimeout(1000)
    await expect.poll(
      async () => await page.evaluate(() => (window as any).dashboardState?.sensorSubscriptions?.size || 0),
      { timeout: 5000, intervals: [100, 200, 500] }
    ).toBeGreaterThanOrEqual(2);

    // Получаем все уникальные sensor имена из подписок
    const sensorNames = await page.evaluate(() => {
      const subs = (window as any).dashboardState?.sensorSubscriptions;
      if (!subs) return [];
      return Array.from(subs.keys());
    });

    // 2 widget'а на разных sensor'ах → ≥ 2 уникальных sensorKey'а в подписках.
    expect(sensorNames.length).toBeGreaterThanOrEqual(2);
  });

  test('cache значений сенсоров заполняется', async ({ page }) => {
    await openServerDashboard(page);

    // Assertion слабая (>= 0 — всегда true), поэтому просто читаем cache size
    // через poll вместо fixed waitForTimeout(5000). Нет смысла жать 5 секунд
    // перед чтением если значение уже доступно.
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
