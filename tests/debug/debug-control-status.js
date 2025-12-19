const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    // Capture console
    page.on('console', msg => {
        if (msg.text().includes('Control') || msg.text().includes('SSE')) {
            console.log('BROWSER:', msg.text());
        }
    });

    console.log('Opening page...');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(3000);

    // Check state.control
    const controlState = await page.evaluate(() => window.state?.control);
    console.log('state.control:', JSON.stringify(controlState, null, 2));

    // Check #control-status element
    console.log('\n=== Checking #control-status element ===');
    const statusInfo = await page.evaluate(() => {
        const el = document.getElementById('control-status');
        if (!el) return { exists: false };
        return {
            exists: true,
            classList: Array.from(el.classList),
            innerHTML: el.innerHTML,
            computedDisplay: getComputedStyle(el).display,
            offsetWidth: el.offsetWidth,
            offsetHeight: el.offsetHeight
        };
    });
    console.log('Control status element:', JSON.stringify(statusInfo, null, 2));

    // Check Take button inside
    const takeBtn = await page.locator('#control-status .control-status-btn');
    const takeBtnVisible = await takeBtn.isVisible().catch(() => false);
    console.log('Take button visible:', takeBtnVisible);

    // Try clicking Take button if visible
    if (takeBtnVisible) {
        console.log('\n=== Clicking Take Control ===');
        await takeBtn.click();
        await page.waitForTimeout(500);

        // Check dialog
        const dialog = page.locator('#control-dialog-overlay.visible');
        const dialogVisible = await dialog.isVisible().catch(() => false);
        console.log('Dialog visible:', dialogVisible);

        if (dialogVisible) {
            // Enter token
            const input = page.locator('#control-token-input');
            await input.fill('admin123');
            await page.locator('.control-btn-primary').click();
            await page.waitForTimeout(1500);

            // Check final state
            const finalState = await page.evaluate(() => window.state?.control);
            console.log('Final state.control:', JSON.stringify(finalState, null, 2));

            // Check status element again
            const finalStatus = await page.evaluate(() => {
                const el = document.getElementById('control-status');
                return {
                    classList: Array.from(el.classList),
                    innerHTML: el.innerHTML.substring(0, 200)
                };
            });
            console.log('Final status element:', JSON.stringify(finalStatus, null, 2));
        }
    } else {
        // Check if control-status has hidden class
        const hasHidden = await page.evaluate(() => {
            const el = document.getElementById('control-status');
            return el ? el.classList.contains('hidden') : 'element not found';
        });
        console.log('Has hidden class:', hasHidden);
    }

    console.log('\nKeeping browser open for 20 seconds...');
    await page.waitForTimeout(20000);
    await browser.close();
})();
