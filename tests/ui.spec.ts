import { test, expect } from '@playwright/test';

test.describe('UniSet2 Viewer UI', () => {

  test('should load main page with title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('UniSet2 Viewer');
    await expect(page.locator('h1')).toHaveText('UniSet2 Viewer');
  });

  test('should display objects list', async ({ page }) => {
    await page.goto('/');

    // Ждём загрузки списка объектов
    await expect(page.locator('#objects-list li')).toHaveCount(2, { timeout: 5000 });

    // Проверяем что TestProc в списке
    await expect(page.locator('#objects-list')).toContainText('TestProc');
  });

  test('should show placeholder when no object selected', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.placeholder')).toBeVisible();
    await expect(page.locator('.placeholder')).toContainText('Select an object');
  });

  test('should open object tab on click', async ({ page }) => {
    await page.goto('/');

    // Ждём загрузки списка
    await page.waitForSelector('#objects-list li');

    // Кликаем на TestProc
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    // Проверяем что открылась вкладка
    await expect(page.locator('.tab-btn', { hasText: 'TestProc' })).toBeVisible();
    await expect(page.locator('.tab-btn', { hasText: 'TestProc' })).toHaveClass(/active/);

    // Проверяем что placeholder исчез
    await expect(page.locator('.placeholder')).not.toBeVisible();
  });

  test('should display variables table', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li');
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    // Ждём загрузки переменных
    await page.waitForSelector('.variables-section tbody tr');

    // Проверяем наличие таблицы переменных
    await expect(page.locator('.variables-section h3')).toContainText('Variables');
    await expect(page.locator('.variables-section tbody tr')).not.toHaveCount(0);
  });

  test('should display inputs and outputs tables', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li');
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    // Ждём загрузки данных
    await page.waitForSelector('.io-section');

    // Проверяем секции Inputs и Outputs
    await expect(page.locator('.io-section h3', { hasText: 'Inputs' })).toBeVisible();
    await expect(page.locator('.io-section h3', { hasText: 'Outputs' })).toBeVisible();
  });

  test('should close tab on close button click', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li');
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    // Ждём появления вкладки
    await expect(page.locator('.tab-btn', { hasText: 'TestProc' })).toBeVisible();

    // Закрываем вкладку
    await page.locator('.tab-btn .close').click();

    // Проверяем что вкладка закрылась
    await expect(page.locator('.tab-btn', { hasText: 'TestProc' })).not.toBeVisible();
    await expect(page.locator('.placeholder')).toBeVisible();
  });

  test('should refresh objects list on button click', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li');
    const initialCount = await page.locator('#objects-list li').count();

    // Кликаем Refresh
    await page.locator('#refresh-objects').click();

    // После рефреша количество объектов должно остаться тем же
    await expect(page.locator('#objects-list li')).toHaveCount(initialCount);
  });

  test('should enable chart checkbox for variable', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li');
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    // Ждём загрузки переменных
    await page.waitForSelector('.variables-section tbody tr');

    // Находим первый чекбокс и кликаем
    const firstCheckbox = page.locator('.variables-section tbody tr:first-child input[type="checkbox"]');
    await firstCheckbox.check();

    // Проверяем что появился график
    await expect(page.locator('.chart-container')).toBeVisible({ timeout: 5000 });
  });

  test('should switch between multiple tabs', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li');

    // Открываем TestProc
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();
    await expect(page.locator('.tab-btn', { hasText: 'TestProc' })).toHaveClass(/active/);

    // Открываем UniSetActivator (если есть)
    const activator = page.locator('#objects-list li', { hasText: 'UniSetActivator' });
    if (await activator.isVisible()) {
      await activator.click();

      // Проверяем что появилась вторая вкладка
      await expect(page.locator('.tab-btn')).toHaveCount(2);
      await expect(page.locator('.tab-btn', { hasText: 'UniSetActivator' })).toHaveClass(/active/);

      // Переключаемся обратно на TestProc
      await page.locator('.tab-btn', { hasText: 'TestProc' }).click();
      await expect(page.locator('.tab-btn', { hasText: 'TestProc' })).toHaveClass(/active/);
    }
  });

});
