const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(1000);
    await page.click('.dashboards-list li:has-text("System Overview")');
    await page.waitForTimeout(2000);
    await page.click('#dashboard-edit-btn');
    await page.waitForTimeout(500);

    const chartWidget = await page.locator('.dashboard-widget[data-type="chart"]').first();
    const initialBox = await chartWidget.boundingBox();
    console.log('Initial widget:', JSON.stringify(initialBox));

    // Scroll resize handle into view
    const handle = await chartWidget.locator('.widget-resize-handle');
    await handle.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const handleBox = await handle.boundingBox();
    console.log('Handle after scroll:', JSON.stringify(handleBox));

    // Now try resize
    console.log('Attempting resize...');
    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;
    
    await page.mouse.move(startX, startY);
    await page.waitForTimeout(100);
    await page.mouse.down();
    
    const hasResizing = await chartWidget.evaluate(el => el.classList.contains('resizing'));
    console.log('Has resizing class:', hasResizing);
    
    // Drag right and down
    await page.mouse.move(startX + 100, startY + 50, { steps: 10 });
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(500);

    const newBox = await chartWidget.boundingBox();
    console.log('After resize:', JSON.stringify(newBox));
    console.log('Width change:', newBox.width - initialBox.width);
    console.log('Height change:', newBox.height - initialBox.height);

    await page.waitForTimeout(8000);
    await browser.close();
})();
