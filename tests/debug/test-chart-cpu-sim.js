const { chromium } = require('@playwright/test');

(async () => {
    console.log('Starting Chart CPU Simulation Test...');

    const browser = await chromium.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();

    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('Error') || text.includes('CPU')) {
            console.log('BROWSER:', text);
        }
    });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Switch to Dashboard
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(1000);

    // Load System Overview
    await page.click('.dashboards-list li:has-text("System Overview")');
    await page.waitForTimeout(2000);

    // Check if chart widget exists
    const chartWidgets = await page.locator('.dashboard-widget[data-type="chart"]').count();
    console.log('Chart widgets found:', chartWidgets);

    if (chartWidgets === 0) {
        console.log('No chart widgets found');
        await browser.close();
        return;
    }

    // Simulate rapid data updates
    console.log('Simulating rapid data updates...');

    await page.evaluate(() => {
        const widget = Array.from(dashboardState.widgets.values()).find(w => w.constructor.name === 'ChartWidget');
        if (!widget) {
            console.log('No ChartWidget found');
            return;
        }

        console.log('Found ChartWidget, starting simulation...');

        // Simulate 100 updates per second for 10 seconds
        let updateCount = 0;
        const startTime = Date.now();

        const interval = setInterval(() => {
            const now = Date.now();
            const value1 = 50 + Math.sin(now / 1000) * 30;
            const value2 = 50 + Math.cos(now / 1000) * 30;

            widget.updateSensor('Sensor15099_S', value1, now);
            widget.updateSensor('AI70_S', value2, now);

            updateCount += 2;

            if (now - startTime > 10000) {
                clearInterval(interval);
                console.log('Simulation complete. Total updates:', updateCount);
            }
        }, 10); // 100 updates per second
    });

    // Monitor for 15 seconds
    console.log('Monitoring chart performance...');
    for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(1000);

        const metrics = await page.evaluate(() => {
            const results = [];
            document.querySelectorAll('.dashboard-widget[data-type="chart"]').forEach((w, idx) => {
                const canvas = w.querySelector('canvas');
                if (canvas) {
                    const chart = Chart.getChart(canvas);
                    if (chart) {
                        const points = chart.data.datasets.map(d => d.data.length);
                        results.push({ idx, points });
                    }
                }
            });
            return results;
        });

        console.log('[' + (i + 1) + 's] Chart data:', JSON.stringify(metrics));
    }

    console.log('Test complete. Browser staying open for 5s...');
    await page.waitForTimeout(5000);
    await browser.close();
})();
