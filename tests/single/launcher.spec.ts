import { test, expect } from '@playwright/test';

// Хелпер: открыть launcher-вкладку из sidebar
async function openLauncher(page: any) {
  await page.goto('/');

  // Launcher может быть в sidebar-группах или в отдельной секции
  const groupItem = page.locator('.sidebar-group-item[data-type="launcher"]');
  const sidebarItem = page.locator('.launcher-sidebar-item');

  // Ждём загрузки sidebar
  await page.waitForTimeout(1000);

  if (await groupItem.count() > 0) {
    await groupItem.first().click();
  } else if (await sidebarItem.count() > 0) {
    await sidebarItem.first().click();
  } else {
    throw new Error('No launcher items found in sidebar');
  }

  // Ждём загрузки таблицы процессов
  await page.waitForSelector('.launcher-table', { timeout: 10000 });
}

// Хелпер: открыть launcher и взять контроль
async function openLauncherWithControl(page: any) {
  await openLauncher(page);
  const takeBtn = page.locator('.launcher-control-btn', { hasText: 'Take' });
  await expect(takeBtn).toBeVisible({ timeout: 5000 });
  await takeBtn.click();
  await expect(page.locator('.launcher-bulk-btn').first()).toBeVisible({ timeout: 5000 });
}

test.describe('Launcher', () => {

  test('should display launcher tab with process table', async ({ page }) => {
    await openLauncher(page);

    const rows = page.locator('.launcher-table tbody tr');
    await expect(rows.first()).toBeVisible();
  });

  test('should show Take button when control token is configured', async ({ page }) => {
    await openLauncher(page);
    await expect(page.locator('.launcher-control-btn', { hasText: 'Take' })).toBeVisible();
  });

  test('should show bulk buttons after taking control', async ({ page }) => {
    await openLauncherWithControl(page);

    await expect(page.locator('.launcher-bulk-stop').first()).toBeVisible();
    await expect(page.locator('.launcher-bulk-start').first()).toBeVisible();
    await expect(page.locator('.launcher-bulk-restart').first()).toBeVisible();
    await expect(page.locator('.launcher-bulk-reload').first()).toBeVisible();
  });

  test('should have correct button order: Stop, Start, Restart, Reload', async ({ page }) => {
    await openLauncherWithControl(page);

    const buttons = page.locator('.launcher-actions-header').first().locator('.launcher-bulk-btn');
    await expect(buttons).toHaveCount(4);
    await expect(buttons.nth(0)).toHaveText('Stop');
    await expect(buttons.nth(1)).toHaveText('Start');
    await expect(buttons.nth(2)).toHaveText('Restart');
    await expect(buttons.nth(3)).toHaveText('Reload');
  });

  test('should hide bulk buttons when control is released', async ({ page }) => {
    await openLauncherWithControl(page);

    await page.locator('.launcher-control-btn', { hasText: 'Release' }).click();

    await expect(page.locator('.launcher-bulk-btn')).toHaveCount(0);
  });
});

test.describe('Launcher Stop All', () => {

  test('should show confirmation dialog', async ({ page }) => {
    await openLauncherWithControl(page);

    await page.locator('.launcher-bulk-stop').first().click();

    const overlay = page.locator('#confirm-dialog-overlay');
    await expect(overlay).not.toHaveClass(/hidden/, { timeout: 3000 });
    await expect(page.locator('#confirm-dialog-message')).toContainText('Stop ALL processes');

    // Отменяем
    await page.locator('#confirm-dialog-cancel').click();
    await expect(overlay).toHaveClass(/hidden/);
  });

  test('should stop running processes via backend', async ({ page }) => {
    await openLauncherWithControl(page);

    // Запоминаем состояние до
    const runningBefore = await page.locator('.launcher-state-running').count();
    // Может не быть running если предыдущие тесты уже остановили; пропускаем
    test.skip(runningBefore === 0, 'No running processes to stop');

    // Кликаем Stop и подтверждаем
    await page.locator('.launcher-bulk-stop').first().click();
    await expect(page.locator('#confirm-dialog-overlay')).not.toHaveClass(/hidden/, { timeout: 3000 });
    await page.locator('#confirm-dialog-ok').click();

    // Ждём уменьшения количества running-процессов
    await expect(async () => {
      const running = await page.locator('.launcher-state-running').count();
      expect(running).toBeLessThan(runningBefore);
    }).toPass({ timeout: 15000 });
  });

  test('should not stop manual processes', async ({ page }) => {
    await openLauncherWithControl(page);

    // Проверяем, что ManualService виден и running
    const manualRow = page.locator('tr', { hasText: 'ManualService' });
    await expect(manualRow).toBeVisible();
    await expect(manualRow.locator('.launcher-state-running')).toBeVisible();

    // Stop All
    await page.locator('.launcher-bulk-stop').first().click();
    await expect(page.locator('#confirm-dialog-overlay')).not.toHaveClass(/hidden/, { timeout: 3000 });
    await page.locator('#confirm-dialog-ok').click();

    // Ждём пока обычные процессы остановятся (таблица обновится через 5с авто-рефреш)
    await page.waitForTimeout(7000);

    // ManualService должен остаться running
    await expect(manualRow.locator('.launcher-state-running')).toBeVisible();
  });
});

test.describe('Launcher Start All', () => {

  test('should show confirmation dialog', async ({ page }) => {
    await openLauncherWithControl(page);

    await page.locator('.launcher-bulk-start').first().click();

    const overlay = page.locator('#confirm-dialog-overlay');
    await expect(overlay).not.toHaveClass(/hidden/, { timeout: 3000 });
    await expect(page.locator('#confirm-dialog-message')).toContainText('Start ALL processes');

    // Отменяем
    await page.locator('#confirm-dialog-cancel').click();
    await expect(overlay).toHaveClass(/hidden/);
  });

  test('should start stopped processes via backend', async ({ page }) => {
    await openLauncherWithControl(page);

    // Запоминаем состояние до
    const stoppedBefore = await page.locator('.launcher-state-stopped').count();
    // Может не быть stopped если предыдущие тесты уже запустили; пропускаем
    test.skip(stoppedBefore === 0, 'No stopped processes to start');

    // Кликаем Start и подтверждаем
    await page.locator('.launcher-bulk-start').first().click();
    await expect(page.locator('#confirm-dialog-overlay')).not.toHaveClass(/hidden/, { timeout: 3000 });
    await page.locator('#confirm-dialog-ok').click();

    // Ждём уменьшения количества stopped-процессов
    await expect(async () => {
      const stopped = await page.locator('.launcher-state-stopped').count();
      expect(stopped).toBeLessThan(stoppedBefore);
    }).toPass({ timeout: 15000 });
  });

  test('should not start skipped processes', async ({ page }) => {
    await openLauncherWithControl(page);

    // Проверяем, что SkippedService виден и stopped
    const skippedRow = page.locator('tr', { hasText: 'SkippedService' });
    await expect(skippedRow).toBeVisible();
    await expect(skippedRow.locator('.launcher-state-stopped')).toBeVisible();

    // Start All
    await page.locator('.launcher-bulk-start').first().click();
    await expect(page.locator('#confirm-dialog-overlay')).not.toHaveClass(/hidden/, { timeout: 3000 });
    await page.locator('#confirm-dialog-ok').click();

    // Ждём пока обычные процессы запустятся
    await page.waitForTimeout(7000);

    // SkippedService должен остаться stopped
    await expect(skippedRow.locator('.launcher-state-stopped')).toBeVisible();
  });
});
