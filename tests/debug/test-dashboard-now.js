const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 300 });
    const page = await browser.newPage();

    page.on('console', msg => {
        console.log('BROWSER:', msg.text());
    });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Клик на Dashboard
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(500);

    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/dashboard-now.png', fullPage: false });
    console.log('Screenshot 1 saved');

    // Открыть селектор и выбрать System Overview
    await page.click('#dashboard-select');
    await page.waitForTimeout(200);
    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/dashboard-select.png', fullPage: false });
    console.log('Screenshot 2 saved');

    // Выбрать System Overview
    await page.selectOption('#dashboard-select', 'System Overview');
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/dashboard-system.png', fullPage: false });
    console.log('Screenshot 3 saved');

    await page.waitForTimeout(20000);
    await browser.close();
})();
