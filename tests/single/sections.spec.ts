import { test, expect } from '@playwright/test';

const TEST_OBJECT = 'TestProc';

async function openTestProc(page) {
  await page.goto('/');
  await page.waitForSelector('.sidebar-group-item[data-type="object"]', { timeout: 15000 });
  await page.locator('.sidebar-group-item[data-type="object"]', { hasText: TEST_OBJECT }).click();
  await page.waitForSelector('.tab-panel.active', { timeout: 10000 });
  // Wait for sections to render
  await page.waitForSelector('.reorderable-section', { timeout: 10000 });
}

test.describe('Section collapse/expand', () => {

  test('should collapse section on header click', async ({ page }) => {
    await openTestProc(page);

    const section = page.locator(`.collapsible-section[data-section="charts-${TEST_OBJECT}"]`);
    await expect(section).toBeVisible();
    await expect(section).not.toHaveClass(/collapsed/);

    // Click on title text to collapse (avoid child elements with stopPropagation)
    await section.locator('.collapsible-icon').click();
    await expect(section).toHaveClass(/collapsed/);
  });

  test('should expand section on second header click', async ({ page }) => {
    await openTestProc(page);

    const section = page.locator(`.collapsible-section[data-section="charts-${TEST_OBJECT}"]`);

    // Collapse
    await section.locator('.collapsible-icon').click();
    await expect(section).toHaveClass(/collapsed/);

    // Expand
    await section.locator('.collapsible-icon').click();
    await expect(section).not.toHaveClass(/collapsed/);
  });

  test('should persist collapsed state in localStorage', async ({ page }) => {
    await openTestProc(page);

    const section = page.locator(`.collapsible-section[data-section="charts-${TEST_OBJECT}"]`);

    // Collapse section (click on icon to avoid child stopPropagation)
    await section.locator('.collapsible-icon').click();
    await expect(section).toHaveClass(/collapsed/);

    // Verify localStorage has the collapsed state
    const collapsed = await page.evaluate((objectName) => {
      const saved = localStorage.getItem('uniset-panel-collapsed');
      if (!saved) return null;
      return JSON.parse(saved)[`charts-${objectName}`];
    }, TEST_OBJECT);
    expect(collapsed).toBe(true);
  });

  test('should restore collapsed state after reload', async ({ page }) => {
    await openTestProc(page);

    const section = page.locator(`.collapsible-section[data-section="charts-${TEST_OBJECT}"]`);

    // Collapse section
    await section.locator('.collapsible-icon').click();
    await expect(section).toHaveClass(/collapsed/);

    // Reload page and reopen object
    await openTestProc(page);

    // Section should still be collapsed
    const sectionAfterReload = page.locator(`.collapsible-section[data-section="charts-${TEST_OBJECT}"]`);
    await expect(sectionAfterReload).toHaveClass(/collapsed/);

    // Clean up
    await page.evaluate(() => localStorage.removeItem('uniset-panel-collapsed'));
  });

  test('should collapse multiple sections independently', async ({ page }) => {
    await openTestProc(page);

    const sections = page.locator('.collapsible-section[data-section]');
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Collapse first two sections
    const first = sections.nth(0);
    const second = sections.nth(1);

    await first.locator('.collapsible-icon').click();
    await expect(first).toHaveClass(/collapsed/);
    await expect(second).not.toHaveClass(/collapsed/);

    await second.locator('.collapsible-icon').click();
    await expect(first).toHaveClass(/collapsed/);
    await expect(second).toHaveClass(/collapsed/);
  });
});

