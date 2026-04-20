const { chromium } = require('@playwright/test');

(async () => {
    console.log('Starting Chart Performance Test...');

    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    // Track console
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('Error') || text.includes('error')) {
            console.log('ERROR:', text);
        }
    });

    page.on('pageerror', err => {
        console.log('PAGE ERROR:', err.message);
    });

    // Navigate to app
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Switch to Dashboard view
    console.log('Switching to Dashboard view...');
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(1000);

    // Check if System Overview exists
    const systemOverview = await page.locator('.dashboards-list li:has-text("System Overview")').count();
    if (systemOverview === 0) {
        console.log('System Overview dashboard not found, checking available dashboards...');
        const dashboards = await page.locator('.dashboards-list li').allTextContents();
        console.log('Available dashboards:', dashboards);

        if (dashboards.length === 0) {
            console.log('No dashboards found. Creating test chart widget...');

            // Create a new dashboard with chart widget
            await page.click('.dashboard-add-btn');
            await page.waitForTimeout(500);
            await page.fill('input[name="name"]', 'Test Chart');
            await page.click('button:has-text("Create")');
            await page.waitForTimeout(1000);

            // Add chart widget
            await page.click('.add-widget-btn');
            await page.waitForTimeout(500);
            await page.click('.widget-type-btn[data-type="chart"]');
            await page.waitForTimeout(500);
        }
    } else {
        console.log('Loading System Overview...');
        await page.click('.dashboards-list li:has-text("System Overview")');
        await page.waitForTimeout(2000);
    }

    // Check chart widgets
    const chartWidgets = await page.locator('.dashboard-widget[data-type="chart"]').count();
    console.log('Chart widgets found:', chartWidgets);

    if (chartWidgets === 0) {
        console.log('No chart widgets found');
        await page.waitForTimeout(5000);
        await browser.close();
        return;
    }

    // Check chart performance metrics
    console.log('Monitoring chart performance for 15 seconds...');

    for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(1000);

        const metrics = await page.evaluate(() => {
            const widgets = document.querySelectorAll('.dashboard-widget[data-type="chart"]');
            const results = [];

            widgets.forEach((w, idx) => {
                const canvas = w.querySelector('canvas');
                if (canvas) {
                    const chart = Chart.getChart(canvas);
                    if (chart) {
                        const dataPoints = chart.data.datasets.reduce((sum, d) => sum + d.data.length, 0);
                        const datasetsCount = chart.data.datasets.length;
                        results.push({
                            widget: idx,
                            datasets: datasetsCount,
                            points: dataPoints
                        });
                    }
                }
            });

            return results;
        });

        console.log(`[${i + 1}s] Charts:`, JSON.stringify(metrics));
    }

    // Test visibility change (minimize/restore simulation)
    console.log('\nTesting visibility change...');
    await page.evaluate(() => {
        // Simulate visibility change
        Object.defineProperty(document, 'hidden', { value: true, writable: true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { value: false, writable: true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(2000);

    // Check if charts are still working
    const chartsWorking = await page.evaluate(() => {
        const canvas = document.querySelector('.dashboard-widget[data-type="chart"] canvas');
        if (!canvas) return { ok: false, reason: 'no canvas' };
        const chart = Chart.getChart(canvas);
        if (!chart) return { ok: false, reason: 'no chart instance' };
        return { ok: true, datasets: chart.data.datasets.length };
    });
    console.log('Charts after visibility change:', chartsWorking);

    console.log('\nTest complete. Browser staying open for 10s...');
    await page.waitForTimeout(10000);
    await browser.close();
})();
