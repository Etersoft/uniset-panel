const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Console monitoring
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push({ time: Date.now(), text });
    console.log(`[Browser ${new Date().toISOString().slice(11, 23)}] ${text}`);
  });

  // Network monitoring for SSE and subscriptions
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/subscribe') || url.includes('/modbus/get')) {
      console.log(`\n[Network →] ${request.method()} ${url}`);
      if (request.postData()) {
        const data = request.postData();
        if (data.length < 500) {
          console.log(`[Network →] Data: ${data}`);
        } else {
          console.log(`[Network →] Data: ${data.substring(0, 200)}... (${data.length} bytes)`);
        }
      }
    }
  });

  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/subscribe') || url.includes('/modbus/get')) {
      console.log(`[Network ←] ${response.status()} ${url}`);
    }
  });

  try {
    console.log('\n=== ModbusSlave Pinned Sensor Update Debug ===\n');

    // 1. Navigate
    console.log('Step 1: Opening http://localhost:8000...');
    await page.goto('http://localhost:8000', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 2. Find ModbusSlave
    console.log('\nStep 2: Looking for MBSlave1 object...');
    await page.waitForSelector('#objects-list li', { timeout: 10000 });

    const mbsItem = await page.locator('#objects-list li').filter({ hasText: 'MBSlave1' }).first();
    if (await mbsItem.count() === 0) {
      console.error('❌ MBSlave1 not found!');
      await browser.close();
      process.exit(1);
    }

    console.log('✅ Found MBSlave1');
    await mbsItem.click();
    console.log('✅ Clicked on MBSlave1');

    // 3. Wait for registers to load
    console.log('\nStep 3: Waiting for registers table...');
    await page.waitForSelector('table.mb-registers-table tbody tr', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // 4. Get initial table state
    console.log('\nStep 4: Getting initial table state...');
    const initialState = await page.evaluate(() => {
      const tbody = document.querySelector('.mb-registers-table tbody');
      if (!tbody) return { error: 'No tbody' };

      const rows = tbody.querySelectorAll('tr');
      const firstRow = rows[0];

      return {
        totalRows: rows.length,
        firstRegId: firstRow?.getAttribute('data-sensor-id'),
        firstRegValue: firstRow?.querySelector('td:nth-child(6)')?.textContent?.trim()
      };
    });

    console.log(`Table state: ${initialState.totalRows} rows`);
    console.log(`First register: ID=${initialState.firstRegId}, Value=${initialState.firstRegValue}`);

    // 5. Pin the first register
    console.log('\nStep 5: Pinning first register...');
    const pinnedRegId = await page.evaluate(() => {
      const pinToggle = document.querySelector('.pin-toggle');
      if (!pinToggle) return null;

      const regId = pinToggle.getAttribute('data-id');
      pinToggle.click();
      return regId;
    });

    if (!pinnedRegId) {
      console.error('❌ Failed to pin register');
      await browser.close();
      process.exit(1);
    }

    console.log(`✅ Pinned register ID: ${pinnedRegId}`);
    await page.waitForTimeout(1000);

    // 6. Check that only pinned is shown
    console.log('\nStep 6: Verifying pinned-only display...');
    const pinnedState = await page.evaluate((expectedId) => {
      const tbody = document.querySelector('.mb-registers-table tbody');
      const rows = tbody.querySelectorAll('tr');

      return {
        visibleRows: rows.length,
        allPinned: Array.from(rows).every(row => {
          const toggle = row.querySelector('.pin-toggle');
          return toggle && toggle.classList.contains('pinned');
        }),
        firstRowId: rows[0]?.getAttribute('data-sensor-id'),
        firstRowValue: rows[0]?.querySelector('td:nth-child(6)')?.textContent?.trim()
      };
    }, pinnedRegId);

    console.log(`Visible rows after pinning: ${pinnedState.visibleRows}`);
    console.log(`All rows pinned: ${pinnedState.allPinned}`);
    console.log(`First row: ID=${pinnedState.firstRowId}, Value=${pinnedState.firstRowValue}`);

    if (pinnedState.visibleRows !== 1) {
      console.warn(`⚠️  Expected 1 visible row, got ${pinnedState.visibleRows}`);
    }

    // 7. Monitor updates
    console.log('\nStep 7: Monitoring SSE updates for 15 seconds...');
    console.log(`Watching register ID: ${pinnedRegId}`);

    const updates = [];
    let domUpdates = 0;

    // Set up mutation observer to catch DOM changes
    await page.evaluate((regId) => {
      window.pinnedUpdates = [];
      window.domUpdateCount = 0;

      const valueCell = document.querySelector(`tr[data-sensor-id="${regId}"] td:nth-child(6)`);
      if (valueCell) {
        console.log(`[Observer] Watching value cell for register ${regId}, initial value: ${valueCell.textContent}`);

        const observer = new MutationObserver((mutations) => {
          mutations.forEach(mutation => {
            if (mutation.type === 'characterData' || mutation.type === 'childList') {
              const newValue = valueCell.textContent;
              console.log(`[Observer] DOM UPDATE! New value: ${newValue}`);
              window.domUpdateCount++;
              window.pinnedUpdates.push({
                time: Date.now(),
                value: newValue,
                mutation: mutation.type
              });
            }
          });
        });

        observer.observe(valueCell, {
          characterData: true,
          childList: true,
          subtree: true
        });

        window.domObserver = observer;
      } else {
        console.error('[Observer] Value cell not found!');
      }

      // Also monitor handleModbusRegisterUpdates calls
      const tabKey = Array.from(window.state.tabs.keys())[0];
      const renderer = window.state.tabs.get(tabKey)?.renderer;
      if (renderer && renderer.handleModbusRegisterUpdates) {
        const original = renderer.handleModbusRegisterUpdates.bind(renderer);
        renderer.handleModbusRegisterUpdates = function(registers) {
          console.log(`[Handler] handleModbusRegisterUpdates called with ${registers.length} registers`);
          const pinnedReg = registers.find(r => r.id == regId);
          if (pinnedReg) {
            console.log(`[Handler] UPDATE for pinned register ${regId}: value=${pinnedReg.value}`);
          }
          return original(registers);
        };
      }
    }, pinnedRegId);

    // Wait and collect updates
    await page.waitForTimeout(15000);

    // 8. Collect results
    console.log('\nStep 8: Collecting results...');
    const finalState = await page.evaluate((regId) => {
      const valueCell = document.querySelector(`tr[data-sensor-id="${regId}"] td:nth-child(6)`);
      const currentValue = valueCell?.textContent?.trim();

      // Stop observer
      if (window.domObserver) {
        window.domObserver.disconnect();
      }

      return {
        currentValue,
        domUpdateCount: window.domUpdateCount || 0,
        pinnedUpdates: window.pinnedUpdates || []
      };
    }, pinnedRegId);

    console.log(`\nCurrent value in DOM: ${finalState.currentValue}`);
    console.log(`Total DOM updates detected: ${finalState.domUpdateCount}`);
    console.log(`Update details:`, finalState.pinnedUpdates);

    // 9. Analyze logs
    console.log('\n=== Log Analysis ===\n');

    const sseEvents = logs.filter(l =>
      l.text.includes('modbus_register_batch') || l.text.includes('[SSE]')
    );
    const handlerCalls = logs.filter(l => l.text.includes('[Handler]'));
    const observerLogs = logs.filter(l => l.text.includes('[Observer]'));

    console.log(`SSE events received: ${sseEvents.length}`);
    console.log(`Handler calls: ${handlerCalls.length}`);
    console.log(`Observer logs: ${observerLogs.length}`);

    if (handlerCalls.length > 0) {
      console.log('\nHandler calls:');
      handlerCalls.forEach(l => console.log(`  ${l.text}`));
    }

    if (observerLogs.length > 0) {
      console.log('\nObserver logs:');
      observerLogs.forEach(l => console.log(`  ${l.text}`));
    }

    // 10. Final verdict
    console.log('\n=== RESULTS ===\n');

    if (finalState.domUpdateCount === 0) {
      console.log('❌ PROBLEM: NO DOM UPDATES for pinned register!');
      if (handlerCalls.length > 0) {
        console.log('   Handler was called, but DOM was NOT updated');
        console.log('   This indicates a bug in batchRenderUpdates()');
      } else {
        console.log('   Handler was NOT called - SSE problem or no data changes');
      }
    } else {
      console.log(`✅ SUCCESS: ${finalState.domUpdateCount} DOM updates detected`);
      console.log('   Pinned sensor is updating correctly');
    }

    console.log('\n=== Browser will remain open for manual inspection ===');
    console.log('Press Ctrl+C to exit\n');

    // Keep alive
    await new Promise(() => {});

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    await browser.close();
    process.exit(1);
  }
})();
