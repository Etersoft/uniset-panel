const { chromium } = require('@playwright/test');

(async () => {
    console.log('=== Dashboard Load Test ===\n');

    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    // Capture console logs
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('BROWSER ERROR:', msg.text());
        }
    });

    // Capture network errors
    page.on('requestfailed', request => {
        console.log('REQUEST FAILED:', request.url(), request.failure().errorText);
    });

    // Capture API responses
    page.on('response', async response => {
        const url = response.url();
        if (url.includes('/api/dashboards')) {
            console.log(`API ${response.status()}: ${url}`);
            if (response.status() !== 200) {
                console.log('Response:', await response.text());
            }
        }
    });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Switch to Dashboard view
    console.log('\n1. Switching to Dashboard view...');
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(1000);

    // Check dashboard list
    const dashboardList = await page.evaluate(() => {
        const items = document.querySelectorAll('.dashboards-list li');
        return Array.from(items).map(li => li.textContent.trim());
    });
    console.log('Dashboard list:', dashboardList);

    // Try to load System Overview
    console.log('\n2. Loading System Overview...');
    const hasSystemOverview = await page.locator('.dashboards-list li:has-text("System Overview")').count();

    if (hasSystemOverview > 0) {
        await page.click('.dashboards-list li:has-text("System Overview")');
        await page.waitForTimeout(2000);

        // Check if widgets loaded
        const widgetCount = await page.locator('.dashboard-widget').count();
        console.log('Widgets loaded:', widgetCount);

        // Check widget types
        const widgetTypes = await page.evaluate(() => {
            const widgets = document.querySelectorAll('.dashboard-widget');
            return Array.from(widgets).map(w => ({
                id: w.dataset.id,
                type: w.dataset.type
            }));
        });
        console.log('Widget details:', JSON.stringify(widgetTypes, null, 2));

        // Check dashboardState
        const stateCheck = await page.evaluate(() => {
            if (typeof dashboardState === 'undefined') {
                return { error: 'dashboardState not defined' };
            }
            const current = dashboardState.currentDashboard;
            const dashboard = dashboardState.dashboards.get(current);
            return {
                currentDashboard: current,
                hasDashboard: !!dashboard,
                widgetCount: dashboard?.widgets?.length || 0,
                firstWidget: dashboard?.widgets?.[0] || null
            };
        });
        console.log('\nDashboard state:', JSON.stringify(stateCheck, null, 2));

        // Check for any errors in widget rendering
        const errors = await page.evaluate(() => {
            const errorElements = document.querySelectorAll('.widget-error, .error');
            return Array.from(errorElements).map(el => el.textContent);
        });
        if (errors.length > 0) {
            console.log('\nWidget errors:', errors);
        }

    } else {
        console.log('ERROR: System Overview not found in list!');

        // Check API directly
        console.log('\nChecking API directly...');
        const apiResponse = await page.evaluate(async () => {
            try {
                const listRes = await fetch('/api/dashboards');
                const list = await listRes.json();
                return { list, listStatus: listRes.status };
            } catch (e) {
                return { error: e.message };
            }
        });
        console.log('API response:', JSON.stringify(apiResponse, null, 2));
    }

    // Take screenshot
    await page.screenshot({ path: 'tests/debug/dashboard-load-test.png' });
    console.log('\nScreenshot saved to tests/debug/dashboard-load-test.png');

    console.log('\n=== Test Complete ===');
    await page.waitForTimeout(3000);
    await browser.close();
})();
