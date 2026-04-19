const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    // Intercept SSE events to see raw data
    const sseData = [];
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('supplier') || text.includes('Supplier')) {
            console.log('BROWSER:', text);
        }
    });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Click on SharedMemory
    await page.locator('text=SharedMemory').first().click();
    await page.waitForTimeout(2000);

    // Add first sensor to chart
    const chartToggle = page.locator('.chart-toggle-label').first();
    await chartToggle.click();
    await page.waitForTimeout(1000);

    // Check what SSE sends - evaluate the ionc data from API
    const apiResponse = await page.evaluate(async () => {
        const resp = await fetch('/api/objects/SharedMemory/sensors?limit=5');
        return resp.json();
    });
    console.log('API /sensors response (first 2 sensors):');
    if (apiResponse.sensors) {
        apiResponse.sensors.slice(0, 2).forEach(s => {
            console.log(`  id=${s.id}, name=${s.name}, supplier=${s.supplier}, supplier_id=${s.supplier_id}`);
        });
    }

    // Check SSE event data by listening to the state
    const chartState = await page.evaluate(() => {
        const result = {};
        for (const [tabKey, tabState] of window.state.tabs) {
            if (tabState.charts && tabState.charts.size > 0) {
                result[tabKey] = {};
                for (const [varName, chartData] of tabState.charts) {
                    result[tabKey][varName] = {
                        displayName: tabState.displayName,
                        varName: varName,
                    };
                }
            }
        }
        return result;
    });
    console.log('\nChart state:', JSON.stringify(chartState, null, 2));

    // Wait for a few SSE updates and check allSensors data
    await page.waitForTimeout(3000);

    const sensorData = await page.evaluate(() => {
        // Find the IONC renderer for SharedMemory
        for (const [tabKey, tabState] of window.state.tabs) {
            if (tabState.displayName === 'SharedMemory' && tabState.renderer) {
                const sensors = tabState.renderer.allSensors;
                if (sensors && sensors.length > 0) {
                    // Return first 3 sensors with all fields
                    return sensors.slice(0, 3).map(s => ({
                        id: s.id,
                        name: s.name,
                        value: s.value,
                        supplier: s.supplier,
                        supplier_id: s.supplier_id,
                    }));
                }
            }
        }
        return 'no renderer found';
    });
    console.log('\nRenderer allSensors (first 3):', JSON.stringify(sensorData, null, 2));

    // Check the chart legend DOM
    const legendHTML = await page.evaluate(() => {
        const panels = document.querySelectorAll('.chart-panel');
        return Array.from(panels).map(p => ({
            html: p.innerHTML.substring(0, 500),
        }));
    });
    console.log('\nChart panels HTML:');
    legendHTML.forEach((p, i) => console.log(`  Panel ${i}: ${p.html.substring(0, 300)}`));

    // Check what ionc_sensor_batch SSE events contain
    // Add a listener for SSE data
    await page.evaluate(() => {
        window._sseDebug = [];
        const origDispatch = EventSource.prototype.dispatchEvent;
    });

    // Check the supplier element directly
    const supplierEls = await page.evaluate(() => {
        const els = document.querySelectorAll('.chart-panel-supplier');
        return Array.from(els).map(el => ({
            id: el.id,
            text: el.textContent,
            parentHTML: el.parentElement?.innerHTML?.substring(0, 200),
        }));
    });
    console.log('\nSupplier elements:', JSON.stringify(supplierEls, null, 2));

    console.log('\nDone!');
    await browser.close();
})();
