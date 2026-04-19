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
    console.log('Clicking Dashboard Button...');
    await page.click('#view-dashboard-btn');
    await page.waitForTimeout(500);

    // Полное содержимое dashboard-view
    const content = await page.evaluate(() => {
        const dv = document.getElementById('dashboard-view');
        return {
            visibility: getComputedStyle(dv).display,
            fullHTML: dv.innerHTML,
            dashboards: Array.from(document.querySelectorAll('#dashboard-select option')).map(o => o.value)
        };
    });

    console.log('\n=== Dashboard View ===');
    console.log('visibility:', content.visibility);
    console.log('dashboards:', content.dashboards);
    console.log('\nHTML:');
    console.log(content.fullHTML.substring(0, 2000));

    await page.screenshot({ path: 'tests/debug/dashboard-content.png', fullPage: false });
    console.log('\nScreenshot saved');

    await page.waitForTimeout(30000);
    await browser.close();
})();
