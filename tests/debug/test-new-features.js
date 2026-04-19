const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    console.log('Opening dashboard...');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(1000);

    // Switch to Dashboard view
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(500);

    // Select Diesel Generator dashboard
    const dashboardSelect = await page.$('#dashboard-select');
    if (dashboardSelect) {
        await dashboardSelect.selectOption({ label: 'Diesel Generator Control' });
        await page.waitForTimeout(1000);
    }

    // Check that widget titles are hidden by default
    const hiddenHeaders = await page.$$('.widget-header.hidden-title');
    const visibleHeaders = await page.$$('.widget-header:not(.hidden-title)');
    console.log(`\nWidget headers with hidden-title: ${hiddenHeaders.length}`);
    console.log(`Widget headers without hidden-title: ${visibleHeaders.length}`);

    // Take screenshot
    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/hidden-titles.png' });

    // Open widget picker and check for divider
    console.log('\nChecking widget picker for Divider...');
    await page.click('#dashboard-add-widget-btn');
    await page.waitForTimeout(500);

    const dividerItem = await page.$('.widget-picker-item[data-type="divider"]');
    if (dividerItem) {
        console.log('✓ Divider widget found in picker!');

        // Click on it
        await dividerItem.click();
        await page.waitForTimeout(500);

        // Take screenshot of config
        await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/divider-config.png' });

        // Apply
        await page.click('#widget-config-apply');
        await page.waitForTimeout(500);

        const dividerWidget = await page.$('.dashboard-widget[data-type="divider"]');
        if (dividerWidget) {
            console.log('✓ Divider widget created!');
        }
    } else {
        console.log('✗ Divider widget NOT found');
    }

    // Final screenshot
    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/final-features.png' });

    console.log('\nTest complete. Browser open for 15s...');
    await page.waitForTimeout(15000);
    await browser.close();
})();
