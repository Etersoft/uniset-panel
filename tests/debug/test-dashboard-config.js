const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('Dashboard') || text.includes('sensor') || text.includes('widget')) {
            console.log('BROWSER:', text);
        }
    });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Переключаемся на Dashboard
    console.log('=== Переключаемся на Dashboard ===');
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(1000);

    // Выбираем System Overview
    await page.selectOption('#dashboard-select', 'System Overview');
    await page.waitForTimeout(2000);

    // Проверяем конфигурацию виджетов
    const widgetConfigs = await page.evaluate(() => {
        const result = [];
        for (const [id, widget] of dashboardState.widgets) {
            result.push({
                id: id.slice(-12),
                type: widget.type,
                sensor: widget.config?.sensor,
                sensor2: widget.config?.sensor2,
                hasConfig: !!widget.config
            });
        }
        return result;
    });

    console.log('\nWidget configs:');
    widgetConfigs.forEach(w => {
        console.log(`  ${w.id}: type=${w.type}, sensor=${w.sensor}, sensor2=${w.sensor2 || 'N/A'}`);
    });

    // Проверяем подписки
    const subscriptions = await page.evaluate(() => {
        return {
            sensorSubs: Array.from(dashboardState.sensorSubscriptions?.entries() || []).map(([k, v]) => [k, Array.from(v).map(id => id.slice(-10))]),
            setpointSubs: Array.from(dashboardState.setpointSubscriptions?.entries() || []).map(([k, v]) => [k, Array.from(v).map(id => id.slice(-10))])
        };
    });

    console.log('\nSensor subscriptions:', JSON.stringify(subscriptions.sensorSubs, null, 2));
    console.log('Setpoint subscriptions:', JSON.stringify(subscriptions.setpointSubs, null, 2));

    // Проверяем API дашборда
    console.log('\n=== Проверяем API дашборда ===');
    const apiResponse = await page.evaluate(async () => {
        const res = await fetch('/api/dashboards');
        const data = await res.json();
        const overview = data.find(d => d.meta?.name === 'System Overview');
        if (overview) {
            return overview.widgets.map(w => ({
                id: w.id.slice(-12),
                sensor: w.config?.sensor,
                sensor2: w.config?.sensor2
            }));
        }
        return null;
    });

    console.log('API widget sensors:', JSON.stringify(apiResponse, null, 2));

    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/dashboard-config.png' });
    console.log('\nСкриншот: tests/debug/dashboard-config.png');

    await browser.close();
})();
