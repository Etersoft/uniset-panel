const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const page = await browser.newPage();

    page.on('console', msg => {
        console.log('BROWSER:', msg.text());
    });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Switch to Dashboard view
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(500);

    // Select existing dashboard
    await page.selectOption('#dashboard-select', 'System Overview');
    await page.waitForTimeout(500);

    // Click Add Widget
    await page.click('#dashboard-add-widget-btn');
    await page.waitForTimeout(300);

    // Select Gauge widget type
    await page.click('.widget-picker-item[data-type="gauge"]');
    await page.waitForTimeout(300);

    // Select Dual Scale style
    await page.selectOption('[name="style"]', 'dual');
    await page.waitForTimeout(300);

    // Screenshot before typing
    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/sensor2-autocomplete-1.png' });
    console.log('Screenshot 1: Dialog opened with Dual Scale');

    // Type in Target Sensor field to trigger autocomplete
    const sensor2Input = await page.$('[name="sensor2"]');
    if (sensor2Input) {
        await sensor2Input.click();
        await sensor2Input.type('AI7');
        await page.waitForTimeout(300);

        await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/sensor2-autocomplete-2.png' });
        console.log('Screenshot 2: Autocomplete should show for sensor2');
    } else {
        console.log('ERROR: sensor2 input not found');
    }

    console.log('\nBrowser will stay open for 30 seconds...');
    await page.waitForTimeout(30000);

    await browser.close();
})();
