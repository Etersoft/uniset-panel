const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Take control
    await page.evaluate(async () => {
        await fetch('/api/control/take', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'admin123' })
        });
    });
    await page.waitForTimeout(500);

    // Open UWebSocketGate1
    await page.evaluate(() => {
        document.querySelectorAll('.server-group').forEach(g => {
            if (g.querySelector('.server-group-header')?.textContent.includes('8081')) {
                g.querySelector('.server-group-header').click();
            }
        });
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
        document.querySelectorAll('.object-name').forEach(n => {
            if (n.textContent.includes('UWebSocketGate')) n.click();
        });
    });
    await page.waitForTimeout(2000);

    // Add sensor
    const input = await page.$('.tab-panel.active .uwsgate-sensor-input');
    if (input) {
        await input.focus();
        await input.type('Sensor15099_S', { delay: 30 });
        await page.waitForTimeout(300);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);
    }

    // Check table structure
    const tableInfo = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const headers = panel?.querySelectorAll('.uwsgate-sensors-table thead th');
        const cells = panel?.querySelectorAll('.uwsgate-sensors-table tbody td');
        const supplierCell = panel?.querySelector('.col-supplier');
        return {
            headerCount: headers?.length || 0,
            headerTexts: Array.from(headers || []).map(h => h.textContent.trim()),
            hasSupplierHeader: Array.from(headers || []).some(h => h.textContent.includes('Supplier')),
            hasSupplierCell: !!supplierCell,
            supplierCellText: supplierCell?.textContent || null,
            cellCount: cells?.length || 0
        };
    });
    console.log('Table info:', JSON.stringify(tableInfo, null, 2));

    console.log(tableInfo.hasSupplierHeader && tableInfo.hasSupplierCell ? '✅ Supplier column added' : '❌ Supplier column missing');

    await browser.close();
})();
