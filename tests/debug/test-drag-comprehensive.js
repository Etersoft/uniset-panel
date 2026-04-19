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

    // Get grid info
    const gridInfo = await page.evaluate(() => {
        const grid = document.querySelector('.dashboard-grid');
        const rect = grid.getBoundingClientRect();
        const style = window.getComputedStyle(grid);
        return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            paddingLeft: parseFloat(style.paddingLeft),
            paddingTop: parseFloat(style.paddingTop),
            contentLeft: rect.left + parseFloat(style.paddingLeft),
            contentTop: rect.top + parseFloat(style.paddingTop)
        };
    });
    console.log('Grid:', gridInfo);

    // Helper to drag widget to target position and check result
    async function testDrag(widgetLabel, targetCol, targetRow, description) {
        console.log(`\n=== Test: ${description} ===`);

        const widget = page.locator(`.dashboard-widget:has-text("${widgetLabel}")`);
        const box = await widget.boundingBox();
        console.log(`Widget "${widgetLabel}" at: (${box.x.toFixed(0)}, ${box.y.toFixed(0)})`);

        // Calculate target position in pixels
        const cellWidth = (gridInfo.width - gridInfo.paddingLeft * 2 - 4 * 47) / 48;
        const cellHeight = 30;
        const gap = 4;

        const targetX = gridInfo.contentLeft + targetCol * (cellWidth + gap) + 20;
        const targetY = gridInfo.contentTop + targetRow * (cellHeight + gap) + 15;

        // Grab and drag
        const grabX = box.x + 50;
        const grabY = box.y + 20;

        await page.mouse.move(grabX, grabY);
        await page.mouse.down();
        await page.waitForTimeout(100);
        await page.mouse.move(targetX, targetY, { steps: 15 });
        await page.waitForTimeout(200);
        await page.mouse.up();
        await page.waitForTimeout(500);

        // Check result
        const newBox = await widget.boundingBox();
        const pos = await page.evaluate((label) => {
            const dash = dashboardState.dashboards.get('System Overview');
            const w = dash.widgets.find(w => w.config?.label === label);
            return w?.position;
        }, widgetLabel);

        console.log(`Target: col=${targetCol}, row=${targetRow}`);
        console.log(`Result: col=${pos?.col}, row=${pos?.row}`);
        console.log(`Widget moved to: (${newBox.x.toFixed(0)}, ${newBox.y.toFixed(0)})`);

        const success = pos?.col === targetCol && pos?.row === targetRow;
        console.log(success ? '✓ PASS' : `✗ FAIL (expected col=${targetCol}, row=${targetRow})`);

        return success;
    }

    let results = [];

    // Test 1: Drag Pressure to top-left (0, 0)
    results.push(await testDrag('Pressure', 0, 0, 'Drag to top-left corner (0,0)'));

    // Test 2: Drag it to right side
    results.push(await testDrag('Pressure', 24, 0, 'Drag to center-top (24,0)'));

    // Test 3: Drag it down
    results.push(await testDrag('Pressure', 24, 5, 'Drag to center-middle (24,5)'));

    // Test 4: Drag back to near-original position
    results.push(await testDrag('Pressure', 12, 2, 'Drag to (12,2)'));

    // Summary
    console.log('\n=== SUMMARY ===');
    const passed = results.filter(r => r).length;
    console.log(`Passed: ${passed}/${results.length}`);

    await page.screenshot({ path: '/tmp/drag-comprehensive-result.png' });
    console.log('Screenshot: /tmp/drag-comprehensive-result.png');

    await page.waitForTimeout(2000);
    await browser.close();
})();
