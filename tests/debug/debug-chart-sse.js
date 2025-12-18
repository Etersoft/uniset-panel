// Debug script: проверка SSE обновлений графиков ModbusSlave
const { chromium } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000';

(async () => {
    console.log('=== Debug: Chart SSE Updates ===\n');

    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const page = await browser.newPage();

    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('[DEBUG]') || text.includes('SSE')) {
            console.log('BROWSER:', text);
        }
    });

    console.log(`Opening ${BASE_URL}...`);
    await page.goto(BASE_URL);
    await page.waitForTimeout(3000);

    console.log('\nWaiting for objects list...');
    await page.waitForSelector('#objects-list', { timeout: 10000 });
    await page.waitForTimeout(1000);

    console.log('Looking for server 9595...');
    const serverItem = await page.locator('.server-item:has-text("9595")').first();
    if (await serverItem.isVisible()) {
        const toggle = await serverItem.locator('.collapse-icon').first();
        if (await toggle.isVisible()) {
            await toggle.click();
            await page.waitForTimeout(1000);
        }
    }

    console.log('Looking for MBSlave1...');
    const mbSlaveItem = await page.locator('li:has-text("MBSlave1")').first();
    if (await mbSlaveItem.isVisible()) {
        await mbSlaveItem.click();
        await page.waitForTimeout(3000);
    }

    console.log('\nWaiting for registers table...');
    await page.waitForSelector('[id^="mbs-registers-tbody-"]', { timeout: 10000 });

    // Фильтруем и создаём график
    console.log('\nFiltering for register 70...');
    const filterInput = await page.locator('.filter-input').first();
    if (await filterInput.isVisible()) {
        await filterInput.fill('70');
        await page.waitForTimeout(500);
    }

    // Создаём график
    console.log('Creating chart for sensor 70...');
    await page.evaluate(() => {
        const renderer = Array.from(window.state.tabs.values()).find(t => t.renderer?.registerMap)?.renderer;
        if (renderer) {
            const sensor = renderer.registerMap?.get(70);
            if (sensor) {
                renderer.toggleSensorChart(sensor);
                console.log('[DEBUG] Chart created for sensor 70');
            }
        }
    });
    await page.waitForTimeout(1000);

    // Разворачиваем секцию Charts
    const chartsHeader = await page.locator('.collapsible-header:has-text("Charts")').first();
    if (await chartsHeader.isVisible()) {
        await chartsHeader.click();
        await page.waitForTimeout(500);
    }

    // Проверяем график
    console.log('\n=== Chart state ===');
    await page.evaluate(() => {
        for (const [key, tabState] of window.state.tabs.entries()) {
            if (key.includes('MBSlave1')) {
                console.log(`[DEBUG] Charts: ${tabState.charts.size}`);
                tabState.charts.forEach((chartData, varName) => {
                    const points = chartData.chart.data.datasets[0].data;
                    console.log(`[DEBUG] Chart "${varName}": ${points.length} points`);
                });
            }
        }
    });

    // Добавляем мониторинг SSE обновлений для графика
    console.log('\n=== Adding SSE monitor ===');
    await page.evaluate(() => {
        let tabState = null;
        for (const [key, ts] of window.state.tabs.entries()) {
            if (key.includes('MBSlave1')) {
                tabState = ts;
                break;
            }
        }
        if (!tabState) return;

        // Периодически выводим состояние графиков
        window._chartMonitor = setInterval(() => {
            tabState.charts.forEach((chartData, varName) => {
                const points = chartData.chart.data.datasets[0].data;
                const last = points[points.length - 1];
                console.log(`[DEBUG] Chart "${varName}": ${points.length} pts, last=${JSON.stringify(last)}`);
            });
        }, 3000);
        console.log('[DEBUG] Chart monitor started');
    });

    console.log('\n=== Waiting for SSE updates (60 seconds) ===');
    console.log('Run in another terminal:');
    console.log('  for i in 10 30 50 70 90; do timeout 2 uniset2-mbtcptest -i localhost -p 2048 --write06 1 70 $i >/dev/null 2>&1; sleep 2; done');

    await page.waitForTimeout(60000);

    // Очистка
    await page.evaluate(() => {
        if (window._chartMonitor) clearInterval(window._chartMonitor);
    });

    await browser.close();
    console.log('\nDone!');
})();
