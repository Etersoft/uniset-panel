const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 300 });
    const page = await browser.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('BROWSER ERROR:', msg.text());
        }
    });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(1000);

    // Switch to Dashboard view
    console.log('=== Switching to Dashboard view ===');
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(500);

    // Create a new dashboard if none exists
    const dashboardSelect = page.locator('#dashboard-select');
    const options = await dashboardSelect.locator('option').count();
    console.log(`Dashboard options: ${options}`);

    if (options <= 1) {
        console.log('=== Creating new dashboard ===');
        await page.click('#dashboard-new-btn');
        await page.waitForTimeout(300);
        await page.fill('#dashboard-name-input', 'Test Dashboard');
        await page.click('#dashboard-name-confirm');
        await page.waitForTimeout(500);
    } else {
        // Select first dashboard
        console.log('=== Selecting existing dashboard ===');
        await dashboardSelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);
    }

    // Wait for actions to be visible
    const actionsVisible = await page.locator('#dashboard-actions:not(.hidden)').isVisible();
    console.log(`Dashboard actions visible: ${actionsVisible}`);

    const addBtnVisible = await page.locator('#dashboard-add-widget-btn').isVisible();
    console.log(`Add widget button visible: ${addBtnVisible}`);

    // Click add widget button
    console.log('=== Opening Add Widget dialog ===');
    await page.click('#dashboard-add-widget-btn');
    await page.waitForTimeout(500);

    // Check if picker overlay opened
    const pickerVisible = await page.locator('#widget-picker-overlay:not(.hidden)').isVisible();
    console.log(`Widget picker overlay visible: ${pickerVisible}`);

    // Select Gauge type from picker
    const gaugeOption = page.locator('.widget-picker-item[data-type="gauge"]');
    const gaugeCount = await gaugeOption.count();
    console.log(`Gauge picker item count: ${gaugeCount}`);

    if (gaugeCount > 0) {
        console.log('=== Selecting Gauge widget from picker ===');
        await gaugeOption.click();
        await page.waitForTimeout(500);

        // Now check if config overlay opened
        const configVisible = await page.locator('#widget-config-overlay:not(.hidden)').isVisible();
        console.log(`Widget config overlay visible: ${configVisible}`);
    } else {
        console.log('Gauge picker item not found');
    }

    // Check for custom number inputs
    console.log('=== Checking custom number inputs ===');
    const numberWrappers = await page.locator('.widget-number-wrapper').count();
    console.log(`Found ${numberWrappers} number input wrappers`);

    const numberArrows = await page.locator('.widget-number-arrow').count();
    console.log(`Found ${numberArrows} arrow buttons`);

    // Check for toggle switch
    console.log('=== Checking toggle switch ===');
    const toggleTrack = await page.locator('.widget-toggle-track').count();
    console.log(`Found ${toggleTrack} toggle tracks`);

    const toggleLabel = await page.locator('.widget-toggle-label').count();
    console.log(`Found ${toggleLabel} toggle labels`);

    // Test arrow button click
    if (numberArrows > 0) {
        console.log('=== Testing arrow buttons ===');
        const minInput = page.locator('input[name="min"]');
        if (await minInput.count() > 0) {
            const valueBefore = await minInput.inputValue();
            console.log(`Min value before: ${valueBefore}`);

            const upArrow = page.locator('.widget-number-wrapper:has(input[name="min"]) .widget-number-arrow.up');
            if (await upArrow.count() > 0) {
                await upArrow.click();
                await page.waitForTimeout(100);
                const valueAfter = await minInput.inputValue();
                console.log(`Min value after clicking up: ${valueAfter}`);
            }
        }
    }

    // Test toggle switch
    const toggleCheckbox = page.locator('.widget-toggle input[name="transparent"]');
    if (await toggleCheckbox.count() > 0) {
        console.log('=== Testing toggle switch ===');
        const checkedBefore = await toggleCheckbox.isChecked();
        console.log(`Toggle checked before: ${checkedBefore}`);

        await page.locator('.widget-toggle-track').first().click();
        await page.waitForTimeout(200);

        const checkedAfter = await toggleCheckbox.isChecked();
        console.log(`Toggle checked after click: ${checkedAfter}`);
    }

    // Check width/height selects are REMOVED
    console.log('=== Checking width/height selects removed ===');
    const widthSelect = await page.locator('select[name="width"]').count();
    const heightSelect = await page.locator('select[name="height"]').count();
    console.log(`Width select count: ${widthSelect} (should be 0)`);
    console.log(`Height select count: ${heightSelect} (should be 0)`);

    // Take screenshot
    await page.screenshot({ path: 'tests/debug/config-dialog.png' });
    console.log('=== Screenshot saved ===');

    await page.waitForTimeout(10000);
    await browser.close();
    console.log('=== Test complete ===');
})();
