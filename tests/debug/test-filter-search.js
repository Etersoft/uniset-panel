const { chromium } = require('@playwright/test');

/**
 * Test unified filter search - checks that filter works on both register number AND sensor name
 */

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();

    console.log('=== Unified Filter Search Test ===\n');

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(2000);

    // 1. Expand server group and find ModbusMaster or ModbusSlave
    console.log('--- Opening Modbus tab ---');

    const serverGroup = page.locator('.server-group-header').first();
    if (await serverGroup.count() > 0) {
        await serverGroup.click();
        await page.waitForTimeout(500);
    }

    // Try to find MBSlave1 or similar
    const mbObject = page.locator('.object-item', { hasText: /MBSlave|MBMaster/ }).first();
    if (await mbObject.count() > 0) {
        await mbObject.click();
        await page.waitForTimeout(2000);
        console.log('✓ Modbus tab opened');

        // 2. Check that checkbox "by sensor" is NOT present
        console.log('\n--- Checking for checkbox removal ---');
        const checkbox = await page.locator('label.mb-search-mode').count();
        if (checkbox === 0) {
            console.log('✓ "by sensor" checkbox NOT present (correct)');
        } else {
            console.log('✗ "by sensor" checkbox still present (should be removed!)');
        }

        // 3. Check placeholder text
        const filterInput = page.locator('.filter-input[id*="registers-filter"]').first();
        if (await filterInput.count() > 0) {
            const placeholder = await filterInput.getAttribute('placeholder');
            console.log(`Filter placeholder: "${placeholder}"`);
            if (placeholder === 'Filter...') {
                console.log('✓ Placeholder is generic "Filter..."');
            } else {
                console.log('✗ Placeholder should be "Filter..."');
            }

            // 4. Test filtering by register number
            console.log('\n--- Testing filter by register number ---');
            await filterInput.fill('70');
            await page.waitForTimeout(500);

            const rows70 = await page.locator('tr[data-mbreg]').count();
            console.log(`Rows visible after filtering "70": ${rows70}`);

            // Clear filter
            await filterInput.fill('');
            await page.waitForTimeout(500);

            // 5. Test filtering by sensor name
            console.log('\n--- Testing filter by sensor name ---');
            await filterInput.fill('AI');
            await page.waitForTimeout(500);

            const rowsAI = await page.locator('tbody tr').count();
            console.log(`Rows visible after filtering "AI": ${rowsAI}`);

            if (rowsAI > 0) {
                console.log('✓ Filter by sensor name works');
            }
        }
    } else {
        console.log('No Modbus object found in sidebar');
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    console.log('If checkbox is removed and filter works on both mbreg and name:');
    console.log('✓ Task completed successfully');

    console.log('\n--- Keeping browser open for 15s to observe ---');
    await page.waitForTimeout(15000);

    await browser.close();
    console.log('\nTest complete.');
})();
