const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Console monitoring
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push({ time: Date.now(), text });
    if (text.includes('[Observer]') || text.includes('[Handler]') || text.includes('modbus_register_batch')) {
      console.log(`[Browser ${new Date().toISOString().slice(11, 23)}] ${text}`);
    }
  });

  // Network monitoring
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/subscribe') || url.includes('/modbus/get')) {
      console.log(`\n[Network →] ${request.method()} ${url}`);
    }
  });

  try {
    console.log('\n=== ModbusSlave Pinned Register Update Test with Value Changes ===\n');

    // 1. Navigate
    console.log('Step 1: Opening http://localhost:8000...');
    await page.goto('http://localhost:8000', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 2. Find ModbusSlave
    console.log('\nStep 2: Looking for MBSlave1...');
    await page.waitForSelector('#objects-list li', { timeout: 10000 });

    const mbsItem = await page.locator('#objects-list li').filter({ hasText: 'MBSlave1' }).first();
    if (await mbsItem.count() === 0) {
      console.error('❌ MBSlave1 not found!');
      await browser.close();
      process.exit(1);
    }

    console.log('✅ Found MBSlave1');
    await mbsItem.click();
    await page.waitForTimeout(500);

    // 3. Wait for registers table
    console.log('\nStep 3: Waiting for registers table...');
    await page.waitForSelector('table.mb-registers-table tbody tr', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // 4. Find register 70
    console.log('\nStep 4: Looking for register ID=70...');
    const reg70Exists = await page.evaluate(() => {
      const row = document.querySelector('tr[data-sensor-id="70"]');
      if (!row) return false;

      const valueCell = row.querySelector('td:nth-child(6)');
      return {
        exists: true,
        initialValue: valueCell?.textContent?.trim()
      };
    });

    if (!reg70Exists || !reg70Exists.exists) {
      console.error('❌ Register 70 not found in table!');
      console.log('Available registers:', await page.evaluate(() => {
        const rows = document.querySelectorAll('.mb-registers-table tbody tr');
        return Array.from(rows).slice(0, 10).map(r => r.getAttribute('data-sensor-id'));
      }));
      await browser.close();
      process.exit(1);
    }

    console.log(`✅ Found register 70, initial value: ${reg70Exists.initialValue}`);

    // 5. Pin register 70
    console.log('\nStep 5: Pinning register 70...');
    await page.evaluate(() => {
      const row = document.querySelector('tr[data-sensor-id="70"]');
      const pinToggle = row?.querySelector('.pin-toggle');
      if (pinToggle) {
        pinToggle.click();
      }
    });
    await page.waitForTimeout(1000);

    // 6. Verify only pinned is shown
    const pinnedState = await page.evaluate(() => {
      const tbody = document.querySelector('.mb-registers-table tbody');
      const rows = tbody.querySelectorAll('tr');
      return {
        visibleRows: rows.length,
        firstRowId: rows[0]?.getAttribute('data-sensor-id'),
        firstRowValue: rows[0]?.querySelector('td:nth-child(6)')?.textContent?.trim()
      };
    });

    console.log(`\nAfter pinning: ${pinnedState.visibleRows} visible rows`);
    console.log(`First row: ID=${pinnedState.firstRowId}, Value=${pinnedState.firstRowValue}`);

    if (pinnedState.visibleRows !== 1 || pinnedState.firstRowId !== '70') {
      console.warn(`⚠️  Expected 1 row with ID=70, got ${pinnedState.visibleRows} rows, first ID=${pinnedState.firstRowId}`);
    }

    // 7. Set up DOM mutation observer
    console.log('\nStep 7: Setting up DOM observer...');
    await page.evaluate(() => {
      window.valueChanges = [];
      window.sseEvents = [];

      const valueCell = document.querySelector('tr[data-sensor-id="70"] td:nth-child(6)');
      if (valueCell) {
        console.log(`[Observer] Watching register 70 value cell, initial: ${valueCell.textContent}`);

        const observer = new MutationObserver((mutations) => {
          mutations.forEach(mutation => {
            const newValue = valueCell.textContent;
            console.log(`[Observer] ✅ DOM UPDATED! New value: ${newValue}`);
            window.valueChanges.push({
              time: Date.now(),
              value: newValue,
              mutation: mutation.type
            });
          });
        });

        observer.observe(valueCell, {
          characterData: true,
          childList: true,
          subtree: true
        });
      }

      // Intercept handleModbusRegisterUpdates
      const tabKey = Array.from(window.state.tabs.keys())[0];
      const renderer = window.state.tabs.get(tabKey)?.renderer;
      if (renderer && renderer.handleModbusRegisterUpdates) {
        const original = renderer.handleModbusRegisterUpdates.bind(renderer);
        renderer.handleModbusRegisterUpdates = function(registers) {
          console.log(`[Handler] handleModbusRegisterUpdates called with ${registers.length} registers`);
          const reg70 = registers.find(r => r.id == 70);
          if (reg70) {
            console.log(`[Handler] ✅ UPDATE for register 70: value=${reg70.value}`);
            window.sseEvents.push({ time: Date.now(), value: reg70.value });
          }
          return original(registers);
        };
      }
    });

    // 8. Start changing values
    console.log('\nStep 8: Starting value changes (10 iterations, 2 sec interval)...');
    console.log('Will change register 70 values: 100 → 200 → 300 → ...\n');

    const changeProcess = spawn('bash', ['-c', `
      for i in {1..10}; do
        value=$((100 + i * 100))
        echo "[Change $i/10] Setting register 70 = $value"
        uniset2-mbtcptest -i localhost -p 2048 --write06 1 70 $value 2>&1 | head -1
        sleep 2
      done
    `]);

    changeProcess.stdout.on('data', (data) => {
      console.log(`${data.toString().trim()}`);
    });

    changeProcess.stderr.on('data', (data) => {
      console.error(`[Change Error] ${data.toString().trim()}`);
    });

    // 9. Monitor for 25 seconds
    await page.waitForTimeout(25000);

    // 10. Collect results
    console.log('\n\nStep 9: Collecting results...');
    const results = await page.evaluate(() => {
      const valueCell = document.querySelector('tr[data-sensor-id="70"] td:nth-child(6)');
      return {
        finalValue: valueCell?.textContent?.trim(),
        domUpdates: window.valueChanges || [],
        sseEvents: window.sseEvents || []
      };
    });

    console.log(`\n=== RESULTS ===\n`);
    console.log(`Final value in DOM: ${results.finalValue}`);
    console.log(`Total DOM updates: ${results.domUpdates.length}`);
    console.log(`Total SSE events for reg 70: ${results.sseEvents.length}`);

    if (results.domUpdates.length > 0) {
      console.log('\nDOM Updates:');
      results.domUpdates.forEach((upd, i) => {
        console.log(`  ${i + 1}. Value: ${upd.value}`);
      });
    }

    if (results.sseEvents.length > 0) {
      console.log('\nSSE Events:');
      results.sseEvents.forEach((evt, i) => {
        console.log(`  ${i + 1}. Value: ${evt.value}`);
      });
    }

    // 11. Verdict
    console.log('\n=== VERDICT ===\n');

    if (results.domUpdates.length === 0) {
      console.log('❌ PROBLEM CONFIRMED: Pinned register does NOT update in DOM!');
      if (results.sseEvents.length > 0) {
        console.log('   - SSE events ARE received by handler');
        console.log('   - BUT DOM is NOT updated');
        console.log('   - This indicates a BUG in batchRenderUpdates()');
      } else {
        console.log('   - SSE events are NOT received');
        console.log('   - Problem may be in backend poller or subscription');
      }
    } else {
      console.log(`✅ SUCCESS: Pinned register updates correctly!`);
      console.log(`   - Received ${results.domUpdates.length} DOM updates`);
      console.log(`   - Received ${results.sseEvents.length} SSE events`);
    }

    // Analyze console logs
    const sseEventLogs = logs.filter(l =>
      l.text.includes('modbus_register_batch') || l.text.includes('[SSE]')
    );
    console.log(`\nTotal SSE event logs: ${sseEventLogs.length}`);

    console.log('\n=== Browser will remain open for inspection ===');
    console.log('Press Ctrl+C to exit\n');

    // Cleanup
    changeProcess.kill();

    // Keep alive
    await new Promise(() => {});

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    await browser.close();
    process.exit(1);
  }
})();
