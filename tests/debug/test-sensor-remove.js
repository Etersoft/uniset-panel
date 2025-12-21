const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    page.on('request', request => {
        if (request.url().includes('subscribe')) {
            console.log('>> REQUEST:', request.method(), request.url());
            if (request.postData()) console.log('   Body:', request.postData());
        }
    });

    page.on('response', async response => {
        if (response.url().includes('subscribe')) {
            console.log('<< RESPONSE:', response.status(), response.url());
        }
    });

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

    // Check initial table
    let tableInfo = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const rows = panel?.querySelectorAll('.uwsgate-sensors-table tbody tr');
        return Array.from(rows || []).map(r => ({
            name: r.querySelector('td:nth-child(3)')?.textContent?.trim(),
            hasRemoveBtn: !!r.querySelector('.uwsgate-btn-remove')
        }));
    });
    console.log('Initial table:', JSON.stringify(tableInfo));

    if (tableInfo.length === 0 || !tableInfo[0].name) {
        console.log('No sensors in table, adding one first...');
        const input = await page.$('.tab-panel.active .uwsgate-sensor-input');
        if (input) {
            await input.focus();
            await input.type('Sensor15099_S', { delay: 30 });
            await page.waitForTimeout(300);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(1000);
        }

        tableInfo = await page.evaluate(() => {
            const panel = document.querySelector('.tab-panel.active');
            const rows = panel?.querySelectorAll('.uwsgate-sensors-table tbody tr');
            return Array.from(rows || []).map(r => ({
                name: r.querySelector('td:nth-child(3)')?.textContent?.trim(),
                hasRemoveBtn: !!r.querySelector('.uwsgate-btn-remove')
            }));
        });
        console.log('Table after adding:', JSON.stringify(tableInfo));
    }

    // Try to click X button
    console.log('\n=== Clicking X button to remove sensor ===');

    // Check if button exists and is clickable
    const btnInfo = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const btn = panel?.querySelector('.uwsgate-btn-remove');
        if (!btn) return { found: false };
        return {
            found: true,
            sensorName: btn.dataset.name,
            visible: btn.offsetParent !== null,
            disabled: btn.disabled,
            html: btn.outerHTML
        };
    });
    console.log('Remove button info:', JSON.stringify(btnInfo));

    if (btnInfo.found) {
        // Click using evaluate to be more direct
        await page.evaluate(() => {
            const panel = document.querySelector('.tab-panel.active');
            const btn = panel?.querySelector('.uwsgate-btn-remove');
            if (btn) {
                console.log('Clicking remove button for:', btn.dataset.name);
                btn.click();
            }
        });
        await page.waitForTimeout(1000);

        // Check table after removal
        tableInfo = await page.evaluate(() => {
            const panel = document.querySelector('.tab-panel.active');
            const rows = panel?.querySelectorAll('.uwsgate-sensors-table tbody tr');
            return Array.from(rows || []).map(r => ({
                name: r.querySelector('td:nth-child(3)')?.textContent?.trim()
            }));
        });
        console.log('Table after X click:', JSON.stringify(tableInfo));
    }

    await page.screenshot({ path: '/tmp/sensor-remove-test.png', fullPage: true });
    console.log('\nScreenshot: /tmp/sensor-remove-test.png');

    await page.waitForTimeout(2000);
    await browser.close();
})();
