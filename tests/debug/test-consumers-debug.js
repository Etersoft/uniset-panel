const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 500 });
    const page = await browser.newPage();

    // Перехват запросов к consumers
    page.on('request', request => {
        if (request.url().includes('consumers') || request.url().includes('ionc')) {
            console.log('>> REQUEST:', request.method(), request.url());
            if (request.postData()) {
                console.log('   POST data:', request.postData());
            }
        }
    });

    page.on('response', async response => {
        if (response.url().includes('consumers')) {
            console.log('<< RESPONSE:', response.status(), response.url());
            try {
                const body = await response.text();
                console.log('   Body:', body.substring(0, 500));
            } catch (e) {
                console.log('   Body read error:', e.message);
            }
        }
    });

    // Захват console.log
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('Error') || text.includes('error') || text.includes('serverId') || text.includes('tabKey')) {
            console.log('BROWSER:', text);
        }
    });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Кликаем на SharedMemory
    console.log('\n=== Clicking on SharedMemory ===');
    await page.click('li[data-name="SharedMemory"]');
    await page.waitForTimeout(3000);

    // Проверяем состояние вкладки
    const tabState = await page.evaluate(() => {
        const tabs = window.state?.tabs;
        if (!tabs) return { error: 'state.tabs not found' };

        const entries = [];
        tabs.forEach((value, key) => {
            entries.push({
                tabKey: key,
                serverId: value.serverId,
                serverName: value.serverName,
                objectType: value.objectType
            });
        });
        return entries;
    });
    console.log('\n=== Tab State ===');
    console.log(JSON.stringify(tabState, null, 2));

    // Ищем кнопку consumers и кликаем
    console.log('\n=== Clicking consumers button ===');
    const consumersBtn = await page.$('.ionc-btn-consumers');
    if (consumersBtn) {
        await consumersBtn.click();
        await page.waitForTimeout(2000);
    } else {
        console.log('Consumers button not found, waiting for sensors to load...');
        await page.waitForTimeout(5000);

        // Пробуем снова
        const consumersBtn2 = await page.$('.ionc-btn-consumers');
        if (consumersBtn2) {
            await consumersBtn2.click();
            await page.waitForTimeout(2000);
        } else {
            console.log('Still no consumers button found');
        }
    }

    // Делаем скриншот
    await page.screenshot({ path: 'tests/debug/consumers-debug.png' });
    console.log('\nScreenshot saved to tests/debug/consumers-debug.png');

    await page.waitForTimeout(30000);
    await browser.close();
})();
