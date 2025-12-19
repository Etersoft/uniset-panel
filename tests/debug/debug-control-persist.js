const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log('Opening page...');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Click Take button
    const takeBtn = page.locator('#control-status .control-status-btn');
    await takeBtn.click();
    await page.waitForTimeout(300);

    // Enter token
    const input = page.locator('#control-token-input');
    await input.fill('admin123');

    // Click Take Control button
    const submitBtn = page.locator('.control-btn-primary');
    await submitBtn.click();

    // Wait for SSE reconnect
    await page.waitForTimeout(1500);

    // Check state immediately
    let state = await page.evaluate(() => window.state?.control);
    console.log('After take (1.5s):', JSON.stringify({ isController: state.isController, hasController: state.hasController }));

    // Wait 5 more seconds
    await page.waitForTimeout(5000);

    // Check state again
    state = await page.evaluate(() => window.state?.control);
    console.log('After 5s delay:', JSON.stringify({ isController: state.isController, hasController: state.hasController }));

    // Check status element
    const statusClass = await page.evaluate(() => {
        const el = document.getElementById('control-status');
        return el ? Array.from(el.classList) : [];
    });
    console.log('Status classes:', statusClass);

    await browser.close();
    console.log('Test complete');
})();
