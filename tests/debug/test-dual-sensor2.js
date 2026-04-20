const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const page = await browser.newPage();

    page.on('console', msg => {
        console.log('BROWSER:', msg.text());
    });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Switch to Dashboard view
    console.log('Switching to Dashboard view...');
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(500);

    // Select existing dashboard
    await page.selectOption('#dashboard-select', 'System Overview');
    await page.waitForTimeout(1000);

    // Create a dual gauge widget with sensor2
    console.log('Creating Dual Scale widget with sensor2...');
    await page.evaluate(() => {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '80px';
        container.style.left = '50%';
        container.style.transform = 'translateX(-50%)';
        container.style.width = '220px';
        container.style.height = '220px';
        container.style.background = 'var(--bg-primary)';
        container.style.border = '2px solid #ff8800';
        container.style.borderRadius = '8px';
        container.style.padding = '10px';
        container.style.zIndex = '9999';
        document.body.appendChild(container);

        const config = {
            sensor: 'AI70_S',      // Main sensor (value)
            sensor2: 'AI71_S',     // Target sensor
            label: 'Dual Sensor Test',
            style: 'dual',
            min: 0,
            max: 100,
            unit: '%',
            decimals: 1,
            zones: []
        };

        const widget = new GaugeWidget('test-dual-sensor2', config, container);
        widget.render();

        // Register with dashboard manager for SSE updates
        dashboardState.widgets.set('test-dual-sensor2', widget);

        // Manual subscription setup
        if (!dashboardState.sensorSubscriptions.has('AI70_S')) {
            dashboardState.sensorSubscriptions.set('AI70_S', new Set());
        }
        dashboardState.sensorSubscriptions.get('AI70_S').add('test-dual-sensor2');

        if (!dashboardState.setpointSubscriptions.has('AI71_S')) {
            dashboardState.setpointSubscriptions.set('AI71_S', new Set());
        }
        dashboardState.setpointSubscriptions.get('AI71_S').add('test-dual-sensor2');

        window.testWidget = widget;
        window.testContainer = container;

        console.log('Widget created and subscribed');
        console.log('sensorSubscriptions:', [...dashboardState.sensorSubscriptions.keys()]);
        console.log('setpointSubscriptions:', [...dashboardState.setpointSubscriptions.keys()]);
    });

    await page.waitForTimeout(500);

    // Simulate SSE update for main sensor
    console.log('Simulating SSE update for AI70_S (value=45)...');
    await page.evaluate(() => {
        dashboardManager.handleSensorUpdate('AI70_S', 45, null);
    });
    await page.waitForTimeout(1500);

    // Simulate SSE update for target sensor
    console.log('Simulating SSE update for AI71_S (target=75)...');
    await page.evaluate(() => {
        dashboardManager.handleSensorUpdate('AI71_S', 75, null);
    });
    await page.waitForTimeout(200);

    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/dual-sensor2-test.png', fullPage: false });
    console.log('Screenshot saved: dual-sensor2-test.png');

    // Check widget state
    const state = await page.evaluate(() => {
        return {
            widgetValue: window.testWidget.value,
            hasTargetEl: !!window.testWidget.targetEl,
            targetDisplay: window.testWidget.targetEl?.style.display,
            targetTransform: window.testWidget.targetEl?.style.transform
        };
    });
    console.log('Widget state:', state);

    console.log('\nBrowser will stay open for 30 seconds...');
    await page.waitForTimeout(30000);

    await browser.close();
})();
