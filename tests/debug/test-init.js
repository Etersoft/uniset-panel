const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('init') || text.includes('fetch') || text.includes('cache') || text.includes('Sensor15099') || text.includes('Failed')) {
            console.log('BROWSER:', text);
        }
    });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Переключаемся СРАЗУ на Dashboard (без открытия SharedMemory)
    console.log('=== Переключаемся на Dashboard ===');
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(1000);
    await page.selectOption('#dashboard-select', 'System Overview');
    await page.waitForTimeout(3000);

    // Проверяем значения виджетов
    const widgetValues = await page.evaluate(() => {
        const result = [];
        for (const [id, widget] of dashboardState.widgets) {
            result.push({
                id: id.slice(-10),
                value: widget.value,
                sensor: widget.config?.sensor
            });
        }
        return result;
    });

    console.log('\nWidget values after init:');
    widgetValues.forEach(w => {
        console.log(`  ${w.id}: value=${w.value}, sensor=${w.sensor}`);
    });

    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/init-test.png' });
    console.log('\nScreenshot: tests/debug/init-test.png');

    await browser.close();
})();
