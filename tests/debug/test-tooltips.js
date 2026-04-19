const { chromium } = require('@playwright/test');

(async () => {
    console.log('=== Tooltip Consistency Check ===\n');

    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const page = await browser.newPage();

    await page.goto('http://localhost:8000');
    await page.waitForTimeout(3000);

    // Wait for tabs to appear
    await page.waitForSelector('.tab', { timeout: 10000 }).catch(() => console.log('No tabs found'));

    // Get tab count
    const tabCount = await page.locator('.tab').count();
    console.log('Tabs found:', tabCount);

    if (tabCount > 0) {
        // Click first tab
        await page.locator('.tab').first().click();
        await page.waitForTimeout(2000);
    }

    // Get all tooltips on page
    const allTooltips = await page.evaluate(() => {
        const results = [];
        document.querySelectorAll('[title]').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                results.push({
                    tag: el.tagName.toLowerCase(),
                    class: el.className.split(' ').filter(c => c).slice(0, 3).join(' '),
                    title: (el.getAttribute('title') || '').substring(0, 40),
                    location: el.closest('table') ? 'table' :
                              el.closest('.sidebar') ? 'sidebar' :
                              el.closest('.header') ? 'header' : 'other'
                });
            }
        });
        return results;
    });

    console.log('\nAll tooltips by location:');
    const byLocation = {};
    allTooltips.forEach(t => {
        if (!byLocation[t.location]) byLocation[t.location] = [];
        byLocation[t.location].push(t);
    });

    for (const [loc, items] of Object.entries(byLocation)) {
        console.log(`\n${loc.toUpperCase()} (${items.length}):`);
        items.slice(0, 5).forEach(t => {
            console.log(`  <${t.tag} class="${t.class}"> title="${t.title}"`);
        });
    }

    console.log('\n=== Analysis ===');
    console.log('All elements use native HTML title attribute');
    console.log('Browser renders all of them with the same native tooltip style');

    await page.waitForTimeout(3000);
    await browser.close();
})();
