const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    // Track SSE events
    const sseEvents = [];
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('supplier') || text.includes('Supplier') || text.includes('SSE:')) {
            console.log('BROWSER:', text);
        }
    });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Click on SharedMemory (IONC - has supplier)
    await page.locator('text=SharedMemory').first().click();
    await page.waitForTimeout(2000);

    // Find first chart toggle (add to chart button) and click it
    const chartToggle = page.locator('.chart-toggle-label').first();
    await chartToggle.click();
    await page.waitForTimeout(1000);

    // Take screenshot of chart area
    await page.screenshot({ path: 'tests/debug/chart-supplier-ionc.png' });

    // Check if supplier element exists in legend
    const supplierElements = await page.locator('.chart-panel-supplier').all();
    console.log(`\nSupplier elements found: ${supplierElements.length}`);

    for (const el of supplierElements) {
        const text = await el.textContent();
        const id = await el.getAttribute('id');
        console.log(`  ${id}: "${text}"`);
    }

    // Check legend content
    const legendValues = await page.locator('.chart-panel-value').all();
    console.log(`\nLegend value elements: ${legendValues.length}`);
    for (const el of legendValues) {
        const text = await el.textContent();
        const id = await el.getAttribute('id');
        console.log(`  ${id}: "${text}"`);
    }

    // Wait for SSE updates
    console.log('\nWaiting 5s for SSE updates...');
    await page.waitForTimeout(5000);

    // Check supplier again after SSE updates
    console.log('\nAfter SSE updates:');
    const supplierElements2 = await page.locator('.chart-panel-supplier').all();
    for (const el of supplierElements2) {
        const text = await el.textContent();
        const id = await el.getAttribute('id');
        console.log(`  ${id}: "${text}"`);
    }

    // Take screenshot after updates
    await page.screenshot({ path: 'tests/debug/chart-supplier-ionc-updated.png' });

    // Now test UWebSocketGate (also has supplier)
    await page.locator('text=UWebSocketGate').first().click();
    await page.waitForTimeout(2000);

    // Add sensor to chart in UWebSocketGate
    const wsChartToggle = page.locator('.chart-toggle-label').first();
    if (await wsChartToggle.count() > 0) {
        await wsChartToggle.click();
        await page.waitForTimeout(3000);
    }

    await page.screenshot({ path: 'tests/debug/chart-supplier-uwsgate.png' });

    // Check all supplier elements across all tabs
    console.log('\nAll supplier elements on page:');
    const allSupplier = await page.locator('.chart-panel-supplier').all();
    for (const el of allSupplier) {
        const text = await el.textContent();
        const id = await el.getAttribute('id');
        const visible = await el.isVisible();
        console.log(`  ${id}: "${text}" (visible: ${visible})`);
    }

    // Also check OPCUAClient1 and ModbusMaster (should NOT have supplier)
    await page.locator('text=OPCUAClient1').first().click();
    await page.waitForTimeout(2000);
    const opcuaChartToggle = page.locator('.chart-toggle-label').first();
    if (await opcuaChartToggle.count() > 0) {
        await opcuaChartToggle.click();
        await page.waitForTimeout(3000);
    }
    await page.screenshot({ path: 'tests/debug/chart-supplier-opcua.png' });

    // Check MBTCPMaster1
    await page.locator('text=MBTCPMaster1').first().click();
    await page.waitForTimeout(2000);
    const mbChartToggle = page.locator('.chart-toggle-label').first();
    if (await mbChartToggle.count() > 0) {
        await mbChartToggle.click();
        await page.waitForTimeout(3000);
    }
    await page.screenshot({ path: 'tests/debug/chart-supplier-modbus.png' });

    console.log('\nFinal state - all supplier elements:');
    const finalSupplier = await page.locator('.chart-panel-supplier').all();
    for (const el of finalSupplier) {
        const text = await el.textContent();
        const id = await el.getAttribute('id');
        console.log(`  ${id}: "${text}"`);
    }

    console.log('\nDone!');
    await browser.close();
})();
