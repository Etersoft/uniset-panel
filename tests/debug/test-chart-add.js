const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    page.on('console', msg => {
        console.log('BROWSER:', msg.text());
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

    // Add sensor first
    console.log('=== Adding sensor ===');
    const input = await page.$('.tab-panel.active .uwsgate-sensor-input');
    if (input) {
        await input.focus();
        await input.type('Sensor15099_S', { delay: 30 });
        await page.waitForTimeout(300);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);
    }

    // Check table
    let tableInfo = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const rows = panel?.querySelectorAll('.uwsgate-sensors-table tbody tr');
        return Array.from(rows || []).map(r => ({
            name: r.querySelector('td:nth-child(3)')?.textContent?.trim(),
            checkbox: r.querySelector('.uwsgate-chart-checkbox')?.outerHTML
        }));
    });
    console.log('Table:', JSON.stringify(tableInfo, null, 2));

    // Try to click chart checkbox
    console.log('\n=== Clicking chart checkbox ===');
    const checkboxInfo = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const checkbox = panel?.querySelector('.uwsgate-chart-checkbox');
        if (!checkbox) return { found: false };
        return {
            found: true,
            checked: checkbox.checked,
            sensorName: checkbox.dataset.name,
            id: checkbox.id,
            html: checkbox.outerHTML
        };
    });
    console.log('Checkbox info:', JSON.stringify(checkboxInfo, null, 2));

    if (checkboxInfo.found) {
        await page.evaluate(() => {
            const panel = document.querySelector('.tab-panel.active');
            const checkbox = panel?.querySelector('.uwsgate-chart-checkbox');
            if (checkbox) {
                console.log('Clicking checkbox for:', checkbox.dataset.name);
                checkbox.click();
            }
        });
        await page.waitForTimeout(1000);
    }

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
        return { error: 'No tab found' };
    });
    console.log('Chart state after click:', JSON.stringify(chartState, null, 2));

    // Check if chart panel exists
    const chartPanelInfo = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const chartPanels = panel?.querySelectorAll('.chart-panel');
        return {
            count: chartPanels?.length || 0,
            ids: Array.from(chartPanels || []).map(p => p.id)
        };
    });
    console.log('Chart panels:', JSON.stringify(chartPanelInfo));

    await page.screenshot({ path: '/tmp/chart-add-test.png', fullPage: true });
    console.log('\nScreenshot: /tmp/chart-add-test.png');

    await page.waitForTimeout(3000);
    await browser.close();
})();
