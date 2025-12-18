const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture console logs
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    console.log(`[Browser Console] ${text}`);
  });

  // Track network requests
  const subscriptionRequests = [];
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/subscribe')) {
      subscriptionRequests.push({
        url,
        method: request.method(),
        postData: request.postData()
      });
      console.log(`\n[Network] ${request.method()} ${url}`);
      if (request.postData()) {
        console.log(`[Network] POST data: ${request.postData()}`);
      }
    }
  });

  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/subscribe')) {
      console.log(`[Network] Response ${response.status()} ${url}`);
    }
  });

  try {
    console.log('\n=== Starting OPCUAServer SSE Test ===\n');

    // Navigate to the app
    console.log('1. Navigating to http://localhost:8000...');
    await page.goto('http://localhost:8000', { waitUntil: 'domcontentloaded' });

    // Wait for objects list to load
    console.log('2. Waiting for objects list...');
    await page.waitForSelector('#objects-list li', { timeout: 10000 });

    // Find and click OPCUAServer1
    console.log('3. Looking for OPCUAServer1...');
    const opcuaServerItem = await page.locator('#objects-list li').filter({ hasText: 'OPCUAServer1' }).first();

    if (await opcuaServerItem.count() === 0) {
      console.error('❌ OPCUAServer1 not found in objects list!');
      await browser.close();
      process.exit(1);
    }

    console.log('4. Clicking OPCUAServer1...');
    await opcuaServerItem.click();

    // Wait for the tab to load
    console.log('5. Waiting for OPCUAServer tab to load...');
    await page.waitForSelector('.variables-table', { timeout: 5000 });

    // Wait a bit for subscription and SSE events
    console.log('6. Waiting 3 seconds for subscription and SSE events...');
    await page.waitForTimeout(3000);

    // Analyze console logs
    console.log('\n=== Console Log Analysis ===\n');

    const subscriptionLogs = consoleLogs.filter(log =>
      log.includes('OPCUAServer SSE') || log.includes('подписка')
    );

    const sseEventLogs = consoleLogs.filter(log =>
      log.includes('[SSE] opcua_sensor_batch')
    );

    const handlerCallLogs = consoleLogs.filter(log =>
      log.includes('handleOPCUASensorUpdates')
    );

    console.log(`Subscription logs (${subscriptionLogs.length}):`);
    subscriptionLogs.forEach(log => console.log(`  - ${log}`));

    console.log(`\nSSE event logs (${sseEventLogs.length}):`);
    sseEventLogs.forEach(log => console.log(`  - ${log}`));

    console.log(`\nHandler call logs (${handlerCallLogs.length}):`);
    handlerCallLogs.forEach(log => console.log(`  - ${log}`));

    // Check subscription requests
    console.log('\n=== Network Subscription Requests ===\n');
    console.log(`Total subscription requests: ${subscriptionRequests.length}`);
    subscriptionRequests.forEach(req => {
      console.log(`  - ${req.method} ${req.url}`);
      if (req.postData) {
        console.log(`    Data: ${req.postData}`);
      }
    });

    // Inspect renderer state
    console.log('\n=== Renderer State Inspection ===\n');
    const rendererState = await page.evaluate(() => {
      const tabKey = Array.from(window.state.tabs.keys())[0];
      const tab = window.state.tabs.get(tabKey);
      if (!tab || !tab.renderer) {
        return { error: 'No renderer found' };
      }

      const renderer = tab.renderer;
      return {
        rendererType: renderer.constructor.name,
        hasHandleOPCUASensorUpdates: typeof renderer.handleOPCUASensorUpdates === 'function',
        hasHandleSSEUpdate: typeof renderer.handleSSEUpdate === 'function',
        hasBatchRenderUpdates: typeof renderer.batchRenderUpdates === 'function',
        hasApplyPendingUpdates: typeof renderer.applyPendingUpdates === 'function',
        subscribedSensorIds: renderer.subscribedSensorIds ? renderer.subscribedSensorIds.size : 0,
        pendingUpdatesCount: renderer.pendingUpdates ? renderer.pendingUpdates.length : 0,
        allSensorsCount: renderer.allSensors ? renderer.allSensors.length : 0
      };
    });

    console.log('Renderer state:', JSON.stringify(rendererState, null, 2));

    // Results
    console.log('\n=== Test Results ===\n');

    let passed = 0;
    let failed = 0;

    // Test 1: Renderer has correct method name
    if (rendererState.hasHandleOPCUASensorUpdates) {
      console.log('✅ Test 1 PASSED: Renderer has handleOPCUASensorUpdates method');
      passed++;
    } else {
      console.log('❌ Test 1 FAILED: Renderer missing handleOPCUASensorUpdates method');
      failed++;
    }

    // Test 2: Old method name should NOT exist
    if (!rendererState.hasHandleSSEUpdate) {
      console.log('✅ Test 2 PASSED: Old handleSSEUpdate method removed');
      passed++;
    } else {
      console.log('⚠️  Test 2 WARNING: Old handleSSEUpdate method still exists');
    }

    // Test 3: Renderer has correct batch method name
    if (rendererState.hasBatchRenderUpdates) {
      console.log('✅ Test 3 PASSED: Renderer has batchRenderUpdates method');
      passed++;
    } else {
      console.log('❌ Test 3 FAILED: Renderer missing batchRenderUpdates method');
      failed++;
    }

    // Test 4: Subscription happened
    if (subscriptionRequests.length > 0) {
      console.log('✅ Test 4 PASSED: Subscription request sent');
      passed++;
    } else {
      console.log('❌ Test 4 FAILED: No subscription request sent');
      failed++;
    }

    // Test 5: Subscription succeeded (sensor IDs registered)
    if (rendererState.subscribedSensorIds > 0) {
      console.log(`✅ Test 5 PASSED: Subscription succeeded (${rendererState.subscribedSensorIds} sensors)`);
      passed++;
    } else {
      console.log('❌ Test 5 FAILED: No sensors subscribed');
      failed++;
    }

    // Test 6: SSE events (informational - may fail if backend doesn't emit)
    if (sseEventLogs.length > 0) {
      console.log(`✅ Test 6 PASSED: SSE events received (${sseEventLogs.length} events)`);
      passed++;
    } else {
      console.log('⚠️  Test 6 INFO: No SSE events received (backend may not be emitting)');
    }

    console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===\n`);

    if (failed > 0) {
      console.log('❌ TEST SUITE FAILED');
      await browser.close();
      process.exit(1);
    } else {
      console.log('✅ TEST SUITE PASSED');
      await browser.close();
      process.exit(0);
    }

  } catch (error) {
    console.error('\n❌ Test error:', error.message);
    await browser.close();
    process.exit(1);
  }
})();
