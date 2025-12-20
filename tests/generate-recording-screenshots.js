/**
 * Генерация скриншотов для документации Recording
 * Запуск: node generate-recording-screenshots.js
 *
 * Требует запущенный dev-viewer: docker-compose up dev-viewer -d
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'docs', 'images');

(async () => {
    // Создаём директорию для скриншотов
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
        fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1400, height: 900 });

    console.log('=== Генерация скриншотов для Recording ===\n');

    // 1. Открываем страницу
    console.log('1. Открываем страницу...');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(3000);

    // 2. Скриншот Recording UI (не записывает)
    console.log('2. Скриншот: Recording UI (idle)...');
    const recordingSection = page.locator('#recording-status');
    await recordingSection.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'recording-idle.png')
    });

    // 3. Находим объект и открываем его
    console.log('3. Открываем объект...');
    const objectLink = page.locator('.server-group-objects li').first();
    if (await objectLink.count() > 0) {
        await objectLink.click();
        await page.waitForTimeout(2000);
    }

    // 4. Подписываемся на датчики (если IONC)
    console.log('4. Подписываемся на датчики...');
    const subscribeBtn = page.locator('button:has-text("Subscribe")').first();
    if (await subscribeBtn.count() > 0 && await subscribeBtn.isVisible()) {
        // Выбираем чекбоксы датчиков
        const checkboxes = page.locator('.sensor-row input[type="checkbox"]');
        const count = await checkboxes.count();
        for (let i = 0; i < Math.min(5, count); i++) {
            await checkboxes.nth(i).check();
        }
        await page.waitForTimeout(500);
    }

    // 5. Запускаем запись
    console.log('5. Запускаем запись...');
    const recordBtn = page.locator('#recording-toggle-btn');
    const btnText = await recordBtn.textContent();
    if (btnText === 'Record') {
        await recordBtn.click();
        await page.waitForTimeout(2000);
    }

    // 6. Скриншот Recording UI (записывает)
    console.log('6. Скриншот: Recording UI (recording)...');
    await recordingSection.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'recording-active.png')
    });

    // 7. Ждём накопления данных
    console.log('7. Ждём накопления данных...');
    await page.waitForTimeout(5000);

    // 8. Скриншот с данными
    console.log('8. Скриншот: Recording UI (with data)...');
    await recordingSection.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'recording-with-data.png')
    });

    // 9. Открываем dropdown экспорта
    console.log('9. Скриншот: Export dropdown...');
    const exportBtn = page.locator('#recording-download-btn');
    await exportBtn.click();
    await page.waitForTimeout(500);

    // Скриншот recording-status с открытым dropdown
    await recordingSection.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'recording-export-dropdown.png')
    });

    // Закрываем dropdown
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // 10. Полный скриншот страницы с записью
    console.log('10. Скриншот: Полная страница с записью...');
    await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'recording-full-page.png'),
        fullPage: false
    });

    // 11. Останавливаем запись
    console.log('11. Останавливаем запись...');
    const stopBtn = page.locator('#recording-toggle-btn');
    await stopBtn.click();
    await page.waitForTimeout(1000);

    // 12. Скриншот после остановки
    console.log('12. Скриншот: Recording UI (stopped with data)...');
    await recordingSection.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'recording-stopped.png')
    });

    await browser.close();

    console.log('\n=== Скриншоты сохранены в', SCREENSHOTS_DIR, '===');
    console.log('Файлы:');
    const files = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'));
    files.forEach(f => console.log('  -', f));
})();
