const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 300 });
    const page = await browser.newPage();

    page.on('console', msg => {
        if (msg.text().includes('target') || msg.text().includes('sensor2') || msg.text().includes('dual')) {
            console.log('BROWSER:', msg.text());
        }
    });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // 1. Open SharedMemory
    console.log('Opening SharedMemory...');
    const smObject = await page.$('text=SharedMemory');
    if (smObject) {
        await smObject.click();
        await page.waitForTimeout(1000);
    } else {
        console.log('ERROR: SharedMemory not found');
        await browser.close();
        return;
    }

    // 2. Find Sensor15099_S and enable sine generator
    console.log('Looking for Sensor15099_S...');
    const filterInput = await page.$('.filter-input');
    if (filterInput) {
        await filterInput.fill('Sensor15099_S');
        await page.waitForTimeout(500);
    }

    // Click generator button for Sensor15099_S
    const genBtn = await page.$('.ionc-btn-gen[data-id]');
    if (genBtn) {
        await genBtn.click();
        await page.waitForTimeout(300);

        // Configure sine generator in dialog
        const genTypeSelect = await page.$('select[name="gen-type"]');
        if (genTypeSelect) {
            await genTypeSelect.selectOption('sine');
            await page.waitForTimeout(200);
        }

        // Set amplitude and period
        const amplitudeInput = await page.$('input[name="gen-amplitude"]');
        if (amplitudeInput) {
            await amplitudeInput.fill('50');
        }

        const periodInput = await page.$('input[name="gen-period"]');
        if (periodInput) {
            await periodInput.fill('5000');
        }

        // Start generator
        const startBtn = await page.$('.gen-dialog button:has-text("Start")');
        if (startBtn) {
            await startBtn.click();
            console.log('Generator started for Sensor15099_S');
        } else {
            // Try clicking OK or Apply button
            const okBtn = await page.$('.gen-dialog button:has-text("OK")') ||
                          await page.$('.gen-dialog button:has-text("Apply")') ||
                          await page.$('.gen-dialog .btn-primary');
            if (okBtn) {
                await okBtn.click();
                console.log('Generator dialog confirmed');
            }
        }
        await page.waitForTimeout(500);
    } else {
        console.log('Generator button not found for Sensor15099_S');
    }

    // 3. Find AI70_S and set value to 90
    console.log('Looking for AI70_S...');
    await filterInput.fill('AI70_S');
    await page.waitForTimeout(500);

    // Get AI70_S sensor ID
    const ai70Row = await page.$('.ionc-sensor-row');
    if (ai70Row) {
        const sensorId = await ai70Row.getAttribute('data-sensor-id');
        console.log('AI70_S sensor ID:', sensorId);

        // Set value via API
        const setResult = await page.evaluate(async (id) => {
            try {
                const response = await fetch('/api/objects/SharedMemory/ionc/set', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sensor_id: parseInt(id), value: 90 })
                });
                return { ok: response.ok, status: response.status, text: await response.text() };
            } catch (e) {
                return { error: e.message };
            }
        }, sensorId);
        console.log('Set AI70_S to 90:', setResult);
    } else {
        console.log('AI70_S row not found');
    }

    // Clear filter
    await filterInput.fill('');
    await page.waitForTimeout(500);

    // 4. Switch to Dashboard view
    console.log('Switching to Dashboard view...');
    const dashboardBtn = await page.$('#view-dashboard-btn');
    if (dashboardBtn) {
        await dashboardBtn.click();
        await page.waitForTimeout(1000);
    } else {
        console.log('ERROR: Dashboard button not found');
    }

    // Select System Overview dashboard
    const dashSelect = await page.$('#dashboard-select');
    if (dashSelect) {
        await dashSelect.selectOption('System Overview');
        await page.waitForTimeout(1000);
    }

    // 5. Take screenshot and inspect dual gauge
    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/dual-target-test-1.png' });
    console.log('Screenshot 1: Dashboard with dual gauge');

    // Check dual gauge state
    const gaugeInfo = await page.evaluate(() => {
        const dualGauge = document.querySelector('.widget-gauge');
        if (!dualGauge) return { error: 'No gauge found' };

        const needle = dualGauge.querySelector('.gauge-needle');
        const target = dualGauge.querySelector('.dual-target-marker');
        const valueText = dualGauge.querySelector('.gauge-value-text');
        const targetText = dualGauge.querySelector('.gauge-target-text');

        return {
            hasNeedle: !!needle,
            hasTarget: !!target,
            needleTransform: needle?.getAttribute('transform'),
            targetTransform: target?.getAttribute('transform'),
            valueText: valueText?.textContent,
            targetTextContent: targetText?.textContent,
            targetStyle: target?.getAttribute('style'),
            allSvgElements: Array.from(dualGauge.querySelectorAll('svg *')).map(el => ({
                tag: el.tagName,
                class: el.className?.baseVal || el.className,
                transform: el.getAttribute('transform')
            })).filter(e => e.transform)
        };
    });
    console.log('Gauge info:', JSON.stringify(gaugeInfo, null, 2));

    // Wait and observe
    console.log('\nWatching gauge for 30 seconds...');
    for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(5000);

        const currentValues = await page.evaluate(() => {
            const gauge = document.querySelector('.widget-gauge');
            if (!gauge) return null;

            const valueText = gauge.querySelector('.gauge-value-text');
            const needle = gauge.querySelector('.gauge-needle');
            const target = gauge.querySelector('.dual-target-marker');

            return {
                value: valueText?.textContent,
                needleRotation: needle?.getAttribute('transform'),
                targetRotation: target?.getAttribute('transform')
            };
        });
        console.log(`T+${(i+1)*5}s:`, JSON.stringify(currentValues));
    }

    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/dual-target-test-2.png' });
    console.log('Screenshot 2: After 30 seconds');

    console.log('\nBrowser will stay open for 60 seconds...');
    await page.waitForTimeout(60000);

    await browser.close();
})();
