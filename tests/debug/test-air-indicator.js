/**
 * Test compressed air indicator on diesel generator dashboard
 */

const { chromium } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8001';

(async () => {
    console.log('=== Air Indicator Test ===\n');
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

        await page.screenshot({ path: 'debug/air-indicator-dashboard.png', fullPage: true });
        console.log('  Screenshot: air-indicator-dashboard.png');

        // Check if air level widgets exist
        const levelWidgets = await page.locator('.level-widget').count();
        console.log(`\n3. Level widgets found: ${levelWidgets}`);

        // Check for specific air indicators by sensor
        const dg1AirValue = await page.evaluate(() => {
            const widgets = document.querySelectorAll('.level-widget');
            for (const w of widgets) {
                const title = w.querySelector('.widget-title-label');
                if (title && title.textContent.includes('Air')) {
                    const value = w.querySelector('.level-value');
                    return value ? value.textContent : 'no value';
                }
            }
            return 'not found';
        });
        console.log(`  DG1 Air indicator: ${dg1AirValue}`);

        // Count widgets with "Air" title
        const airWidgetCount = await page.evaluate(() => {
            const widgets = document.querySelectorAll('.dashboard-widget');
            let count = 0;
            for (const w of widgets) {
                const title = w.querySelector('.widget-title-label');
                if (title && title.textContent.includes('Air')) {
                    count++;
                }
            }
            return count;
        });
        console.log(`  Air widgets count: ${airWidgetCount}`);

        // Check fuel/air indicators layout
        console.log('\n4. Checking Fuel/Air layout...');
        const fuelAirWidgets = await page.evaluate(() => {
            const result = [];
            const widgets = document.querySelectorAll('.dashboard-widget');
            for (const w of widgets) {
                const title = w.querySelector('.widget-title-label');
                if (title && (title.textContent.includes('Fuel') || title.textContent.includes('Air'))) {
                    const rect = w.getBoundingClientRect();
                    result.push({
                        title: title.textContent,
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height)
                    });
                }
            }
            return result.sort((a, b) => a.x - b.x);
        });
        console.log('  Fuel/Air widgets layout:');
        fuelAirWidgets.forEach(w => {
            console.log(`    ${w.title}: x=${w.x}, y=${w.y}, size=${w.width}x${w.height}`);
        });

        console.log('\n=== Test Complete ===');
        console.log('\nBrowser will stay open for 30 seconds...');
        await page.waitForTimeout(30000);

    } catch (error) {
        console.error('Test error:', error);
        await page.screenshot({ path: 'debug/air-indicator-error.png' });
    } finally {
        await browser.close();
    }
})();
