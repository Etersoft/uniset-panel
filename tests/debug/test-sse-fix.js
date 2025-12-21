const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => {
        console.log('BROWSER:', msg.text());
    });

    console.log('Opening page...');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Check SSE events using state.sse.eventSource
    await page.evaluate(() => {
        window.allSSEEvents = [];
        
        const eventSource = window.state?.sse?.eventSource;
        if (eventSource) {
            console.log('Found eventSource in state.sse');
            
            eventSource.addEventListener('uwsgate_sensor_batch', (e) => {
                window.allSSEEvents.push({ type: 'uwsgate_sensor_batch', data: e.data.substring(0, 100) });
                console.log('SSE: uwsgate_sensor_batch received, total=' + window.allSSEEvents.length);
            });
            
            // Also check object_data which should be coming for other pollers
            eventSource.addEventListener('object_data', (e) => {
                console.log('SSE: object_data received');
            });
            
            console.log('Listeners added');
        } else {
            console.log('ERROR: state.sse.eventSource not found');
        }
    });

    console.log('Waiting 5 seconds...');
    await page.waitForTimeout(5000);

    const events = await page.evaluate(() => window.allSSEEvents || []);
    console.log('\nTotal uwsgate_sensor_batch events:', events.length);

    await browser.close();
})();
