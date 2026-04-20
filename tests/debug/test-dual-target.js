const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('[DUAL]') || text.includes('AI70') || text.includes('setpoint')) {
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

    const dualWidgetId = 'widget-1766449476291';

    // Логирование
    await page.evaluate((widgetId) => {
        const widget = dashboardState.widgets.get(widgetId);
        console.log('[DUAL] Widget config:', JSON.stringify({
            sensor: widget?.config?.sensor,
            sensor2: widget?.config?.sensor2,
            style: widget?.config?.style
        }));

        // Патчим updateSetpoint
        if (widget && widget.updateSetpoint) {
            const orig = widget.updateSetpoint.bind(widget);
            widget.updateSetpoint = function(value, error) {
                console.log('[DUAL] updateSetpoint called: value=' + value);
                orig(value, error);
                console.log('[DUAL] After: display=' + this.targetEl?.style?.display + ', transform=' + this.targetEl?.style?.transform);
            };
        }

        // Патчим handleSensorUpdate для AI70_S
        const origHandle = dashboardManager.handleSensorUpdate.bind(dashboardManager);
        dashboardManager.handleSensorUpdate = function(name, value, error) {
            if (name === 'AI70_S') {
                console.log('[DUAL] handleSensorUpdate for AI70_S: value=' + value);
            }
            origHandle(name, value, error);
        };
    }, dualWidgetId);

    // Проверяем начальное состояние
    const initial = await page.evaluate((widgetId) => {
        const widget = dashboardState.widgets.get(widgetId);
        return {
            value: widget?.value,
            setpointValue: widget?.setpointValue,
            targetDisplay: widget?.targetEl?.style?.display,
            targetTransform: widget?.targetEl?.style?.transform,
            hasTargetEl: !!widget?.targetEl
        };
    }, dualWidgetId);
    console.log('Начальное состояние:', initial);

    // Проверяем подписки
    const subs = await page.evaluate(() => {
        return {
            setpointSubs: Array.from(dashboardState.setpointSubscriptions.entries()).map(([k, v]) => [k, v.size])
        };
    });
    console.log('Setpoint подписки:', subs);

    console.log('\n=== Тест 1: Прямой вызов updateSetpoint(50) ===');
    await page.evaluate((widgetId) => {
        const widget = dashboardState.widgets.get(widgetId);
        if (widget && widget.updateSetpoint) {
            widget.updateSetpoint(50);
        } else {
            console.log('[DUAL] updateSetpoint не найден!');
        }
    }, dualWidgetId);
    await page.waitForTimeout(500);

    let state = await page.evaluate((widgetId) => {
        const widget = dashboardState.widgets.get(widgetId);
        return {
            setpointValue: widget?.setpointValue,
            targetDisplay: widget?.targetEl?.style?.display,
            targetTransform: widget?.targetEl?.style?.transform
        };
    }, dualWidgetId);
    console.log('После updateSetpoint(50):', state);

    console.log('\n=== Тест 2: Через handleSensorUpdate(AI70_S, 75) ===');
    await page.evaluate(() => {
        dashboardManager.handleSensorUpdate('AI70_S', 75);
    });
    await page.waitForTimeout(500);

    state = await page.evaluate((widgetId) => {
        const widget = dashboardState.widgets.get(widgetId);
        return {
            setpointValue: widget?.setpointValue,
            targetDisplay: widget?.targetEl?.style?.display,
            targetTransform: widget?.targetEl?.style?.transform
        };
    }, dualWidgetId);
    console.log('После handleSensorUpdate(AI70_S, 75):', state);

    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/dual-target.png' });
    console.log('\nСкриншот: tests/debug/dual-target.png');

    console.log('\n=== Ожидание SSE события для AI70_S (20 сек) ===');
    await page.waitForTimeout(20000);

    await browser.close();
})();
