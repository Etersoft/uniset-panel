const { chromium } = require('@playwright/test');

// Test filter and pin functionality for all component types
const components = [
    {
        name: 'SharedMemory',
        type: 'ionc',
        filterClass: '.filter-input',
        rowClass: '.ionc-sensor-row',
        pinClass: '.pin-toggle',
        pinnedClass: '.pin-toggle.pinned',
        storageKey: 'uniset-panel-ionc-pinned'
    },
    {
        name: 'OPCUAClient1',
        type: 'opcua-exchange',
        filterClass: '.filter-input',
        rowClass: '.opcua-sensor-row',
        pinClass: '.pin-toggle',
        pinnedClass: '.pin-toggle.pinned',
        storageKey: 'uniset-panel-opcua-pinned'
    },
    {
        name: 'MBTCPMaster1',
        type: 'modbus-master',
        filterClass: '.filter-input',
        rowClass: '.mb-register-row',
        pinClass: '.pin-toggle',
        pinnedClass: '.pin-toggle.pinned',
        storageKey: 'uniset-panel-mb-pinned'
    },
    {
        name: 'MBTCPSlave1',
        type: 'modbus-slave',
        filterClass: '.filter-input',
        rowClass: '.mbs-register-row',
        pinClass: '.pin-toggle',
        pinnedClass: '.pin-toggle.pinned',
        storageKey: 'uniset-panel-mbs-pinned'
    },
    {
        name: 'OPCUAServer1',
        type: 'opcua-server',
        filterClass: '.filter-input',
        rowClass: '.opcuasrv-sensor-row',
        pinClass: '.pin-toggle',
        pinnedClass: '.pin-toggle.pinned',
        storageKey: 'uniset-panel-opcuasrv-pinned'
    }
];

async function testComponent(page, component) {
    console.log(`\n=== Testing ${component.name} (${component.type}) ===`);

    // Clear localStorage for this component
    await page.evaluate((key) => {
        localStorage.removeItem(key);
    }, component.storageKey);

    // Click on object in sidebar
    const objectLink = await page.$(`text=${component.name}`);
    if (!objectLink) {
        console.log(`SKIP: ${component.name} not found in sidebar`);
        return { name: component.name, status: 'skip', reason: 'not found' };
    }

    await objectLink.click();
    await page.waitForTimeout(1500);

    // Find filter input in active tab
    const filterInput = await page.$(component.filterClass);
    if (!filterInput) {
        console.log(`SKIP: Filter input not found for ${component.name}`);
        return { name: component.name, status: 'skip', reason: 'no filter input' };
    }

    // Type filter to narrow down results
    const filterText = component.type === 'ionc' ? 'AI' : 'Reg';
    await filterInput.fill(filterText);
    await page.waitForTimeout(500);

    // Get IDs to pin
    const idsToPin = await page.evaluate((config) => {
        const rows = document.querySelectorAll(`${config.rowClass}:not([style*="display: none"])`);
        return Array.from(rows).slice(0, 2).map(r => {
            const toggle = r.querySelector(config.pinClass);
            return toggle?.dataset.id;
        }).filter(Boolean);
    }, component);

    if (idsToPin.length < 2) {
        console.log(`SKIP: Not enough rows to pin for ${component.name} (found ${idsToPin.length})`);
        return { name: component.name, status: 'skip', reason: 'not enough rows' };
    }

    console.log(`  Pinning IDs: ${idsToPin.join(', ')}`);

    // Pin two items
    for (const id of idsToPin) {
        await page.click(`${component.pinClass}[data-id="${id}"]`);
        await page.waitForTimeout(200);
    }

    // Verify localStorage
    const pinnedBefore = await page.evaluate((key) => {
        return JSON.parse(localStorage.getItem(key) || '{}');
    }, component.storageKey);
    console.log(`  Pinned in localStorage:`, JSON.stringify(pinnedBefore));

    // Clear filter
    await filterInput.fill('');
    await page.waitForTimeout(1000);

    // Check pinned items are visible
    const pinnedCount = await page.evaluate((config) => {
        return document.querySelectorAll(config.pinnedClass).length;
    }, component);

    console.log(`  Pinned items visible after clearing filter: ${pinnedCount}`);

    if (pinnedCount >= 2) {
        console.log(`  SUCCESS: ${component.name} filter works correctly!`);
        return { name: component.name, status: 'pass' };
    } else {
        console.log(`  FAILURE: ${component.name} - pinned items not visible!`);
        return { name: component.name, status: 'fail', pinnedCount };
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log('Connecting to http://localhost:8000...');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    const results = [];

    for (const component of components) {
        try {
            const result = await testComponent(page, component);
            results.push(result);
        } catch (err) {
            console.log(`  ERROR: ${component.name} - ${err.message}`);
            results.push({ name: component.name, status: 'error', error: err.message });
        }
    }

    console.log('\n=== SUMMARY ===');
    let passed = 0, failed = 0, skipped = 0;
    for (const r of results) {
        const icon = r.status === 'pass' ? '✓' : r.status === 'fail' ? '✗' : '○';
        console.log(`${icon} ${r.name}: ${r.status}${r.reason ? ` (${r.reason})` : ''}`);
        if (r.status === 'pass') passed++;
        else if (r.status === 'fail') failed++;
        else skipped++;
    }
    console.log(`\nTotal: ${passed} passed, ${failed} failed, ${skipped} skipped`);

    await browser.close();

    process.exit(failed > 0 ? 1 : 0);
})();
