const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 150 });
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

    // Type partial name and select from autocomplete
    console.log('=== Typing "15099" and selecting from autocomplete ===');
    const input = await page.$('.tab-panel.active .uwsgate-sensor-input');
    if (input) {
        await input.focus();
        await input.type('15099', { delay: 50 });
        await page.waitForTimeout(500);

        // Check autocomplete
        const autocomplete = await page.evaluate(() => {
            const items = document.querySelectorAll('.uwsgate-autocomplete-item');
            return Array.from(items).map(i => ({
                name: i.dataset.name,
                text: i.textContent.trim().substring(0, 50)
            }));
        });
        console.log('Autocomplete items:', JSON.stringify(autocomplete));

        // Click first autocomplete item
        if (autocomplete.length > 0) {
            console.log('Clicking autocomplete item:', autocomplete[0].name);
            await page.evaluate(() => {
                const item = document.querySelector('.uwsgate-autocomplete-item');
                if (item) item.click();
            });
            await page.waitForTimeout(1000);
        }
    }

    // Check table
    let tableInfo = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const rows = panel?.querySelectorAll('.uwsgate-sensors-table tbody tr');
        return Array.from(rows || []).map(r => ({
            name: r.querySelector('td:nth-child(3)')?.textContent?.trim(),
            value: r.querySelector('td:nth-child(5)')?.textContent?.trim(),
            checkboxHtml: r.querySelector('.uwsgate-chart-checkbox')?.outerHTML
        }));
    });
    console.log('Table after autocomplete select:', JSON.stringify(tableInfo, null, 2));

    // Now click the chart checkbox
    console.log('\n=== Clicking chart checkbox ===');
    await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const checkbox = panel?.querySelector('.uwsgate-chart-checkbox');
        if (checkbox) {
            console.log('Found checkbox, dataset.name:', checkbox.dataset.name, 'checked:', checkbox.checked);
            checkbox.click();
            console.log('After click, checked:', checkbox.checked);
        } else {
            console.log('Checkbox not found!');
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
                    chartKeys: Array.from(tabState.charts?.keys() || []),
                    displayName: tabState.displayName
                };
            }
        }
        return { error: 'No tab' };
    });
    console.log('Chart state:', JSON.stringify(chartState, null, 2));

    // Check chart panels in DOM
    const chartPanels = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const charts = panel?.querySelectorAll('.chart-panel');
        return {
            count: charts?.length || 0,
            ids: Array.from(charts || []).map(c => c.id)
        };
    });
    console.log('Chart panels in DOM:', JSON.stringify(chartPanels));

    await page.screenshot({ path: '/tmp/autocomplete-chart-test.png', fullPage: true });
    console.log('\nScreenshot: /tmp/autocomplete-chart-test.png');

    console.log('\n=== RESULT ===');
    if (chartState.chartsCount > 0) {
        console.log('✅ Chart added successfully');
    } else {
        console.log('❌ Chart NOT added');
    }

    await page.waitForTimeout(3000);
    await browser.close();
})();
