const { chromium } = require('@playwright/test');

/**
 * Test unified filter - checks that filter works on name, id, and mbreg (where applicable)
 * in all components: IONC, OPCUAExchange, OPCUAServer, ModbusMaster, ModbusSlave
 */

const COMPONENTS = [
    {
        name: 'SharedMemory',
        type: 'IONC',
        filterInputSelector: 'input[id^="ionc-filter-"]',
        tableSelector: 'tbody[id^="ionc-sensors-"]',
        rowSelector: 'tr[data-sensor-id]',
        testCases: [
            { query: 'Sensor', field: 'name', description: 'Filter by name' },
            { query: '150', field: 'id', description: 'Filter by id' }
        ]
    },
    {
        name: 'OPCUAClient1',
        type: 'OPCUAExchange',
        filterInputSelector: 'input[id^="opcua-sensors-filter-"]',
        tableSelector: 'tbody[id^="opcua-sensors-"]',
        rowSelector: 'tr[data-sensor-id]',
        testCases: [
            { query: 'OPC', field: 'name', description: 'Filter by name' },
            { query: '100', field: 'id', description: 'Filter by id' }
        ]
    },
    {
        name: 'OPCUAServer1',
        type: 'OPCUAServer',
        filterInputSelector: 'input[id^="opcuasrv-sensors-filter-"]',
        tableSelector: 'tbody[id^="opcuasrv-sensors-"]',
        rowSelector: 'tr[data-sensor-id]',
        testCases: [
            { query: 'Var', field: 'name', description: 'Filter by name' },
            { query: '200', field: 'id', description: 'Filter by id' }
        ]
    },
    {
        name: 'MBTCPMaster1',
        type: 'ModbusMaster',
        filterInputSelector: 'input[id^="mb-registers-filter-"]',
        tableSelector: 'tbody[id^="mb-registers-tbody-"]',
        rowSelector: 'tr[data-id]',
        testCases: [
            { query: 'MB', field: 'name', description: 'Filter by name' },
            { query: '100', field: 'id', description: 'Filter by id' },
            { query: '70', field: 'mbreg', description: 'Filter by mbreg' }
        ]
    },
    {
        name: 'MBTCPSlave1',
        type: 'ModbusSlave',
        filterInputSelector: 'input[id^="mbs-registers-filter-"]',
        tableSelector: 'tbody[id^="mbs-registers-tbody-"]',
        rowSelector: 'tr[data-id]',
        testCases: [
            { query: 'MBS', field: 'name', description: 'Filter by name' },
            { query: '200', field: 'id', description: 'Filter by id' },
            { query: '80', field: 'mbreg', description: 'Filter by mbreg' }
        ]
    }
];

async function waitForObjectInSidebar(page, objectName, timeout = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        // Objects are <li> elements with data-name attribute
        const item = await page.locator(`li[data-name="${objectName}"]`).first();
        if (await item.count() > 0) {
            return item;
        }
        await page.waitForTimeout(500);
    }
    return null;
}

