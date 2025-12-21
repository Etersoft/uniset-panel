const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('SSE') || text.includes('chart') || text.includes('UWebSocket')) {
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

    // Type UNET_DATA3_S and add
    console.log('=== Adding UNET_DATA3_S sensor ===');
    const input = await page.$('.tab-panel.active .uwsgate-sensor-input');
    if (input) {
        await input.focus();
        await input.type('UNET_DATA3_S', { delay: 30 });
        await page.waitForTimeout(300);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);
    }

    // Check table
    const tableInfo = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const rows = panel?.querySelectorAll('.uwsgate-sensors-table tbody tr');
        return Array.from(rows || []).map(r => ({
            name: r.querySelector('td:nth-child(3)')?.textContent?.trim(),
            value: r.querySelector('td:nth-child(5)')?.textContent?.trim()
        }));
    });
    console.log('Table sensors:', JSON.stringify(tableInfo));

    // Add to chart
    console.log('=== Adding to chart ===');
    await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const checkbox = panel?.querySelector('.uwsgate-chart-checkbox');
        if (checkbox) checkbox.click();
    });
    await page.waitForTimeout(1000);

    // Check chart state
    let chartState = await page.evaluate(() => {
        for (const [key, tabState] of (window.state?.tabs || new Map()).entries()) {
            if (key.includes('UWebSocketGate')) {
                return {
                    chartsCount: tabState.charts?.size || 0,
                    chartKeys: Array.from(tabState.charts?.keys() || []),
                    dataPoints: Array.from(tabState.charts?.values() || []).map(c => 
                        c.chart?.data?.datasets?.[0]?.data?.length || 0
                    )
                };
            }
        }
        return {};
    });
    console.log('Chart state BEFORE:', JSON.stringify(chartState));

    // Wait for SSE updates
    console.log('=== Waiting 8 seconds for SSE updates ===');
    await page.waitForTimeout(8000);

    // Final check
    chartState = await page.evaluate(() => {
        for (const [key, tabState] of (window.state?.tabs || new Map()).entries()) {
            if (key.includes('UWebSocketGate')) {
                return {
                    chartsCount: tabState.charts?.size || 0,
                    chartKeys: Array.from(tabState.charts?.keys() || []),
                    dataPoints: Array.from(tabState.charts?.values() || []).map(c => 
                        c.chart?.data?.datasets?.[0]?.data?.length || 0
                    ),
                    lastValues: Array.from(tabState.charts?.values() || []).map(c => 
                        c.chart?.data?.datasets?.[0]?.data?.slice(-3).map(d => d.y)
                    )
                };
            }
        }
        return {};
    });
    console.log('Chart state AFTER:', JSON.stringify(chartState, null, 2));

    await page.screenshot({ path: '/tmp/unet-data3-chart.png', fullPage: true });

    const dataPointsAfter = chartState.dataPoints?.[0] || 0;
    console.log(`\n=== RESULT: ${dataPointsAfter} data points ===`);
    console.log(dataPointsAfter > 0 ? '✅ SUCCESS: Chart is updating!' : '❌ FAIL: Chart not updating');

    await browser.close();
})();
