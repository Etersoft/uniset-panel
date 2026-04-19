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

    // Count widgets
    const widgets = await page.$$('.dashboard-widget');
    const dividers = await page.$$('.dashboard-widget[data-type="divider"]');
    const labels = await page.$$('.dashboard-widget[data-type="label"]');

    console.log(`Total widgets: ${widgets.length}`);
    console.log(`Dividers: ${dividers.length}`);
    console.log(`Labels: ${labels.length}`);

    // Check labels with borders
    for (const label of labels) {
        const text = await label.$eval('.label-text', el => el.textContent.trim());
        const hasBorder = await label.$eval('.label-text', el => el.style.border !== '');
        console.log(`  Label "${text.substring(0, 30)}..." - border: ${hasBorder}`);
    }

    // Take screenshot
    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/updated-dashboard.png', fullPage: true });

    console.log('\nScreenshot saved. Browser open for 15s...');
    await page.waitForTimeout(15000);
    await browser.close();
})();
