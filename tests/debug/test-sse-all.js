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

    // Check what events are being received
    await page.evaluate(() => {
        window.allSSEEvents = [];
        
        // Get all event types that are being listened to
        const eventTypes = [
            'object_data', 'server_status', 'objects_list', 'sensor_data',
            'ionc_sensor_batch', 'modbus_register_batch', 'opcua_sensor_batch',
            'uwsgate_sensor_batch', 'control_status'
        ];
        
        if (window.eventSource) {
            eventTypes.forEach(type => {
                window.eventSource.addEventListener(type, (e) => {
                    window.allSSEEvents.push({ type, data: e.data.substring(0, 100) });
                    console.log(`SSE [${type}]: received`);
                });
            });
            console.log('Added listeners for all event types');
        } else {
            console.log('ERROR: no eventSource');
        }
    });

    console.log('Waiting 5 seconds...');
    await page.waitForTimeout(5000);

    const events = await page.evaluate(() => window.allSSEEvents || []);
    console.log('\nTotal events received:', events.length);
    
    // Group by type
    const byType = {};
    events.forEach(e => {
        byType[e.type] = (byType[e.type] || 0) + 1;
    });
    console.log('Events by type:', byType);

    await browser.close();
})();
