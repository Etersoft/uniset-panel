const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 300 });
    const page = await browser.newPage();

    // Capture console messages
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('BROWSER ERROR:', msg.text());
        }
    });

    // Capture page errors
    page.on('pageerror', err => {
        console.log('PAGE ERROR:', err.message);
    });

    console.log('Opening dashboard...');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(1000);

    // Switch to Dashboard view
    console.log('Switching to Dashboard view...');
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(500);

    // Check if we need to select or create a dashboard
    const dashboardSelect = await page.$('#dashboard-select');
    if (dashboardSelect) {
        const options = await dashboardSelect.$$('option');
        if (options.length > 1) {
            console.log('Selecting first dashboard...');
            await dashboardSelect.selectOption({ index: 1 });
            await page.waitForTimeout(500);
        }
    }

    // Click Add Widget button
    console.log('Opening widget picker...');
    const addWidgetBtn = await page.$('#dashboard-add-widget-btn');
    if (addWidgetBtn) {
        await addWidgetBtn.click();
        await page.waitForTimeout(500);

        // Look for StatusBar widget
        const statusbarItem = await page.$('.widget-picker-item[data-type="statusbar"]');
        if (statusbarItem) {
            console.log('✓ StatusBar widget found in picker!');

            // Click on it
            await statusbarItem.click();
            await page.waitForTimeout(500);

            // Take screenshot of config dialog
            await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/statusbar-config.png' });

            // Check for layout select
            const layoutSelect = await page.$('[name="layout"]');
            if (layoutSelect) {
                console.log('✓ Layout select found');
            }

            // Check for indicator config
            const indicatorConfig = await page.$('.statusbar-item-config');
            if (indicatorConfig) {
                console.log('✓ Indicator config found');
            }

            // Check for add button
            const addBtn = await page.$('#add-statusbar-item');
            if (addBtn) {
                console.log('✓ Add indicator button found');

                // Click to add new indicator
                await addBtn.click();
                await page.waitForTimeout(200);

                const indicators = await page.$$('.statusbar-item-config');
                console.log(`  Total indicators: ${indicators.length}`);

                await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/statusbar-added.png' });
            }

            // Fill in config
            const labelInputs = await page.$$('[name^="item-label-"]');
            if (labelInputs.length > 0) {
                await labelInputs[0].fill('Running');
                if (labelInputs[1]) await labelInputs[1].fill('Alarm');
            }

            // Apply config
            const applyBtn = await page.$('#widget-config-apply');
            if (applyBtn) {
                console.log('Clicking Apply...');
                await applyBtn.click();
                await page.waitForTimeout(1000);

                await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/statusbar-after-apply.png' });

                // Check overlay is hidden
                const overlay = await page.$('#widget-config-overlay');
                const overlayHidden = await overlay?.evaluate(el => el.classList.contains('hidden'));
                console.log(`Config overlay hidden: ${overlayHidden}`);

                // Check if widget was created
                const statusbarWidget = await page.$('.dashboard-widget[data-type="statusbar"]');
                if (statusbarWidget) {
                    console.log('✓ StatusBar widget created successfully!');

                    // Check internal structure
                    const indicators = await statusbarWidget.$$('.statusbar-indicator');
                    console.log(`  Widget has ${indicators.length} indicators`);
                } else {
                    console.log('✗ StatusBar widget NOT created');

                    // Check what widgets exist
                    const allWidgets = await page.$$('.dashboard-widget');
                    console.log(`  Total widgets on dashboard: ${allWidgets.length}`);
                }
            }
        } else {
            console.log('✗ StatusBar widget NOT found in picker');
        }
    }

    console.log('\nKeeping browser open for 30 seconds...');
    await page.waitForTimeout(30000);
    await browser.close();
})();
