const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();

    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

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

    // Check for widget title labels
    const titleLabels = await page.$$('.widget-title-label');
    console.log(`\nWidget title labels found: ${titleLabels.length}`);

    // Get text of each title label
    for (const label of titleLabels) {
        const text = await label.textContent();
        console.log(`  - "${text}"`);
    }

    // Check specific widgets
    const widgets = await page.$$('.dashboard-widget');
    console.log(`\nTotal widgets: ${widgets.length}`);

    // Take screenshot
    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/widget-titles.png', fullPage: true });

    console.log('\nScreenshot saved. Browser open for 10s...');
    await page.waitForTimeout(10000);
    await browser.close();
})();
