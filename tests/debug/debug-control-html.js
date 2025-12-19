const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    console.log('Opening page...');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Проверяем state
    const controlState = await page.evaluate(() => window.state?.control);
    console.log('state.control:', JSON.stringify(controlState, null, 2));

    // Ищем элементы контроля
    console.log('\n=== Looking for control elements ===');

    // Banner
    const banner = await page.locator('.control-banner').first();
    const bannerExists = await banner.count() > 0;
    console.log('Banner element exists:', bannerExists);
    if (bannerExists) {
        const bannerHtml = await banner.evaluate(el => el.outerHTML);
        console.log('Banner HTML:', bannerHtml);
    }

    // Take button
    const takeBtn = await page.locator('#control-take-btn');
    const takeBtnExists = await takeBtn.count() > 0;
    console.log('Take button exists:', takeBtnExists);

    // Dialog
    const dialog = await page.locator('.control-dialog-overlay');
    const dialogExists = await dialog.count() > 0;
    console.log('Dialog element exists:', dialogExists);
    if (dialogExists) {
        const dialogHtml = await dialog.evaluate(el => el.outerHTML);
        console.log('Dialog HTML:', dialogHtml.substring(0, 500));
    }

    // Проверяем body на наличие control элементов
    const bodyHtml = await page.evaluate(() => document.body.innerHTML);
    const hasControlBanner = bodyHtml.includes('control-banner');
    const hasControlDialog = bodyHtml.includes('control-dialog');
    console.log('\nBody contains control-banner:', hasControlBanner);
    console.log('Body contains control-dialog:', hasControlDialog);

    // Если control элементы не найдены, проверим был ли вызван renderControlUI
    console.log('\n=== Checking functions ===');
    const hasRenderControlUI = await page.evaluate(() => typeof renderControlUI === 'function');
    console.log('renderControlUI exists:', hasRenderControlUI);

    const hasUpdateControlUI = await page.evaluate(() => typeof updateControlUI === 'function');
    console.log('updateControlUI exists:', hasUpdateControlUI);

    console.log('\nDone. Close browser manually or wait 20 sec...');
    await page.waitForTimeout(20000);
    await browser.close();
})();
