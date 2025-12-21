const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 300 });
    const page = await browser.newPage();

    // Capture console
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('Error') || text.includes('UWebSocket') || text.includes('LogViewer') || text.includes('subscribe')) {
            console.log('BROWSER:', text);
        }
    });

    page.on('pageerror', error => {
        console.error('PAGE ERROR:', error.message);
    });

    // Track API requests
    page.on('request', request => {
        const url = request.url();
        if (url.includes('uwsgate') || url.includes('logserver')) {
            console.log('>> REQUEST:', request.method(), url);
            if (request.postData()) {
                console.log('   Body:', request.postData());
            }
        }
    });

    page.on('response', async response => {
        const url = response.url();
        if (url.includes('uwsgate') || url.includes('logserver')) {
            console.log('<< RESPONSE:', response.status(), url);
            try {
                const body = await response.text();
                if (body.length < 500) {
                    console.log('   Body:', body);
                }
            } catch (e) {}
        }
    });

    console.log('=== Opening UniSet Panel ===');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Take control
    console.log('\n=== Taking control ===');
    await page.evaluate(async () => {
        await fetch('/api/control/take', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'admin123' })
        });
    });
    await page.waitForTimeout(500);

    // Expand server 8081 and click UWebSocketGate1
    console.log('\n=== Opening UWebSocketGate1 ===');

    // Find and expand server group for port 8081
    // Wait for servers to load
    await page.waitForTimeout(2000);

    const expandResult = await page.evaluate(() => {
        const groups = document.querySelectorAll('.server-group');
        console.log('Found server groups:', groups.length);
        for (const group of groups) {
            const header = group.querySelector('.server-group-header');
            console.log('Server header:', header?.textContent);
            if (header && header.textContent.includes('8081')) {
                header.click();
                console.log('Expanded server 8081');
                return { success: true, text: header.textContent };
            }
        }
        return { success: false, groups: Array.from(groups).map(g => g.querySelector('.server-group-header')?.textContent) };
    });
    console.log('Expand result:', JSON.stringify(expandResult));
    await page.waitForTimeout(1000);

    // Click on UWebSocketGate1
    await page.evaluate(() => {
        const names = document.querySelectorAll('.object-name');
        for (const name of names) {
            if (name.textContent.includes('UWebSocketGate')) {
                name.click();
                console.log('Clicked UWebSocketGate1');
                break;
            }
        }
    });
    await page.waitForTimeout(2000);

    // Wait for panel
    await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

    // ====== TEST 1: LogServer connection ======
    console.log('\n=== TEST 1: LogServer connection ===');

    // Check LogServer section exists
    const logServerInfo = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        if (!panel) return { error: 'No active panel' };

        const logServerSection = panel.querySelector('[data-section*="logserver"]');
        const logServerRows = panel.querySelectorAll('tbody[id*="logserver"] tr');

        return {
            sectionExists: !!logServerSection,
            rowCount: logServerRows.length,
            rows: Array.from(logServerRows).map(r => r.textContent.trim())
        };
    });
    console.log('LogServer section:', JSON.stringify(logServerInfo, null, 2));

    // Check LogViewer section
    const logViewerInfo = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        if (!panel) return { error: 'No active panel' };

        // LogViewer создаёт .logviewer-section
        const logViewerSection = panel.querySelector('.logviewer-section');
        // Уровни логов - это кнопки .log-level-pill
        const levelPills = panel.querySelectorAll('.log-level-pill');

        return {
            sectionExists: !!logViewerSection,
            levelPills: Array.from(levelPills).map(p => ({
                level: p.dataset.level,
                active: p.classList.contains('active')
            })),
            connectBtn: !!panel.querySelector('.log-connect-btn')
        };
    });
    console.log('LogViewer section:', JSON.stringify(logViewerInfo, null, 2));

    // Select log levels: info, warn, crit
    console.log('\n=== Selecting log levels: INFO, WARN, CRIT ===');
    // Open level dropdown and select levels
    await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        // Click on Levels button to open dropdown
        const levelBtn = panel.querySelector('.log-level-btn');
        if (levelBtn) {
            levelBtn.click();
            console.log('Opened level dropdown');
        }
    });
    await page.waitForTimeout(300);

    await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const pills = panel.querySelectorAll('.log-level-pill');
        pills.forEach(pill => {
            const level = pill.dataset.level;
            if (['CRIT', 'WARN', 'INFO'].includes(level)) {
                pill.click();
                console.log(`Toggled level: ${level}`);
            }
        });
    });
    await page.waitForTimeout(300);

    // Click Apply
    await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const applyBtn = panel.querySelector('.log-level-apply');
        if (applyBtn) {
            applyBtn.click();
            console.log('Applied levels');
        }
    });
    await page.waitForTimeout(500);

    // Click Connect button
    console.log('\n=== Connecting to LogServer ===');
    const connectResult = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const connectBtn = panel.querySelector('.log-connect-btn');
        if (connectBtn) {
            connectBtn.click();
            return { clicked: true, buttonText: connectBtn.textContent };
        }
        return { clicked: false, error: 'Connect button not found' };
    });
    console.log('Connect result:', connectResult);
    await page.waitForTimeout(2000);

    // Check connection status
    const connectionStatus = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const connectBtn = panel.querySelector('.log-connect-btn');
        const logOutput = panel.querySelector('.log-output');

        return {
            buttonText: connectBtn?.textContent,
            buttonClass: connectBtn?.className,
            logOutputExists: !!logOutput,
            logLines: logOutput ? logOutput.querySelectorAll('.log-line').length : 0
        };
    });
    console.log('Connection status:', JSON.stringify(connectionStatus, null, 2));

    // ====== TEST 2: Add sensors to table ======
    console.log('\n=== TEST 2: Adding sensors to table ===');

    // Check sensors section
    const sensorsInfo = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const sensorsSection = panel.querySelector('[data-section*="uwsgate-sensors"]');
        const sensorInput = panel.querySelector('.uwsgate-sensor-input');
        const sensorTable = panel.querySelector('.uwsgate-sensors-table');

        return {
            sectionExists: !!sensorsSection,
            inputExists: !!sensorInput,
            tableExists: !!sensorTable,
            currentRows: sensorTable ? sensorTable.querySelectorAll('tbody tr').length : 0
        };
    });
    console.log('Sensors section:', JSON.stringify(sensorsInfo, null, 2));

    // Type sensor name to trigger autocomplete
    // Take screenshot
    await page.screenshot({ path: '/tmp/uwsgate-test-1.png', fullPage: true });
    console.log('Screenshot saved to /tmp/uwsgate-test-1.png');

    console.log('\n=== Typing sensor name for autocomplete ===');
    const sensorInput = await page.$('.tab-panel.active .uwsgate-sensor-input');
    if (sensorInput) {
        await sensorInput.focus();
        // Try AI which should be in sensorconfig
        await sensorInput.type('AI', { delay: 100 });
        await page.waitForTimeout(500);

        // Check autocomplete
        const autocomplete = await page.evaluate(() => {
            const panel = document.querySelector('.tab-panel.active');
            const dropdown = panel.querySelector('.uwsgate-autocomplete');
            const items = dropdown ? dropdown.querySelectorAll('.uwsgate-autocomplete-item') : [];

            return {
                visible: dropdown && dropdown.style.display !== 'none',
                itemCount: items.length,
                items: Array.from(items).slice(0, 5).map(i => i.textContent.trim())
            };
        });
        console.log('Autocomplete:', JSON.stringify(autocomplete, null, 2));

        // Select first item if available
        if (autocomplete.itemCount > 0) {
            console.log('\n=== Selecting first autocomplete item ===');
            await page.keyboard.press('ArrowDown');
            await page.waitForTimeout(200);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(1000);

            // Check if sensor was added
            const tableAfterAdd = await page.evaluate(() => {
                const panel = document.querySelector('.tab-panel.active');
                const tbody = panel.querySelector('.uwsgate-sensors-table tbody');
                const rows = tbody ? tbody.querySelectorAll('tr') : [];

                return {
                    rowCount: rows.length,
                    sensors: Array.from(rows).map(r => {
                        const cells = r.querySelectorAll('td');
                        return {
                            id: cells[1]?.textContent.trim(),
                            name: cells[2]?.textContent.trim(),
                            value: cells[3]?.textContent.trim()
                        };
                    })
                };
            });
            console.log('Table after add:', JSON.stringify(tableAfterAdd, null, 2));
        }
    } else {
        console.log('ERROR: Sensor input not found');
    }

    // ====== TEST 3: Add sensor to chart ======
    console.log('\n=== TEST 3: Adding sensor to chart ===');

    // Find chart checkbox and click it
    const chartCheckboxResult = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const checkboxes = panel.querySelectorAll('.uwsgate-chart-checkbox');

        if (checkboxes.length > 0) {
            const firstCheckbox = checkboxes[0];
            const sensorName = firstCheckbox.closest('tr')?.querySelector('td:nth-child(3)')?.textContent;
            firstCheckbox.click();
            return { clicked: true, sensorName, checked: firstCheckbox.checked };
        }
        return { clicked: false, error: 'No chart checkboxes found' };
    });
    console.log('Chart checkbox:', JSON.stringify(chartCheckboxResult, null, 2));
    await page.waitForTimeout(1000);

    // Check charts section
    const chartsInfo = await page.evaluate(() => {
        const panel = document.querySelector('.tab-panel.active');
        const chartsSection = panel.querySelector('[data-section*="charts"]');
        const chartContainers = panel.querySelectorAll('.chart-container, .chart-panel');
        const chartCanvases = panel.querySelectorAll('canvas');

        let sectionVisible = false;
        if (chartsSection) {
            const parent = chartsSection.closest('.object-section') || chartsSection.closest('.collapsible-section');
            if (parent) {
                sectionVisible = getComputedStyle(parent).display !== 'none';
            }
        }

        return {
            sectionExists: !!chartsSection,
            sectionVisible,
            chartCount: chartContainers.length,
            canvasCount: chartCanvases.length,
            chartIds: Array.from(chartContainers).map(c => c.id)
        };
    });
    console.log('Charts info:', JSON.stringify(chartsInfo, null, 2));

    // ====== TEST 4: Check chart rendering ======
    console.log('\n=== TEST 4: Check chart rendering ===');
    await page.waitForTimeout(2000);

    const chartState = await page.evaluate(() => {
        const tabs = window.state?.tabs;
        if (!tabs) return { error: 'No state.tabs' };

        for (const [key, tabState] of tabs.entries()) {
            if (key.includes('UWebSocketGate')) {
                return {
                    tabKey: key,
                    chartsCount: tabState.charts?.size || 0,
                    chartKeys: tabState.charts ? Array.from(tabState.charts.keys()) : [],
                    chartsData: tabState.charts ? Array.from(tabState.charts.entries()).map(([k, v]) => ({
                        varName: k,
                        hasChart: !!v.chart,
                        dataPoints: v.chart?.data?.datasets?.[0]?.data?.length || 0
                    })) : []
                };
            }
        }
        return { error: 'UWebSocketGate tab not found' };
    });
    console.log('Chart state:', JSON.stringify(chartState, null, 2));

    // ====== TEST 5: Wait for SSE updates ======
    console.log('\n=== TEST 5: Waiting for SSE sensor updates (10 seconds) ===');

    // Listen for SSE events
    await page.evaluate(() => {
        window._sseUpdates = [];
        const origDispatch = EventTarget.prototype.dispatchEvent;
        EventTarget.prototype.dispatchEvent = function(event) {
            if (event.type === 'uwsgate_sensor_batch') {
                window._sseUpdates.push({
                    type: event.type,
                    time: new Date().toISOString()
                });
            }
            return origDispatch.call(this, event);
        };
    });

    await page.waitForTimeout(10000);

    // Check for updates
    const sseUpdates = await page.evaluate(() => {
        return {
            updates: window._sseUpdates || [],
            updateCount: (window._sseUpdates || []).length
        };
    });
    console.log('SSE updates received:', JSON.stringify(sseUpdates, null, 2));

    // Final chart state
    const finalChartState = await page.evaluate(() => {
        const tabs = window.state?.tabs;
        if (!tabs) return { error: 'No state.tabs' };

        for (const [key, tabState] of tabs.entries()) {
            if (key.includes('UWebSocketGate')) {
                return {
                    chartsData: tabState.charts ? Array.from(tabState.charts.entries()).map(([k, v]) => ({
                        varName: k,
                        dataPoints: v.chart?.data?.datasets?.[0]?.data?.length || 0,
                        lastValue: v.chart?.data?.datasets?.[0]?.data?.slice(-1)?.[0]?.y
                    })) : []
                };
            }
        }
        return { error: 'Tab not found' };
    });
    console.log('Final chart state:', JSON.stringify(finalChartState, null, 2));

    // ====== SUMMARY ======
    console.log('\n========== SUMMARY ==========');
    console.log('1. LogServer section:', logServerInfo.sectionExists ? '✅' : '❌');
    console.log('2. LogViewer section:', logViewerInfo.sectionExists ? '✅' : '❌');
    console.log('3. LogServer connection:', connectionStatus.buttonText?.includes('Disconnect') ? '✅' : '⚠️');
    console.log('4. Sensors input:', sensorsInfo.inputExists ? '✅' : '❌');
    console.log('5. Charts section:', chartsInfo.sectionExists ? '✅' : '❌');
    console.log('6. Chart rendering:', (chartState.chartsCount || 0) > 0 ? '✅' : '⚠️ (no sensors added)');
    console.log('7. SSE updates:', sseUpdates.updateCount > 0 ? '✅' : '⚠️ (no updates in 10s)');
    console.log('==============================');

    // Final screenshot
    await page.screenshot({ path: '/tmp/uwsgate-test-final.png', fullPage: true });
    console.log('Final screenshot saved to /tmp/uwsgate-test-final.png');

    console.log('\n=== Browser closing ===');
    await browser.close();
})();
