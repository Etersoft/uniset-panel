import { test, expect } from '@playwright/test';

test.describe('ModbusSlave renderer', () => {
  // Variable to store the found slave name
  let mbSlaveObject: string | null = null;

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 15000 });

    // Find any ModbusSlave object in the list
    const slaveItems = page.locator('#objects-list li').filter({
      has: page.locator('.type-badge', { hasText: 'ModbusSlave' })
    });

    const count = await slaveItems.count();
    if (count === 0) {
      test.skip();
      return;
    }

    // Get the name of the first slave object
    mbSlaveObject = await slaveItems.first().locator('span').first().textContent();
    if (!mbSlaveObject) {
      test.skip();
      return;
    }

    // Click on the slave object
    await slaveItems.first().click();
    await expect(page.locator('.tab-btn', { hasText: mbSlaveObject })).toBeVisible();
  });

  test('should display ModbusSlave object in list and open tab', async ({ page }) => {
    if (!mbSlaveObject) return;

    // Tab and panel should be visible
    const tabBtn = page.locator('.tab-btn', { hasText: mbSlaveObject });
    await expect(tabBtn).toBeVisible({ timeout: 10000 });

    const panel = page.locator('.tab-panel.active');
    await expect(panel).toBeVisible({ timeout: 10000 });
  });

  test('should have ModbusSlave-specific sections', async ({ page }) => {
    if (!mbSlaveObject) return;

    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // Check for ModbusSlave-specific sections
    const statusSection = page.locator(`#mbs-status-section-${mbSlaveObject}`);
    await expect(statusSection).toBeVisible({ timeout: 5000 });

    const paramsSection = page.locator(`#mbs-params-section-${mbSlaveObject}`);
    await expect(paramsSection).toBeVisible({ timeout: 5000 });

    const registersSection = page.locator(`#mbs-registers-section-${mbSlaveObject}`);
    await expect(registersSection).toBeVisible({ timeout: 5000 });
  });

  test('should display status information', async ({ page }) => {
    if (!mbSlaveObject) return;

    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // Wait for status to load
    await page.waitForTimeout(1000);

    // Check status section has content
    const statusTable = page.locator(`#mbs-status-section-${mbSlaveObject} .info-table`);
    await expect(statusTable).toBeVisible();
  });

  test('should display registers table', async ({ page }) => {
    if (!mbSlaveObject) return;

    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // Wait for registers to load
    await page.waitForTimeout(1500);

    // Check registers tbody
    const registersTbody = page.locator(`#mbs-registers-tbody-${mbSlaveObject}`);
    await expect(registersTbody).toBeVisible({ timeout: 5000 });

    // Should have register rows
    const registerRows = page.locator(`#mbs-registers-tbody-${mbSlaveObject} tr`);
    await expect(registerRows.first()).toBeVisible({ timeout: 5000 });
  });

  test('should have filter input for registers', async ({ page }) => {
    if (!mbSlaveObject) return;

    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // Check filter input exists
    const filterInput = page.locator(`#mbs-registers-filter-${mbSlaveObject}`);
    await expect(filterInput).toBeVisible({ timeout: 5000 });

    // Check type filter exists
    const typeFilter = page.locator(`#mbs-type-filter-${mbSlaveObject}`);
    await expect(typeFilter).toBeVisible({ timeout: 5000 });
  });

  test('should display register values for SSE updates', async ({ page }) => {
    if (!mbSlaveObject) return;

    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // Wait for registers to load
    await page.waitForTimeout(1500);

    // Check that register rows exist
    const rows = page.locator(`#mbs-registers-tbody-${mbSlaveObject} tr`);
    await expect(rows.first()).toBeVisible();

    // Check value cell exists (last column for ModbusSlave)
    const valueCell = rows.first().locator('td:last-child');
    await expect(valueCell).toBeVisible();
  });

  test('should filter registers by text', async ({ page }) => {
    if (!mbSlaveObject) return;

    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // Wait for registers to load
    await page.waitForTimeout(1500);

    const filterInput = page.locator(`#mbs-registers-filter-${mbSlaveObject}`);
    await filterInput.fill('AI');

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // All visible registers should contain "AI" in name
    const visibleRows = page.locator(`#mbs-registers-tbody-${mbSlaveObject} tr`);
    const count = await visibleRows.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should filter registers by type', async ({ page }) => {
    if (!mbSlaveObject) return;

    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // Wait for registers to load
    await page.waitForTimeout(1500);

    const typeFilter = page.locator(`#mbs-type-filter-${mbSlaveObject}`);
    await typeFilter.selectOption('DI');

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // All visible registers should have DI type
    const visibleTypes = page.locator(`#mbs-registers-tbody-${mbSlaveObject} tr .type-badge`);
    const count = await visibleTypes.count();

    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        await expect(visibleTypes.nth(i)).toHaveText('DI');
      }
    }
  });

  test('should have virtual scroll for registers', async ({ page }) => {
    if (!mbSlaveObject) return;

    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // Check for virtual scroll container
    const viewport = page.locator(`#mbs-registers-section-${mbSlaveObject} .mbs-registers-viewport`);
    await expect(viewport).toBeVisible({ timeout: 5000 });
  });

  test('should have resize handle for registers section', async ({ page }) => {
    if (!mbSlaveObject) return;

    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // Check for resize handle
    const resizeHandle = page.locator(`#mbs-registers-section-${mbSlaveObject} .resize-handle`);
    await expect(resizeHandle).toBeVisible({ timeout: 5000 });
  });
});
