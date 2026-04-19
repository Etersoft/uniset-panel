const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    // Monitor console from the start
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('[sector]') || text.includes('[test]') || text.includes('SSE')) {
            console.log('BROWSER:', text);
        }
    });

    console.log('Opening page...');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Switch to Dashboard view
    console.log('Switching to Dashboard view...');
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(1000);

    // Create new dashboard
    console.log('Creating test dashboard...');
    await page.click('#dashboard-new-btn');
    await page.waitForTimeout(500);

    await page.fill('#dashboard-name-input', 'Sector Sync Test');
    await page.click('#dashboard-name-confirm');
    await page.waitForTimeout(1000);

    // Enter edit mode
    console.log('Entering edit mode...');
    await page.click('#dashboard-edit-btn');
    await page.waitForTimeout(500);

    // Add widget
    console.log('Adding gauge widget...');
    await page.click('#dashboard-add-widget-btn');
    await page.waitForTimeout(500);

    // Select gauge widget type
    await page.click('.widget-picker-item[data-type="gauge"]');
    await page.waitForTimeout(500);

    // Configure widget with a known sensor
    console.log('Configuring gauge widget...');
    await page.fill('[name="sensor"]', 'AI70_S');
    await page.waitForTimeout(500);

    // Select arc270 style
    await page.selectOption('[name="style"]', 'arc270');
    await page.waitForTimeout(200);

    // Set reasonable range
    await page.fill('[name="min"]', '0');
    await page.fill('[name="max"]', '100');
    await page.waitForTimeout(200);

    // Enable fillSector
    console.log('Enabling fillSector...');
    await page.click('text=Fill sector (0 to value)');
    await page.waitForTimeout(200);

    // Apply widget
    await page.click('#widget-config-apply');
    await page.waitForTimeout(1000);

    console.log('Widget created. Now using JavaScript to simulate value changes...');

    // Simulate value changes via JavaScript to test animation sync
    for (let i = 0; i < 5; i++) {
        const newValue = 20 + Math.random() * 60; // Random value between 20-80
        console.log(`Setting simulated value: ${newValue.toFixed(1)}`);

        await page.evaluate((val) => {
            // Widget instances are stored in dashboardState.widgets Map
            const widgetsMap = window.dashboardState?.widgets;
            console.log(`[test] widgetsMap size=${widgetsMap?.size}`);
            if (widgetsMap) {
                for (const [id, widget] of widgetsMap) {
                    const typeName = widget.constructor?.name;
                    console.log(`[test] widget id=${id}, type=${typeName}, hasUpdate=${typeof widget.update}`);
                    if (typeName === 'GaugeWidget') {
                        console.log(`[test] calling widget.update(${val})`);
                        widget.update(val);
                        break;
                    }
                }
            }
        }, newValue);

        await page.waitForTimeout(2000); // Wait for animation
    }

    await page.screenshot({ path: 'tests/debug/sector-sync-result.png' });
    console.log('Screenshot saved to tests/debug/sector-sync-result.png');

    // Keep browser open for observation
    console.log('Keeping browser open for 20 seconds...');
    await page.waitForTimeout(20000);

    await browser.close();
})();
