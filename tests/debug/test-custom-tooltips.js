const { chromium } = require('@playwright/test');

(async () => {
    console.log('=== Custom Tooltip Test ===\n');

    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Find an element with title
    const refreshBtn = await page.locator('button[title="Refresh"]');

    if (await refreshBtn.count() > 0) {
        console.log('Found Refresh button with title');

        // Check before hover
        const beforeHover = await refreshBtn.evaluate(el => ({
            title: el.getAttribute('title'),
            dataTooltip: el.dataset.tooltip
        }));
        console.log('Before hover:', beforeHover);

        // Hover
        await refreshBtn.hover();
        await page.waitForTimeout(100);

        // Check during hover
        const duringHover = await refreshBtn.evaluate(el => ({
            title: el.getAttribute('title'),
            dataTooltip: el.dataset.tooltip,
            hasAfter: window.getComputedStyle(el, '::after').content
        }));
        console.log('During hover:', duringHover);

        // Take screenshot with tooltip visible
        await page.waitForTimeout(400); // Wait for animation
        await page.screenshot({ path: 'tests/debug/tooltip-test.png' });
        console.log('\nScreenshot saved: tests/debug/tooltip-test.png');

        // Move away
        await page.mouse.move(0, 0);
        await page.waitForTimeout(200);

        // Check after hover
        const afterHover = await refreshBtn.evaluate(el => ({
            title: el.getAttribute('title'),
            dataTooltip: el.dataset.tooltip
        }));
        console.log('After hover:', afterHover);

        if (duringHover.dataTooltip === 'Refresh' && !duringHover.title) {
            console.log('\n✓ Custom tooltip working correctly!');
        } else {
            console.log('\n⚠ Tooltip not working as expected');
        }
    } else {
        console.log('Refresh button not found');
    }

    await page.waitForTimeout(3000);
    await browser.close();
})();
