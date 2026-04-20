const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const page = await browser.newPage();

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

    await page.fill('#dashboard-name-input', 'FillSector Test');
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

    // Configure widget
    console.log('Configuring gauge widget with fillSector...');
    await page.fill('[name="sensor"]', 'AI_Temperature_S');
    await page.waitForTimeout(200);

    // Select arc270 style
    await page.selectOption('[name="style"]', 'arc270');
    await page.waitForTimeout(200);

    // Enable fillSector using label click (toggle style)
    console.log('Enabling fillSector...');
    await page.click('text=Fill sector (0 to value)');
    await page.waitForTimeout(200);

    // Apply widget
    await page.click('#widget-config-apply');
    await page.waitForTimeout(1000);

    // Take screenshot
    console.log('Taking screenshot...');
    await page.screenshot({ path: 'tests/debug/fill-sector-arc270.png', fullPage: false });

    // Wait to observe the result
    console.log('Waiting 20 seconds for manual inspection...');
    await page.waitForTimeout(20000);

    await browser.close();
})();
