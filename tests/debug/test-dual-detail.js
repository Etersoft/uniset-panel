const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const page = await browser.newPage();

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(1000);

    // Switch to Dashboard view
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(500);

    // Select dashboard
    const dashboardSelect = page.locator('#dashboard-select');
    await dashboardSelect.selectOption({ index: 1 });
    await page.waitForTimeout(500);

    // Find the dual gauge widget and take a screenshot of just that element
    const dualGauge = page.locator('.gauge-dual').first();

    if (await dualGauge.count() > 0) {
        // Get parent widget container
        const widget = dualGauge.locator('xpath=ancestor::div[contains(@class, "dashboard-widget")]');

        // Take screenshot of the widget
        await widget.screenshot({ path: '/tmp/dual-gauge-widget.png' });
        console.log('Widget screenshot saved to /tmp/dual-gauge-widget.png');

        // Get SVG content for inspection
        const svgContent = await dualGauge.innerHTML();
        console.log('\n=== SVG Structure ===');
        console.log('Has outer labels:', svgContent.includes('dual-outer-label'));
        console.log('Has inner labels:', svgContent.includes('dual-inner-label'));
        console.log('Has cyan color:', svgContent.includes('#00d4ff'));
        console.log('Has dark background:', svgContent.includes('dual-bg-'));
        console.log('Has needle:', svgContent.includes('gauge-needle-dual'));
    }

    await page.waitForTimeout(5000);
    await browser.close();
})();
