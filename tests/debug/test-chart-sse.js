const { chromium } = require('@playwright/test');

(async () => {
    console.log('Starting Chart SSE Debug Test...');

    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    // Track console
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('SSE') || text.includes('chart') || text.includes('sensor')) {
            console.log('BROWSER:', text);
        }
    });

    page.on('pageerror', err => {
        console.log('PAGE ERROR:', err.message);
    });

    // Track SSE events
    await page.route('**/api/events', async route => {
        console.log('SSE: Events connection initiated');
        route.continue();
    });

    // Navigate to app
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Switch to Dashboard view
    console.log('Switching to Dashboard view...');
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(1000);

    // Load System Overview
    console.log('Loading System Overview...');
    await page.click('.dashboards-list li:has-text("System Overview")');
    await page.waitForTimeout(2000);

    // Check chart subscription state
    const subscriptionState = await page.evaluate(() => {
        const state = {
            chartSubscriptionsSize: dashboardState?.chartSubscriptions?.size || 0,
            chartSubscriptions: [],
            widgets: []
        };

        if (dashboardState?.chartSubscriptions) {
            dashboardState.chartSubscriptions.forEach((widgetIds, sensorName) => {
                state.chartSubscriptions.push({
                    sensor: sensorName,
                    widgetIds: Array.from(widgetIds)
                });
            });
        }

        if (dashboardState?.widgets) {
            dashboardState.widgets.forEach((widget, id) => {
                if (widget.constructor.name === 'ChartWidget') {
                    state.widgets.push({
                        id,
                        type: widget.constructor.name,
                        chartsCount: widget.charts?.size || 0,
                        sensorDataCount: widget.sensorData?.size || 0
                    });
                }
            });
        }

        return state;
    });

    console.log('\n=== Subscription State ===');
    console.log('Chart subscriptions:', JSON.stringify(subscriptionState, null, 2));

    // Inject logging for handleSensorUpdate
    await page.evaluate(() => {
        if (window.dashboardManager) {
            const original = window.dashboardManager.handleSensorUpdate.bind(window.dashboardManager);
            window.dashboardManager.handleSensorUpdate = function(sensorName, value, error, timestamp) {
                console.log(`[handleSensorUpdate] sensor=${sensorName} value=${value} ts=${timestamp}`);
                return original(sensorName, value, error, timestamp);
            };
            console.log('Injected logging for handleSensorUpdate');
        }
    });

    // Monitor for 15 seconds
    console.log('\n=== Monitoring for 15 seconds ===');
    for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(1000);

        const chartState = await page.evaluate(() => {
            const results = [];
            const widgets = document.querySelectorAll('.dashboard-widget[data-type="chart"]');
            widgets.forEach((w, idx) => {
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

        console.log(`[${i + 1}s] Chart data points:`, JSON.stringify(chartState));
    }

    console.log('\nTest complete. Browser staying open for 10s...');
    await page.waitForTimeout(10000);
    await browser.close();
})();
