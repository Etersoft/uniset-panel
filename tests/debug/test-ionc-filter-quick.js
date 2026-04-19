const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Click on SharedMemory
    const ioncObject = await page.$('text=SharedMemory');
    if (ioncObject) {
        await ioncObject.click();
        await page.waitForTimeout(1000);
    } else {
        console.log('ERROR: No SharedMemory found');
        await browser.close();
        return;
    }

    // Find filter input
    const filterInput = await page.$('.filter-input');
    if (!filterInput) {
        console.log('ERROR: Filter input not found');
        await browser.close();
        return;
    }

    // Type filter
    await filterInput.fill('AI');
    await page.waitForTimeout(500);

    // Get sensor IDs to pin
    const sensorIds = await page.evaluate(() => {
        const rows = document.querySelectorAll('.ionc-sensor-row:not([style*="display: none"])');
        return Array.from(rows).slice(0, 2).map(r => r.querySelector('.pin-toggle')?.dataset.id);
    });
    console.log('Sensors to pin (IDs):', sensorIds);

    // Pin two sensors by clicking their pin toggles
    for (const id of sensorIds) {
        if (id) {
            await page.click(`.pin-toggle[data-id="${id}"]`);
            await page.waitForTimeout(200);
        }
    }

    // Check localStorage
    const pinnedBefore = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('uniset-panel-ionc-pinned') || '{}');
    });
    console.log('Pinned in localStorage:', JSON.stringify(pinnedBefore));

    // Clear filter
    await filterInput.fill('');
    await page.waitForTimeout(1000);

    // Check pinned rows - look for rows with .pin-toggle.pinned
    const pinnedRows = await page.evaluate(() => {
        const pinned = document.querySelectorAll('.pin-toggle.pinned');
        return {
            count: pinned.length,
            ids: Array.from(pinned).map(p => p.dataset.id)
        };
    });
    console.log('Pinned rows after clearing filter:', JSON.stringify(pinnedRows));

    // Check all visible rows
    const allRows = await page.evaluate(() => {
        const rows = document.querySelectorAll('.ionc-sensor-row');
        return rows.length;
    });
    console.log('Total visible rows:', allRows);

    if (pinnedRows.count >= 2) {
        console.log('SUCCESS: Pinned sensors are displayed!');
    } else {
        console.log('FAILURE: Pinned sensors NOT displayed!');
    }

    await browser.close();
})();
