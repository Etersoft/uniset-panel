import { test, expect } from '@playwright/test';

// Test objects for each renderer type (names must match mock-server objects)
const TEST_OBJECTS = {
  ModbusMaster: 'MBTCPMaster1',
  ModbusSlave: 'MBTCPSlave1',
  OPCUAExchange: 'OPCUAClient1',
  OPCUAServer: 'OPCUAServer1',
};

// Section IDs where status controls are located
const STATUS_SECTION_IDS = {
  ModbusMaster: 'mb-status-section',
  ModbusSlave: 'mbs-status-section',
  OPCUAExchange: 'opcua-status-section',
  OPCUAServer: 'opcuasrv-status-section',
};

// Status timestamp element ID prefixes
const STATUS_LAST_PREFIXES = {
  ModbusMaster: 'modbusmaster-status-last',
  ModbusSlave: 'modbusslave-status-last',
  OPCUAExchange: 'opcuaexchange-status-last',
  OPCUAServer: 'opcuaserver-status-last',
};

// Helper function to open object tab and wait for status section
async function openObjectAndWaitForStatus(page: any, objectName: string, sectionId: string) {
  await page.goto('/');
  await page.waitForSelector('#objects-list li', { timeout: 15000 });

  const item = page.locator('#objects-list li', { hasText: objectName });
  await item.click();
  await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

  // Wait for status section to be visible
  const statusSection = page.locator(`#${sectionId}-${objectName}`);
  await expect(statusSection).toBeVisible({ timeout: 10000 });

  // Wait a bit for status to load
  await page.waitForTimeout(1000);
}

test.describe('Status Auto-Refresh', () => {
  test.describe('ModbusMaster', () => {
    const objectName = TEST_OBJECTS.ModbusMaster;
    const sectionId = STATUS_SECTION_IDS.ModbusMaster;
    const lastPrefix = STATUS_LAST_PREFIXES.ModbusMaster;

    test('should show relative time after 5 seconds', async ({ page }) => {
      await openObjectAndWaitForStatus(page, objectName, sectionId);

      // Wait for 6 seconds (text appears after 5s)
      await page.waitForTimeout(6000);

      const lastUpdate = page.locator(`#${lastPrefix}-${objectName}`);
      const text = await lastUpdate.textContent();

      // Should have relative time format "Updated Xs ago"
      expect(text).toMatch(/Updated \d+[smh] ago/);
    });
  });

  test.describe('ModbusSlave', () => {
    const objectName = TEST_OBJECTS.ModbusSlave;
    const sectionId = STATUS_SECTION_IDS.ModbusSlave;
    const lastPrefix = STATUS_LAST_PREFIXES.ModbusSlave;

    test('should show relative time after 5 seconds', async ({ page }) => {
      await openObjectAndWaitForStatus(page, objectName, sectionId);

      await page.waitForTimeout(6000);

      const lastUpdate = page.locator(`#${lastPrefix}-${objectName}`);
      const text = await lastUpdate.textContent();
      expect(text).toMatch(/Updated \d+[smh] ago/);
    });
  });

  test.describe('OPCUAExchange', () => {
    const objectName = TEST_OBJECTS.OPCUAExchange;
    const sectionId = STATUS_SECTION_IDS.OPCUAExchange;
    const lastPrefix = STATUS_LAST_PREFIXES.OPCUAExchange;

    test('should show relative time after 5 seconds', async ({ page }) => {
      await openObjectAndWaitForStatus(page, objectName, sectionId);

      await page.waitForTimeout(6000);

      const lastUpdate = page.locator(`#${lastPrefix}-${objectName}`);
      const text = await lastUpdate.textContent();
      expect(text).toMatch(/Updated \d+[smh] ago/);
    });
  });

  test.describe('OPCUAServer', () => {
    const objectName = TEST_OBJECTS.OPCUAServer;
    const sectionId = STATUS_SECTION_IDS.OPCUAServer;
    const lastPrefix = STATUS_LAST_PREFIXES.OPCUAServer;

    test('should show relative time after 5 seconds', async ({ page }) => {
      await openObjectAndWaitForStatus(page, objectName, sectionId);

      await page.waitForTimeout(6000);

      const lastUpdate = page.locator(`#${lastPrefix}-${objectName}`);
      const text = await lastUpdate.textContent();
      expect(text).toMatch(/Updated \d+[smh] ago/);
    });
  });

  test.describe('Global poll interval', () => {
    test('should use poll interval from header', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#objects-list li', { timeout: 15000 });

      // Check poll interval selector exists in header
      const pollSelector = page.locator('#poll-interval-selector');
      await expect(pollSelector).toBeVisible();

      // Check interval buttons exist
      const pollButtons = page.locator('.poll-btn');
      const count = await pollButtons.count();
      expect(count).toBeGreaterThanOrEqual(5);
    });

    test('should have active poll interval button', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#objects-list li', { timeout: 15000 });

      // One button should be active
      const activeBtn = page.locator('.poll-btn.active');
      await expect(activeBtn).toBeVisible();
    });

    test('should change poll interval on button click', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#objects-list li', { timeout: 15000 });

      // Click 10s button
      const btn10s = page.locator('.poll-btn[data-interval="10000"]');
      await btn10s.click();

      // Should be active
      await expect(btn10s).toHaveClass(/active/);

      // Check localStorage
      const storedValue = await page.evaluate(() => localStorage.getItem('pollInterval'));
      expect(storedValue).toBe('10000');
    });
  });
});
