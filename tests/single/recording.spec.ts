import { test, expect } from '@playwright/test';

// Проверка наличия CSS класса 'recording' через classList (а не substring в className)
async function hasRecordingClass(page) {
  return page.locator('#recording-status').evaluate(el => el.classList.contains('recording'));
}

test.describe('Recording', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Ждём инициализации recording UI (polling status)
    await page.waitForTimeout(2000);
  });

  test('секция Recording видна в header', async ({ page }) => {
    const recordingStatus = page.locator('#recording-status');
    await expect(recordingStatus).toBeVisible({ timeout: 10000 });
  });

  test('начальное состояние — не записывает', async ({ page }) => {
    const recordingStatus = page.locator('#recording-status');
    await expect(recordingStatus).toBeVisible({ timeout: 10000 });

    // Кнопка должна показывать "Record"
    const toggleBtn = page.locator('#recording-toggle-btn');
    await expect(toggleBtn).toHaveText('Record');

    // classList не содержит 'recording'
    const isRecording = await hasRecordingClass(page);
    expect(isRecording).toBe(false);
  });

  test('начало записи по клику на Record', async ({ page }) => {
    const recordingStatus = page.locator('#recording-status');
    await expect(recordingStatus).toBeVisible({ timeout: 10000 });

    const toggleBtn = page.locator('#recording-toggle-btn');

    // Кликаем Record
    await toggleBtn.click();

    // Ждём что кнопка станет "Stop"
    await expect(toggleBtn).toHaveText('Stop', { timeout: 5000 });

    // classList содержит 'recording'
    const isRecording = await hasRecordingClass(page);
    expect(isRecording).toBe(true);
  });

  test('остановка записи по клику на Stop', async ({ page }) => {
    const recordingStatus = page.locator('#recording-status');
    await expect(recordingStatus).toBeVisible({ timeout: 10000 });

    const toggleBtn = page.locator('#recording-toggle-btn');

    // Начинаем запись
    await toggleBtn.click();
    await expect(toggleBtn).toHaveText('Stop', { timeout: 5000 });

    // Останавливаем запись
    await toggleBtn.click();
    await expect(toggleBtn).toHaveText('Record', { timeout: 5000 });

    // Ждём обновления UI
    await page.waitForTimeout(500);

    const isRecording = await hasRecordingClass(page);
    expect(isRecording).toBe(false);
  });

  test('dropdown экспорта открывается по клику', async ({ page }) => {
    const recordingStatus = page.locator('#recording-status');
    await expect(recordingStatus).toBeVisible({ timeout: 10000 });

    const downloadBtn = page.locator('#recording-download-btn');
    const dropdownMenu = page.locator('#recording-dropdown-menu');

    // Меню скрыто
    await expect(dropdownMenu).toHaveClass(/hidden/);

    // Кликаем по кнопке download
    await downloadBtn.click();

    // Меню открылось
    await expect(dropdownMenu).not.toHaveClass(/hidden/);
  });

  test('dropdown содержит форматы экспорта', async ({ page }) => {
    const recordingStatus = page.locator('#recording-status');
    await expect(recordingStatus).toBeVisible({ timeout: 10000 });

    // Открываем dropdown
    await page.locator('#recording-download-btn').click();

    const dropdownMenu = page.locator('#recording-dropdown-menu');
    await expect(dropdownMenu).not.toHaveClass(/hidden/);

    // Проверяем форматы
    await expect(dropdownMenu.locator('[data-format="sqlite"]')).toBeVisible();
    await expect(dropdownMenu.locator('[data-format="csv"]')).toBeVisible();
    await expect(dropdownMenu.locator('[data-format="json"]')).toBeVisible();

    // Кнопка очистки
    await expect(dropdownMenu.locator('[data-action="clear"]')).toBeVisible();
  });

  test('badge показывает количество записей после записи', async ({ page }) => {
    const recordingStatus = page.locator('#recording-status');
    await expect(recordingStatus).toBeVisible({ timeout: 10000 });

    const toggleBtn = page.locator('#recording-toggle-btn');
    const badge = page.locator('#recording-badge');

    // Начинаем запись
    await toggleBtn.click();
    await expect(toggleBtn).toHaveText('Stop', { timeout: 5000 });

    // Badge виден при записи
    await expect(badge).toBeVisible();

    // Останавливаем
    await toggleBtn.click();
    await expect(toggleBtn).toHaveText('Record', { timeout: 5000 });
  });

  test('API /api/recording/status возвращает статус', async ({ request }) => {
    const response = await request.get('/api/recording/status');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('configured');
    expect(data.configured).toBe(true);
    expect(data).toHaveProperty('isRecording');
    expect(data).toHaveProperty('recordCount');
  });

  test('dropdown закрывается по клику вне его', async ({ page }) => {
    const recordingStatus = page.locator('#recording-status');
    await expect(recordingStatus).toBeVisible({ timeout: 10000 });

    // Открываем dropdown
    await page.locator('#recording-download-btn').click();
    const dropdownMenu = page.locator('#recording-dropdown-menu');
    await expect(dropdownMenu).not.toHaveClass(/hidden/);

    // Кликаем вне dropdown
    await page.locator('body').click();
    await expect(dropdownMenu).toHaveClass(/hidden/);
  });
});
