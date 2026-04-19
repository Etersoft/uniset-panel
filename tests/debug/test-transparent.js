const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();

    page.on('console', msg => {
        if (msg.text().includes('Error') || msg.text().includes('error')) {
            console.log('BROWSER:', msg.text());
        }
    });

    console.log('Opening page...');
    await page.goto('http://localhost:8000');
    await page.waitForSelector('.objects-list', { timeout: 10000 });
    await page.waitForTimeout(1500);

    await page.waitForFunction(() => dashboardState?.dashboards?.size > 0, { timeout: 5000 });

    await page.evaluate(() => {
        dashboardManager.loadDashboard('System Overview');
        dashboardManager.switchView('dashboard');
    });
    await page.waitForTimeout(1000);

    // Enable edit mode
    await page.evaluate(() => dashboardManager.toggleEditMode());
    await page.waitForTimeout(500);

    // Check initial state - widget should not be transparent
    const pressureWidget = page.locator('.dashboard-widget:has-text("Pressure")');
    const isTransparentBefore = await pressureWidget.evaluate(el => el.classList.contains('transparent'));
    console.log('Before: transparent class =', isTransparentBefore);

    // Click config button on Pressure widget
    console.log('Opening widget config...');
    await pressureWidget.locator('.widget-action-btn.config').click();
    await page.waitForTimeout(500);

    // Check if transparent checkbox exists
    const transparentCheckbox = page.locator('[name="transparent"]');
    const checkboxExists = await transparentCheckbox.count() > 0;
    console.log('Transparent checkbox exists:', checkboxExists);

    if (checkboxExists) {
        // Check the transparent checkbox
        console.log('Checking transparent checkbox...');
        await transparentCheckbox.check();
        await page.waitForTimeout(200);

        // Click Apply
        console.log('Applying config...');
        await page.click('#widget-config-apply');
        await page.waitForTimeout(500);

        // Check if widget now has transparent class
        const isTransparentAfter = await pressureWidget.evaluate(el => el.classList.contains('transparent'));
        console.log('After: transparent class =', isTransparentAfter);

        if (isTransparentAfter) {
            console.log('✓ Transparent class applied successfully!');
        } else {
            console.log('✗ Transparent class NOT applied');
        }

        // Check config was saved
        const config = await page.evaluate(() => {
            const dash = dashboardState.dashboards.get('System Overview');
            const w = dash.widgets.find(w => w.config?.label === 'Pressure');
            return w?.config;
        });
        console.log('Widget config:', config);
    }

    await page.screenshot({ path: '/tmp/transparent-test.png' });
    console.log('\nScreenshot: /tmp/transparent-test.png');

    await page.waitForTimeout(3000);
    await browser.close();
})();
