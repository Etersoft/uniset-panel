const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    // Логируем все SSE события
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('SSE:') || text.includes('server') || text.includes('status')) {
            console.log('BROWSER:', text);
        }
    });

    // Перехват сетевых запросов
    page.on('response', async response => {
        const url = response.url();
        if (url.includes('/api/servers') || url.includes('/api/events')) {
            console.log(`RESPONSE ${response.status()}: ${url}`);
            if (url.includes('/api/servers')) {
                try {
                    const data = await response.json();
                    console.log('Servers:', JSON.stringify(data, null, 2));
                } catch (e) {}
            }
        }
    });

    console.log('Opening page...');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Проверяем состояние SSE
    const sseStatus = await page.evaluate(() => {
        return {
            connected: window.state?.sse?.connected,
            eventSource: !!window.state?.sse?.eventSource,
            servers: Array.from(window.state?.servers?.entries() || []).map(([id, s]) => ({
                id,
                name: s.name,
                connected: s.connected
            }))
        };
    });
    console.log('SSE Status:', JSON.stringify(sseStatus, null, 2));

    console.log('\n--- Мониторинг SSE событий (60 сек) ---');
    console.log('Перезапустите UniSet2 сервер для проверки...\n');

    // Подписываемся на все SSE события через evaluate
    await page.evaluate(() => {
        const es = window.state?.sse?.eventSource;
        if (es) {
            const origHandler = es.onmessage;
            es.onmessage = (e) => {
                console.log('SSE RAW:', e.type, e.data?.substring(0, 200));
                if (origHandler) origHandler(e);
            };
            // Также слушаем именованные события
            es.addEventListener('server_status', (e) => {
                console.log('SSE server_status:', e.data);
            });
            es.addEventListener('objects_list', (e) => {
                console.log('SSE objects_list:', e.data?.substring(0, 200));
            });
        }
    });

    // Периодически проверяем состояние серверов
    for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(2000);
        const servers = await page.evaluate(() => {
            return Array.from(window.state?.servers?.entries() || []).map(([id, s]) => ({
                id: id.substring(0, 8),
                connected: s.connected
            }));
        });
        console.log(`[${i*2}s] Servers:`, JSON.stringify(servers));
    }

    await browser.close();
})();
