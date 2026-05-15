import { test, expect } from '@playwright/test';

// Все типы виджетов
const WIDGET_TYPES = ['gauge', 'level', 'led', 'label', 'divider', 'statusbar', 'bargraph', 'digital', 'toggle', 'pushbutton', 'setpoint', 'generator', 'chart'];

async function openServerDashboard(page) {
  await page.goto('/');

  // Открываем первый серверный дашборд через sidebar группы
  const firstDashboard = page.locator('.sidebar-group-item[data-type="dashboard"]').first();
  // Прокрутка до элемента (может быть внизу sidebar)
  await expect(firstDashboard).toBeVisible({ timeout: 10000 });
  await firstDashboard.scrollIntoViewIfNeeded();
  await firstDashboard.click();

  await expect(page.locator('#dashboard-view')).toHaveClass(/active/, { timeout: 10000 });
  // Ждём появления хотя бы одного виджета (подтверждает что dashboard загружен)
  await expect(page.locator('#dashboard-grid .dashboard-widget').first()).toBeVisible({ timeout: 8000 });
}

async function createTestDashboard(page, name = 'Widget Test') {
  await page.goto('/');
  // Очищаем пользовательские дашборды
  await page.evaluate(() => {
    localStorage.removeItem('user-dashboards');
    const keys = Object.keys(localStorage).filter(k => k.startsWith('dashboard:'));
    keys.forEach(k => localStorage.removeItem(k));
  });
  await page.reload();
  // Ждём готовности UI после reload
  await expect(page.locator('#view-dashboard-btn')).toBeVisible({ timeout: 10000 });

  // Переключаемся на dashboard view
  await page.locator('#view-dashboard-btn').click();
  await expect(page.locator('#dashboard-view')).toHaveClass(/active/, { timeout: 5000 });

  // Создаём новый дашборд
  await page.locator('#dashboard-new-btn').click();
  await page.locator('#dashboard-name-input').fill(name);
  await page.locator('#dashboard-name-confirm').click();
  await expect(page.locator('#dashboard-actions')).not.toHaveClass(/hidden/, { timeout: 5000 });
}

async function addWidget(page, widgetType: string) {
  // Кликаем "Add widget"
  await page.locator('#dashboard-add-widget-btn').click();

  // Ждём появления picker
  const pickerOverlay = page.locator('#widget-picker-overlay');
  await expect(pickerOverlay).not.toHaveClass(/hidden/, { timeout: 3000 });

  // Выбираем тип виджета
  await page.locator(`.widget-picker-item[data-type="${widgetType}"]`).click();

  // Ждём появления конфиг диалога
  const configOverlay = page.locator('#widget-config-overlay');
  await expect(configOverlay).not.toHaveClass(/hidden/, { timeout: 3000 });

  return configOverlay;
}

test.describe('Dashboard — виджеты серверного дашборда', () => {

  test('виджеты gauge отображаются с SVG', async ({ page }) => {
    await openServerDashboard(page);

    const gaugeWidgets = page.locator('.dashboard-widget[data-type="gauge"]');
    const count = await gaugeWidgets.count();

    if (count > 0) {
      // Gauge должен содержать SVG элемент gauge-svg
      const firstGauge = gaugeWidgets.first();
      await expect(firstGauge).toBeVisible();
      await expect(firstGauge.locator('.gauge-svg')).toBeVisible({ timeout: 5000 });
    }
  });

  test('виджеты led отображаются', async ({ page }) => {
    await openServerDashboard(page);

    const ledWidgets = page.locator('.dashboard-widget[data-type="led"]');
    const count = await ledWidgets.count();

    if (count > 0) {
      await expect(ledWidgets.first()).toBeVisible();
    }
  });

  test('виджеты label отображают текст', async ({ page }) => {
    await openServerDashboard(page);

    const labelWidgets = page.locator('.dashboard-widget[data-type="label"]');
    const count = await labelWidgets.count();

    if (count > 0) {
      const firstLabel = labelWidgets.first();
      await expect(firstLabel).toBeVisible();
      // Label должен содержать текст
      const text = await firstLabel.textContent();
      expect(text.length).toBeGreaterThan(0);
    }
  });

  test('каждый виджет имеет data-widget-id и data-type', async ({ page }) => {
    await openServerDashboard(page);

    const widgets = page.locator('#dashboard-grid .dashboard-widget');
    const count = await widgets.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 5); i++) {
      const widget = widgets.nth(i);
      const widgetId = await widget.getAttribute('data-widget-id');
      const widgetType = await widget.getAttribute('data-type');

      expect(widgetId).toBeTruthy();
      expect(widgetType).toBeTruthy();
      expect(WIDGET_TYPES).toContain(widgetType);
    }
  });
});

