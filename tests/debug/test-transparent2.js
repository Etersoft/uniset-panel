const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();

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

    const pressureWidget = page.locator('.dashboard-widget:has-text("Pressure")');

    // Check current classes and styles
    const info = await pressureWidget.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
            classes: el.className,
            background: computed.background,
            backgroundColor: computed.backgroundColor,
            borderColor: computed.borderColor
        };
    });
    console.log('Before transparent:', info);

    // Click config button
    await pressureWidget.locator('.widget-action-btn.config').click();
    await page.waitForTimeout(500);

    // Check transparent checkbox
    await page.locator('[name="transparent"]').check();
    await page.waitForTimeout(200);

    // Apply
    await page.click('#widget-config-apply');
    await page.waitForTimeout(500);

    // Check again
    const infoAfter = await pressureWidget.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
            classes: el.className,
            background: computed.background,
            backgroundColor: computed.backgroundColor,
            borderColor: computed.borderColor
        };
    });
    console.log('After transparent:', infoAfter);

    // Check if CSS rule exists
    const cssCheck = await page.evaluate(() => {
        // Find the transparent rule
        for (const sheet of document.styleSheets) {
            try {
                for (const rule of sheet.cssRules) {
                    if (rule.selectorText && rule.selectorText.includes('.dashboard-widget.transparent')) {
                        return {
                            found: true,
                            selector: rule.selectorText,
                            cssText: rule.cssText
                        };
                    }
                }
            } catch (e) {}
        }
        return { found: false };
    });
    console.log('CSS rule check:', cssCheck);

    await page.screenshot({ path: '/tmp/transparent-debug.png' });
    console.log('\nScreenshot: /tmp/transparent-debug.png');

    await page.waitForTimeout(3000);
    await browser.close();
})();
