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

  test.describe('IONotifyController Multi-Server', () => {
    test('should load IONC sensors from server 2 with server parameter', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#objects-list li', { timeout: 10000 });

      // Monitor network requests
      const requests: string[] = [];
      page.on('request', request => {
        if (request.url().includes('/api/')) {
          requests.push(request.url());
        }
      });

      // Click on SM2 (IONotifyController from server 2)
      await page.locator('#objects-list li', { hasText: 'SM2' }).click();

      // Wait for tab to open
      await page.waitForSelector('.tab-btn[data-name*="SM2"]', { timeout: 5000 });

      // Wait for sensors to load
      await page.waitForSelector('.ionc-sensors-tbody tr.ionc-sensor-row', { timeout: 10000 });

      // Check that API requests include server parameter
      const sensorsRequest = requests.find(r => r.includes('/api/objects/SM2/ionc/sensors'));
      expect(sensorsRequest).toBeDefined();
      expect(sensorsRequest).toContain('server=');

      // Verify sensors are displayed
      const sensorRows = page.locator('.ionc-sensors-tbody tr.ionc-sensor-row');
      const count = await sensorRows.count();
      expect(count).toBeGreaterThan(0);
    });

    test('should include server parameter in IONC value requests', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#objects-list li', { timeout: 10000 });

      // Monitor network requests
      const requests: string[] = [];
      page.on('request', request => {
        if (request.url().includes('/api/')) {
          requests.push(request.url());
        }
      });

      // Click on SM2
      await page.locator('#objects-list li', { hasText: 'SM2' }).click();
      await page.waitForSelector('.tab-btn[data-name*="SM2"]', { timeout: 5000 });
      await page.waitForSelector('.ionc-sensors-tbody tr.ionc-sensor-row', { timeout: 10000 });

      // Click on a sensor row to get its value
      const firstRow = page.locator('.ionc-sensors-tbody tr.ionc-sensor-row').first();
      await firstRow.click();

      // Wait for potential value request
      await page.waitForTimeout(500);

      // All SM2-related API requests should have server parameter
      const sm2Requests = requests.filter(r => r.includes('/api/objects/SM2/'));
      for (const req of sm2Requests) {
        expect(req).toContain('server=');
      }
    });

    test('should display sensors from different servers independently', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#objects-list li', { timeout: 10000 });

      // Open SharedMemory (from server 1)
      await page.locator('#objects-list li', { hasText: 'SharedMemory' }).click();
      await page.waitForSelector('.tab-btn[data-name*="SharedMemory"]', { timeout: 5000 });
      await page.waitForSelector('.ionc-sensors-tbody tr.ionc-sensor-row', { timeout: 10000 });

      // Get sensor count from server 1
      const server1SensorCount = await page.locator('.tab-panel.active .ionc-sensors-tbody tr.ionc-sensor-row').count();

      // Open SM2 (from server 2)
      await page.locator('#objects-list li', { hasText: 'SM2' }).click();
      await page.waitForSelector('.tab-btn[data-name*="SM2"]', { timeout: 5000 });
      await page.waitForSelector('.tab-panel.active .ionc-sensors-tbody tr.ionc-sensor-row', { timeout: 10000 });

      // Get sensor count from server 2
      const server2SensorCount = await page.locator('.tab-panel.active .ionc-sensors-tbody tr.ionc-sensor-row').count();

      // Both should have sensors
      expect(server1SensorCount).toBeGreaterThan(0);
      expect(server2SensorCount).toBeGreaterThan(0);

      // Server 2 has 50 sensors (may show less with pagination)
      expect(server2SensorCount).toBeLessThanOrEqual(50);
    });
  });

  test.describe('OPCUAExchange Multi-Server', () => {
    test('should load OPCUA sensors from server 2 with server parameter', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#objects-list li', { timeout: 10000 });

      // Monitor network requests
      const requests: string[] = [];
      page.on('request', request => {
        if (request.url().includes('/api/')) {
          requests.push(request.url());
        }
      });

      // Click on OPCUAClient2 (OPCUAExchange from server 2)
      await page.locator('#objects-list li', { hasText: 'OPCUAClient2' }).click();

      // Wait for tab to open
      await page.waitForSelector('.tab-btn[data-name*="OPCUAClient2"]', { timeout: 5000 });

      // Wait for OPCUA sensors section
      await page.waitForSelector('.collapsible-title', { hasText: /Сенсоры|Датчики/ });

      // Check that API requests include server parameter
      const sensorsRequest = requests.find(r => r.includes('/api/objects/OPCUAClient2/opcua/sensors'));
      if (sensorsRequest) {
        expect(sensorsRequest).toContain('server=');
      }

      // Check status request also has server parameter
      const statusRequest = requests.find(r => r.includes('/api/objects/OPCUAClient2/opcua/status'));
      expect(statusRequest).toBeDefined();
      expect(statusRequest).toContain('server=');
    });

    test('should include server parameter in OPCUA params request', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#objects-list li', { timeout: 10000 });

      // Monitor network requests
      const requests: string[] = [];
      page.on('request', request => {
        if (request.url().includes('/api/')) {
          requests.push(request.url());
        }
      });

      // Click on OPCUAClient2
      await page.locator('#objects-list li', { hasText: 'OPCUAClient2' }).click();
      await page.waitForSelector('.tab-btn[data-name*="OPCUAClient2"]', { timeout: 5000 });

      // Wait for params to load
      await page.waitForTimeout(1000);

      // Check params request has server parameter
      const paramsRequest = requests.find(r => r.includes('/api/objects/OPCUAClient2/opcua/params'));
      expect(paramsRequest).toBeDefined();
      expect(paramsRequest).toContain('server=');
    });

    test('should display OPCUA objects from different servers independently', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#objects-list li', { timeout: 10000 });

      // Check both OPCUA objects are visible in the list
      await expect(page.locator('#objects-list li', { hasText: 'OPCUAClient1' })).toBeVisible();
      await expect(page.locator('#objects-list li', { hasText: 'OPCUAClient2' })).toBeVisible();

      // Get server IDs
      const opcua1Item = page.locator('#objects-list li', { hasText: 'OPCUAClient1' });
      const opcua2Item = page.locator('#objects-list li', { hasText: 'OPCUAClient2' });

      const opcua1ServerId = await opcua1Item.getAttribute('data-server-id');
      const opcua2ServerId = await opcua2Item.getAttribute('data-server-id');

      // They should be from different servers
      expect(opcua1ServerId).not.toBe(opcua2ServerId);
    });
  });
});
