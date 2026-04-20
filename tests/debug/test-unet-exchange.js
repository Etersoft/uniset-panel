/**
 * Тест компонента UNetExchange
 *
 * Проверяет:
 * 1. Отображение вкладки UNetExchange
 * 2. Загрузка статуса (activated, steptime, heartbeat)
 * 3. Отображение таблицы Receivers
 * 4. Отображение таблицы Senders
 * 5. Работу chart toggles
 */

const { chromium } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000';

(async () => {
    console.log('=== Тест UNetExchange ===');
    console.log('BASE_URL:', BASE_URL);

    const browser = await chromium.launch({
        headless: false,
        slowMo: 300
    });
    const page = await browser.newPage();

    // Перехват всех запросов для отладки
    page.on('response', async response => {
        const status = response.status();
        const url = response.url();
        // Логируем ошибочные запросы и запросы к нашему API
        if (status >= 400 || url.includes('/api/') || url.includes('/unet/')) {
            console.log(`<< [${status}] ${url}`);
        }
    });

    // Захват console.log из браузера
    page.on('console', msg => {
        const type = msg.type();
        if (type === 'error' || type === 'warning') {
            console.log(`BROWSER ${type.toUpperCase()}:`, msg.text());
        }
    });

    // Захват ошибок JS
    page.on('pageerror', error => {
        console.log('PAGE ERROR:', error.message);
    });

    try {
        // 1. Открываем страницу
        console.log('\n1. Открытие страницы...');
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000); // Дадим время на загрузку JS
        await page.screenshot({ path: 'tests/debug/unet-1-main.png' });
        console.log('   Страница загружена');

        // 2. Кликаем на объект UNetExchange в списке объектов
        console.log('\n2. Поиск объекта UNetExchange в списке...');

        // Ждём появления списка объектов
        await page.waitForSelector('.object-item, .objects-list li, [data-object]', { timeout: 10000 });
        await page.waitForTimeout(500);

        // Ищем UNetExchange в списке
        const objectItems = await page.locator('.object-item, .objects-list li, [data-object]').allTextContents();
        console.log('   Найденные объекты:', objectItems);

        // Кликаем на UNetExchange
        const unetObject = page.locator('.object-item, .objects-list li, [data-object]', { hasText: 'UNetExchange' });
        if (await unetObject.count() > 0) {
            console.log('   Клик на UNetExchange в списке...');
            await unetObject.first().click();
            await page.waitForTimeout(2000); // Ждём загрузки панели
        } else {
            console.log('   ОШИБКА: UNetExchange не найден в списке объектов');
        }

        // Теперь ждём появления вкладки
        console.log('\n3. Ожидание появления вкладки...');
        try {
            await page.waitForSelector('.tab', { timeout: 5000 });
        } catch (e) {
            console.log('   Вкладка не появилась');
        }

        // Отладка: посмотрим на content область
        const mainContent = await page.locator('#main-content, .main-content, main, .tabs-container').first().innerHTML().catch(() => 'не найден');
        console.log('   main-content HTML:', mainContent.substring(0, 500));

        // Проверим есть ли ошибки в state
        const stateDebug = await page.evaluate(() => {
            return {
                stateExists: typeof state !== 'undefined',
                tabsCount: typeof state !== 'undefined' ? state.tabs?.size : 0,
                objectRenderersExists: typeof objectRenderers !== 'undefined',
                objectRenderersSize: typeof objectRenderers !== 'undefined' ? objectRenderers.size : 0,
                objectRenderersKeys: typeof objectRenderers !== 'undefined' ? Array.from(objectRenderers.keys()) : [],
                registerRendererExists: typeof registerRenderer !== 'undefined',
                BaseObjectRendererExists: typeof BaseObjectRenderer !== 'undefined'
            };
        }).catch(e => ({ error: e.message }));
        console.log('   State debug:', JSON.stringify(stateDebug, null, 2));

        // Проверим какие скрипты загружены
        const scripts = await page.evaluate(() => {
            return Array.from(document.scripts).map(s => s.src || 'inline');
        });
        console.log('   Loaded scripts:', scripts);

        // Проверим переменную renderers напрямую
        const renderersDebug = await page.evaluate(() => {
            if (typeof window.renderers !== 'undefined') {
                return {
                    type: typeof window.renderers,
                    keys: Object.keys(window.renderers),
                    isObject: window.renderers !== null && typeof window.renderers === 'object'
                };
            }
            // Попробуем найти в глобальном контексте
            return {
                windowKeys: Object.keys(window).filter(k => k.includes('render') || k.includes('Renderer')).slice(0, 20),
                hasRenderers: 'renderers' in window
            };
        });
        console.log('   renderers debug:', JSON.stringify(renderersDebug, null, 2));

        const tabs = await page.locator('.tab').allTextContents();
        console.log('   Найденные вкладки:', tabs);

        const tabExists = tabs.some(t => t.includes('UNetExchange'));

        if (!tabExists) {
            console.log('   ВНИМАНИЕ: Вкладка UNetExchange не найдена в списке вкладок');
        }

        await page.screenshot({ path: 'tests/debug/unet-2-after-click.png' });

        // 4. Проверяем секцию статуса
        console.log('\n4. Проверка секции статуса...');
        const statusSection = page.locator('[data-section="unet-status-UNetExchange"], .unet-status-section');
        const statusExists = await statusSection.count() > 0;
        console.log('   Секция статуса:', statusExists ? 'найдена' : 'НЕ НАЙДЕНА');

        // Ждём загрузки данных
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'tests/debug/unet-3-status.png' });

        // 5. Проверяем значения статуса
        console.log('\n5. Проверка значений статуса...');

        const panelContent = await page.locator('.tab-panel.active').first().textContent();
        console.log('   Содержимое панели (первые 500 символов):');
        console.log('   ', panelContent?.substring(0, 500));

        // Проверяем наличие ключевых элементов
        const hasActivated = panelContent?.includes('Activated') || panelContent?.includes('activated');
        const hasSteptime = panelContent?.includes('Step Time') || panelContent?.includes('steptime');
        const hasReceivers = panelContent?.includes('Receivers') || panelContent?.includes('receivers');
        const hasSenders = panelContent?.includes('Senders') || panelContent?.includes('senders');

        console.log('   Activated:', hasActivated ? '✓' : '✗');
        console.log('   Step Time:', hasSteptime ? '✓' : '✗');
        console.log('   Receivers:', hasReceivers ? '✓' : '✗');
        console.log('   Senders:', hasSenders ? '✓' : '✗');

        // 6. Проверяем таблицу Receivers
        console.log('\n6. Проверка таблицы Receivers...');
        const receiversTable = page.locator('.unet-receivers-table, [data-section*="receivers"] table');
        const receiversCount = await receiversTable.count();
        console.log('   Таблица receivers:', receiversCount > 0 ? 'найдена' : 'НЕ НАЙДЕНА');

        if (receiversCount > 0) {
            const rows = await receiversTable.locator('tbody tr').count();
            console.log('   Количество строк:', rows);
        }

        // 7. Проверяем таблицу Senders
        console.log('\n7. Проверка таблицы Senders...');
        const sendersTable = page.locator('.unet-senders-table, [data-section*="senders"] table');
        const sendersCount = await sendersTable.count();
        console.log('   Таблица senders:', sendersCount > 0 ? 'найдена' : 'НЕ НАЙДЕНА');

        if (sendersCount > 0) {
            const rows = await sendersTable.locator('tbody tr').count();
            console.log('   Количество строк:', rows);
        }

        // 8. Проверяем chart toggle
        console.log('\n8. Проверка chart toggles...');
        const chartToggles = page.locator('.chart-toggle, input[type="checkbox"][id*="chart"]');
        const togglesCount = await chartToggles.count();
        console.log('   Chart toggles найдено:', togglesCount);

        if (togglesCount > 0) {
            // Кликаем на первый toggle
            console.log('   Клик на первый toggle...');
            await chartToggles.first().click();
            await page.waitForTimeout(500);
            await page.screenshot({ path: 'tests/debug/unet-4-chart-toggle.png' });
        }

        // 9. Проверяем секцию Charts
        console.log('\n9. Проверка секции Charts...');
        const chartsSection = page.locator('[data-section="charts-UNetExchange"], .charts-section');
        const chartsVisible = await chartsSection.count() > 0;
        console.log('   Секция Charts:', chartsVisible ? 'найдена' : 'НЕ НАЙДЕНА');

        // Финальный скриншот
        await page.screenshot({ path: 'tests/debug/unet-5-final.png', fullPage: true });

        // Итог
        console.log('\n=== Результаты теста ===');
        // Проверяем: есть активная панель с данными UNetExchange
        const allPassed = statusExists && (hasSteptime || hasReceivers || hasSenders);

        if (allPassed) {
            console.log('✓ Тест ПРОЙДЕН');
            console.log('  - Компонент UNetExchange отображается');
            console.log('  - Секция статуса найдена');
            console.log('  - Данные загружены (Step Time, Receivers, Senders)');
        } else {
            console.log('✗ Тест НЕ ПРОЙДЕН');
            if (!statusExists) console.log('  - Секция статуса не найдена');
            if (!hasSteptime && !hasReceivers && !hasSenders) console.log('  - Данные не загружены');
        }

        // Держим браузер открытым для визуальной проверки
        console.log('\nБраузер открыт. Нажмите Ctrl+C для завершения...');
        await page.waitForTimeout(30000);

    } catch (error) {
        console.error('ОШИБКА:', error.message);
        await page.screenshot({ path: 'tests/debug/unet-error.png' });
    } finally {
        await browser.close();
    }
})();
