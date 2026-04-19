const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const page = await browser.newPage();

    // Capture errors
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    console.log('Opening dashboard...');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(1000);

    // Switch to Dashboard view
    console.log('Switching to Dashboard view...');
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(500);

    // Select first dashboard
    const dashboardSelect = await page.$('#dashboard-select');
    if (dashboardSelect) {
        const options = await dashboardSelect.$$('option');
        if (options.length > 1) {
            await dashboardSelect.selectOption({ index: 1 });
            await page.waitForTimeout(500);
        }
    }

    // Open widget picker
    console.log('Opening widget picker...');
    await page.click('#dashboard-add-widget-btn');
    await page.waitForTimeout(500);

    // Look for BarGraph
    const bargraphItem = await page.$('.widget-picker-item[data-type="bargraph"]');
    if (bargraphItem) {
        console.log('✓ BarGraph widget found in picker!');
        await bargraphItem.click();
        await page.waitForTimeout(500);

        await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/bargraph-config.png' });

        // Check orientation select
        const orientationSelect = await page.$('[name="orientation"]');
        if (orientationSelect) console.log('✓ Orientation select found');

        // Check bars container
        const barsContainer = await page.$('#bargraph-items-container');
        if (barsContainer) console.log('✓ Bars container found');

        // Add another bar
        const addBtn = await page.$('#add-bargraph-item');
        if (addBtn) {
            await addBtn.click();
            await page.waitForTimeout(200);
            await addBtn.click();
            await page.waitForTimeout(200);

            const bars = await page.$$('.bargraph-item-config');
            console.log(`  Total bars: ${bars.length}`);
        }

        // Fill labels
        const labelInputs = await page.$$('[name^="bar-label-"]');
        if (labelInputs.length >= 3) {
            await labelInputs[0].fill('DG1 Power');
            await labelInputs[1].fill('DG2 Power');
            await labelInputs[2].fill('Total');
        }

        await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/bargraph-filled.png' });

        // Apply
        const applyBtn = await page.$('#widget-config-apply');
        if (applyBtn) {
            console.log('Applying config...');
            await applyBtn.click();
            await page.waitForTimeout(1000);

            // Check widget created
            const bargraphWidget = await page.$('.dashboard-widget[data-type="bargraph"]');
            if (bargraphWidget) {
                console.log('✓ BarGraph widget created!');

                const bars = await bargraphWidget.$$('.bargraph-bar-container');
                console.log(`  Widget has ${bars.length} bars`);

                await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/bargraph-created.png' });
            } else {
                console.log('✗ BarGraph widget NOT created');
            }
        }
    } else {
        console.log('✗ BarGraph widget NOT found in picker');
    }

    console.log('\nTest complete. Browser stays open 15 seconds...');
    await page.waitForTimeout(15000);
    await browser.close();
})();
