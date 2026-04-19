const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    // Capture errors
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    console.log('Opening dashboard...');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(1000);

    // Switch to Dashboard view
    console.log('Switching to Dashboard view...');
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(500);

    // Select Diesel Generator dashboard
    const dashboardSelect = await page.$('#dashboard-select');
    if (dashboardSelect) {
        await dashboardSelect.selectOption({ label: 'Diesel Generator Control' });
        await page.waitForTimeout(1000);
        console.log('Selected Diesel Generator Control dashboard');
    }

    // Take screenshot
    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/diesel-dashboard.png', fullPage: true });

    // Count widgets by type
    const widgets = await page.$$('.dashboard-widget');
    console.log(`\nTotal widgets: ${widgets.length}`);

    const widgetCounts = {};
    for (const widget of widgets) {
        const type = await widget.getAttribute('data-type');
        widgetCounts[type] = (widgetCounts[type] || 0) + 1;
    }

    console.log('\nWidgets by type:');
    for (const [type, count] of Object.entries(widgetCounts)) {
        console.log(`  ${type}: ${count}`);
    }

    // Check for labels
    const labels = await page.$$('.dashboard-widget[data-type="label"]');
    console.log(`\nLabels found: ${labels.length}`);
    for (const label of labels) {
        const text = await label.$eval('.label-text', el => el.textContent);
        console.log(`  - "${text}"`);
    }

    // Check for status bars
    const statusBars = await page.$$('.dashboard-widget[data-type="statusbar"]');
    console.log(`\nStatus bars: ${statusBars.length}`);
    for (const bar of statusBars) {
        const indicators = await bar.$$('.statusbar-indicator');
        console.log(`  - ${indicators.length} indicators`);
    }

    // Check for bar graphs
    const barGraphs = await page.$$('.dashboard-widget[data-type="bargraph"]');
    console.log(`\nBar graphs: ${barGraphs.length}`);
    for (const graph of barGraphs) {
        const bars = await graph.$$('.bargraph-bar-container');
        console.log(`  - ${bars.length} bars`);
    }

    console.log('\nDashboard test complete! Browser stays open for 20 seconds...');
    await page.waitForTimeout(20000);
    await browser.close();
})();
