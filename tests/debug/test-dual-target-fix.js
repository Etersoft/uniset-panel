const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    // Capture all console output
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('SETPOINT') || text.includes('WIDGET') || text.includes('updateSetpoint')) {
            console.log('BROWSER:', text);
        }
    });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(3000);

    // 1. First open SharedMemory to find sensor ID and enable generator
    console.log('=== Opening SharedMemory ===');
    const smObject = await page.$('text=SharedMemory');
    if (smObject) {
        await smObject.click();
        await page.waitForTimeout(2000);
    } else {
        console.log('ERROR: SharedMemory not found');
        await browser.close();
        return;
    }

    // Find AI70_S sensor ID
    console.log('=== Looking for AI70_S sensor ===');
    const ai70Info = await page.evaluate(() => {
        const rows = document.querySelectorAll('.ionc-sensor-row');
        for (const row of rows) {
            const nameEl = row.querySelector('.ionc-sensor-name');
            if (nameEl?.textContent.includes('AI70_S')) {
                return {
                    sensorId: row.dataset.sensorId,
                    name: nameEl.textContent
                };
            }
        }
        return null;
    });
    console.log('AI70_S info:', ai70Info);

    // 2. Set AI70_S value using the correct API
    if (ai70Info) {
        console.log('=== Setting AI70_S to 75 ===');
        // Get the server ID from the tab state
        const serverInfo = await page.evaluate(() => {
            // Find the SM tab
            for (const [tabKey, tabState] of state.tabs.entries()) {
                if (tabState.displayName === 'SharedMemory') {
                    return {
                        tabKey,
                        serverId: tabKey.split(':')[0]
                    };
                }
            }
            return null;
        });
        console.log('Server info:', serverInfo);

        if (serverInfo) {
            const setResult = await page.evaluate(async (args) => {
                try {
                    const url = `/api/objects/SharedMemory/ionc/set?server=${args.serverId}`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sensor_id: parseInt(args.sensorId),
                            value: 75
                        })
                    });
                    return { ok: response.ok, status: response.status, text: await response.text() };
                } catch (e) {
                    return { error: e.message };
                }
            }, { serverId: serverInfo.serverId, sensorId: ai70Info.sensorId });
            console.log('Set AI70_S result:', setResult);
        }
    }

    // 3. Enable generator for Sensor15099_S
    console.log('=== Looking for Sensor15099_S ===');
    const filterInput = await page.$('.filter-input');
    if (filterInput) {
        await filterInput.fill('Sensor15099');
        await page.waitForTimeout(500);
    }

    const genBtn = await page.$('.ionc-btn-gen');
    if (genBtn) {
        await genBtn.click();
        await page.waitForTimeout(500);

        // Select sine generator
        await page.selectOption('select[name="gen-type"]', 'sine');
        await page.fill('input[name="gen-amplitude"]', '50');
        await page.fill('input[name="gen-period"]', '5000');

        // Start generator
        const startBtn = await page.$('.gen-dialog .btn-primary, .gen-dialog button:has-text("Start")');
        if (startBtn) {
            await startBtn.click();
            console.log('Generator started for Sensor15099_S');
            await page.waitForTimeout(500);
        }
    }

    // Clear filter
    if (filterInput) {
        await filterInput.fill('');
        await page.waitForTimeout(500);
    }

    // 4. Switch to Dashboard view
    console.log('=== Switching to Dashboard view ===');
    const dashboardBtn = await page.$('#view-dashboard-btn');
    if (dashboardBtn) {
        await dashboardBtn.click();
        await page.waitForTimeout(1000);
    }

    // Select System Overview dashboard
    const dashSelect = await page.$('#dashboard-select');
    if (dashSelect) {
        await dashSelect.selectOption('System Overview');
        await page.waitForTimeout(1000);
    }

    // 5. Inject logging into handleSensorUpdate
    await page.evaluate(() => {
        const originalHandleSensorUpdate = dashboardManager.handleSensorUpdate.bind(dashboardManager);
        dashboardManager.handleSensorUpdate = function(sensorName, value, error) {
            if (sensorName === 'AI70_S' || dashboardState.setpointSubscriptions.has(sensorName)) {
                console.log(`[SETPOINT] handleSensorUpdate: "${sensorName}" = ${value}`);
            }
            originalHandleSensorUpdate(sensorName, value, error);
        };
        console.log('Logging injected');
    });

    // Also log updateSetpoint calls
    await page.evaluate(() => {
        const widget = dashboardState.widgets.get('widget-1766449476291');
        if (widget && widget.updateSetpoint) {
            const original = widget.updateSetpoint.bind(widget);
            widget.updateSetpoint = function(value, error) {
                console.log(`[WIDGET] updateSetpoint called: value=${value}, targetEl=${!!this.targetEl}`);
                original(value, error);
                console.log(`[WIDGET] after update: display=${this.targetEl?.style?.display}, transform=${this.targetEl?.style?.transform}`);
            };
        }
    });

    // 6. Watch for updates
    console.log('\n=== Watching for 20 seconds ===');
    for (let i = 0; i < 4; i++) {
        await page.waitForTimeout(5000);

        const status = await page.evaluate(() => {
            const widget = dashboardState.widgets.get('widget-1766449476291');
            const targetEl = widget?.targetEl;
            return {
                mainValue: widget?.value,
                targetDisplay: targetEl?.style?.display,
                targetTransform: targetEl?.style?.transform
            };
        });
        console.log(`T+${(i+1)*5}s:`, JSON.stringify(status));
    }

    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/dual-target-fix.png' });
    console.log('\nScreenshot saved');

    console.log('\n=== Browser will stay open for 60 seconds ===');
    await page.waitForTimeout(60000);

    await browser.close();
})();
