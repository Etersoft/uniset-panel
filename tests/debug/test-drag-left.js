const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();

    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('DRAG')) {
            console.log('BROWSER:', text);
        }
    });

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

    // Find Pressure widget
    const widget = page.locator('.dashboard-widget:has-text("Pressure")');
    const box = await widget.boundingBox();
    console.log('Widget before:', box);

    // Get grid info
    const gridInfo = await page.evaluate(() => {
        const grid = document.querySelector('.dashboard-grid');
        const rect = grid.getBoundingClientRect();
        const style = window.getComputedStyle(grid);
        return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            paddingLeft: parseFloat(style.paddingLeft),
            paddingTop: parseFloat(style.paddingTop),
            contentLeft: rect.left + parseFloat(style.paddingLeft),
            contentTop: rect.top + parseFloat(style.paddingTop)
        };
    });
    console.log('Grid:', gridInfo);

    // Drag widget to top-left corner of grid
    const grabX = box.x + 50;
    const grabY = box.y + 20;

    // Target: very top-left of grid content area
    const targetX = gridInfo.contentLeft + 10;
    const targetY = gridInfo.contentTop + 10;

    console.log(`\nDragging to top-left: (${grabX}, ${grabY}) -> (${targetX}, ${targetY})`);

    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(targetX, targetY, { steps: 15 });
    await page.waitForTimeout(200);

    const during = await widget.boundingBox();
    console.log('During drag:', during);

    await page.mouse.up();
    await page.waitForTimeout(500);

    const after = await widget.boundingBox();
    console.log('After release:', after);

    // Check config
    const pos = await page.evaluate(() => {
        const dash = dashboardState.dashboards.get('System Overview');
        const w = dash.widgets.find(w => w.config?.label === 'Pressure');
        return w?.position;
    });
    console.log('Config position:', pos);

    // Expected position for col 0, row 0
    console.log(`\nExpected top-left for (0,0): (${gridInfo.contentLeft}, ${gridInfo.contentTop})`);
    console.log(`Actual widget top-left: (${after.x}, ${after.y})`);
    console.log(`Difference: (${after.x - gridInfo.contentLeft}, ${after.y - gridInfo.contentTop})`);

    await page.screenshot({ path: '/tmp/drag-left-result.png' });
    await page.waitForTimeout(3000);
    await browser.close();
})();
