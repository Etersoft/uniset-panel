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
        if (msg.text().includes('control') || msg.text().includes('Control')) {
            console.log('BROWSER:', msg.text());
        }
    });

    console.log('Opening page...');
    await page.goto('http://localhost:8000');

    // Ждём загрузки
    await page.waitForTimeout(2000);

    // Проверяем статус контроля
    console.log('\n=== Checking control status ===');
    const statusResponse = await page.evaluate(async () => {
        const resp = await fetch('/api/control/status');
        return await resp.json();
    });
    console.log('Control status:', JSON.stringify(statusResponse, null, 2));

    // Пробуем взять управление
    console.log('\n=== Trying to take control with admin123 ===');
    const takeResponse = await page.evaluate(async () => {
        const resp = await fetch('/api/control/take', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'admin123' })
        });
        return { status: resp.status, body: await resp.json() };
    });
    console.log('Take control response:', JSON.stringify(takeResponse, null, 2));

    // Проверяем UI элементы
    console.log('\n=== Checking UI elements ===');

    const banner = await page.locator('.control-banner').first();
    const bannerVisible = await banner.isVisible().catch(() => false);
    console.log('Control banner visible:', bannerVisible);

    if (bannerVisible) {
        const bannerText = await banner.textContent();
        console.log('Banner text:', bannerText);
    }

    const takeButton = await page.locator('#control-take-btn').first();
    const takeButtonVisible = await takeButton.isVisible().catch(() => false);
    console.log('Take button visible:', takeButtonVisible);

    const dialog = await page.locator('.control-dialog-overlay').first();
    const dialogVisible = await dialog.isVisible().catch(() => false);
    console.log('Control dialog visible:', dialogVisible);

    // Пробуем через UI
    console.log('\n=== Trying via UI ===');
    if (takeButtonVisible) {
        await takeButton.click();
        await page.waitForTimeout(500);

        const dialogNow = await page.locator('.control-dialog-overlay.visible').first();
        const dialogNowVisible = await dialogNow.isVisible().catch(() => false);
        console.log('Dialog visible after click:', dialogNowVisible);

        if (dialogNowVisible) {
            const input = page.locator('#control-token-input');
            await input.fill('admin123');

            const submitBtn = page.locator('.control-dialog-btn-submit');
            await submitBtn.click();

            await page.waitForTimeout(1000);

            const errorEl = page.locator('.control-dialog-error');
            const errorVisible = await errorEl.isVisible().catch(() => false);
            if (errorVisible) {
                const errorText = await errorEl.textContent();
                console.log('Error message:', errorText);
            }
        }
    }

    // Проверяем state.control
    console.log('\n=== Checking state.control ===');
    const controlState = await page.evaluate(() => {
        return window.state ? window.state.control : 'state not found';
    });
    console.log('state.control:', JSON.stringify(controlState, null, 2));

    console.log('\nKeeping browser open for 60 seconds...');
    await page.waitForTimeout(60000);

    await browser.close();
})();
