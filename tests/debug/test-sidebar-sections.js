const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  console.log('Loading page...');
  await page.goto('http://localhost:8000');
  await page.waitForTimeout(2000);

  // Take screenshot of the sidebar
  await page.screenshot({ path: 'tests/debug/sidebar-sections.png', fullPage: false });
  console.log('Screenshot saved to tests/debug/sidebar-sections.png');

  // Check all sections have the expected structure
  const sections = [
    { name: 'Objects', selector: '#objects-section', header: '#objects-section-header', count: '#objects-count' },
    { name: 'Dashboards', selector: '.dashboards-section', header: '.dashboards-section-header', count: '.dashboards-count' },
    { name: 'Journals', selector: '#journals-section', header: '#journals-section-header', count: '#journals-count' },
    { name: 'Servers', selector: '#servers-section', header: '#servers-section-header', count: '#servers-count' }
  ];

  console.log('\nChecking sidebar sections:');
  for (const section of sections) {
    const sectionEl = page.locator(section.selector);
    const headerEl = page.locator(section.header);
    const countEl = page.locator(section.count);

    const sectionVisible = await sectionEl.isVisible().catch(() => false);
    const headerVisible = await headerEl.isVisible().catch(() => false);
    const countText = await countEl.textContent().catch(() => 'N/A');

    console.log(`\n${section.name}:`);
    console.log(`  Section visible: ${sectionVisible}`);
    console.log(`  Header visible: ${headerVisible}`);
    console.log(`  Count: ${countText}`);

    if (headerVisible) {
      // Check if header has collapse icon
      const collapseIcon = headerEl.locator('.collapse-icon');
      const hasIcon = await collapseIcon.isVisible().catch(() => false);
      console.log(`  Has collapse icon: ${hasIcon}`);

      // Get the title text
      const title = await headerEl.textContent().catch(() => 'N/A');
      console.log(`  Title: ${title.replace(/\s+/g, ' ').trim()}`);
    }
  }

  // Test collapsing sections
  console.log('\n\nTesting section collapse:');

  // Try clicking Objects header
  const objectsHeader = page.locator('#objects-section-header');
  if (await objectsHeader.isVisible()) {
    console.log('Clicking Objects header...');
    await objectsHeader.click();
    await page.waitForTimeout(500);
    const collapsed = await page.locator('#objects-section.collapsed').isVisible().catch(() => false);
    console.log(`Objects section collapsed: ${collapsed}`);

    // Take another screenshot
    await page.screenshot({ path: 'tests/debug/sidebar-collapsed.png', fullPage: false });
    console.log('Screenshot saved to tests/debug/sidebar-collapsed.png');

    // Click again to expand
    await objectsHeader.click();
    await page.waitForTimeout(500);
  }

  console.log('\n\nDone. Press Ctrl+C to close browser.');
  await page.waitForTimeout(60000);
  await browser.close();
})();