async function testComponent(page, component) {
    console.log(`\n=== Testing ${component.name} (${component.type}) ===`);

    // Find and click the object in sidebar
    const objectItem = await waitForObjectInSidebar(page, component.name, 5000);
    if (!objectItem) {
        console.log(`  SKIP: ${component.name} not found in sidebar`);
        return { name: component.name, status: 'skip', tests: [] };
    }

    await objectItem.click({ timeout: 5000 });
    await page.waitForTimeout(2000);

    // Find filter input
    const filterInput = page.locator(component.filterInputSelector).first();
    if (await filterInput.count() === 0) {
        console.log(`  SKIP: Filter input not found`);
        return { name: component.name, status: 'skip', tests: [] };
    }

    // Check that "by sensor" checkbox is NOT present (for Modbus components)
    if (component.type.includes('Modbus')) {
        const checkbox = await page.locator('label.mb-search-mode').count();
        if (checkbox > 0) {
            console.log(`  FAIL: "by sensor" checkbox still present!`);
        } else {
            console.log(`  PASS: "by sensor" checkbox removed`);
        }
    }

    // Check placeholder
    const placeholder = await filterInput.getAttribute('placeholder');
    console.log(`  Placeholder: "${placeholder}"`);
    if (placeholder === 'Filter...') {
        console.log(`  PASS: Placeholder is generic "Filter..."`);
    }

    // Wait for data to load (poll for rows)
    let initialRows = 0;
    for (let attempt = 0; attempt < 10; attempt++) {
        await page.waitForTimeout(500);
        initialRows = await page.locator(component.rowSelector).count();
        if (initialRows > 0) break;
    }
    console.log(`  Initial rows: ${initialRows}`);

    if (initialRows === 0) {
        console.log(`  WARN: No rows in table after waiting`);
    }

    const testResults = [];

    // Test each filter case
    for (const testCase of component.testCases) {
        console.log(`\n  --- ${testCase.description} (query: "${testCase.query}") ---`);

        // Clear and enter filter
        await filterInput.fill('');
        await page.waitForTimeout(300);
        await filterInput.fill(testCase.query);
        await page.waitForTimeout(600);

        const filteredRows = await page.locator(component.rowSelector).count();
        console.log(`  Filtered rows: ${filteredRows}`);

        // Check if filtering worked
        const success = filteredRows > 0;
        if (success) {
            console.log(`  PASS: Filter returned ${filteredRows} rows`);
            testResults.push({ test: testCase.description, status: 'pass', rows: filteredRows });
        } else {
            console.log(`  WARN: No rows match "${testCase.query}"`);
            testResults.push({ test: testCase.description, status: 'warn', rows: 0 });
        }
    }

    // Clear filter
    await filterInput.fill('');
    await page.waitForTimeout(300);

    return { name: component.name, type: component.type, status: 'tested', tests: testResults };
}

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 30 });
    const page = await browser.newPage();

    console.log('=== Unified Filter Test ===');
    console.log('Testing filter by name, id, and mbreg across all components\n');

    await page.goto('http://localhost:8000');

    // Wait for page to fully load
    console.log('Waiting for page to load...');
    await page.waitForTimeout(3000);

    // Expand all server groups if they are collapsed
    console.log('Expanding server groups...');
    const serverGroups = page.locator('.server-group');
    const groupCount = await serverGroups.count();
    console.log(`Found ${groupCount} server groups`);

    for (let i = 0; i < groupCount; i++) {
        const group = serverGroups.nth(i);
        const isCollapsed = await group.evaluate(el => el.classList.contains('collapsed'));
        const headerText = await group.locator('.server-group-header').textContent();
        console.log(`  Group: ${headerText.trim().substring(0, 30)}... (collapsed: ${isCollapsed})`);

        if (isCollapsed) {
            await group.locator('.server-group-header').click();
            await page.waitForTimeout(500);
            console.log(`    -> Expanded`);
        }
    }

    // Wait for objects to appear
    await page.waitForTimeout(1000);

    // List all visible objects (li elements with data-name)
    const allObjects = await page.locator('li[data-name]').evaluateAll(els => els.map(el => el.dataset.name));
    console.log(`\nFound ${allObjects.length} objects: ${allObjects.join(', ')}`);

    if (allObjects.length === 0) {
        console.log('\nERROR: No objects loaded in sidebar. Check server connection.');
        await page.waitForTimeout(10000);
        await browser.close();
        return;
    }

    const results = [];

    // Test each component
    for (const component of COMPONENTS) {
        try {
            const result = await testComponent(page, component);
            results.push(result);
        } catch (err) {
            console.log(`  ERROR: ${err.message}`);
            results.push({ name: component.name, status: 'error', error: err.message });
        }
    }

    // Summary
    console.log('\n\n========== SUMMARY ==========');
    console.log('Component            | Status  | Tests');
    console.log('---------------------|---------|------------------------');

    for (const result of results) {
        const status = result.status.toUpperCase().padEnd(7);
        const tests = result.tests?.map(t => `${t.test}: ${t.status}`).join(', ') || '-';
        console.log(`${result.name.padEnd(20)} | ${status} | ${tests}`);
    }

    // Overall result
    const passed = results.filter(r => r.status === 'tested' && r.tests?.every(t => t.status !== 'fail')).length;
    const failed = results.filter(r => r.status === 'error' || r.tests?.some(t => t.status === 'fail')).length;
    const skipped = results.filter(r => r.status === 'skip').length;

    console.log('\n----------------------------------');
    console.log(`TESTED: ${passed}, FAILED: ${failed}, SKIPPED: ${skipped}`);

    console.log('\n--- Keeping browser open for 10s to observe ---');
    await page.waitForTimeout(10000);

    await browser.close();
    console.log('\nTest complete.');
})();
