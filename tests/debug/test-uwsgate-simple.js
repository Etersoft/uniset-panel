const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const page = await browser.newPage();

    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('SSE') || text.includes('chart') || text.includes('UWebSocket') || text.includes('Error')) {
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

    // Expand server 8081 and click UWebSocketGate1
    console.log('=== Opening UWebSocketGate1 ===');
    await page.evaluate(() => {
        const groups = document.querySelectorAll('.server-group');
        for (const group of groups) {
            const header = group.querySelector('.server-group-header');
            if (header && header.textContent.includes('8081')) {
                header.click();
                break;
            }
        }
    });
    await page.waitForTimeout(500);
    
    await page.evaluate(() => {
        const names = document.querySelectorAll('.object-name');
        for (const name of names) {
            if (name.textContent.includes('UWebSocketGate')) {
                name.click();
                break;
            }
        }
    });
    await page.waitForTimeout(2000);

    // Type AI in input to get autocomplete
    console.log('=== Adding sensor via autocomplete ===');
    const input = await page.$('.tab-panel.active .uwsgate-sensor-input');
    if (input) {
        await input.focus();
        await input.type('AI_AS', { delay: 50 });
        await page.waitForTimeout(500);
        
        // Press Enter to add
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);
    }

    // Check table
    const tableInfo = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const rows = panel?.querySelectorAll('.uwsgate-sensors-table tbody tr');
        return {
            rowCount: rows?.length || 0,
            sensors: Array.from(rows || []).map(r => ({
                name: r.querySelector('td:nth-child(3)')?.textContent?.trim(),
                value: r.querySelector('td:nth-child(5)')?.textContent?.trim()
            }))
        };
    });
    console.log('Table:', JSON.stringify(tableInfo, null, 2));

    // Click chart checkbox
    console.log('=== Adding chart ===');
    await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const checkbox = panel?.querySelector('.uwsgate-chart-checkbox');
        if (checkbox) {
            checkbox.click();
            console.log('Clicked chart checkbox');
        }
    });
    await page.waitForTimeout(1000);

    // Check chart state
    const chartState = await page.evaluate(() => {
        for (const [key, tabState] of (window.state?.tabs || new Map()).entries()) {
            if (key.includes('UWebSocketGate')) {
                return {
                    tabKey: key,
                    chartsCount: tabState.charts?.size || 0,
                    chartKeys: Array.from(tabState.charts?.keys() || [])
                };
            }
        }
        return { error: 'No tab' };
    });
    console.log('Chart state:', JSON.stringify(chartState));

    // Wait for SSE updates
    console.log('=== Waiting 10 seconds for SSE updates ===');
    await page.waitForTimeout(10000);

    // Final chart state
    const finalState = await page.evaluate(() => {
        for (const [key, tabState] of (window.state?.tabs || new Map()).entries()) {
            if (key.includes('UWebSocketGate')) {
                return {
                    chartsData: Array.from(tabState.charts?.entries() || []).map(([k, v]) => ({
                        varName: k,
                        dataPoints: v.chart?.data?.datasets?.[0]?.data?.length || 0,
                        lastValue: v.chart?.data?.datasets?.[0]?.data?.slice(-1)?.[0]?.y
                    }))
                };
            }
        }
        return {};
    });
    console.log('Final state:', JSON.stringify(finalState, null, 2));

    await page.screenshot({ path: '/tmp/uwsgate-simple.png', fullPage: true });
    console.log('Screenshot: /tmp/uwsgate-simple.png');

    // Summary
    const dataPoints = finalState.chartsData?.[0]?.dataPoints || 0;
    console.log(`\n=== RESULT: ${dataPoints} data points ===`);
    console.log(dataPoints > 0 ? '✅ Chart updating!' : '❌ Chart not updating (sensor value may be static)');

    await browser.close();
})();
