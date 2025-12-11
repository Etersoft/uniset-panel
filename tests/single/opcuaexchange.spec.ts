import { test, expect } from '@playwright/test';

const OPCUA_OBJECT = 'OPCUAClient1';

test.describe('OPCUAExchange renderer', () => {
  test.beforeEach(async ({ page }) => {
    // Ускоряем автообновление статуса в тестах
    await page.addInitScript(({ name }) => {
      try {
        const saved = JSON.parse(localStorage.getItem('uniset2-viewer-opcua-status-interval') || '{}');
        saved[name] = 1000;
        localStorage.setItem('uniset2-viewer-opcua-status-interval', JSON.stringify(saved));
      } catch (err) {
        console.warn('failed to init status interval', err);
      }
    }, { name: OPCUA_OBJECT });
  });

  test('shows OPCUA sections and disables control when not allowed', async ({ page }) => {
    await page.goto('/');

    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: OPCUA_OBJECT }).click();

    const panel = page.locator('.tab-panel.active');
    await panel.waitFor({ timeout: 10000 });

    await expect(panel.locator('.collapsible-title', { hasText: 'Статус OPC UA' })).toBeVisible();
    await expect(panel.locator('.collapsible-title', { hasText: 'HTTP-контроль' })).toBeVisible();
    await expect(panel.locator('.collapsible-title', { hasText: 'Параметры обмена' })).toBeVisible();
    await expect(panel.locator('.collapsible-title', { hasText: /Датчики|Сенсоры OPC UA/ })).toBeVisible();
    await expect(panel.locator('.collapsible-title', { hasText: 'Диагностика' })).toBeVisible();

    const takeBtn = panel.locator(`#opcua-control-take-${OPCUA_OBJECT}`);
    const releaseBtn = panel.locator(`#opcua-control-release-${OPCUA_OBJECT}`);
    await expect(takeBtn).toBeDisabled();
    await expect(releaseBtn).toBeDisabled();
    await expect(panel.locator('.opcua-flag-row', { hasText: 'Разрешён контроль:' })).toContainText('Нет');

    await expect(panel.locator(`#opcua-status-autorefresh-${OPCUA_OBJECT}`)).toBeVisible();
    await expect(panel.locator('.opcua-interval-btn[data-ms="5000"]')).toBeVisible();

    await expect(panel.locator(`#opcua-params-${OPCUA_OBJECT} tr`)).not.toHaveCount(0);
    await expect(panel.locator(`#opcua-sensors-${OPCUA_OBJECT} tr`)).not.toHaveCount(0);
    await expect(panel.locator(`#opcua-diagnostics-${OPCUA_OBJECT}`)).toBeVisible();
  });

  test('auto-refreshes status with configured interval', async ({ page }) => {
    let statusHits = 0;
    page.on('response', (response) => {
      if (response.url().includes('/opcua/status')) {
        statusHits += 1;
      }
    });

    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 10000 });
    await page.locator('#objects-list li', { hasText: OPCUA_OBJECT }).click();

    const panel = page.locator('.tab-panel.active');
    await panel.waitFor({ timeout: 10000 });

    // Дождаться первого запроса статуса
    await page.waitForResponse((resp) => resp.url().includes('/opcua/status'));
    const startHits = statusHits;

    // Ждём, чтобы автообновление сработало хотя бы один раз
    await page.waitForTimeout(2200);
    expect(statusHits).toBeGreaterThan(startHits);

    // Переключаем интервал и проверяем, что активность обновляется визуально
    const btn10s = panel.locator('.opcua-interval-btn', { hasText: '10с' });
    await btn10s.click();
    await expect(btn10s).toHaveClass(/active/);
  });
});
