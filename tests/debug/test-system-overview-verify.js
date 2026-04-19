const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  await page.goto('http://localhost:8000');
  await page.waitForTimeout(3000);

  // Click the overview sidebar item
  const overviewItem = page.locator('.sidebar-group-item[data-type="overview"]').first();
  await overviewItem.waitFor({ state: 'visible', timeout: 10000 });

  // Intercept API response
  const overviewResponse = page.waitForResponse(
    resp => resp.url().includes('/overview'),
    { timeout: 15000 }
  );

  await overviewItem.click();
  const resp = await overviewResponse;
  const data = await resp.json();
  console.log('Overview API response:', JSON.stringify(data, null, 2));

  await page.waitForTimeout(2000);

  // Check graph nodes via JS
  const nodeCount = await page.evaluate(() => {
    const keys = Object.keys(window.overviewInstances || {});
    if (keys.length === 0) return 0;
    const instance = window.overviewInstances[keys[0]];
    if (!instance || !instance.graph) return 0;
    const nodes = instance.graph._nodes || [];
    console.log('Nodes:', nodes.map(n => n.title));
    return nodes.length;
  });
  console.log('Graph node count:', nodeCount);

  await page.screenshot({ path: '/app/tests/debug/system-overview-verify.png', fullPage: false });
  console.log('Screenshot saved');

  await browser.close();
})();
