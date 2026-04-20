const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();

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

    // Get all widgets and their positions
    const widgetsBefore = await page.evaluate(() => {
        const dash = dashboardState.dashboards.get('System Overview');
        return dash.widgets.map(w => ({
            label: w.config?.label,
            col: w.position?.col,
            row: w.position?.row
        }));
    });
    console.log('Widgets before:', widgetsBefore);

    // Drag Pressure widget to absolute top-left (pixel position)
    const widget = page.locator('.dashboard-widget:has-text("Pressure")');
    const box = await widget.boundingBox();
    console.log('Pressure widget box:', box);

    // Get grid content area
    const grid = await page.evaluate(() => {
        const g = document.querySelector('.dashboard-grid');
        const rect = g.getBoundingClientRect();
        const style = window.getComputedStyle(g);
        return {
            contentLeft: rect.left + parseFloat(style.paddingLeft),
            contentTop: rect.top + parseFloat(style.paddingTop)
        };
    });
    console.log('Grid content starts at:', grid);

    // Drag to very top-left of content area
    console.log('\n--- Dragging Pressure to top-left ---');
    await page.mouse.move(box.x + 50, box.y + 20);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(grid.contentLeft + 5, grid.contentTop + 5, { steps: 20 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Check position
    const afterDrag1 = await page.evaluate(() => {
        const dash = dashboardState.dashboards.get('System Overview');
        const w = dash.widgets.find(w => w.config?.label === 'Pressure');
        return { col: w?.position?.col, row: w?.position?.row };
    });
    console.log('Pressure after drag:', afterDrag1);
    console.log(afterDrag1.col === 0 && afterDrag1.row === 0 ? '✓ Correctly at (0,0)' : '✗ Not at (0,0)');

    // Now test dragging Level widget to a specific spot
    const levelWidget = page.locator('.dashboard-widget:has-text("Level")');
    const levelBox = await levelWidget.boundingBox();
    console.log('\nLevel widget box:', levelBox);

    // Drag Level to bottom-right area
    console.log('\n--- Dragging Level to bottom area ---');
    await page.mouse.move(levelBox.x + 50, levelBox.y + 20);
    await page.mouse.down();
    await page.waitForTimeout(100);
    // Move to approximately bottom-right area of grid
    await page.mouse.move(grid.contentLeft + 700, grid.contentTop + 400, { steps: 20 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(500);

    const afterDrag2 = await page.evaluate(() => {
        const dash = dashboardState.dashboards.get('System Overview');
        const w = dash.widgets.find(w => w.config?.label === 'Level');
        return { col: w?.position?.col, row: w?.position?.row };
    });
    console.log('Level after drag:', afterDrag2);

    // Final check - widgets positions
    const widgetsAfter = await page.evaluate(() => {
        const dash = dashboardState.dashboards.get('System Overview');
        return dash.widgets.map(w => ({
            label: w.config?.label,
            col: w.position?.col,
            row: w.position?.row
        }));
    });
    console.log('\nWidgets after all drags:', widgetsAfter);

    await page.screenshot({ path: '/tmp/drag-visual-result.png' });
    console.log('\nScreenshot: /tmp/drag-visual-result.png');

    await page.waitForTimeout(3000);
    await browser.close();
})();
