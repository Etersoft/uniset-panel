const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    console.log('=== Тест рамки digital индикатора ===\n');

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Переключаемся на Dashboard
    console.log('1. Переключаемся на Dashboard...');
    await page.click('button:has-text("Dashboard")');
    await page.waitForTimeout(1000);

    // Выбираем System Overview
    console.log('2. Выбираем System Overview dashboard...');
    const select = page.locator('#dashboard-select');
    await select.selectOption({ label: 'System Overview' });
    await page.waitForTimeout(1500);

    // Находим digital виджет и делаем скриншот только его
    console.log('\n3. Ищем digital элемент...');

    const digitalDisplay = page.locator('.digital-display').first();

    if (await digitalDisplay.count() > 0) {
        // Скриншот только digital элемента
        await digitalDisplay.screenshot({ path: 'digital-closeup.png' });
        console.log('Скриншот digital элемента: digital-closeup.png');

        // Проверяем computed styles
        const styles = await digitalDisplay.evaluate((el) => {
            const cs = window.getComputedStyle(el);
            return {
                border: cs.border,
                borderWidth: cs.borderWidth,
                borderStyle: cs.borderStyle,
                borderColor: cs.borderColor,
                borderTop: cs.borderTop,
                background: cs.background,
                backgroundColor: cs.backgroundColor,
                outline: cs.outline,
                boxShadow: cs.boxShadow,
            };
        });

        console.log('\nComputed styles:');
        console.log('  border:', styles.border);
        console.log('  borderWidth:', styles.borderWidth);
        console.log('  borderStyle:', styles.borderStyle);
        console.log('  borderColor:', styles.borderColor);
        console.log('  background:', styles.background.substring(0, 100));
        console.log('  boxShadow:', styles.boxShadow);

        // Проверяем inline styles
        const inlineStyle = await digitalDisplay.getAttribute('style');
        console.log('\nInline style:', inlineStyle || '(none)');

        // Получаем HTML
        const html = await digitalDisplay.evaluate(el => el.outerHTML);
        console.log('\nHTML:', html);

    } else {
        console.log('digital-display не найден!');

        // Ищем digital-widget
        const widgets = await page.locator('.digital-widget').all();
        console.log(`Найдено .digital-widget: ${widgets.length}`);

        if (widgets.length > 0) {
            const html = await widgets[0].innerHTML();
            console.log('HTML первого:', html);
        }
    }

    // Полный скриншот
    await page.screenshot({ path: 'digital-border-full.png' });

    console.log('\n=== Тест завершён ===');
    await page.waitForTimeout(5000);
    await browser.close();
})();
