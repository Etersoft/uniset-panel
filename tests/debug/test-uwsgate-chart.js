const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const page = await browser.newPage();

    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('SSE') || text.includes('chart') || text.includes('Error')) {
            console.log('BROWSER:', text);
        }
    });

    console.log('=== Opening UniSet Panel ===');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Take control
    console.log('=== Taking control ===');
    await page.evaluate(async () => {
        await fetch('/api/control/take', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'admin123' })
        });
    });
    await page.waitForTimeout(500);

    // Expand server 8081
    console.log('=== Expanding server 8081 ===');
    await page.evaluate(() => {
        const groups = document.querySelectorAll('.server-group');
        for (const group of groups) {
            const header = group.querySelector('.server-group-header');
            if (header && header.textContent.includes('8081')) {
                header.click();
                console.log('Expanded 8081');
                break;
            }
        }
    });
    await page.waitForTimeout(1000);

    // Click UWebSocketGate1
    console.log('=== Opening UWebSocketGate1 ===');
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

    // Subscribe to UNET_DATA3_S via API
    console.log('=== Subscribing to UNET_DATA3_S via API ===');
    const subscribeResult = await page.evaluate(async () => {
        const resp = await fetch('/api/objects/UWebSocketGate1/uwsgate/subscribe?server=b213ecea', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sensors: ['UNET_DATA3_S'] })
        });
        return await resp.json();
    });
    console.log('Subscribe result:', subscribeResult);
    await page.waitForTimeout(1000);

    // Refresh the sensors table
    await page.reload();
    await page.waitForTimeout(3000);

    // Re-open UWebSocketGate1
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

    // Check if UNET_DATA3_S is in the table
    const tableInfo = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        if (!panel) return { error: 'No active panel' };
        
        const rows = panel.querySelectorAll('.uwsgate-sensors-table tbody tr');
        return {
            rowCount: rows.length,
            sensors: Array.from(rows).map(r => ({
                name: r.querySelector('td:nth-child(3)')?.textContent?.trim(),
                value: r.querySelector('td:nth-child(5)')?.textContent?.trim()
            }))
        };
    });
    console.log('Table:', JSON.stringify(tableInfo, null, 2));

    // Click chart checkbox for UNET_DATA3_S
    console.log('=== Adding chart for UNET_DATA3_S ===');
    const checkboxResult = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const checkboxes = panel?.querySelectorAll('.uwsgate-chart-checkbox');
        if (checkboxes && checkboxes.length > 0) {
            checkboxes[0].click();
            const sensorName = checkboxes[0].closest('tr')?.querySelector('td:nth-child(3)')?.textContent;
            return { clicked: true, sensorName, checked: checkboxes[0].checked };
        }
        return { clicked: false, error: 'No checkboxes' };
    });
    console.log('Checkbox result:', checkboxResult);
    await page.waitForTimeout(1000);

    // Check chart state before waiting
    const chartStateBefore = await page.evaluate(() => {
        const tabs = window.state?.tabs;
        if (!tabs) return { error: 'No state.tabs' };
        for (const [key, tabState] of tabs.entries()) {
            if (key.includes('UWebSocketGate')) {
                return {
                    tabKey: key,
                    chartsCount: tabState.charts?.size || 0,
                    chartKeys: tabState.charts ? Array.from(tabState.charts.keys()) : [],
                    chartsData: tabState.charts ? Array.from(tabState.charts.entries()).map(([k, v]) => ({
                        varName: k,
                        dataPoints: v.chart?.data?.datasets?.[0]?.data?.length || 0
                    })) : []
                };
            }
        }
        return { error: 'Tab not found' };
    });
    console.log('Chart state BEFORE wait:', JSON.stringify(chartStateBefore, null, 2));

    // Wait for SSE updates
    console.log('=== Waiting 10 seconds for chart updates ===');
    await page.waitForTimeout(10000);

    // Check chart state after waiting
    const chartStateAfter = await page.evaluate(() => {
        const tabs = window.state?.tabs;
        if (!tabs) return { error: 'No state.tabs' };
        for (const [key, tabState] of tabs.entries()) {
            if (key.includes('UWebSocketGate')) {
                return {
                    tabKey: key,
                    chartsData: tabState.charts ? Array.from(tabState.charts.entries()).map(([k, v]) => ({
                        varName: k,
                        dataPoints: v.chart?.data?.datasets?.[0]?.data?.length || 0,
                        lastValue: v.chart?.data?.datasets?.[0]?.data?.slice(-1)?.[0]?.y
                    })) : []
                };
            }
        }
        return { error: 'Tab not found' };
    });
    console.log('Chart state AFTER wait:', JSON.stringify(chartStateAfter, null, 2));

    // Screenshot
    await page.screenshot({ path: '/tmp/uwsgate-chart-test.png', fullPage: true });
    console.log('Screenshot: /tmp/uwsgate-chart-test.png');

    // Summary
    console.log('\n========== SUMMARY ==========');
    const dataPointsBefore = chartStateBefore.chartsData?.[0]?.dataPoints || 0;
    const dataPointsAfter = chartStateAfter.chartsData?.[0]?.dataPoints || 0;
    console.log(`Chart data points: ${dataPointsBefore} -> ${dataPointsAfter}`);
    console.log(dataPointsAfter > dataPointsBefore ? '✅ Chart is updating!' : '❌ Chart not updating');
    console.log('==============================');

    await browser.close();
})();
