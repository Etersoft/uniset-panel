const { chromium } = require('@playwright/test');

(async () => {
    // Create fresh context with cache disabled
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const context = await browser.newContext();

    // Clear all storage and cache
    await context.clearCookies();

    const page = await context.newPage();

    // Intercept and add no-cache headers
    await page.route('**/*', async route => {
        await route.continue({
            headers: {
                ...route.request().headers(),
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            },
        });
    });

    page.on('console', msg => console.log('BROWSER:', msg.text()));

    console.log('Opening page (fresh context, no cache)...');
    await page.goto('http://localhost:8000');
    await page.waitForSelector('.objects-list', { timeout: 10000 });
    await page.waitForTimeout(1500);

    await page.waitForFunction(() => dashboardState?.dashboards?.size > 0, { timeout: 5000 });

    console.log('Loading dashboard...');
    await page.evaluate(() => {
        dashboardManager.loadDashboard('System Overview');
        dashboardManager.switchView('dashboard');
    });
    await page.waitForTimeout(1000);

    console.log('Enabling edit mode...');
    await page.evaluate(() => dashboardManager.toggleEditMode());
    await page.waitForTimeout(500);

    // Check if our code is in the page
    const hasNewCode = await page.evaluate(() => {
        // Check if the function includes our debug log
        const code = dashboardManager.createWidget.toString();
        return code.includes('DRAG: createWidget');
    });
    console.log('Has new createWidget code:', hasNewCode);

    // Try to trigger mousedown
    const widget = page.locator('.dashboard-widget:has-text("Pressure")');
    const header = widget.locator('.widget-header');
    const headerBox = await header.boundingBox();

    if (headerBox) {
        console.log('Clicking header at', headerBox.x + 50, headerBox.y + 10);
        await page.mouse.move(headerBox.x + 50, headerBox.y + 10);
        await page.mouse.down();
        await page.waitForTimeout(200);
        await page.mouse.up();
    }

    await page.waitForTimeout(2000);
    await browser.close();
})();
