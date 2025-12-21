const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    page.on('console', msg => console.log('BROWSER:', msg.text()));

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

    // Check table structure
    const tableStructure = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const tbody = panel?.querySelector('.uwsgate-sensors-table tbody');
        const rows = tbody?.querySelectorAll('tr');

        return {
            tbodyExists: !!tbody,
            rowCount: rows?.length || 0,
            firstRowHTML: rows?.[0]?.innerHTML?.substring(0, 500),
            checkboxes: Array.from(panel?.querySelectorAll('.uwsgate-chart-checkbox') || []).map(cb => ({
                tagName: cb.tagName,
                type: cb.type,
                className: cb.className,
                dataName: cb.dataset.name,
                hasChangeListener: cb.onchange !== null
            }))
        };
    });
    console.log('Table structure:', JSON.stringify(tableStructure, null, 2));

    // Try to manually trigger change event
    console.log('\n=== Manually triggering change event ===');
    await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const checkbox = panel?.querySelector('.uwsgate-chart-checkbox');
        if (checkbox) {
            console.log('Dispatching change event on checkbox');
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    await page.waitForTimeout(1000);

    // Check if chart was added
    const chartState = await page.evaluate(() => {
        for (const [key, tabState] of (window.state?.tabs || new Map()).entries()) {
            if (key.includes('UWebSocketGate')) {
                return {
                    chartsCount: tabState.charts?.size || 0,
                    chartKeys: Array.from(tabState.charts?.keys() || [])
                };
            }
        }
        return {};
    });
    console.log('Chart state:', JSON.stringify(chartState));

    await page.waitForTimeout(3000);
    await browser.close();
})();
