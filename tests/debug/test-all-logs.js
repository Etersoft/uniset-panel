const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();

    // Capture ALL console logs
    page.on('console', msg => {
        console.log('BROWSER:', msg.text());
    });

    console.log('Opening page...');
    await page.goto('http://localhost:8000');
    await page.waitForSelector('.objects-list', { timeout: 10000 });
    await page.waitForTimeout(1500);

    await page.waitForFunction(() => dashboardState?.dashboards?.size > 0, { timeout: 5000 });

    await page.evaluate(() => {
        console.log('TEST: Loading dashboard');
        dashboardManager.loadDashboard('System Overview');
        dashboardManager.switchView('dashboard');
    });
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
        console.log('TEST: Enabling edit mode');
        dashboardManager.toggleEditMode();
    });
    await page.waitForTimeout(500);

    const widget = page.locator('.dashboard-widget:has-text("Pressure")');
    const header = widget.locator('.widget-header');
    const headerBox = await header.boundingBox();
    console.log('Header box:', headerBox);

    console.log('Clicking header...');
    await page.mouse.move(headerBox.x + 50, headerBox.y + 10);
    await page.mouse.down();
    await page.waitForTimeout(200);

    console.log('Moving...');
    await page.mouse.move(headerBox.x + 100, headerBox.y - 50, { steps: 5 });
    await page.waitForTimeout(200);

    console.log('Releasing...');
    await page.mouse.up();
    await page.waitForTimeout(500);

    console.log('\nDone.');
    await page.waitForTimeout(2000);
    await browser.close();
})();
