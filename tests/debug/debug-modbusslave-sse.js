const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture ALL console logs
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    console.log(`[Browser] ${text}`);
  });

  // Track network
  const requests = [];
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/subscribe') || url.includes('/get')) {
      requests.push({
        url,
        method: request.method(),
        postData: request.postData()
      });
      console.log(`\n[Network →] ${request.method()} ${url}`);
      if (request.postData()) {
        console.log(`[Network →] Data: ${request.postData()}`);
      }
    }
  });

  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/subscribe') || url.includes('/get')) {
      console.log(`[Network ←] ${response.status()} ${url}`);
    }
  });

  try {
    console.log('\n=== ModbusSlave SSE Debug Test ===\n');

    // Navigate
    console.log('1. Navigating to http://localhost:8000...');
    await page.goto('http://localhost:8000', { waitUntil: 'domcontentloaded' });

    // Wait for objects
    console.log('2. Waiting for objects list...');
    await page.waitForSelector('#objects-list li', { timeout: 10000 });

    // Find ModbusSlave
    console.log('3. Looking for ModbusSlave (MBSlave1 or MBTCPSlave1)...');
    const mbsItem = await page.locator('#objects-list li').filter({ hasText: /MBSlave1|MBTCPSlave1/ }).first();

    if (await mbsItem.count() === 0) {
      console.error('❌ ModbusSlave not found!');
      await browser.close();
      process.exit(1);
    }

    const objectName = await mbsItem.textContent();
    console.log(`4. Found: ${objectName}`);
    console.log('5. Clicking...');
    await mbsItem.click();

    // Wait for table
    console.log('6. Waiting for registers table...');
    await page.waitForSelector('.registers-table', { timeout: 10000 });

    // Wait for subscription
    console.log('7. Waiting 3 seconds for subscription...');
    await page.waitForTimeout(3000);

    // Inspect renderer
    console.log('\n=== Renderer State ===\n');
    const state = await page.evaluate(() => {
      const tabKey = Array.from(window.state.tabs.keys())[0];
      const tab = window.state.tabs.get(tabKey);
      if (!tab || !tab.renderer) return { error: 'No renderer' };

      const r = tab.renderer;
      return {
        type: r.constructor.name,
        hasHandleModbusRegisterUpdates: typeof r.handleModbusRegisterUpdates === 'function',
        hasBatchRenderUpdates: typeof r.batchRenderUpdates === 'function',
        subscribedIds: r.subscribedSensorIds ? r.subscribedSensorIds.size : 0,
        allRegistersCount: r.allRegisters ? r.allRegisters.length : 0,
        pendingUpdates: r.pendingUpdates ? r.pendingUpdates.length : 0
      };
    });

    console.log('Renderer:', JSON.stringify(state, null, 2));

    // Check table structure
    console.log('\n=== Table Structure ===\n');
    const tableInfo = await page.evaluate(() => {
      const tbody = document.querySelector('.registers-table tbody');
      if (!tbody) return { error: 'No tbody' };

      const rows = tbody.querySelectorAll('tr');
      const firstRow = rows[0];
      if (!firstRow) return { error: 'No rows' };

      const cells = firstRow.querySelectorAll('td');
      return {
        rowCount: rows.length,
        cellCount: cells.length,
        hasDataSensorId: firstRow.hasAttribute('data-sensor-id'),
        dataSensorId: firstRow.getAttribute('data-sensor-id'),
        cellContents: Array.from(cells).map((cell, i) => ({
          index: i + 1,
          text: cell.textContent.trim().substring(0, 20)
        }))
      };
    });

    console.log('Table:', JSON.stringify(tableInfo, null, 2));

    // Analyze logs
    console.log('\n=== Console Logs Analysis ===\n');

    const subscriptionLogs = consoleLogs.filter(l =>
      l.includes('подписка') || l.includes('subscribe')
    );
    const sseLogs = consoleLogs.filter(l =>
      l.includes('[SSE]') || l.includes('modbus_register_batch')
    );
    const updateLogs = consoleLogs.filter(l =>
      l.includes('[ModbusSlave]')
    );

    console.log(`Subscription logs (${subscriptionLogs.length}):`);
    subscriptionLogs.forEach(l => console.log(`  ${l}`));

    console.log(`\nSSE event logs (${sseLogs.length}):`);
    sseLogs.forEach(l => console.log(`  ${l}`));

    console.log(`\nModbusSlave logs (${updateLogs.length}):`);
    updateLogs.forEach(l => console.log(`  ${l}`));

    console.log(`\n=== Network Requests (${requests.length}) ===\n`);
    requests.forEach(r => {
      console.log(`  ${r.method} ${r.url}`);
      if (r.postData) console.log(`    Data: ${r.postData.substring(0, 100)}...`);
    });

    // Results
    console.log('\n=== Results ===\n');

    if (state.hasHandleModbusRegisterUpdates) {
      console.log('✅ Renderer has handleModbusRegisterUpdates');
    } else {
      console.log('❌ Missing handleModbusRegisterUpdates');
    }

    if (state.hasBatchRenderUpdates) {
      console.log('✅ Renderer has batchRenderUpdates');
    } else {
      console.log('❌ Missing batchRenderUpdates');
    }

    if (state.subscribedIds > 0) {
      console.log(`✅ Subscription succeeded: ${state.subscribedIds} registers`);
    } else {
      console.log('❌ No registers subscribed');
    }

    if (tableInfo.hasDataSensorId) {
      console.log('✅ Table rows have data-sensor-id attribute');
    } else {
      console.log('❌ Table rows missing data-sensor-id');
    }

    if (sseLogs.length > 0) {
      console.log(`✅ SSE events received: ${sseLogs.length}`);
    } else {
      console.log('⚠️  No SSE events (backend may not be emitting)');
    }

    console.log('\n=== Keep browser open for manual inspection ===');
    console.log('Press Ctrl+C to exit');

    // Keep alive
    await new Promise(() => {});

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await browser.close();
    process.exit(1);
  }
})();
