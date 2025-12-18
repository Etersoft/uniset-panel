const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Перехватываем все сетевые запросы
  page.on('request', request => {
    if (request.url().includes('subscribe')) {
      console.log('>> REQUEST:', request.method(), request.url());
      console.log('   POST data:', request.postData());
    }
  });

  page.on('response', async response => {
    if (response.url().includes('subscribe')) {
      console.log('<< RESPONSE:', response.status(), response.url());
      try {
        const body = await response.text();
        console.log('   Body:', body);
      } catch (e) {
        console.log('   (no body)');
      }
    }
  });

  // Перехватываем console.log из браузера
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('ModbusSlave') || text.includes('subscribe') || text.includes('SSE')) {
      console.log('BROWSER:', text);
    }
  });

  // Перехватываем ошибки
  page.on('pageerror', error => {
    console.error('PAGE ERROR:', error.message);
  });

  console.log('Opening http://localhost:8000...');
  await page.goto('http://localhost:8000');

  console.log('Waiting for objects list...');
  await page.waitForSelector('#objects-list li', { timeout: 15000 });

  console.log('Looking for MBSlave1...');
  const mbsItem = page.locator('#objects-list li', { hasText: 'MBSlave1' });
  await mbsItem.waitFor({ timeout: 10000 });

  console.log('Clicking MBSlave1...');
  await mbsItem.click();

  console.log('Waiting for tab to activate...');
  await page.waitForSelector('.tab-panel.active', { timeout: 10000 });

  console.log('Waiting 5 seconds to observe subscription...');
  await page.waitForTimeout(5000);

  console.log('\n=== FINAL STATE ===');

  // Проверяем что произошло
  const subscribedIds = await page.evaluate(() => {
    const tabs = window.state?.tabs;
    if (!tabs) return null;
    for (const [key, tabState] of tabs.entries()) {
      if (key.includes('MBSlave1') && tabState.renderer) {
        return {
          subscribedCount: tabState.renderer.subscribedSensorIds?.size || 0,
          allRegistersCount: tabState.renderer.allRegisters?.length || 0,
        };
      }
    }
    return null;
  });

  console.log('Renderer state:', subscribedIds);

  console.log('\nPress Ctrl+C to exit...');
  // Держим браузер открытым
  await page.waitForTimeout(60000);

  await browser.close();
})();
