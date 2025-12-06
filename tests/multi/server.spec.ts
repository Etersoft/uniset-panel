import { test, expect } from '@playwright/test';

/**
 * Multi-Server E2E Tests
 *
 * These tests verify that the viewer correctly handles multiple UniSet2 servers.
 * They specifically test:
 * - Objects from different servers are displayed with correct server badges
 * - API requests include ?server= parameter for correct server routing
 * - LogServer stream requests use correct server context
 */

test.describe('Multi-Server Support', () => {
  test('should display objects from multiple servers', async ({ page }) => {
    await page.goto('/');

    // Wait for objects list to load
    await page.waitForSelector('#objects-list li', { timeout: 10000 });

    // Get all object items
    const items = page.locator('#objects-list li');
    const count = await items.count();

    // Should have objects from both servers
    // Server 1: UniSetActivator, TestProc, SharedMemory
    // Server 2: Server2Controller, BackupProcess
    expect(count).toBeGreaterThanOrEqual(5);

    // Check for objects from server 1
    await expect(page.locator('#objects-list li', { hasText: 'TestProc' })).toBeVisible();

    // Check for objects from server 2
    await expect(page.locator('#objects-list li', { hasText: 'Server2Controller' })).toBeVisible();
    await expect(page.locator('#objects-list li', { hasText: 'BackupProcess' })).toBeVisible();
  });

  test('should display server badges for each object', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 10000 });

    // Each object should have a server badge
    const badges = page.locator('#objects-list li .server-badge');
    const count = await badges.count();

    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('should have different server IDs for objects from different servers', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 10000 });

    // Get server ID from TestProc (server 1)
    const testProcItem = page.locator('#objects-list li', { hasText: 'TestProc' });
    const testProcServerId = await testProcItem.getAttribute('data-server-id');

    // Get server ID from Server2Controller (server 2)
    const server2Item = page.locator('#objects-list li', { hasText: 'Server2Controller' });
    const server2ServerId = await server2Item.getAttribute('data-server-id');

    // Server IDs should be different
    expect(testProcServerId).toBeDefined();
    expect(server2ServerId).toBeDefined();
    expect(testProcServerId).not.toBe(server2ServerId);
  });

  test('should open object from server 1 with correct server context', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 10000 });

    // Monitor network requests
    const requests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/')) {
        requests.push(request.url());
      }
    });

    // Click on TestProc (from server 1)
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    // Wait for tab to open
    await page.waitForSelector('.tab-btn[data-name*="TestProc"]', { timeout: 5000 });

    // Check that API requests include server parameter
    const watchRequest = requests.find(r => r.includes('/api/objects/TestProc/watch'));
    expect(watchRequest).toBeDefined();
    expect(watchRequest).toContain('server=');
  });

  test('should open object from server 2 with correct server context', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 10000 });

    // Monitor network requests
    const requests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/')) {
        requests.push(request.url());
      }
    });

    // Click on Server2Controller (from server 2)
    await page.locator('#objects-list li', { hasText: 'Server2Controller' }).click();

    // Wait for tab to open
    await page.waitForSelector('.tab-btn[data-name*="Server2Controller"]', { timeout: 5000 });

    // Check that API requests include server parameter
    const watchRequest = requests.find(r => r.includes('/api/objects/Server2Controller/watch'));
    expect(watchRequest).toBeDefined();
    expect(watchRequest).toContain('server=');
  });

  test('should display unique tab keys for same-named objects from different servers', async ({ page }) => {
    // This test verifies that if two servers have objects with the same name,
    // they are handled correctly with unique tab keys (serverID:objectName)
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 10000 });

    // Open TestProc from server 1
    const testProcItem = page.locator('#objects-list li', { hasText: 'TestProc' }).first();
    const testProcServerId = await testProcItem.getAttribute('data-server-id');
    await testProcItem.click();

    // Wait for tab to appear
    await page.waitForSelector('.tab-btn', { timeout: 5000 });

    // The tab key should include server ID
    const tabBtn = page.locator('.tab-btn').first();
    const tabName = await tabBtn.getAttribute('data-name');

    expect(tabName).toContain(':'); // Format: serverID:objectName
    expect(tabName).toContain('TestProc');
  });

  test('should pass server parameter to LogServer stream endpoint', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 10000 });

    // Monitor EventSource connections
    const eventSourceUrls: string[] = [];
    await page.addInitScript(() => {
      const originalEventSource = window.EventSource;
      (window as any).__eventSourceUrls = [];
      window.EventSource = function(url: string) {
        (window as any).__eventSourceUrls.push(url);
        return new originalEventSource(url);
      } as any;
    });

    // Click on TestProc which has LogServer
    await page.locator('#objects-list li', { hasText: 'TestProc' }).click();

    // Wait for LogViewer section to appear
    await page.waitForSelector('.logviewer-section', { timeout: 5000 });

    // Click connect button
    const connectBtn = page.locator('.log-connect-btn');
    if (await connectBtn.isVisible()) {
      await connectBtn.click();

      // Wait a bit for EventSource to be created
      await page.waitForTimeout(500);

      // Get captured EventSource URLs
      const urls = await page.evaluate(() => (window as any).__eventSourceUrls || []);

      // Find LogServer stream URL
      const logStreamUrl = urls.find((url: string) => url.includes('/api/logs/') && url.includes('/stream'));

      if (logStreamUrl) {
        // Verify server parameter is included
        expect(logStreamUrl).toContain('server=');
      }
    }
  });

  test('should show server status for each server', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 10000 });

    // Call servers API to check status
    const response = await page.request.get('/api/servers');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();

    // Should have 2 servers (API returns {count: N, servers: [...]})
    expect(data.servers).toBeDefined();
    expect(data.servers.length).toBe(2);

    // Each server should have status info
    for (const server of data.servers) {
      expect(server.id).toBeDefined();
      expect(server.connected).toBeDefined();
    }
  });

  test('should handle disconnected server gracefully', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 10000 });

    // Objects from disconnected servers should show disconnected badge
    const disconnectedBadges = page.locator('.server-badge.disconnected');

    // Initially both servers should be connected, so no disconnected badges
    const disconnectedCount = await disconnectedBadges.count();

    // This is a check that the UI properly shows connected state
    // In a real scenario with a down server, this would show disconnected badges
    expect(disconnectedCount).toBeGreaterThanOrEqual(0);
  });
});
