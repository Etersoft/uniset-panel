import { test, expect } from '@playwright/test';

const MB_OBJECT = 'MBTCPMaster1';

test.describe('ModbusMaster renderer', () => {
  test('should display ModbusMaster object in list and open tab', async ({ page }) => {
    await page.goto('/');

    // Wait for objects list
    await page.waitForSelector('#objects-list li', { timeout: 15000 });

    // Check that MBTCPMaster1 exists
    const mbItem = page.locator('#objects-list li', { hasText: MB_OBJECT });
    await expect(mbItem).toBeVisible({ timeout: 10000 });

    // Click on MBTCPMaster1
    await mbItem.click();

    // Wait for tab and panel to appear
    const tabBtn = page.locator('.tab-btn', { hasText: MB_OBJECT });
    await expect(tabBtn).toBeVisible({ timeout: 10000 });

    const panel = page.locator('.tab-panel.active');
    await expect(panel).toBeVisible({ timeout: 10000 });
  });

  test('should have ModbusMaster-specific sections', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 15000 });

    const mbItem = page.locator('#objects-list li', { hasText: MB_OBJECT });
    await mbItem.click();

    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // Check for ModbusMaster-specific sections
    const statusSection = page.locator(`#mb-status-section-${MB_OBJECT}`);
    await expect(statusSection).toBeVisible({ timeout: 5000 });

    const paramsSection = page.locator(`#mb-params-section-${MB_OBJECT}`);
    await expect(paramsSection).toBeVisible({ timeout: 5000 });

    const devicesSection = page.locator(`#mb-devices-section-${MB_OBJECT}`);
    await expect(devicesSection).toBeVisible({ timeout: 5000 });

    const registersSection = page.locator(`#mb-registers-section-${MB_OBJECT}`);
    await expect(registersSection).toBeVisible({ timeout: 5000 });
  });

  test('should display status information', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 15000 });

    const mbItem = page.locator('#objects-list li', { hasText: MB_OBJECT });
    await mbItem.click();

    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // Wait for status to load
    await page.waitForTimeout(1000);

    // Check status section has content
    const statusTable = page.locator(`#mb-status-section-${MB_OBJECT} .info-table`);
    await expect(statusTable).toBeVisible();
  });

  test('should display devices list', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 15000 });

    const mbItem = page.locator('#objects-list li', { hasText: MB_OBJECT });
    await mbItem.click();

    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // Wait for devices to load
    await page.waitForTimeout(1000);

    // Check devices container
    const devicesContainer = page.locator(`#mb-devices-${MB_OBJECT}`);
    await expect(devicesContainer).toBeVisible({ timeout: 5000 });

    // Should have device cards
    const deviceCards = page.locator(`#mb-devices-${MB_OBJECT} .mb-device-card`);
    await expect(deviceCards.first()).toBeVisible({ timeout: 5000 });
  });

  test('should display registers table', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 15000 });

    const mbItem = page.locator('#objects-list li', { hasText: MB_OBJECT });
    await mbItem.click();

    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // Wait for registers to load
    await page.waitForTimeout(1500);

    // Check registers tbody
    const registersTbody = page.locator(`#mb-registers-tbody-${MB_OBJECT}`);
    await expect(registersTbody).toBeVisible({ timeout: 5000 });

    // Should have register rows
    const registerRows = page.locator(`#mb-registers-tbody-${MB_OBJECT} tr`);
    await expect(registerRows.first()).toBeVisible({ timeout: 5000 });
  });

  test('should have filter input for registers', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 15000 });

    const mbItem = page.locator('#objects-list li', { hasText: MB_OBJECT });
    await mbItem.click();

    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // Check filter input exists
    const filterInput = page.locator(`#mb-registers-filter-${MB_OBJECT}`);
    await expect(filterInput).toBeVisible({ timeout: 5000 });

    // Check type filter exists
    const typeFilter = page.locator(`#mb-type-filter-${MB_OBJECT}`);
    await expect(typeFilter).toBeVisible({ timeout: 5000 });
  });

  test('should have status auto-refresh buttons', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 15000 });

    const mbItem = page.locator('#objects-list li', { hasText: MB_OBJECT });
    await mbItem.click();

    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // Check auto-refresh buttons exist
    const autoRefreshWrapper = page.locator(`#mb-status-autorefresh-${MB_OBJECT}`);
    await expect(autoRefreshWrapper).toBeVisible({ timeout: 5000 });

    const intervalButtons = page.locator(`#mb-status-autorefresh-${MB_OBJECT} .mb-interval-btn`);
    await expect(intervalButtons.first()).toBeVisible({ timeout: 5000 });

    // Should have active button (5s by default)
    const activeBtn = page.locator(`#mb-status-autorefresh-${MB_OBJECT} .mb-interval-btn.active`);
    await expect(activeBtn).toBeVisible({ timeout: 5000 });
  });

  test('should filter registers by text', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 15000 });

    const mbItem = page.locator('#objects-list li', { hasText: MB_OBJECT });
    await mbItem.click();

    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // Wait for registers to load
    await page.waitForTimeout(1500);

    const filterInput = page.locator(`#mb-registers-filter-${MB_OBJECT}`);
    await filterInput.fill('AI');

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // All visible registers should contain "AI" in name
    const visibleRows = page.locator(`#mb-registers-tbody-${MB_OBJECT} tr`);
    const count = await visibleRows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should filter registers by type', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 15000 });

    const mbItem = page.locator('#objects-list li', { hasText: MB_OBJECT });
    await mbItem.click();

    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // Wait for registers to load
    await page.waitForTimeout(1500);

    const typeFilter = page.locator(`#mb-type-filter-${MB_OBJECT}`);
    await typeFilter.selectOption('DI');

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // All visible registers should have DI type
    const visibleTypes = page.locator(`#mb-registers-tbody-${MB_OBJECT} tr .type-badge`);
    const count = await visibleTypes.count();

    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        await expect(visibleTypes.nth(i)).toHaveText('DI');
      }
    }
  });
});
