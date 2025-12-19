const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 300 });
    const page = await browser.newPage();

    // Перехват запросов
    page.on('request', request => {
        if (request.url().includes('/control')) {
            console.log('>> REQUEST:', request.method(), request.url());
            const postData = request.postData();
            if (postData) console.log('   POST data:', postData);
        }
    });

    page.on('response', async response => {
        if (response.url().includes('/control')) {
            console.log('<< RESPONSE:', response.status(), response.url());
            try {
                const body = await response.text();
                console.log('   Body:', body);
            } catch (e) {}
        }
    });

    // Захват console.log
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('control') || text.includes('Control') || text.includes('SSE')) {
            console.log('BROWSER:', text);
        }
    });

    console.log('Opening page...');
    await page.goto('http://localhost:8000');

    // Ждём загрузки
    await page.waitForTimeout(2000);

    // Проверяем начальное состояние
    console.log('\n=== Initial state ===');
    let controlState = await page.evaluate(() => window.state?.control);
    console.log('state.control:', JSON.stringify(controlState, null, 2));

    // Ищем кнопку Take Control
    console.log('\n=== Looking for Take Control button ===');
    const takeBtn = page.locator('#control-take-btn');
    const takeBtnVisible = await takeBtn.isVisible().catch(() => false);
    console.log('Take button visible:', takeBtnVisible);

    if (!takeBtnVisible) {
        // Может быть banner?
        const banner = page.locator('.control-banner');
        const bannerVisible = await banner.isVisible().catch(() => false);
        console.log('Banner visible:', bannerVisible);
        if (bannerVisible) {
            const bannerHtml = await banner.innerHTML();
            console.log('Banner HTML:', bannerHtml.substring(0, 200));
        }
    }

    // Кликаем на Take Control
    if (takeBtnVisible) {
        console.log('\n=== Clicking Take Control ===');
        await takeBtn.click();
        await page.waitForTimeout(500);

        // Проверяем диалог
        const dialog = page.locator('.control-dialog-overlay.visible');
        const dialogVisible = await dialog.isVisible().catch(() => false);
        console.log('Dialog visible:', dialogVisible);

        if (dialogVisible) {
            // Вводим токен
            console.log('\n=== Entering token admin123 ===');
            const input = page.locator('#control-token-input');
            await input.fill('admin123');

            // Кликаем Submit
            const submitBtn = page.locator('.control-dialog-btn-submit');
            await submitBtn.click();

            await page.waitForTimeout(1500);

            // Проверяем ошибку
            const errorEl = page.locator('.control-dialog-error');
            const errorVisible = await errorEl.isVisible().catch(() => false);
            if (errorVisible) {
                const errorText = await errorEl.textContent();
                console.log('Error message:', errorText);
            }

            // Проверяем финальное состояние
            console.log('\n=== Final state ===');
            controlState = await page.evaluate(() => window.state?.control);
            console.log('state.control:', JSON.stringify(controlState, null, 2));

            // Проверяем banner
            const bannerActive = page.locator('.control-banner-active');
            const bannerActiveVisible = await bannerActive.isVisible().catch(() => false);
            console.log('Active banner visible:', bannerActiveVisible);

            const bannerReadonly = page.locator('.control-banner-readonly');
            const bannerReadonlyVisible = await bannerReadonly.isVisible().catch(() => false);
            console.log('Readonly banner visible:', bannerReadonlyVisible);
        }
    } else {
        console.log('Take button not found, checking if already controller...');
        controlState = await page.evaluate(() => window.state?.control);
        console.log('state.control:', JSON.stringify(controlState, null, 2));
    }

    console.log('\nKeeping browser open for 30 seconds...');
    await page.waitForTimeout(30000);

    await browser.close();
})();
