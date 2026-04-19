const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    // Listen for Shift key state
    await page.exposeFunction('logShift', (isShift, event) => {
        console.log(`${event}: shiftKey=${isShift}`);
    });

    console.log('Opening page...');
    await page.goto('http://localhost:8000');
    await page.waitForSelector('.objects-list', { timeout: 10000 });
    await page.waitForTimeout(1500);

    await page.waitForFunction(() => dashboardState?.dashboards?.size > 0, { timeout: 5000 });

    await page.evaluate(() => {
        dashboardManager.loadDashboard('System Overview');
        dashboardManager.switchView('dashboard');
    });
    await page.waitForTimeout(1000);

    await page.evaluate(() => dashboardManager.toggleEditMode());
    await page.waitForTimeout(500);

    // Add listener to track Shift key during mouse events
    await page.evaluate(() => {
        document.addEventListener('mousemove', (e) => {
            if (window.trackShift) {
                window.logShift(e.shiftKey, 'mousemove');
            }
        });
        document.addEventListener('mouseup', (e) => {
            if (window.trackShift) {
                window.logShift(e.shiftKey, 'mouseup');
            }
        });
    });

    const widget = page.locator('.dashboard-widget:has-text("Pressure")');
    const box = await widget.boundingBox();

    console.log('\n=== Testing Shift+drag ===');
    await page.evaluate(() => { window.trackShift = true; });

    // Start drag
    await page.mouse.move(box.x + 50, box.y + 20);
    await page.mouse.down();
    await page.waitForTimeout(100);

    // Press Shift and move
    console.log('Pressing Shift...');
    await page.keyboard.down('Shift');
    await page.waitForTimeout(100);

    console.log('Moving mouse while Shift is held...');
    await page.mouse.move(box.x + 100, box.y + 50, { steps: 5 });
    await page.waitForTimeout(200);

    console.log('Releasing mouse...');
    await page.mouse.up();
    await page.waitForTimeout(100);

    await page.keyboard.up('Shift');
    await page.evaluate(() => { window.trackShift = false; });

    // Check result
    const pos = await page.evaluate(() => {
        const dash = dashboardState.dashboards.get('System Overview');
        const w = dash.widgets.find(w => w.config?.label === 'Pressure');
        return w?.position;
    });
    console.log('\nFinal position:', pos);

    await page.waitForTimeout(2000);
    await browser.close();
})();
