const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();

    // Log all network requests
    page.on('request', req => {
        if (req.url().includes('/api/')) {
            console.log('>> REQUEST:', req.url());
        }
    });

    page.on('response', async res => {
        if (res.url().includes('/api/')) {
            console.log('<< RESPONSE:', res.status(), res.url());
            if (res.status() !== 200) {
                try {
                    const text = await res.text();
                    console.log('   Body:', text.substring(0, 200));
                } catch (e) {}
            }
        }
    });

    page.on('console', msg => {
        console.log('BROWSER:', msg.type(), msg.text());
    });

    console.log('Loading page...');
    await page.goto('http://localhost:8000');

    console.log('\nWaiting 5 seconds for page to load...');
    await page.waitForTimeout(5000);

    // Debug sidebar structure
    console.log('\n=== Sidebar Debug ===');

    const sidebar = await page.locator('#sidebar').innerHTML();
    console.log('Sidebar HTML (first 2000 chars):');
    console.log(sidebar.substring(0, 2000));

    // Check server groups
    const serverGroups = await page.locator('.server-group').count();
    console.log(`\nServer groups found: ${serverGroups}`);

    // Check each server group
    for (let i = 0; i < serverGroups; i++) {
        const group = page.locator('.server-group').nth(i);
        const header = await group.locator('.server-group-header').textContent();
        const objects = await group.locator('.object-item').allTextContents();
        const isExpanded = await group.locator('.server-group-content').getAttribute('class');
        console.log(`\nGroup ${i}: "${header.trim()}"`);
        console.log(`  Expanded: ${!isExpanded?.includes('collapsed')}`);
        console.log(`  Objects: ${objects.join(', ')}`);
    }

    console.log('\n--- Keeping browser open for 30s ---');
    await page.waitForTimeout(30000);

    await browser.close();
})();
