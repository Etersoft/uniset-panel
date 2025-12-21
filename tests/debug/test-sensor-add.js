const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    // Intercept API requests
    page.on('request', request => {
        if (request.url().includes('subscribe') || request.url().includes('sensors')) {
            console.log('>> REQUEST:', request.method(), request.url());
            if (request.postData()) console.log('   Body:', request.postData());
        }
    });

    page.on('response', async response => {
        if (response.url().includes('subscribe') || response.url().includes('sensors')) {
            console.log('<< RESPONSE:', response.status(), response.url());
            try {
                const text = await response.text();
                console.log('   Body:', text.substring(0, 500));
            } catch (e) {}
        }
    });

    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('Error') || text.includes('error') || text.includes('subscribe') || text.includes('UWebSocket')) {
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

    // Test 1: Add existing sensor Sensor15099_S
    console.log('\n=== Test 1: Adding Sensor15099_S ===');
    const input = await page.$('.tab-panel.active .uwsgate-sensor-input');
    if (input) {
        await input.focus();
        await input.fill('');
        await input.type('Sensor15099_S', { delay: 30 });
        await page.waitForTimeout(500);

        // Check autocomplete
        const autocomplete = await page.evaluate(() => {
            const items = document.querySelectorAll('.uwsgate-autocomplete-item');
            return Array.from(items).map(i => i.textContent);
        });
        console.log('Autocomplete suggestions:', autocomplete);

        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);
    }

    // Check table after first add
    let tableInfo = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const rows = panel?.querySelectorAll('.uwsgate-sensors-table tbody tr');
        return Array.from(rows || []).map(r => ({
            name: r.querySelector('td:nth-child(3)')?.textContent?.trim(),
            value: r.querySelector('td:nth-child(5)')?.textContent?.trim()
        }));
    });
    console.log('Table after Sensor15099_S:', JSON.stringify(tableInfo));

    // Test 2: Try to add non-existent sensor
    console.log('\n=== Test 2: Adding non-existent sensor "FAKE_SENSOR_XYZ" ===');
    const input2 = await page.$('.tab-panel.active .uwsgate-sensor-input');
    if (input2) {
        await input2.focus();
        await input2.fill('');
        await input2.type('FAKE_SENSOR_XYZ', { delay: 30 });
        await page.waitForTimeout(500);

        // Check autocomplete for fake sensor
        const autocomplete2 = await page.evaluate(() => {
            const items = document.querySelectorAll('.uwsgate-autocomplete-item');
            return Array.from(items).map(i => i.textContent);
        });
        console.log('Autocomplete for fake sensor:', autocomplete2);

        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);
    }

    // Check table after fake sensor attempt
    tableInfo = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const rows = panel?.querySelectorAll('.uwsgate-sensors-table tbody tr');
        return Array.from(rows || []).map(r => ({
            name: r.querySelector('td:nth-child(3)')?.textContent?.trim(),
            value: r.querySelector('td:nth-child(5)')?.textContent?.trim()
        }));
    });
    console.log('Table after FAKE_SENSOR_XYZ attempt:', JSON.stringify(tableInfo));

    // Check if fake sensor was added (it shouldn't be)
    const hasFakeSensor = tableInfo.some(s => s.name === 'FAKE_SENSOR_XYZ');
    console.log('\n=== RESULTS ===');
    console.log('Sensor15099_S added:', tableInfo.some(s => s.name === 'Sensor15099_S') ? '✅' : '❌');
    console.log('FAKE_SENSOR_XYZ blocked:', !hasFakeSensor ? '✅' : '❌ (should not be added!)');

    await page.screenshot({ path: '/tmp/sensor-add-test.png', fullPage: true });
    console.log('Screenshot: /tmp/sensor-add-test.png');

    await page.waitForTimeout(3000);
    await browser.close();
})();
