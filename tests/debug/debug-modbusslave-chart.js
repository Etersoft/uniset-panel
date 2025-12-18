// Debug script: проверка обновлений графиков ModbusSlave через SSE
// Запуск: cd tests && node debug/debug-modbusslave-chart.js

const { chromium } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000';

(async () => {
    console.log('=== Debug: ModbusSlave Chart SSE Updates ===\n');

    const browser = await chromium.launch({ headless: false, slowMo: 300 });
    const page = await browser.newPage();

    // Перехват SSE событий
    let sseEventCount = 0;
    page.on('request', request => {
        if (request.url().includes('/api/events')) {
            console.log('>> SSE Connection opened:', request.url());
        }
    });

    // Перехват console.log из браузера
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('SSE') || text.includes('chart') || text.includes('Chart')) {
            console.log('BROWSER:', text);
        }
    });

    // Открываем страницу
    console.log(`Opening ${BASE_URL}...`);
    await page.goto(BASE_URL);
    await page.waitForTimeout(2000);

    // Находим и кликаем на MBSlave1
    console.log('\nLooking for MBSlave1...');
    const mbSlaveNode = await page.locator('text=MBSlave1').first();
    if (await mbSlaveNode.isVisible()) {
        console.log('Found MBSlave1, clicking...');
        await mbSlaveNode.click();
        await page.waitForTimeout(2000);
    } else {
        console.log('MBSlave1 not found, trying to expand tree...');
        // Пытаемся найти в дереве
        await page.locator('.tree-toggle').first().click();
        await page.waitForTimeout(500);
        await page.locator('text=MBSlave1').first().click();
        await page.waitForTimeout(2000);
    }

    // Ждём загрузки регистров
    console.log('\nWaiting for registers to load...');
    await page.waitForSelector('[id^="mbs-registers-tbody-"]', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Находим первый регистр и добавляем на график
    console.log('\nAdding first register to chart...');
    const chartCheckbox = await page.locator('.chart-checkbox').first();
    if (await chartCheckbox.isVisible()) {
        const sensorId = await chartCheckbox.getAttribute('data-sensor-id');
        const sensorName = await chartCheckbox.getAttribute('data-sensor-name');
        console.log(`Adding sensor: id=${sensorId}, name=${sensorName}`);
        await chartCheckbox.click();
        await page.waitForTimeout(1000);
    }

    // Проверяем, что график создан
    console.log('\nChecking if chart was created...');
    const chartPanel = await page.locator('.chart-panel').first();
    if (await chartPanel.isVisible()) {
        console.log('Chart panel found!');
    } else {
        console.log('WARNING: Chart panel NOT found!');
    }

    // Разворачиваем секцию Charts если свернута
    const chartsSection = await page.locator('[data-section-id="charts"]').first();
    if (await chartsSection.isVisible()) {
        const isCollapsed = await chartsSection.locator('.collapsible-content').evaluate(el => {
            return el.style.display === 'none' || el.classList.contains('collapsed');
        });
        if (isCollapsed) {
            console.log('Expanding Charts section...');
            await chartsSection.locator('.collapsible-header').click();
            await page.waitForTimeout(500);
        }
    }

    // Инжектируем код для мониторинга обновлений графика
    console.log('\nInjecting chart monitoring code...');
    await page.evaluate(() => {
        // Находим tabState для MBSlave1
        let targetTabState = null;
        for (const [key, tabState] of window.state.tabs.entries()) {
            if (key.includes('MBSlave1')) {
                targetTabState = tabState;
                console.log(`Found tabState for ${key}`);
                console.log(`Charts count: ${tabState.charts.size}`);
                tabState.charts.forEach((chartData, varName) => {
                    console.log(`  Chart: ${varName}, points: ${chartData.chart.data.datasets[0].data.length}`);
                });
                break;
            }
        }

        if (!targetTabState) {
            console.log('ERROR: TabState for MBSlave1 not found!');
            return;
        }

        // Сохраняем для мониторинга
        window._debugTabState = targetTabState;
        window._debugChartUpdates = [];

        // Периодически проверяем количество точек на графиках
        window._debugInterval = setInterval(() => {
            if (window._debugTabState) {
                window._debugTabState.charts.forEach((chartData, varName) => {
                    const points = chartData.chart.data.datasets[0].data.length;
                    const lastPoint = chartData.chart.data.datasets[0].data.slice(-1)[0];
                    console.log(`Chart ${varName}: ${points} points, last value: ${lastPoint?.y}`);
                });
            }
        }, 5000);
    });

    console.log('\n=== Monitoring chart updates ===');
    console.log('Waiting for SSE events to update the chart...');
    console.log('Press Ctrl+C to exit\n');

    // Ждём 60 секунд для наблюдения
    await page.waitForTimeout(60000);

    // Очистка
    await page.evaluate(() => {
        if (window._debugInterval) {
            clearInterval(window._debugInterval);
        }
    });

    await browser.close();
    console.log('\nDone!');
})();
