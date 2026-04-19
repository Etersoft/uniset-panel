const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    // Логируем сетевые запросы
    page.on('response', async response => {
        const url = response.url();
        if (url.includes('/api/servers') || url.includes('/api/events')) {
            console.log(`[NET] ${response.status()} ${url}`);
        }
    });

    // Логируем консоль браузера
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('SSE:') || text.includes('Список объектов')) {
            console.log('[BROWSER]', text);
        }
    });

    console.log('1. Открываем страницу...');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(3000);

    // Проверяем начальное состояние
    const initialStatus = await page.evaluate(() => {
        return {
            sseConnected: window.state?.sse?.connected,
            serversCount: window.state?.servers?.size,
            servers: Array.from(window.state?.servers?.entries() || []).map(([id, s]) => ({
                id: id.substring(0, 8),
                name: s.name,
                connected: s.connected
            }))
        };
    });
    console.log('2. Начальное состояние:', JSON.stringify(initialStatus, null, 2));

    console.log('3. Симулируем разрыв SSE соединения...');

    // Закрываем SSE соединение через браузер
    await page.evaluate(() => {
        if (window.state?.sse?.eventSource) {
            console.log('SSE: Принудительное закрытие соединения для теста');
            window.state.sse.eventSource.close();
            window.state.sse.eventSource = null;
            window.state.sse.connected = false;
        }
    });

    await page.waitForTimeout(1000);

    console.log('4. Инициируем переподключение SSE...');

    // Вызываем initSSE для переподключения
    await page.evaluate(() => {
        console.log('SSE: Инициируем переподключение');
        if (typeof initSSE === 'function') {
            initSSE();
        }
    });

    // Ждем переподключения и синхронизации
    await page.waitForTimeout(3000);

    // Проверяем состояние после переподключения
    const afterReconnect = await page.evaluate(() => {
        return {
            sseConnected: window.state?.sse?.connected,
            serversCount: window.state?.servers?.size,
            servers: Array.from(window.state?.servers?.entries() || []).map(([id, s]) => ({
                id: id.substring(0, 8),
                name: s.name,
                connected: s.connected
            }))
        };
    });
    console.log('5. Состояние после переподключения:', JSON.stringify(afterReconnect, null, 2));

    console.log('\n--- Проверка завершена ---');
    console.log('Если в логе видно "[NET] 200 .../api/servers" после переподключения SSE,');
    console.log('значит синхронизация статусов работает.');

    await page.waitForTimeout(5000);
    await browser.close();
})();
