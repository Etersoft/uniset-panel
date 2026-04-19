const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 300 });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    // Логируем консоль браузера
    page.on('console', msg => {
        if (msg.type() === 'log' || msg.type() === 'warn' || msg.type() === 'error') {
            console.log(`BROWSER ${msg.type()}: ${msg.text()}`);
        }
    });

    console.log('=== Тест клика по дашборду в сайдбаре ===\n');

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Переключаемся на Dashboard
    console.log('1. Переключаемся на Dashboard...');
    await page.click('button:has-text("Dashboard")');
    await page.waitForTimeout(1000);

    // Смотрим какие дашборды есть в списке
    console.log('\n2. Список дашбордов в сайдбаре:');
    const items = await page.locator('.dashboard-item').all();
    for (let i = 0; i < items.length; i++) {
        const name = await items[i].getAttribute('data-name');
        const isActive = await items[i].evaluate(el => el.classList.contains('active'));
        console.log(`   ${i + 1}. ${name} ${isActive ? '(active)' : ''}`);
    }

    // Текущий дашборд
    const currentSelect = await page.locator('#dashboard-select').inputValue();
    console.log(`\nТекущий выбранный (select): ${currentSelect}`);

    // Кликаем на первый неактивный дашборд
    console.log('\n3. Кликаем на другой дашборд...');
    const inactiveItem = page.locator('.dashboard-item:not(.active)').first();

    if (await inactiveItem.count() > 0) {
        const targetName = await inactiveItem.getAttribute('data-name');
        console.log(`   Кликаем на: ${targetName}`);

        // Добавляем логирование перед кликом
        await page.evaluate(() => {
            const items = document.querySelectorAll('.dashboard-item');
            items.forEach(item => {
                item.addEventListener('click', (e) => {
                    console.log('CLICK EVENT on dashboard-item:', item.dataset.name);
                }, { capture: true });
            });
        });

        await inactiveItem.click();
        await page.waitForTimeout(1500);

        // Проверяем что изменилось
        const newSelect = await page.locator('#dashboard-select').inputValue();
        console.log(`\n   После клика (select): ${newSelect}`);

        const newActive = await page.locator('.dashboard-item.active').getAttribute('data-name');
        console.log(`   После клика (active item): ${newActive}`);

        if (newSelect === targetName) {
            console.log('\n   ✓ Дашборд переключился!');
        } else {
            console.log('\n   ✗ Дашборд НЕ переключился!');

            // Проверяем есть ли обработчики
            const hasHandler = await page.evaluate(() => {
                const item = document.querySelector('.dashboard-item');
                // Попытка проверить есть ли listeners
                return item ? 'element exists' : 'no element';
            });
            console.log(`   Debug: ${hasHandler}`);
        }
    } else {
        console.log('   Нет неактивных дашбордов для теста');
    }

    await page.screenshot({ path: 'dashboard-click-test.png' });
    console.log('\nСкриншот: dashboard-click-test.png');

    console.log('\n=== Тест завершён ===');
    await page.waitForTimeout(5000);
    await browser.close();
})();
