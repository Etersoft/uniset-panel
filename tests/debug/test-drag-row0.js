const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();

    // Capture all DRAG logs
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('DRAG')) {
            console.log('BROWSER:', text);
        }
    });

    console.log('Opening page...');
    await page.goto('http://localhost:8000');
    await page.waitForSelector('.objects-list', { timeout: 10000 });
    await page.waitForTimeout(1500);

    // Wait for dashboards
    await page.waitForFunction(() => dashboardState?.dashboards?.size > 0, { timeout: 5000 });

    // Load dashboard and enable edit mode
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
    console.log('Pressure widget:', box);

    // Get grid info
    const gridInfo = await page.evaluate(() => {
        const grid = document.querySelector('.dashboard-grid');
        const rect = grid.getBoundingClientRect();
        const style = window.getComputedStyle(grid);
        return {
            top: rect.top,
            paddingTop: parseFloat(style.paddingTop),
            contentTop: rect.top + parseFloat(style.paddingTop)
        };
    });
    console.log('Grid:', gridInfo);

    // Calculate where row 0 starts
    const row0Top = gridInfo.contentTop;
    console.log(`Row 0 starts at Y=${row0Top}`);
    console.log(`Widget current top: Y=${box.y}`);
    console.log(`Need to move widget UP by ${box.y - row0Top}px to reach row 0`);

    // Drag widget to row 0
    // Grab widget near the top-left
    const grabX = box.x + 50;
    const grabY = box.y + 20;

    // Target: widget top at row0Top (or slightly above to ensure row 0)
    const targetY = row0Top - 10; // Slightly above row 0 start
    const targetX = grabX;

    console.log(`\nDragging from (${grabX}, ${grabY}) to (${targetX}, ${targetY})`);

    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.waitForTimeout(100);

    // Move in steps to the target
    await page.mouse.move(targetX, targetY, { steps: 15 });
    await page.waitForTimeout(200);

    // Check widget position during drag
    const duringDrag = await widget.boundingBox();
    console.log('During drag, widget at:', duringDrag);

    // Release
    console.log('Releasing mouse...');
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Check final position
    const afterRelease = await widget.boundingBox();
    console.log('After release, widget at:', afterRelease);

    // Check config
    const configRow = await page.evaluate(() => {
        const dash = dashboardState.dashboards.get('System Overview');
        const w = dash.widgets.find(w => w.config?.label === 'Pressure');
        return w?.position?.row;
    });
    console.log(`Config row: ${configRow}`);

    if (configRow === 0) {
        console.log('✓ Widget is at row 0 in config');
    } else {
        console.log(`✗ Widget is at row ${configRow}, not row 0`);
    }

    // Visual check
    const rowHeightPlusGap = 30 + 4; // GRID_ROW_HEIGHT + GRID_GAP
    const expectedTopForRow0 = gridInfo.contentTop;
    const actualTop = afterRelease.y;
    const visualRow = Math.round((actualTop - gridInfo.contentTop) / rowHeightPlusGap);
    console.log(`Visual row (approx): ${visualRow}`);

    await page.screenshot({ path: '/tmp/drag-row0-result.png' });
    console.log('\nScreenshot: /tmp/drag-row0-result.png');

    await page.waitForTimeout(3000);
    await browser.close();
})();
