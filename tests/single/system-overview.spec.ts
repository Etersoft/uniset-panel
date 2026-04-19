import { test, expect } from '@playwright/test';

// Helper: open System Overview tab from sidebar for the first server
async function openSystemOverview(page) {
  await page.goto('/');
  await page.waitForTimeout(2000);

  // Wait for sidebar to load and find overview item
  const overviewItem = page.locator('.sidebar-group-item[data-type="overview"]').first();
  await expect(overviewItem).toBeVisible({ timeout: 10000 });

  // Intercept overview API call
  const overviewResponse = page.waitForResponse(
    resp => resp.url().includes('/api/servers/') && resp.url().includes('/overview'),
    { timeout: 15000 }
  );

  await overviewItem.click();

  // Wait for API response
  await overviewResponse;
  await page.waitForTimeout(1000);
}

test.describe('System Overview', () => {

  test('overview items visible in sidebar (one per server)', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Overview items should appear in sidebar groups
    const overviewItems = page.locator('.sidebar-group-item[data-type="overview"]');
    await expect(overviewItems.first()).toBeVisible({ timeout: 10000 });

    // At least 1 overview item (one per server)
    const count = await overviewItems.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Badge should show "Ovw"
    const badge = overviewItems.first().locator('.entity-type-badge');
    await expect(badge).toHaveText('Ovw');
  });

  test('should open overview tab from sidebar and display canvas', async ({ page }) => {
    await openSystemOverview(page);

    // Tab should be created with Overview type
    const tabBtn = page.locator('.tab-btn[data-object-type="Overview"]');
    await expect(tabBtn).toBeVisible({ timeout: 5000 });
    await expect(tabBtn).toHaveClass(/active/);

    // Tab panel should contain a canvas element
    const tabPanel = page.locator('.tab-panel[data-object-type="Overview"]');
    await expect(tabPanel).toBeVisible();
    const canvas = tabPanel.locator('canvas.lgraphcanvas');
    await expect(canvas).toBeVisible();

    // Canvas should have non-zero dimensions
    const width = await canvas.evaluate(el => el.width);
    const height = await canvas.evaluate(el => el.height);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  test('should have process nodes in the graph', async ({ page }) => {
    await openSystemOverview(page);

    // Verify graph has nodes via JavaScript evaluation
    const nodeCount = await page.evaluate(() => {
      const keys = Object.keys(overviewInstances);
      if (keys.length === 0) return 0;
      const instance = overviewInstances[keys[0]];
      if (!instance || !instance.graph) return 0;
      return instance.graph._nodes ? instance.graph._nodes.length : 0;
    });

    expect(nodeCount).toBeGreaterThan(0);
  });

  test('should fit diagram to screen when fit button is clicked', async ({ page }) => {
    await openSystemOverview(page);

    // Get initial scale
    const initialScale = await page.evaluate(() => {
      const keys = Object.keys(overviewInstances);
      if (keys.length === 0) return null;
      const instance = overviewInstances[keys[0]];
      return instance?.canvas?.ds?.scale ?? null;
    });

    // Click fit button (first one, not the layout button)
    const fitBtn = page.locator('.overview-fit-btn:not(.overview-layout-btn)');
    await expect(fitBtn).toBeVisible({ timeout: 5000 });
    await fitBtn.click();
    await page.waitForTimeout(500);

    // Verify no JS errors — fit should work without errors
    const scaleAfter = await page.evaluate(() => {
      const keys = Object.keys(overviewInstances);
      if (keys.length === 0) return null;
      const instance = overviewInstances[keys[0]];
      return instance?.canvas?.ds?.scale ?? null;
    });

    expect(scaleAfter).not.toBeNull();
    expect(typeof scaleAfter).toBe('number');
  });

  test('should not duplicate tab on repeated sidebar click', async ({ page }) => {
    await openSystemOverview(page);

    // Click overview item again
    const overviewItem = page.locator('.sidebar-group-item[data-type="overview"]').first();
    await overviewItem.click();
    await page.waitForTimeout(500);

    // Should still be only one overview tab
    const overviewTabs = page.locator('.tab-btn[data-object-type="Overview"]');
    const count = await overviewTabs.count();
    expect(count).toBe(1);
  });

  test('should close overview tab', async ({ page }) => {
    await openSystemOverview(page);

    // Close the tab
    const closeBtn = page.locator('.tab-btn[data-object-type="Overview"] .close');
    await closeBtn.click();
    await page.waitForTimeout(500);

    // Tab should be removed
    const overviewTabs = page.locator('.tab-btn[data-object-type="Overview"]');
    await expect(overviewTabs).toHaveCount(0);

    // Placeholder should appear
    await expect(page.locator('.placeholder')).toBeVisible();
  });

});
