const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    // Disable cache
    bypassCSP: true
  });
  const page = await context.newPage();

  // Clear cache
  await page.goto('about:blank');

  console.log('Loading page with fresh cache...');
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Scroll sidebar to show all sections
  await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar-content');
    if (sidebar) sidebar.scrollTop = 0;
  });

  // Take screenshot of the sidebar only
  const sidebar = page.locator('.sidebar-content');
  await sidebar.screenshot({ path: 'debug/sidebar-final.png' });
  console.log('Screenshot saved to debug/sidebar-final.png');

  // Also take full page screenshot
  await page.screenshot({ path: 'debug/full-page-final.png', fullPage: false });
  console.log('Full page screenshot saved to debug/full-page-final.png');

  console.log('\nDone!');
  await page.waitForTimeout(5000);
  await browser.close();
})();
