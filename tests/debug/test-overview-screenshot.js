const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  const baseUrl = process.env.BASE_URL || 'http://localhost:8000';
  console.log('Opening', baseUrl);

  await page.goto(baseUrl);
  await page.waitForTimeout(3000);

  // Click the overview sidebar item
  const overviewItem = page.locator('.sidebar-group-item[data-type="overview"]').first();
  await overviewItem.waitFor({ state: 'visible', timeout: 10000 });
  console.log('Overview item found in sidebar');

  // Intercept API response
  const overviewResponse = page.waitForResponse(
    resp => resp.url().includes('/overview'),
    { timeout: 15000 }
  );

  await overviewItem.click();
  const resp = await overviewResponse;
  const data = await resp.json();
  console.log(`Nodes: ${data.nodes.map(n => n.name).join(', ')}`);
  console.log(`Edges: ${data.edges.map(e => `${e.fromNode}->${e.toNode} (${e.fromPort})`).join(', ')}`);

  await page.waitForTimeout(2000);

  // Check graph nodes
  const info = await page.evaluate(() => {
    const keys = Object.keys(window.overviewInstances || {});
    if (keys.length === 0) return { error: 'no instances' };
    const instance = window.overviewInstances[keys[0]];
    if (!instance || !instance.graph) return { error: 'no graph' };
    const nodes = instance.graph._nodes || [];
    return {
      nodeCount: nodes.length,
      nodeTitles: nodes.map(n => n.title),
      canvasSize: instance.canvas ? { w: instance.canvas.canvas.width, h: instance.canvas.canvas.height } : null
    };
  });
  console.log('Graph info:', JSON.stringify(info, null, 2));

  await page.screenshot({ path: '/app/tests/debug/system-overview-final.png', fullPage: false });
  console.log('Screenshot saved to tests/debug/system-overview-final.png');

  await browser.close();
})();