test.describe('Dashboard — Edit mode', () => {

  test('кнопка Edit включает режим редактирования', async ({ page }) => {
    await openServerDashboard(page);

    const editBtn = page.locator('#dashboard-edit-btn');
    await expect(editBtn).toBeVisible();

    // Включаем edit mode
    await editBtn.click();

    // Grid получает класс edit-mode
    await expect(page.locator('#dashboard-grid')).toHaveClass(/edit-mode/);

    // Виджеты получают класс edit-mode
    const firstWidget = page.locator('#dashboard-grid .dashboard-widget').first();
    await expect(firstWidget).toHaveClass(/edit-mode/);
  });

  test('повторный клик на Edit выключает режим редактирования', async ({ page }) => {
    await openServerDashboard(page);

    const editBtn = page.locator('#dashboard-edit-btn');

    // Включаем
    await editBtn.click();
    await expect(page.locator('#dashboard-grid')).toHaveClass(/edit-mode/);

    // Выключаем
    await editBtn.click();
    await expect(page.locator('#dashboard-grid')).not.toHaveClass(/edit-mode/);
  });

  test('в edit mode виджеты имеют resize handle', async ({ page }) => {
    await openServerDashboard(page);

    // Включаем edit mode
    await page.locator('#dashboard-edit-btn').click();

    const firstWidget = page.locator('#dashboard-grid .dashboard-widget').first();
    await expect(firstWidget.locator('.widget-resize-handle')).toBeVisible();
  });

  test('в edit mode виджеты имеют кнопки config и delete', async ({ page }) => {
    await openServerDashboard(page);

    // Включаем edit mode
    await page.locator('#dashboard-edit-btn').click();

    const firstWidget = page.locator('#dashboard-grid .dashboard-widget').first();

    // Кнопки actions (config + delete) видны в edit mode
    await expect(firstWidget.locator('.widget-actions')).toBeVisible();
    await expect(firstWidget.locator('.widget-action-btn.config')).toBeVisible();
    await expect(firstWidget.locator('.widget-action-btn.delete')).toBeVisible();
  });
});

test.describe('Dashboard — Widget Picker', () => {

  test('Widget picker показывает все 13 типов виджетов', async ({ page }) => {
    await createTestDashboard(page);

    // Открываем picker
    await page.locator('#dashboard-add-widget-btn').click();

    const pickerOverlay = page.locator('#widget-picker-overlay');
    await expect(pickerOverlay).not.toHaveClass(/hidden/, { timeout: 3000 });

    const items = page.locator('.widget-picker-item');
    await expect(items).toHaveCount(13);

    // Проверяем все типы
    for (const type of WIDGET_TYPES) {
      await expect(page.locator(`.widget-picker-item[data-type="${type}"]`)).toBeVisible();
    }
  });

  test('выбор типа виджета открывает конфиг диалог', async ({ page }) => {
    await createTestDashboard(page);

    // Открываем picker и выбираем label (самый простой)
    await page.locator('#dashboard-add-widget-btn').click();
    await page.locator('.widget-picker-item[data-type="label"]').click();

    // Конфиг диалог открыт
    const configOverlay = page.locator('#widget-config-overlay');
    await expect(configOverlay).not.toHaveClass(/hidden/, { timeout: 3000 });

    // Есть кнопка Apply
    await expect(page.locator('#widget-config-apply')).toBeVisible();
  });
});

