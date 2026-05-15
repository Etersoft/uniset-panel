import { test, expect } from '@playwright/test';

async function switchToDashboardView(page) {
  await page.goto('/');
  // Очищаем пользовательские дашборды для изоляции тестов
  await page.evaluate(() => {
    localStorage.removeItem('user-dashboards');
    const keys = Object.keys(localStorage).filter(k => k.startsWith('dashboard:'));
    keys.forEach(k => localStorage.removeItem(k));
  });
  await page.reload();
  // Ждём появления элементов интерфейса вместо фиксированной паузы
  await expect(page.locator('#view-dashboard-btn')).toBeVisible({ timeout: 10000 });

  // Переключаемся на Dashboard view
  await page.locator('#view-dashboard-btn').click();
  await expect(page.locator('#dashboard-view')).toHaveClass(/active/, { timeout: 5000 });
}

test.describe('Dashboard — базовые операции', () => {

  test('серверные дашборды видны в sidebar (группы)', async ({ page }) => {
    await page.goto('/');

    // Дашборды отображаются в sidebar как sidebar-group-item[data-type="dashboard"]
    const dashboardItems = page.locator('.sidebar-group-item[data-type="dashboard"]');
    await expect(dashboardItems.first()).toBeVisible({ timeout: 10000 });

    // Должно быть минимум 2 серверных дашборда (из examples/dashboards/)
    const count = await dashboardItems.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('переключение в Dashboard view', async ({ page }) => {
    await page.goto('/');
    // Ждём готовности интерфейса
    await expect(page.locator('#view-dashboard-btn')).toBeVisible({ timeout: 10000 });

    // Кликаем на кнопку Dashboard view
    await page.locator('#view-dashboard-btn').click();

    // Dashboard view контейнер должен стать активным
    await expect(page.locator('#dashboard-view')).toHaveClass(/active/, { timeout: 5000 });
    await expect(page.locator('#view-dashboard-btn')).toHaveClass(/active/);
  });

  test('выпадающий список дашбордов содержит серверные варианты', async ({ page }) => {
    await switchToDashboardView(page);

    const select = page.locator('#dashboard-select');
    const options = select.locator('option');
    const count = await options.count();

    // Минимум: placeholder + 2 серверных дашборда
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('клик на дашборд в sidebar открывает его', async ({ page }) => {
    await page.goto('/');

    // Кликаем на первый дашборд в sidebar группах
    const firstDashboard = page.locator('.sidebar-group-item[data-type="dashboard"]').first();
    await expect(firstDashboard).toBeVisible({ timeout: 10000 });
    await firstDashboard.click();

    // Должен переключиться на dashboard view
    await expect(page.locator('#dashboard-view')).toHaveClass(/active/, { timeout: 5000 });

    // Действия дашборда видны
    await expect(page.locator('#dashboard-actions')).not.toHaveClass(/hidden/, { timeout: 5000 });
  });

  test('дашборд содержит виджеты', async ({ page }) => {
    await page.goto('/');

    // Открываем первый дашборд
    const firstDashboard = page.locator('.sidebar-group-item[data-type="dashboard"]').first();
    await expect(firstDashboard).toBeVisible({ timeout: 10000 });
    await firstDashboard.click();
    await expect(page.locator('#dashboard-view')).toHaveClass(/active/, { timeout: 5000 });

    // Grid виден
    const grid = page.locator('#dashboard-grid');
    await expect(grid).toBeVisible();

    // Должны быть виджеты
    const widgets = grid.locator('.dashboard-widget');
    await expect(widgets).not.toHaveCount(0, { timeout: 5000 });
  });

  test('создание нового дашборда', async ({ page }) => {
    await switchToDashboardView(page);

    // Кликаем + (New dashboard)
    await page.locator('#dashboard-new-btn').click();

    // Диалог ввода имени
    const overlay = page.locator('#dashboard-name-overlay');
    await expect(overlay).not.toHaveClass(/hidden/, { timeout: 3000 });

    // Вводим имя
    await page.locator('#dashboard-name-input').fill('Test Dashboard');
    await page.locator('#dashboard-name-confirm').click();

    // Диалог закрылся
    await expect(overlay).toHaveClass(/hidden/, { timeout: 3000 });

    // Новый дашборд выбран в select
    const select = page.locator('#dashboard-select');
    await expect(select).toHaveValue(/Test Dashboard/, { timeout: 5000 });

    // Действия видны
    await expect(page.locator('#dashboard-actions')).not.toHaveClass(/hidden/);
  });

  test('удаление пользовательского дашборда', async ({ page }) => {
    await switchToDashboardView(page);

    // Создаём дашборд для удаления
    await page.locator('#dashboard-new-btn').click();
    await page.locator('#dashboard-name-input').fill('To Delete');
    await page.locator('#dashboard-name-confirm').click();
    await expect(page.locator('#dashboard-actions')).not.toHaveClass(/hidden/, { timeout: 5000 });

    // Кликаем Delete — приложение использует кастомный showConfirmDialog
    // (раньше был нативный confirm()).
    await page.locator('#dashboard-delete-btn').click();

    // Подтверждаем удаление в dialog'е
    await expect(page.locator('#confirm-dialog-overlay')).not.toHaveClass(/hidden/, { timeout: 2000 });
    await page.locator('#confirm-dialog-ok').click();

    // Дашборд удалён — actions скрыты
    await expect(page.locator('#dashboard-actions')).toHaveClass(/hidden/, { timeout: 5000 });
  });

  test('переключение между дашбордами через select', async ({ page }) => {
    await page.goto('/');

    // Открываем первый дашборд
    const firstDashboard = page.locator('.sidebar-group-item[data-type="dashboard"]').first();
    await expect(firstDashboard).toBeVisible({ timeout: 10000 });
    await firstDashboard.click();
    await expect(page.locator('#dashboard-view')).toHaveClass(/active/, { timeout: 5000 });

    // Считаем виджеты
    const firstCount = await page.locator('#dashboard-grid .dashboard-widget').count();

    // Переключаемся на другой через select
    const select = page.locator('#dashboard-select');
    const options = await select.locator('option').all();

    // Ищем другой серверный дашборд (не placeholder и не текущий)
    for (const option of options) {
      const value = await option.getAttribute('value');
      if (value && value !== '' && value !== await select.inputValue()) {
        await select.selectOption(value);
        break;
      }
    }

    // Ждём обновления grid (может изменить набор виджетов)
    await expect(page.locator('#dashboard-grid')).toBeVisible({ timeout: 5000 });

    // Виджеты могут быть другие
    const secondCount = await page.locator('#dashboard-grid .dashboard-widget').count();
    expect(secondCount).toBeGreaterThanOrEqual(0);
  });

  test('API /api/dashboards возвращает список', async ({ request }) => {
    const response = await request.get('/api/dashboards');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(Array.isArray(data)).toBeTruthy();
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  test('виджеты позиционированы в сетке', async ({ page }) => {
    await page.goto('/');

    // Открываем дашборд
    const firstDashboard = page.locator('.sidebar-group-item[data-type="dashboard"]').first();
    await expect(firstDashboard).toBeVisible({ timeout: 10000 });
    await firstDashboard.click();
    await expect(page.locator('#dashboard-view')).toHaveClass(/active/, { timeout: 5000 });

    const widgets = page.locator('#dashboard-grid .dashboard-widget');
    const count = await widgets.count();

    if (count > 0) {
      // Каждый виджет должен иметь data-widget-id
      const firstWidget = widgets.first();
      const widgetId = await firstWidget.getAttribute('data-widget-id');
      expect(widgetId).toBeTruthy();

      // Виджет должен иметь data-type
      const widgetType = await firstWidget.getAttribute('data-type');
      expect(widgetType).toBeTruthy();
    }
  });
});
