const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(3000);

    // === Test 1: IONC (SharedMemory) — has supplier ===
    console.log('=== Test 1: SharedMemory (IONC) ===');
    await page.locator('text=SharedMemory').first().click();
    await page.waitForTimeout(2000);

    // Click chart toggle to add first sensor
    const chartToggle = page.locator('.chart-toggle-label').first();
    await chartToggle.click();
    await page.waitForTimeout(1000);

    // Add second sensor too for comparison
    const chartToggle2 = page.locator('.chart-toggle-label').nth(1);
    await chartToggle2.click();
    await page.waitForTimeout(1000);

    // Wait for SSE updates to propagate supplier
    console.log('Waiting for SSE updates...');
    await page.waitForTimeout(5000);

    // Check supplier elements
    let supplierEls = await page.evaluate(() => {
        const els = document.querySelectorAll('.chart-panel-supplier');
        return Array.from(els).map(el => ({
            id: el.id,
            text: el.textContent,
            visible: el.offsetParent !== null || el.textContent.length > 0
        }));
    });
    console.log('Supplier elements:', JSON.stringify(supplierEls, null, 2));

    // Also check legend values
    let legendVals = await page.evaluate(() => {
        const els = document.querySelectorAll('.chart-panel-value');
        return Array.from(els).map(el => ({
            id: el.id,
            text: el.textContent
        }));
    });
    console.log('Legend values:', JSON.stringify(legendVals, null, 2));

    await page.screenshot({ path: 'tests/debug/chart-supplier-ionc.png' });

    // === Test 2: Check that table also shows supplier ===
    console.log('\n=== Test 2: Table supplier column ===');
    const tableSupplier = await page.evaluate(() => {
        // Check first few visible rows for supplier content
        const rows = document.querySelectorAll('.ionc-sensor-row');
        return Array.from(rows).slice(0, 3).map(row => {
            const supplierCell = row.querySelector('.col-supplier');
            return {
                name: row.querySelector('.col-name')?.textContent || '',
                supplier: supplierCell?.textContent || 'NO CELL'
            };
        });
    });
    console.log('Table supplier data:', JSON.stringify(tableSupplier, null, 2));

    // === Test 3: UWebSocketGate — also has supplier ===
    console.log('\n=== Test 3: UWebSocketGate ===');
    await page.locator('text=UWebSocketGate').first().click();
    await page.waitForTimeout(2000);

    // UWebSocketGate has realtime sensors, check their supplier
    const wsSupplier = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel[data-name*="UWebSocketGate"]');
        if (!panel) return 'NO PANEL';
        const rows = panel.querySelectorAll('tbody tr');
        return Array.from(rows).map(row => {
            const cells = row.querySelectorAll('td');
            return Array.from(cells).map(c => c.textContent.trim());
        });
    });
    console.log('UWebSocketGate rows:', JSON.stringify(wsSupplier, null, 2));

    // === Test 4: Modbus Master — should NOT have supplier in charts ===
    console.log('\n=== Test 4: MBTCPMaster1 (no supplier) ===');
    await page.locator('text=MBTCPMaster1').first().click();
    await page.waitForTimeout(2000);

    // Add register to chart
    const mbChartToggle = page.locator('.tab-panel[data-name*="MBTCPMaster1"] .chart-toggle-label').first();
    if (await mbChartToggle.count() > 0) {
        await mbChartToggle.click();
        await page.waitForTimeout(3000);
    }

    // Check supplier in modbus chart - should be empty
    const mbSupplier = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel[data-name*="MBTCPMaster1"]');
        if (!panel) return 'NO PANEL';
        const els = panel.querySelectorAll('.chart-panel-supplier');
        return Array.from(els).map(el => ({
            id: el.id,
            text: el.textContent
        }));
    });
    console.log('Modbus chart supplier (should be empty):', JSON.stringify(mbSupplier, null, 2));

    // === Summary ===
    console.log('\n=== SUMMARY ===');
    const allSupplier = await page.evaluate(() => {
        const els = document.querySelectorAll('.chart-panel-supplier');
        return Array.from(els).map(el => ({
            id: el.id,
            text: el.textContent,
            empty: el.textContent === ''
        }));
    });

    const withSupplier = allSupplier.filter(e => !e.empty);
    const withoutSupplier = allSupplier.filter(e => e.empty);
    console.log(`Total chart supplier elements: ${allSupplier.length}`);
    console.log(`With supplier text: ${withSupplier.length}`);
    withSupplier.forEach(e => console.log(`  ✓ ${e.id}: "${e.text}"`));
    console.log(`Without supplier (empty): ${withoutSupplier.length}`);
    withoutSupplier.forEach(e => console.log(`  - ${e.id}`));

    console.log('\nDone!');
    await browser.close();
})();
