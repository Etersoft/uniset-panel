const { chromium } = require('@playwright/test');
const { exec } = require('child_process');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Observer]') || text.includes('[Handler]')) {
      console.log(`[Browser] ${text}`);
    }
  });

  try {
    console.log('\n=== Final Test: Pinned Register Updates ===\n');

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    const mbsItem = await page.locator('#objects-list li').filter({ hasText: 'MBSlave1' }).first();
    await mbsItem.click();
    await page.waitForSelector('table.mb-registers-table tbody tr', { timeout: 15000 });
    await page.waitForTimeout(2000);

    console.log('Step 1: Pinning register 70...');
    await page.evaluate(() => {
      const row = document.querySelector('tr[data-sensor-id="70"]');
      row?.querySelector('.pin-toggle')?.click();
    });
    await page.waitForTimeout(1000);

    const initialValue = await page.evaluate(() => {
      return document.querySelector('tr[data-sensor-id="70"] td:nth-child(6)')?.textContent;
    });
    console.log(`Initial value: ${initialValue}`);

    // Setup observer
    await page.evaluate(() => {
      window.updates = [];
      const cell = document.querySelector('tr[data-sensor-id="70"] td:nth-child(6)');
      const observer = new MutationObserver(() => {
        const val = cell.textContent;
        console.log(`[Observer] Value changed to: ${val}`);
        window.updates.push({ time: Date.now(), value: val });
      });
      observer.observe(cell, { characterData: true, childList: true, subtree: true });
    });

    console.log('\nStep 2: Changing register 70 value to 12345...');
    exec('uniset2-mbtcptest -i localhost -p 2048 --write06 1 70 12345 2>&1', (err, stdout) => {
      if (!err) console.log('[Change] Success');
    });

    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
      const cell = document.querySelector('tr[data-sensor-id="70"] td:nth-child(6)');
      return {
        finalValue: cell?.textContent,
        updates: window.updates || []
      };
    });

    console.log(`\nFinal value: ${result.finalValue}`);
    console.log(`DOM updates: ${result.updates.length}`);

    if (result.updates.length > 0) {
      console.log('\n✅ SUCCESS: Pinned register updates correctly!');
      result.updates.forEach((u, i) => console.log(`  Update ${i+1}: ${u.value}`));
    } else {
      console.log('\n❌ FAIL: No DOM updates detected');
    }

    console.log('\nBrowser will stay open. Press Ctrl+C to exit.\n');
    await new Promise(() => {});

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await browser.close();
    process.exit(1);
  }
})();
