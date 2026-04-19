const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    // Track errors
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('ERROR:', msg.text());
        }
    });

    page.on('pageerror', err => {
        console.log('PAGE ERROR:', err.message);
    });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Switch to Dashboard
    console.log('Switching to Dashboard...');
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(1000);

    // Click System Overview
    console.log('Loading System Overview...');
    await page.click('.dashboards-list li:has-text("System Overview")');
    await page.waitForTimeout(2000);

    // Check how many chart widgets exist
    const chartWidgets = await page.locator('.dashboard-widget[data-type="chart"]').count();
    console.log('Chart widgets found:', chartWidgets);

    // Check how many intervals are running
    const intervalCount = await page.evaluate(() => {
        // Count active intervals (approximate)
        let count = 0;
        const originalSetInterval = window.setInterval;
        return 'Cannot count intervals directly';
    });
    console.log('Intervals:', intervalCount);

    // Monitor for 10 seconds
    console.log('Monitoring for 10 seconds...');
    for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(1000);

        // Check chart data points
        const dataPoints = await page.evaluate(() => {
            const widgets = document.querySelectorAll('.dashboard-widget[data-type="chart"]');
            const results = [];
            widgets.forEach(w => {
                const canvas = w.querySelector('canvas');
                if (canvas) {
                    const chart = Chart.getChart(canvas);
                    if (chart) {
                        const points = chart.data.datasets.reduce((sum, d) => sum + d.data.length, 0);
                        results.push(points);
                    }
                }
            });
            return results;
        });
        console.log(`[${i+1}s] Data points:`, dataPoints);
    }

    console.log('Test complete');
    await page.waitForTimeout(5000);
    await browser.close();
})();
