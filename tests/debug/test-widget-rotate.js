const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 300 });
    const page = await browser.newPage();

    console.log('Opening dashboard...');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(1000);

    // Switch to Dashboard view
    console.log('Switching to Dashboard view...');
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(500);

    // Check if we need to select a dashboard
    const dashboardSelect = await page.$('#dashboard-select');
    if (dashboardSelect) {
        // Select first available dashboard
        const options = await dashboardSelect.$$('option');
        if (options.length > 1) {
            console.log('Selecting first dashboard...');
            await dashboardSelect.selectOption({ index: 1 });
            await page.waitForTimeout(1000);
        }
    }

    // Click on a gauge widget to configure it
    console.log('Looking for gauge widget to configure...');
    const gaugeWidget = await page.$('.dashboard-widget[data-type="gauge"]');
    if (gaugeWidget) {
        // Click config button
        const configBtn = await gaugeWidget.$('.widget-action-btn.config');
        if (configBtn) {
            console.log('Opening widget config...');
            await configBtn.click();
            await page.waitForTimeout(500);

            // Take screenshot of config dialog
            await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/rotate-config-dialog.png' });

            // Check for rotate input
            const rotateInput = await page.$('[name="rotate"]');
            if (rotateInput) {
                console.log('✓ Rotate input found!');

                // Get current value
                const currentValue = await rotateInput.inputValue();
                console.log(`  Current rotate value: ${currentValue}°`);

                // Test quick buttons
                const quickButtons = await page.$$('.rotate-quick-btn');
                console.log(`  Found ${quickButtons.length} quick buttons`);

                // Click 90° button
                const btn90 = await page.$('.rotate-quick-btn[data-angle="90"]');
                if (btn90) {
                    console.log('  Clicking 90° button...');
                    await btn90.click();
                    await page.waitForTimeout(200);

                    const newValue = await rotateInput.inputValue();
                    console.log(`  Value after click: ${newValue}°`);
                }

                // Set to 45 degrees manually
                console.log('  Setting to 45° manually...');
                await rotateInput.fill('45');
                await page.waitForTimeout(200);

                // Click Apply
                const applyBtn = await page.$('#widget-config-apply');
                if (applyBtn) {
                    console.log('  Applying config...');
                    await applyBtn.click();
                    await page.waitForTimeout(500);

                    // Check if widget is rotated
                    const widgetTransform = await gaugeWidget.evaluate(el => el.style.transform);
                    console.log(`  Widget transform: ${widgetTransform || '(none)'}`);

                    if (widgetTransform.includes('rotate(45deg)')) {
                        console.log('✓ Widget correctly rotated to 45°!');
                    } else {
                        console.log('✗ Widget rotation not applied correctly');
                    }

                    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/rotate-applied.png' });
                }
            } else {
                console.log('✗ Rotate input NOT found!');
                await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/rotate-missing.png' });
            }
        }
    } else {
        console.log('No gauge widget found. Looking for any widget...');
        const anyWidget = await page.$('.dashboard-widget');
        if (anyWidget) {
            const configBtn = await anyWidget.$('.widget-action-btn.config');
            if (configBtn) {
                await configBtn.click();
                await page.waitForTimeout(500);
                await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/rotate-any-widget.png' });
            }
        }
    }

    console.log('\nKeeping browser open for 30 seconds...');
    await page.waitForTimeout(30000);
    await browser.close();
})();
