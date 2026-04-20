const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('[FLOW]') || text.includes('[SSE]')) {
            console.log('BROWSER:', text);
        }
    });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Переключаемся на Dashboard
    console.log('=== Переключаемся на Dashboard ===');
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(1000);
    await page.selectOption('#dashboard-select', 'System Overview');
    await page.waitForTimeout(1000);

    // Проверяем начальное состояние виджета
    const initialState = await page.evaluate(() => {
        const widget = dashboardState.widgets.get('widget-1766449476291');
        return {
            exists: !!widget,
            value: widget?.value,
            sensor: widget?.config?.sensor,
            sensor2: widget?.config?.sensor2
        };
    });
    console.log('Initial widget state:', initialState);

    // Добавляем логирование SSE и handleSensorUpdate
    await page.evaluate(() => {
        // Патчим handleSensorUpdate
        const original = dashboardManager.handleSensorUpdate.bind(dashboardManager);
        dashboardManager.handleSensorUpdate = function(name, value, error) {
            console.log(`[FLOW] handleSensorUpdate(${name}, ${value}, ${error})`);
            original(name, value, error);
        };

        // Патчим updateDashboardWidgets
        const origUpdate = window.updateDashboardWidgets;
        if (origUpdate) {
            window.updateDashboardWidgets = function(sensors) {
                console.log(`[FLOW] updateDashboardWidgets called with ${sensors?.length} sensors`);
                if (sensors?.length > 0) {
                    console.log(`[FLOW]   First sensor: ${sensors[0]?.name} = ${sensors[0]?.value}`);
                }
                origUpdate(sensors);
            };
        } else {
            console.log('[FLOW] updateDashboardWidgets NOT FOUND');
        }

        // Логируем SSE события
        const es = state.sse.eventSource;
        if (es) {
            es.addEventListener('ionc_sensor_batch', (e) => {
                const data = JSON.parse(e.data);
                console.log(`[SSE] ionc_sensor_batch: object=${data.objectName}, sensors=${data.data?.length}`);
                const s15099 = data.data?.find(s => s.name === 'Sensor15099_S');
                if (s15099) {
                    console.log(`[SSE]   Sensor15099_S = ${s15099.value}`);
                }
            });
            console.log('[FLOW] SSE и handleSensorUpdate патчи установлены');
        }
    });

    // Ждём и наблюдаем
    console.log('\n=== Ждём SSE события (меняем значение датчика) ===');
    console.log('    Sensor15099_S будет установлен в 85\n');

    // Изменяем значение датчика
    await page.evaluate(async () => {
        // Напрямую вызываем handleSensorUpdate для теста
        console.log('[FLOW] Тест: вызываем handleSensorUpdate напрямую');
        dashboardManager.handleSensorUpdate('Sensor15099_S', 99);
    });

    await page.waitForTimeout(1000);

    // Проверяем состояние после прямого вызова
    const afterDirect = await page.evaluate(() => {
        const widget = dashboardState.widgets.get('widget-1766449476291');
        return {
            value: widget?.value,
            el: widget?.el?.innerHTML?.substring(0, 100)
        };
    });
    console.log('After direct call:', afterDirect);

    await page.waitForTimeout(15000);

    await browser.close();
})();