test.describe('Dashboard — создание виджетов', () => {

  test('создание Label виджета', async ({ page }) => {
    await createTestDashboard(page);

    await addWidget(page, 'label');

    // Заполняем конфиг
    const labelInput = page.locator('#widget-config-overlay [name="label"]');
    if (await labelInput.isVisible()) {
      await labelInput.fill('Test Label');
    }

    // Применяем
    await page.locator('#widget-config-apply').click();

    // Виджет появился на сетке
    const labelWidget = page.locator('.dashboard-widget[data-type="label"]');
    await expect(labelWidget).toBeVisible({ timeout: 5000 });
  });

  test('создание Gauge виджета', async ({ page }) => {
    await createTestDashboard(page);

    await addWidget(page, 'gauge');

    // Заполняем обязательные поля
    const sensorInput = page.locator('#widget-config-overlay [name="sensor"]');
    if (await sensorInput.isVisible()) {
      await sensorInput.fill('AI70_S');
    }

    const labelInput = page.locator('#widget-config-overlay [name="label"]');
    if (await labelInput.isVisible()) {
      await labelInput.fill('Temperature');
    }

    // Применяем
    await page.locator('#widget-config-apply').click();

    // Виджет появился
    const gaugeWidget = page.locator('.dashboard-widget[data-type="gauge"]');
    await expect(gaugeWidget).toBeVisible({ timeout: 5000 });
  });

  test('создание Digital виджета', async ({ page }) => {
    await createTestDashboard(page);

    await addWidget(page, 'digital');

    // Заполняем sensor
    const sensorInput = page.locator('#widget-config-overlay [name="sensor"]');
    if (await sensorInput.isVisible()) {
      await sensorInput.fill('AI70_S');
    }

    await page.locator('#widget-config-apply').click();

    const widget = page.locator('.dashboard-widget[data-type="digital"]');
    await expect(widget).toBeVisible({ timeout: 5000 });
  });

  test('создание LED виджета', async ({ page }) => {
    await createTestDashboard(page);

    await addWidget(page, 'led');

    const sensorInput = page.locator('#widget-config-overlay [name="sensor"]');
    if (await sensorInput.isVisible()) {
      await sensorInput.fill('DI50_S');
    }

    await page.locator('#widget-config-apply').click();

    const widget = page.locator('.dashboard-widget[data-type="led"]');
    await expect(widget).toBeVisible({ timeout: 5000 });
  });

  test('создание Divider виджета', async ({ page }) => {
    await createTestDashboard(page);

    await addWidget(page, 'divider');
    await page.locator('#widget-config-apply').click();

    const widget = page.locator('.dashboard-widget[data-type="divider"]');
    await expect(widget).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Dashboard — конфигурация и удаление виджетов', () => {

  test('конфиг диалог открывается по клику на config кнопку', async ({ page }) => {
    await openServerDashboard(page);

    // Включаем edit mode
    await page.locator('#dashboard-edit-btn').click();

    // Кликаем config на первом виджете
    const firstWidget = page.locator('#dashboard-grid .dashboard-widget').first();
    await firstWidget.locator('.widget-action-btn.config').click();

    // Конфиг диалог открыт
    const configOverlay = page.locator('#widget-config-overlay');
    await expect(configOverlay).not.toHaveClass(/hidden/, { timeout: 3000 });
  });

  test('удаление виджета через кнопку delete', async ({ page }) => {
    await createTestDashboard(page);

    // Создаём label виджет
    await addWidget(page, 'label');
    const labelInput = page.locator('#widget-config-overlay [name="label"]');
    if (await labelInput.isVisible()) {
      await labelInput.fill('To Delete');
    }
    await page.locator('#widget-config-apply').click();
    await expect(page.locator('.dashboard-widget[data-type="label"]')).toBeVisible({ timeout: 5000 });

    // Включаем edit mode
    await page.locator('#dashboard-edit-btn').click();

    // Кликаем delete
    const widget = page.locator('.dashboard-widget[data-type="label"]').first();
    await widget.locator('.widget-action-btn.delete').click();

    // Подтверждаем удаление
    await expect(page.locator('#confirm-dialog-overlay')).toBeVisible({ timeout: 3000 });
    await page.locator('#confirm-dialog-ok').click();

    // Виджет удалён
    await expect(page.locator('.dashboard-widget[data-type="label"]')).toHaveCount(0, { timeout: 5000 });
  });

  test('конфиг диалог закрывается по Cancel', async ({ page }) => {
    await openServerDashboard(page);

    // Включаем edit mode
    await page.locator('#dashboard-edit-btn').click();

    // Открываем конфиг
    await page.locator('#dashboard-grid .dashboard-widget').first().locator('.widget-action-btn.config').click();
    const configOverlay = page.locator('#widget-config-overlay');
    await expect(configOverlay).not.toHaveClass(/hidden/, { timeout: 3000 });

    // Закрываем по Cancel
    await page.locator('#widget-config-overlay .widget-btn-secondary').click();
    await expect(configOverlay).toHaveClass(/hidden/);
  });

  test('несколько виджетов можно добавить на дашборд', async ({ page }) => {
    await createTestDashboard(page);

    // Добавляем 3 виджета разных типов
    const types = ['label', 'divider', 'led'];
    for (const type of types) {
      await addWidget(page, type);

      if (type === 'led') {
        const sensorInput = page.locator('#widget-config-overlay [name="sensor"]');
        if (await sensorInput.isVisible()) {
          await sensorInput.fill('DI50_S');
        }
      } else if (type === 'label') {
        const labelInput = page.locator('#widget-config-overlay [name="label"]');
        if (await labelInput.isVisible()) {
          await labelInput.fill('Label Widget');
        }
      }

      await page.locator('#widget-config-apply').click();
      // Wait for widget to appear before adding next
      await expect(page.locator(`#dashboard-grid .dashboard-widget[data-type="${type}"]`)).toBeVisible({ timeout: 5000 });
    }

    const widgets = page.locator('#dashboard-grid .dashboard-widget');
    const count = await widgets.count();
    expect(count).toBe(3);
  });
});

test.describe('Dashboard — экспорт', () => {

  test('кнопка Export видна для дашборда', async ({ page }) => {
    await openServerDashboard(page);

    const exportBtn = page.locator('#dashboard-export-btn');
    await expect(exportBtn).toBeVisible();
  });

  test('кнопка Import видна', async ({ page }) => {
    await openServerDashboard(page);

    const importBtn = page.locator('#dashboard-import-btn');
    await expect(importBtn).toBeVisible();
  });
});
