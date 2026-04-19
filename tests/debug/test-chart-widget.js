const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 300 });
    const page = await browser.newPage();

    page.on('console', msg => {
        console.log('BROWSER:', msg.text());
    });

    page.on('pageerror', err => {
        console.log('PAGE ERROR:', err.message);
    });

    page.on('requestfailed', request => {
        console.log('FAILED:', request.url(), request.failure()?.errorText);
    });

    await page.goto('http://localhost:8000');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Switch to Dashboard view
    console.log('Switching to Dashboard view...');
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(1000);

    // Click on System Overview in sidebar
    console.log('Clicking on System Overview in sidebar...');
    await page.click('.dashboards-list li:has-text("System Overview")');
    await page.waitForTimeout(1000);

    // Find chart widget
    const chartWidget = await page.locator('.dashboard-widget[data-type="chart"]').first();
    if (await chartWidget.count() === 0) {
        console.log('No chart widget found');
        // Print all widgets
        const widgets = await page.locator('.dashboard-widget').all();
        console.log('Total widgets:', widgets.length);
        for (const w of widgets) {
            const type = await w.getAttribute('data-type');
            console.log('Widget type:', type);
        }
        await page.waitForTimeout(5000);
        await browser.close();
        return;
    }

    console.log('Chart widget found');

    // Check canvas dimensions
    const canvas = await chartWidget.locator('canvas').first();
    const canvasBounds = await canvas.boundingBox();
    console.log('Canvas bounds:', canvasBounds);

    // Check if chart is initialized
    const chartExists = await page.evaluate(() => {
        const canvas = document.querySelector('.dashboard-widget[data-type="chart"] canvas');
        if (!canvas) return { exists: false };

        // Chart.js stores chart instance on canvas
        const chart = Chart.getChart(canvas);
        if (!chart) return { exists: false, reason: 'No Chart.js instance' };

        return {
            exists: true,
            datasets: chart.data.datasets.length,
            dataPoints: chart.data.datasets.map(d => d.data.length)
        };
    });
    console.log('Chart info:', chartExists);

    // Check table
    const tableRows = await chartWidget.locator('.chart-widget-table tbody tr').count();
    console.log('Table rows:', tableRows);

    const tableHeaders = await chartWidget.locator('.chart-widget-table thead th').allTextContents();
    console.log('Table headers:', tableHeaders);

    // Take screenshot
    await page.screenshot({ path: '/tmp/chart-widget-test.png', fullPage: true });
    console.log('Screenshot saved to /tmp/chart-widget-test.png');

    console.log('Test complete. Browser will stay open for 10s...');
    await page.waitForTimeout(10000);
    await browser.close();
})();
