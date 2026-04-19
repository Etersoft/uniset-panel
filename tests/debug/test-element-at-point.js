const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    page.on('console', msg => console.log('BROWSER:', msg.text()));

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

    const widget = page.locator('.dashboard-widget:has-text("Pressure")');
    const header = widget.locator('.widget-header');
    const headerBox = await header.boundingBox();
    console.log('Header box:', headerBox);

    // Check what element is at the click point
    const clickX = headerBox.x + 50;
    const clickY = headerBox.y + 10;
    console.log(`Click point: (${clickX}, ${clickY})`);

    const elementAtPoint = await page.evaluate(({x, y}) => {
        const el = document.elementFromPoint(x, y);
        return {
            tagName: el?.tagName,
            className: el?.className,
            id: el?.id,
            parentTagName: el?.parentElement?.tagName,
            parentClassName: el?.parentElement?.className,
            innerHTML: el?.innerHTML?.substring(0, 100)
        };
    }, {x: clickX, y: clickY});
    console.log('Element at click point:', elementAtPoint);

    // Add a global mousedown listener to see if events are being captured
    await page.evaluate(() => {
        document.addEventListener('mousedown', (e) => {
            console.log('GLOBAL mousedown on:', e.target.tagName, e.target.className);
        }, true);
    });

    console.log('\nClicking on header...');
    await page.mouse.click(clickX, clickY);
    await page.waitForTimeout(500);

    await page.waitForTimeout(2000);
    await browser.close();
})();
