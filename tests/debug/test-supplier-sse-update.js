const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(3000);

    // Open SharedMemory
    await page.locator('text=SharedMemory').first().click();
    await page.waitForTimeout(2000);

    // Add sensor to chart
    const chartToggle = page.locator('.chart-toggle-label').first();
    await chartToggle.click();
    await page.waitForTimeout(500);

    // Get initial supplier
    const initial = await page.evaluate(() => {
        const el = document.querySelector('.chart-panel-supplier');
        return { id: el?.id, text: el?.textContent };
    });
    console.log('Initial supplier:', JSON.stringify(initial));

    // Wait for several SSE update cycles
    console.log('Waiting 8s for SSE batch updates...');
    await page.waitForTimeout(8000);

    // Get updated supplier
    const updated = await page.evaluate(() => {
        const el = document.querySelector('.chart-panel-supplier');
        return { id: el?.id, text: el?.textContent };
    });
    console.log('After SSE updates:', JSON.stringify(updated));

    // Check if values are changing (proof SSE is working)
    const value1 = await page.evaluate(() => {
        const el = document.querySelector('.chart-panel-value');
        return el?.textContent;
    });
    await page.waitForTimeout(2000);
    const value2 = await page.evaluate(() => {
        const el = document.querySelector('.chart-panel-value');
        return el?.textContent;
    });
    console.log(`Value changed: ${value1} → ${value2} (SSE batch events ${value1 !== value2 ? 'ARE' : 'NOT'} working)`);

    // Verify supplier persists after SSE updates
    console.log(`\nSupplier check: "${updated.text}" ${updated.text ? '✓ PASS' : '✗ FAIL - supplier is empty after SSE updates'}`);

    await page.screenshot({ path: 'tests/debug/chart-supplier-final.png' });

    console.log('\nDone!');
    await browser.close();
})();
