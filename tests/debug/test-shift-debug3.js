const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    // Capture console logs
    page.on('console', msg => {
        console.log('BROWSER:', msg.text());
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

    // Check edit mode before
    const editModeBefore = await page.evaluate(() => dashboardState.editMode);
    console.log('Edit mode before toggle:', editModeBefore);

    await page.evaluate(() => dashboardManager.toggleEditMode());
    await page.waitForTimeout(500);

    // Check edit mode after
    const editModeAfter = await page.evaluate(() => dashboardState.editMode);
    console.log('Edit mode after toggle:', editModeAfter);

    // Check if grid has edit-mode class
    const hasEditClass = await page.evaluate(() => {
        return document.querySelector('.dashboard-grid')?.classList.contains('edit-mode');
    });
    console.log('Grid has edit-mode class:', hasEditClass);

    // Check if widget header exists
    const hasHeader = await page.evaluate(() => {
        const widget = document.querySelector('.dashboard-widget');
        return !!widget?.querySelector('.widget-header');
    });
    console.log('Widget has header:', hasHeader);

    // Now try to trigger mousedown on widget header
    const widget = page.locator('.dashboard-widget:has-text("Pressure")');
    const header = widget.locator('.widget-header');
    const headerBox = await header.boundingBox();
    console.log('Header box:', headerBox);

    if (headerBox) {
        console.log('\nClicking on header...');
        await page.mouse.move(headerBox.x + 50, headerBox.y + 10);
        await page.mouse.down();
        await page.waitForTimeout(500);

        console.log('Moving mouse...');
        await page.mouse.move(headerBox.x + 100, headerBox.y + 50, { steps: 5 });
        await page.waitForTimeout(500);

        console.log('Releasing...');
        await page.mouse.up();
        await page.waitForTimeout(500);
    }

    // Check final position
    const pos = await page.evaluate(() => {
        const dash = dashboardState.dashboards.get('System Overview');
        const w = dash.widgets.find(w => w.config?.label === 'Pressure');
        return w?.position;
    });
    console.log('\nFinal position:', pos);

    await page.waitForTimeout(2000);
    await browser.close();
})();
