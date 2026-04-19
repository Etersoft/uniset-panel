const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();

    // Log network requests
    page.on('request', req => {
        if (req.url().includes('/modbus/') || req.url().includes('MBTCPMaster')) {
            console.log('>> REQUEST:', req.url());
        }
    });

    page.on('response', async res => {
        if (res.url().includes('/modbus/') || res.url().includes('MBTCPMaster')) {
            console.log('<< RESPONSE:', res.status(), res.url());
            try {
                const text = await res.text();
                console.log('   Body:', text.substring(0, 500));
            } catch (e) {}
        }
    });

    page.on('console', msg => {
        if (msg.text().includes('Modbus') || msg.text().includes('MB') || msg.type() === 'error') {
            console.log('BROWSER:', msg.type(), msg.text());
        }
    });

    console.log('Loading page...');
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(3000);

    // Expand server groups
    const groups = page.locator('.server-group');
    const count = await groups.count();
    for (let i = 0; i < count; i++) {
        const group = groups.nth(i);
        const collapsed = await group.evaluate(el => el.classList.contains('collapsed'));
        if (collapsed) {
            await group.locator('.server-group-header').click();
            await page.waitForTimeout(500);
        }
    }

    // Click on MBTCPMaster1
    console.log('\n=== Opening MBTCPMaster1 ===');
    const mbMaster = page.locator('li[data-name="MBTCPMaster1"]');
    if (await mbMaster.count() > 0) {
        await mbMaster.click();
        console.log('Clicked MBTCPMaster1, waiting for data...');
        await page.waitForTimeout(5000);

        // Check what sections are visible
        const sections = await page.locator('.collapsible-section').evaluateAll(els =>
            els.map(el => ({
                id: el.dataset.sectionId,
                collapsed: el.classList.contains('collapsed')
            }))
        );
        console.log('\nSections:', JSON.stringify(sections, null, 2));

        // Check if Registers section needs to be expanded
        const registersSection = page.locator('.collapsible-section[data-section-id*="registers"]');
        if (await registersSection.count() > 0) {
            const isCollapsed = await registersSection.evaluate(el => el.classList.contains('collapsed'));
            console.log(`Registers section collapsed: ${isCollapsed}`);

            if (isCollapsed) {
                await registersSection.locator('.section-header').click();
                await page.waitForTimeout(2000);
                console.log('Expanded Registers section');
            }
        }

        // Check rows in table
        const rows = await page.locator('tr[data-id]').count();
        console.log(`\nRows in table: ${rows}`);

        // Check filter input
        const filterInput = page.locator('input[id^="mb-registers-filter-"]');
        if (await filterInput.count() > 0) {
            const inputId = await filterInput.getAttribute('id');
            console.log(`Filter input found: ${inputId}`);
        }
    } else {
        console.log('MBTCPMaster1 not found');
    }

    console.log('\n--- Keeping browser open for 30s ---');
    await page.waitForTimeout(30000);

    await browser.close();
})();