test.describe('Section reordering', () => {

  test('should have reorder buttons on sections', async ({ page }) => {
    await openTestProc(page);

    const sections = page.locator('.tab-panel.active .reorderable-section');
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Each section should have up/down buttons
    const upButtons = page.locator('.tab-panel.active .section-move-up');
    const downButtons = page.locator('.tab-panel.active .section-move-down');
    await expect(upButtons.first()).toBeVisible();
    await expect(downButtons.first()).toBeVisible();
  });

  test('should change section order on move down click', async ({ page }) => {
    await openTestProc(page);

    const sections = page.locator('.tab-panel.active .reorderable-section[data-section-id]');
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Get initial order
    const initialOrder = await sections.evaluateAll(els =>
      els.map(el => el.getAttribute('data-section-id'))
    );

    // Click move down on first section
    const firstDownBtn = sections.first().locator('.section-move-down');
    await firstDownBtn.click();

    // Get new order
    const newOrder = await page.locator('.tab-panel.active .reorderable-section[data-section-id]').evaluateAll(els =>
      els.map(el => el.getAttribute('data-section-id'))
    );

    // First and second should be swapped
    expect(newOrder[0]).toBe(initialOrder[1]);
    expect(newOrder[1]).toBe(initialOrder[0]);
  });

  test('should change section order on move up click', async ({ page }) => {
    await openTestProc(page);

    const sections = page.locator('.tab-panel.active .reorderable-section[data-section-id]');
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Get initial order
    const initialOrder = await sections.evaluateAll(els =>
      els.map(el => el.getAttribute('data-section-id'))
    );

    // Click move up on second section
    const secondUpBtn = sections.nth(1).locator('.section-move-up');
    await secondUpBtn.click();

    // Get new order
    const newOrder = await page.locator('.tab-panel.active .reorderable-section[data-section-id]').evaluateAll(els =>
      els.map(el => el.getAttribute('data-section-id'))
    );

    // First and second should be swapped
    expect(newOrder[0]).toBe(initialOrder[1]);
    expect(newOrder[1]).toBe(initialOrder[0]);
  });

  test('should persist section order in localStorage', async ({ page }) => {
    await openTestProc(page);

    const sections = page.locator('.tab-panel.active .reorderable-section[data-section-id]');

    // Click move down on first section
    await sections.first().locator('.section-move-down').click();

    // Check localStorage
    const saved = await page.evaluate(() => {
      const data = localStorage.getItem('uniset-panel-section-order');
      return data ? JSON.parse(data) : null;
    });

    expect(saved).not.toBeNull();
    // Should have at least one key
    const keys = Object.keys(saved);
    expect(keys.length).toBeGreaterThanOrEqual(1);

    // Clean up
    await page.evaluate(() => localStorage.removeItem('uniset-panel-section-order'));
  });

  test('should restore section order after reload', async ({ page }) => {
    await openTestProc(page);

    const sections = page.locator('.tab-panel.active .reorderable-section[data-section-id]');

    // Get initial order
    const initialOrder = await sections.evaluateAll(els =>
      els.map(el => el.getAttribute('data-section-id'))
    );

    // Move first section down
    await sections.first().locator('.section-move-down').click();

    // Verify order changed
    const changedOrder = await page.locator('.tab-panel.active .reorderable-section[data-section-id]').evaluateAll(els =>
      els.map(el => el.getAttribute('data-section-id'))
    );
    expect(changedOrder[0]).toBe(initialOrder[1]);

    // Reload and reopen
    await openTestProc(page);

    // Order should be preserved
    const restoredOrder = await page.locator('.tab-panel.active .reorderable-section[data-section-id]').evaluateAll(els =>
      els.map(el => el.getAttribute('data-section-id'))
    );
    expect(restoredOrder[0]).toBe(initialOrder[1]);
    expect(restoredOrder[1]).toBe(initialOrder[0]);

    // Clean up
    await page.evaluate(() => localStorage.removeItem('uniset-panel-section-order'));
  });
});

test.describe('IO layout toggle', () => {

  test('should have Sequential checkbox for IO section', async ({ page }) => {
    await openTestProc(page);

    const checkbox = page.locator(`#io-sequential-${TEST_OBJECT}`);
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();
  });

  test('should toggle IO layout to sequential mode', async ({ page }) => {
    await openTestProc(page);

    const checkbox = page.locator(`#io-sequential-${TEST_OBJECT}`);
    const ioGrid = page.locator(`#io-grid-${TEST_OBJECT}`);

    // Initially not sequential
    await expect(ioGrid).not.toHaveClass(/io-sequential/);

    // Check the checkbox
    await checkbox.check();
    await expect(ioGrid).toHaveClass(/io-sequential/);

    // Uncheck
    await checkbox.uncheck();
    await expect(ioGrid).not.toHaveClass(/io-sequential/);
  });

  test('should persist IO layout state in localStorage', async ({ page }) => {
    await openTestProc(page);

    const checkbox = page.locator(`#io-sequential-${TEST_OBJECT}`);

    // Enable sequential mode
    await checkbox.check();

    // Check localStorage
    const saved = await page.evaluate((objectName) => {
      const data = localStorage.getItem('uniset-panel-io-layout');
      if (!data) return null;
      return JSON.parse(data)[objectName];
    }, TEST_OBJECT);
    expect(saved).toBe(true);

    // Clean up
    await page.evaluate(() => localStorage.removeItem('uniset-panel-io-layout'));
  });
});
