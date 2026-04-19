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

    // Get grid info
    const gridInfo = await page.evaluate(() => {
        const grid = document.querySelector('.dashboard-grid');
        const rect = grid.getBoundingClientRect();
        const style = window.getComputedStyle(grid);
        return {
            contentLeft: rect.left + parseFloat(style.paddingLeft),
            contentTop: rect.top + parseFloat(style.paddingTop)
        };
    });
    console.log('Grid content starts at:', gridInfo);

    // Test 1: Normal drag (no Shift) - should snap to grid
    console.log('\n=== Test 1: Normal drag (snap to grid) ===');
    const widget1 = page.locator('.dashboard-widget:has-text("Pressure")');
    const box1 = await widget1.boundingBox();
    console.log('Pressure before:', box1);

    await page.mouse.move(box1.x + 50, box1.y + 20);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(gridInfo.contentLeft + 100, gridInfo.contentTop + 50, { steps: 15 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(500);

    const pos1 = await page.evaluate(() => {
        const dash = dashboardState.dashboards.get('System Overview');
        const w = dash.widgets.find(w => w.config?.label === 'Pressure');
        return w?.position;
    });
    console.log('After normal drag, position:', pos1);
    console.log(pos1.freePosition ? '✗ Has freePosition (unexpected)' : '✓ No freePosition (grid snap)');

    // Test 2: Shift+drag - should use pixel positioning
    console.log('\n=== Test 2: Shift+drag (free pixel positioning) ===');
    const box2 = await widget1.boundingBox();
    console.log('Pressure before Shift+drag:', box2);

    await page.mouse.move(box2.x + 50, box2.y + 20);
    await page.mouse.down();
    await page.waitForTimeout(100);

    // Move with Shift held
    await page.keyboard.down('Shift');
    await page.mouse.move(gridInfo.contentLeft + 77, gridInfo.contentTop + 33, { steps: 15 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);

    const pos2 = await page.evaluate(() => {
        const dash = dashboardState.dashboards.get('System Overview');
        const w = dash.widgets.find(w => w.config?.label === 'Pressure');
        return w?.position;
    });
    console.log('After Shift+drag, position:', pos2);
    if (pos2.freePosition) {
        console.log(`✓ Has freePosition: left=${pos2.freePosition.left}, top=${pos2.freePosition.top}`);
    } else {
        console.log('✗ No freePosition (expected free positioning)');
    }

    // Check if widget has free-position class
    const hasFreeClass = await widget1.evaluate(el => el.classList.contains('free-position'));
    console.log(hasFreeClass ? '✓ Widget has free-position class' : '✗ Widget missing free-position class');

    // Test 3: Normal drag again - should clear freePosition
    console.log('\n=== Test 3: Normal drag (should clear freePosition) ===');
    const box3 = await widget1.boundingBox();

    await page.mouse.move(box3.x + 50, box3.y + 20);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(gridInfo.contentLeft + 200, gridInfo.contentTop + 100, { steps: 15 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(500);

    const pos3 = await page.evaluate(() => {
        const dash = dashboardState.dashboards.get('System Overview');
        const w = dash.widgets.find(w => w.config?.label === 'Pressure');
        return w?.position;
    });
    console.log('After normal drag, position:', pos3);
    console.log(pos3.freePosition ? '✗ Still has freePosition' : '✓ freePosition cleared (back to grid snap)');

    // Final check
    const hasFreeClass2 = await widget1.evaluate(el => el.classList.contains('free-position'));
    console.log(hasFreeClass2 ? '✗ Widget still has free-position class' : '✓ free-position class removed');

    await page.screenshot({ path: '/tmp/shift-drag-result.png' });
    console.log('\nScreenshot: /tmp/shift-drag-result.png');

    console.log('\n=== Summary ===');
    console.log('Normal drag: snaps to grid');
    console.log('Shift+drag: free pixel positioning');
    console.log('Normal drag after Shift: returns to grid snap');

    await page.waitForTimeout(3000);
    await browser.close();
})();
