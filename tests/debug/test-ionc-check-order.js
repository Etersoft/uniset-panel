const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Open SharedMemory tab
    const ioncObject = await page.$('text=SharedMemory');
    if (ioncObject) {
        await ioncObject.click();
        await page.waitForTimeout(1000);
    }

    // Check if AI70_S is in first 200 sensors (no filter)
    const result = await page.evaluate(async () => {
        const response = await fetch('/api/objects/SharedMemory/ionc/sensors?offset=0&limit=200');
        const data = await response.json();

        const ai70 = data.sensors?.find(s => s.name === 'AI70_S');
        const firstNames = data.sensors?.slice(0, 10).map(s => s.name);
        const lastNames = data.sensors?.slice(-5).map(s => s.name);

        return {
            totalInChunk: data.sensors?.length,
            totalSize: data.size,
            ai70Found: !!ai70,
            ai70Index: data.sensors?.findIndex(s => s.name === 'AI70_S'),
            firstSensors: firstNames,
            lastSensors: lastNames
        };
    });

    console.log('API result (no filter):', JSON.stringify(result, null, 2));

    // Check with search filter
    const resultWithFilter = await page.evaluate(async () => {
        const response = await fetch('/api/objects/SharedMemory/ionc/sensors?offset=0&limit=200&search=AI7');
        const data = await response.json();

        return {
            totalInChunk: data.sensors?.length,
            names: data.sensors?.map(s => s.name)
        };
    });

    console.log('API result (search=AI7):', JSON.stringify(resultWithFilter, null, 2));

    await browser.close();
})();
