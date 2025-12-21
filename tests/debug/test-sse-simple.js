const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('uwsgate') || text.includes('SSE') || text.includes('sensor_batch')) {
            console.log('BROWSER:', text);
        }
    });

    console.log('Opening page...');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Add listener for uwsgate_sensor_batch
    await page.evaluate(() => {
        window.sseEvents = [];
        if (window.eventSource) {
            window.eventSource.addEventListener('uwsgate_sensor_batch', (e) => {
                window.sseEvents.push(JSON.parse(e.data));
                console.log('SSE: uwsgate_sensor_batch received, count=' + window.sseEvents.length);
            });
            console.log('Added SSE listener, eventSource exists');
        } else {
            console.log('ERROR: eventSource not found');
        }
    });

    console.log('Waiting 5 seconds for SSE events...');
    await page.waitForTimeout(5000);

    const events = await page.evaluate(() => window.sseEvents || []);
    console.log('Total SSE uwsgate_sensor_batch events received:', events.length);
    if (events.length > 0) {
        console.log('First event objectName:', events[0].objectName);
    }

    await browser.close();
})();
