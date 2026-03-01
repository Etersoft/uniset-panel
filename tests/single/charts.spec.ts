import { test, expect } from '@playwright/test';

const MB_OBJECT = 'MBTCPMaster1';

async function openMBTCPMaster(page) {
  await page.goto('/');
  await page.waitForSelector('.sidebar-group-item[data-type="object"]', { timeout: 15000 });
  await page.locator('.sidebar-group-item[data-type="object"]', { hasText: MB_OBJECT }).click();
  await page.waitForSelector('.tab-panel.active', { timeout: 10000 });
  await page.waitForSelector(`#mb-registers-tbody-${MB_OBJECT} tr`, { timeout: 10000 });
}

async function addFirstAIChart(page) {
  const aiRow = page.locator(`#mb-registers-tbody-${MB_OBJECT} tr`, { hasText: 'AI' }).first();
  await aiRow.locator('.chart-toggle-label').click();
  const chartsContainer = page.locator(`#charts-${MB_OBJECT}`);
  await expect(chartsContainer.locator('.chart-panel')).toHaveCount(1, { timeout: 5000 });
  return aiRow;
}

test.describe('Chart configuration and controls', () => {

  test.describe('Time range buttons', () => {
    test('should display all time range buttons', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('.sidebar-group-item[data-type="object"]', { timeout: 15000 });
      await page.locator('.sidebar-group-item[data-type="object"]', { hasText: 'TestProc' }).click();

      const activePanel = page.locator('.tab-panel.active');
      await activePanel.waitFor({ timeout: 10000 });

      const buttons = activePanel.locator('.time-range-btn');
      await expect(buttons).toHaveCount(6);

      await expect(activePanel.locator('.time-range-btn', { hasText: /^1m$/ })).toBeVisible();
      await expect(activePanel.locator('.time-range-btn', { hasText: /^3m$/ })).toBeVisible();
      await expect(activePanel.locator('.time-range-btn', { hasText: /^5m$/ })).toBeVisible();
      await expect(activePanel.locator('.time-range-btn', { hasText: /^15m$/ })).toBeVisible();
      await expect(activePanel.locator('.time-range-btn', { hasText: /^1h$/ })).toBeVisible();
      await expect(activePanel.locator('.time-range-btn', { hasText: /^3h$/ })).toBeVisible();
    });

    test('should switch active class on time range click', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('.sidebar-group-item[data-type="object"]', { timeout: 15000 });
      await page.locator('.sidebar-group-item[data-type="object"]', { hasText: 'TestProc' }).click();

      const activePanel = page.locator('.tab-panel.active');
      await activePanel.waitFor({ timeout: 10000 });

      // Click 1m
      await activePanel.locator('.time-range-btn', { hasText: /^1m$/ }).click();
      await expect(activePanel.locator('.time-range-btn', { hasText: /^1m$/ })).toHaveClass(/active/);
      await expect(activePanel.locator('.time-range-btn', { hasText: /^15m$/ })).not.toHaveClass(/active/);

      // Click 3h
      await activePanel.locator('.time-range-btn', { hasText: /^3h$/ }).click();
      await expect(activePanel.locator('.time-range-btn', { hasText: /^3h$/ })).toHaveClass(/active/);
      await expect(activePanel.locator('.time-range-btn', { hasText: /^1m$/ })).not.toHaveClass(/active/);
    });

    test('should only have one active time range button at a time', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('.sidebar-group-item[data-type="object"]', { timeout: 15000 });
      await page.locator('.sidebar-group-item[data-type="object"]', { hasText: 'TestProc' }).click();

      const activePanel = page.locator('.tab-panel.active');
      await activePanel.waitFor({ timeout: 10000 });

      // Click through several buttons
      const ranges = ['1m', '3m', '5m', '1h', '3h'];
      for (const range of ranges) {
        await activePanel.locator('.time-range-btn', { hasText: new RegExp(`^${range}$`) }).click();
        const activeCount = await activePanel.locator('.time-range-btn.active').count();
        expect(activeCount).toBe(1);
      }
    });

    test('should update global state timeRange', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('.sidebar-group-item[data-type="object"]', { timeout: 15000 });
      await page.locator('.sidebar-group-item[data-type="object"]', { hasText: 'TestProc' }).click();
      await page.locator('.tab-panel.active').waitFor({ timeout: 10000 });

      // Click on 1h (3600s)
      await page.locator('.tab-panel.active .time-range-btn', { hasText: /^1h$/ }).click();

      const timeRange = await page.evaluate(() => (window as any).state?.timeRange);
      expect(timeRange).toBe(3600);
    });
  });

  test.describe('Adding and removing charts', () => {
    test('should add chart via chart-toggle checkbox', async ({ page }) => {
      await openMBTCPMaster(page);

      const chartsContainer = page.locator(`#charts-${MB_OBJECT}`);
      await expect(chartsContainer.locator('.chart-panel')).toHaveCount(0);

      // Click chart toggle label on first AI row
      await addFirstAIChart(page);

      // Verify canvas exists inside chart panel
      await expect(chartsContainer.locator('.chart-panel canvas')).toHaveCount(1);
    });

    test('should remove chart via close button', async ({ page }) => {
      await openMBTCPMaster(page);
      await addFirstAIChart(page);

      const chartsContainer = page.locator(`#charts-${MB_OBJECT}`);
      await expect(chartsContainer.locator('.chart-panel')).toHaveCount(1);

      // Ждём полную инициализацию chart panel
      await page.waitForTimeout(500);

      // Click close button on chart panel (кнопка ✕)
      await chartsContainer.locator('.chart-panel .chart-remove-btn').first().click();
      await expect(chartsContainer.locator('.chart-panel')).toHaveCount(0, { timeout: 5000 });
    });

    test('should remove chart by unchecking toggle', async ({ page }) => {
      await openMBTCPMaster(page);

      const aiRow = page.locator(`#mb-registers-tbody-${MB_OBJECT} tr`, { hasText: 'AI' }).first();
      const chartLabel = aiRow.locator('.chart-toggle-label');

      // Add chart
      await chartLabel.click();
      const chartsContainer = page.locator(`#charts-${MB_OBJECT}`);
      await expect(chartsContainer.locator('.chart-panel')).toHaveCount(1);

      // Remove chart by clicking toggle again
      await chartLabel.click();
      await expect(chartsContainer.locator('.chart-panel')).toHaveCount(0);
    });

    test('should add multiple charts simultaneously', async ({ page }) => {
      await openMBTCPMaster(page);

      const rows = page.locator(`#mb-registers-tbody-${MB_OBJECT} tr`);

      // Add charts for first 3 registers
      for (let i = 0; i < 3; i++) {
        await rows.nth(i).locator('.chart-toggle-label').click();
        // Wait for chart to appear
        await page.waitForTimeout(500);
      }

      const chartsContainer = page.locator(`#charts-${MB_OBJECT}`);
      await expect(chartsContainer.locator('.chart-panel')).toHaveCount(3, { timeout: 5000 });

      // Each chart should have its own canvas
      await expect(chartsContainer.locator('.chart-panel canvas')).toHaveCount(3);
    });
  });

  test.describe('Chart panel controls', () => {
    test('should have fill checkbox checked by default', async ({ page }) => {
      await openMBTCPMaster(page);
      await addFirstAIChart(page);

      const chartsContainer = page.locator(`#charts-${MB_OBJECT}`);
      const fillCheckbox = chartsContainer.locator('.chart-panel .fill-toggle input[type="checkbox"]').first();
      await expect(fillCheckbox).toBeChecked();
    });

    test('should toggle fill mode on checkbox click', async ({ page }) => {
      await openMBTCPMaster(page);
      await addFirstAIChart(page);

      const chartsContainer = page.locator(`#charts-${MB_OBJECT}`);
      const fillLabel = chartsContainer.locator('.chart-panel .fill-toggle-label', { hasText: 'fill' }).first();
      const fillCheckbox = chartsContainer.locator('.chart-panel').first().locator('input[id^="fill-"]');

      // Initially checked
      await expect(fillCheckbox).toBeChecked();

      // Uncheck fill
      await fillLabel.click();
      await expect(fillCheckbox).not.toBeChecked();

      // Check fill again
      await fillLabel.click();
      await expect(fillCheckbox).toBeChecked();
    });

    test('should display chart legend with sensor name', async ({ page }) => {
      await openMBTCPMaster(page);
      await addFirstAIChart(page);

      const chartsContainer = page.locator(`#charts-${MB_OBJECT}`);
      const chartTitle = chartsContainer.locator('.chart-panel-title').first();
      await expect(chartTitle).toBeVisible();
      // Title should contain the sensor name
      const titleText = await chartTitle.textContent();
      expect(titleText.length).toBeGreaterThan(0);
    });

    test('should display value in chart legend', async ({ page }) => {
      await openMBTCPMaster(page);
      await addFirstAIChart(page);

      const chartsContainer = page.locator(`#charts-${MB_OBJECT}`);
      const legendValue = chartsContainer.locator('.chart-panel-value').first();
      await expect(legendValue).toBeVisible();
    });

    test('should display type badge in chart panel', async ({ page }) => {
      await openMBTCPMaster(page);
      await addFirstAIChart(page);

      const chartsContainer = page.locator(`#charts-${MB_OBJECT}`);
      const typeBadge = chartsContainer.locator('.chart-panel .type-badge').first();
      await expect(typeBadge).toBeVisible();
      await expect(typeBadge).toHaveText('AI');
    });
  });

  test.describe('Charts section', () => {
    test('should collapse and expand charts section', async ({ page }) => {
      await openMBTCPMaster(page);

      const chartsSection = page.locator(`.collapsible-section[data-section="charts-${MB_OBJECT}"]`);
      await expect(chartsSection).toBeVisible();

      // Click on icon to collapse (avoid child elements with stopPropagation)
      await chartsSection.locator('.collapsible-icon').click();
      await expect(chartsSection).toHaveClass(/collapsed/);

      // Click icon again to expand
      await chartsSection.locator('.collapsible-icon').click();
      await expect(chartsSection).not.toHaveClass(/collapsed/);
    });

    test('should have Add Sensor button in charts section', async ({ page }) => {
      await openMBTCPMaster(page);

      const addBtn = page.locator(`#add-sensor-btn-${MB_OBJECT}`);
      await expect(addBtn).toBeVisible();
      await expect(addBtn).toContainText('Sensor');
    });
  });
});
