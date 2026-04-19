const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 300 });
    const page = await browser.newPage();

    page.on('console', msg => {
        console.log('BROWSER:', msg.text());
    });

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // Find and click on an IONC object (UniSetActivator or SharedMemory)
    console.log('Looking for IONC object...');

    // Expand server tree if needed
    const serverItem = await page.$('.server-item');
    if (serverItem) {
        await serverItem.click();
        await page.waitForTimeout(500);
    }

    // Click on SharedMemory or UniSetActivator
    const ioncObject = await page.$('text=SharedMemory') || await page.$('text=UniSetActivator');
    if (ioncObject) {
        await ioncObject.click();
        await page.waitForTimeout(1000);
        console.log('Opened IONC object tab');
    } else {
        console.log('ERROR: No IONC object found');
        await browser.close();
        return;
    }

    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/ionc-filter-1-initial.png' });
    console.log('Screenshot 1: Initial state');

    // Find the filter input (class="filter-input" for IONC)
    const filterInput = await page.$('.filter-input');
    if (!filterInput) {
        console.log('ERROR: Filter input not found');
        // Debug: print all inputs
        const inputs = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('input')).map(i => ({
                id: i.id,
                class: i.className,
                placeholder: i.placeholder
            }));
        });
        console.log('Available inputs:', inputs);
        await browser.close();
        return;
    }

    // Type filter text - use "AI" to get more results
    console.log('Typing filter "AI"...');
    await filterInput.click();
    await filterInput.fill('AI');
    await page.waitForTimeout(500);

    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/ionc-filter-2-filtered.png' });
    console.log('Screenshot 2: After filtering "AI7"');

    // Check how many rows are visible
    const visibleRows = await page.evaluate(() => {
        const rows = document.querySelectorAll('.ionc-sensor-row:not([style*="display: none"])');
        return {
            count: rows.length,
            names: Array.from(rows).slice(0, 10).map(r => r.querySelector('.ionc-col-name')?.textContent || 'N/A')
        };
    });
    console.log('Visible rows after filter:', visibleRows);

    // Try to pin first visible row
    console.log('Trying to pin first sensor...');
    const firstPinToggle = await page.$('.ionc-sensor-row:not([style*="display: none"]) .pin-toggle');
    if (firstPinToggle) {
        await firstPinToggle.click();
        await page.waitForTimeout(300);
        console.log('Clicked first pin toggle');
    } else {
        console.log('ERROR: No pin toggle found');
    }

    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/ionc-filter-3-pinned1.png' });
    console.log('Screenshot 3: After pinning first sensor');

    // Try to pin second visible row
    console.log('Trying to pin second sensor...');
    const allPinToggles = await page.$$('.ionc-sensor-row:not([style*="display: none"]) .pin-toggle');
    if (allPinToggles.length > 1) {
        await allPinToggles[1].click();
        await page.waitForTimeout(300);
        console.log('Clicked second pin toggle');
    } else {
        console.log('Only ' + allPinToggles.length + ' pin toggles found');
    }

    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/ionc-filter-4-pinned2.png' });
    console.log('Screenshot 4: After pinning second sensor');

    // Check localStorage after pinning
    const pinnedAfterClick = await page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('uniset-panel-ionc-pinned') || '{}');
        return saved;
    });
    console.log('Pinned in localStorage:', pinnedAfterClick);

    // Clear filter and check pinned sensors
    console.log('Clearing filter...');
    await filterInput.fill('');
    await page.waitForTimeout(500);

    await page.screenshot({ path: '/home/pv/Projects/uniset-panel/tests/debug/ionc-filter-5-cleared.png' });
    console.log('Screenshot 5: After clearing filter');

    // Debug: check renderer state
    const rendererState = await page.evaluate(() => {
        // Find the active IONC renderer
        const renderers = window.ioncRenderers;
        if (!renderers) return { error: 'No ioncRenderers found' };

        let rendererInfo = {};
        for (const [key, renderer] of renderers) {
            rendererInfo[key] = {
                objectName: renderer.objectName,
                filter: renderer.filter,
                allSensorsCount: renderer.allSensors?.length,
                pinnedInStorage: JSON.parse(localStorage.getItem('uniset-panel-ionc-pinned') || '{}')[renderer.objectName],
                firstSensorId: renderer.allSensors?.[0]?.id,
                firstSensorIdType: typeof renderer.allSensors?.[0]?.id
            };
        }
        return rendererInfo;
    });
    console.log('Renderer state:', JSON.stringify(rendererState, null, 2));

    // Check pinned rows
    const pinnedRows = await page.evaluate(() => {
        const pinned = document.querySelectorAll('.ionc-sensor-pinned');
        return {
            count: pinned.length,
            names: Array.from(pinned).map(r => r.querySelector('.ionc-col-name')?.textContent || 'N/A')
        };
    });
    console.log('Pinned rows:', pinnedRows);

    // Check state
    const state = await page.evaluate(() => {
        const tabPanel = document.querySelector('.tab-panel.active');
        const tabKey = tabPanel?.querySelector('[data-name]')?.dataset.name;
        const tabState = tabKey ? window.state?.tabs?.get(tabKey) : null;
        return {
            tabKey,
            pinnedSensors: tabState?.pinnedSensors ? Array.from(tabState.pinnedSensors) : [],
            filterValue: document.querySelector('.unified-filter-input')?.value
        };
    });
    console.log('Tab state:', state);

    console.log('\nBrowser will stay open for 60 seconds...');
    await page.waitForTimeout(60000);

    await browser.close();
})();
