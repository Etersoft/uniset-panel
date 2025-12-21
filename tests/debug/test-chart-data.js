const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('SSE') || text.includes('chart') || text.includes('uwsgate') || text.includes('UWebSocket')) {
            console.log('BROWSER:', text);
        }
    });

    console.log('=== Opening UniSet Panel ===');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Take control
    await page.evaluate(async () => {
        await fetch('/api/control/take', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'admin123' })
        });
    });
    await page.waitForTimeout(500);

    // Open UWebSocketGate1
    console.log('=== Opening UWebSocketGate1 ===');
    await page.evaluate(() => {
        document.querySelectorAll('.server-group').forEach(g => {
            if (g.querySelector('.server-group-header')?.textContent.includes('8081')) {
                g.querySelector('.server-group-header').click();
            }
        });
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
        document.querySelectorAll('.object-name').forEach(n => {
            if (n.textContent.includes('UWebSocketGate')) n.click();
        });
    });
    await page.waitForTimeout(2000);

    // Add sensor
    console.log('=== Adding sensor ===');
    const input = await page.$('.tab-panel.active .uwsgate-sensor-input');
    if (input) {
        await input.focus();
        await input.type('Sensor15099_S', { delay: 30 });
        await page.waitForTimeout(300);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);
    }

    // Add to chart
    console.log('=== Adding to chart ===');
    await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const checkbox = panel?.querySelector('.uwsgate-chart-checkbox');
        if (checkbox && !checkbox.checked) {
            checkbox.click();
        }
    });
    await page.waitForTimeout(1000);

    // Initial chart state
    let chartState = await page.evaluate(() => {
        for (const [key, tabState] of (window.state?.tabs || new Map()).entries()) {
            if (key.includes('UWebSocketGate')) {
                const chartData = tabState.charts?.get('ws:Sensor15099_S');
                return {
                    tabKey: key,
                    hasChart: !!chartData,
                    dataPoints: chartData?.chart?.data?.datasets?.[0]?.data?.length || 0,
                    lastPoints: chartData?.chart?.data?.datasets?.[0]?.data?.slice(-5).map(d => ({x: d.x, y: d.y})) || []
                };
            }
        }
        return {};
    });
    console.log('Chart state BEFORE wait:', JSON.stringify(chartState, null, 2));

    // Wait for SSE updates
    console.log('\n=== Waiting 10 seconds for SSE updates ===');
    await page.waitForTimeout(10000);

    // Final chart state
    chartState = await page.evaluate(() => {
        for (const [key, tabState] of (window.state?.tabs || new Map()).entries()) {
            if (key.includes('UWebSocketGate')) {
                const chartData = tabState.charts?.get('ws:Sensor15099_S');
                return {
                    hasChart: !!chartData,
                    dataPoints: chartData?.chart?.data?.datasets?.[0]?.data?.length || 0,
                    lastPoints: chartData?.chart?.data?.datasets?.[0]?.data?.slice(-5).map(d => ({x: d.x, y: d.y})) || []
                };
            }
        }
        return {};
    });
    console.log('Chart state AFTER wait:', JSON.stringify(chartState, null, 2));

    // Check table value changes
    const tableValue = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const row = panel?.querySelector('.uwsgate-sensors-table tbody tr');
        return row?.querySelector('td:nth-child(5)')?.textContent?.trim();
    });
    console.log('Current table value:', tableValue);

    await page.screenshot({ path: '/tmp/chart-data-test.png', fullPage: true });
    console.log('\nScreenshot: /tmp/chart-data-test.png');

    console.log('\n=== RESULT ===');
    console.log(chartState.dataPoints > 0 ? `✅ Chart has ${chartState.dataPoints} data points` : '❌ Chart has no data points');

    await browser.close();
})();
