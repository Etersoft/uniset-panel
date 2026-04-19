const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(3000);

    // Open SharedMemory
    await page.locator('text=SharedMemory').first().click();
    await page.waitForTimeout(2000);

    // Add 2 sensors to chart
    const toggle1 = page.locator('.chart-toggle-label').first();
    await toggle1.click();
    await page.waitForTimeout(500);
    const toggle2 = page.locator('.chart-toggle-label').nth(1);
    await toggle2.click();
    await page.waitForTimeout(500);
    const toggle3 = page.locator('.chart-toggle-label').nth(2);
    await toggle3.click();
    await page.waitForTimeout(5000);

    // Scroll to charts area
    await page.evaluate(() => window.scrollTo(0, 0));

    const dir = path.resolve(__dirname);
    await page.screenshot({ path: path.join(dir, 'chart-supplier-result.png') });
    console.log('Screenshot saved to tests/debug/chart-supplier-result.png');

    // Print supplier info
    const suppliers = await page.evaluate(() => {
        const els = document.querySelectorAll('.chart-panel-supplier');
        return Array.from(els).map(el => ({
            id: el.id,
            text: el.textContent,
            css: window.getComputedStyle(el, '::before').content
        }));
    });
    console.log('Supplier elements:', JSON.stringify(suppliers, null, 2));

    await browser.close();
})();
