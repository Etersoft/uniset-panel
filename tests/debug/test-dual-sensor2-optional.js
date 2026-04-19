/**
 * Test dual gauge with optional sensor2
 *
 * Verifies that when sensor2 is not specified, the target value label is hidden
 */

const { chromium } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8001';

(async () => {
    console.log('=== Dual Gauge Sensor2 Optional Test ===\n');
    console.log(`URL: ${BASE_URL}\n`);

    const browser = await chromium.launch({ headless: false, slowMo: 300 });
    const page = await browser.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('BROWSER ERROR:', msg.text());
        }
    });

    try {
        await page.goto(BASE_URL);
        await page.waitForTimeout(2000);

        // Switch to Dashboard view
        console.log('1. Switching to Dashboard view...');
        const dashboardBtn = page.locator('text=Dashboard').first();
        if (await dashboardBtn.count() > 0) {
            await dashboardBtn.click();
            await page.waitForTimeout(1000);
        }

        // Select Diesel Generator dashboard
        console.log('2. Selecting Diesel Generator dashboard...');
        const dieselDashboard = page.locator('text=Diesel Generator').first();
        if (await dieselDashboard.count() > 0) {
            await dieselDashboard.click();
            await page.waitForTimeout(2000);
        }

        // Check existing dual gauge widgets (with sensor2)
        console.log('\n3. Checking existing dual gauge (with sensor2)...');
        const dualGauges = await page.locator('.gauge-dual').count();
        console.log(`  Dual gauges found: ${dualGauges}`);

        // Check if target label is visible for gauge with sensor2
        const existingTargetDisplay = await page.evaluate(() => {
            const dualGauge = document.querySelector('.gauge-dual');
            if (!dualGauge) return 'no gauge';
            const targetDigital = dualGauge.querySelector('.dual-target-small');
            if (!targetDigital) return 'no target element';
            const style = getComputedStyle(targetDigital);
            return {
                display: style.display,
                text: targetDigital.textContent,
                visible: style.display !== 'none'
            };
        });
        console.log(`  Existing gauge target label:`, existingTargetDisplay);

        // Enter edit mode
        console.log('\n4. Entering edit mode...');
        const editBtn = page.locator('#dashboard-edit-btn');
        if (await editBtn.count() > 0) {
            await editBtn.click();
            await page.waitForTimeout(500);
        }

        // Add new Dual gauge WITHOUT sensor2
        console.log('\n5. Creating new dual gauge WITHOUT sensor2...');
        await page.click('button:has-text("Add Widget")');
        await page.waitForTimeout(500);

        await page.click('.widget-picker-item:has-text("Gauge")');
        await page.waitForTimeout(300);

        // Set style to Dual Scale
        await page.selectOption('select[name="style"]', 'dual');
        await page.waitForTimeout(300);

        // Set sensor (main)
        await page.fill('input[name="sensor"]', 'DG1_RPM');
        await page.waitForTimeout(100);

        // Leave sensor2 empty!

        // Apply
        await page.click('button:has-text("Apply")');
        await page.waitForTimeout(1000);

        await page.screenshot({ path: 'debug/dual-no-sensor2.png', fullPage: true });
        console.log('  Screenshot: dual-no-sensor2.png');

        // Check if target label is hidden for new gauge (no sensor2)
        const newGaugeTargetDisplay = await page.evaluate(() => {
            // Find the last dual gauge (newly created)
            const dualGauges = document.querySelectorAll('.gauge-dual');
            if (dualGauges.length === 0) return 'no gauges';
            const lastGauge = dualGauges[dualGauges.length - 1];
            const targetDigital = lastGauge.querySelector('.dual-target-small');
            if (!targetDigital) return 'no target element';
            const style = getComputedStyle(targetDigital);
            return {
                display: style.display,
                text: targetDigital.textContent,
                visible: style.display !== 'none',
                inlineStyle: targetDigital.style.display
            };
        });
        console.log(`  New gauge (no sensor2) target label:`, newGaugeTargetDisplay);
        console.log(`  Target hidden: ${!newGaugeTargetDisplay.visible ? 'OK' : 'FAIL'}`);

        // Now add sensor2 and check it becomes visible
        console.log('\n6. Adding sensor2 to the gauge...');

        // Open config for the new gauge
        const newGaugeWidget = page.locator('.dashboard-widget:has(.gauge-dual)').last();
        await newGaugeWidget.locator('.widget-action-btn.config').click();
        await page.waitForTimeout(500);

        // Set sensor2
        await page.fill('input[name="sensor2"]', 'DG1_Load');
        await page.waitForTimeout(100);

        // Apply
        await page.click('button:has-text("Apply")');
        await page.waitForTimeout(1000);

        await page.screenshot({ path: 'debug/dual-with-sensor2.png', fullPage: true });
        console.log('  Screenshot: dual-with-sensor2.png');

        // Check if target label is now visible
        const updatedGaugeTargetDisplay = await page.evaluate(() => {
            const dualGauges = document.querySelectorAll('.gauge-dual');
            if (dualGauges.length === 0) return 'no gauges';
            const lastGauge = dualGauges[dualGauges.length - 1];
            const targetDigital = lastGauge.querySelector('.dual-target-small');
            if (!targetDigital) return 'no target element';
            const style = getComputedStyle(targetDigital);
            return {
                display: style.display,
                text: targetDigital.textContent,
                visible: style.display !== 'none',
                inlineStyle: targetDigital.style.display
            };
        });
        console.log(`  Updated gauge (with sensor2) target label:`, updatedGaugeTargetDisplay);
        console.log(`  Target visible: ${updatedGaugeTargetDisplay.visible ? 'OK' : 'FAIL'}`);

        console.log('\n=== Test Complete ===');
        console.log('\nBrowser will stay open for 20 seconds...');
        await page.waitForTimeout(20000);

    } catch (error) {
        console.error('Test error:', error);
        await page.screenshot({ path: 'debug/dual-sensor2-error.png' });
    } finally {
        await browser.close();
    }
})();
