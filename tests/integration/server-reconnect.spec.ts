import { test, expect, request as apiRequest } from '@playwright/test';

// URL мок-сервера (доступен из e2e контейнера через Docker-сеть)
const MOCK_URL = 'http://mock-uniset:9393';

// Запускаем тесты последовательно — они меняют глобальное состояние mock-сервера
test.describe.configure({ mode: 'serial' });

// Вспомогательная функция: вызвать control endpoint мок-сервера
async function mockDisconnect() {
  const ctx = await apiRequest.newContext();
  const resp = await ctx.get(`${MOCK_URL}/api/mock/disconnect`);
  expect(resp.ok()).toBeTruthy();
  await ctx.dispose();
}

async function mockReconnect() {
  const ctx = await apiRequest.newContext();
  const resp = await ctx.get(`${MOCK_URL}/api/mock/reconnect`);
  expect(resp.ok()).toBeTruthy();
  await ctx.dispose();
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test.describe('Server Disconnect/Reconnect', () => {
  // Гарантируем нормальное состояние мок-сервера до и после каждого теста
  test.beforeEach(async () => {
    await mockReconnect();
    // Даём backend время обнаружить восстановление (poll interval = 1s)
    await sleep(2000);
  });

  test.afterEach(async () => {
    await mockReconnect();
  });

  test('sidebar должен показать disconnect и автоматически восстановиться при reconnect', async ({ page }) => {
    // 1. Загружаем страницу, ждём появления списка объектов
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 15000 });

    // 2. Сервер изначально подключён (зелёная точка — нет класса .disconnected)
    const serverDot = page.locator('.server-group-header .server-status-dot').first();
    await expect(serverDot).toBeVisible({ timeout: 10000 });
    await expect(serverDot).not.toHaveClass(/disconnected/, { timeout: 5000 });

    // 3. Имитируем падение сервера
    await mockDisconnect();

    // 4. Ждём, пока backend health check обнаружит сбой и обновит sidebar через SSE
    // Backend poll interval = 1s (default), через ~5с статус должен измениться
    await expect(serverDot).toHaveClass(/disconnected/, { timeout: 10000 });

    // 5. Имитируем восстановление сервера
    await mockReconnect();

    // 6. Ждём автоматического восстановления sidebar БЕЗ ручного refresh
    await expect(serverDot).not.toHaveClass(/disconnected/, { timeout: 15000 });
  });

  test('секция Servers должна отражать disconnect/reconnect', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#objects-list li', { timeout: 15000 });

    // Точка статуса сервера в секции Servers
    const serverItemDot = page.locator('.server-item .server-status-dot').first();
    await expect(serverItemDot).toBeVisible({ timeout: 10000 });
    await expect(serverItemDot).not.toHaveClass(/disconnected/, { timeout: 5000 });

    // Disconnect
    await mockDisconnect();

    // Сервер должен показать disconnected
    await expect(serverItemDot).toHaveClass(/disconnected/, { timeout: 10000 });

    // Reconnect
    await mockReconnect();

    // Сервер должен автоматически восстановиться
    await expect(serverItemDot).not.toHaveClass(/disconnected/, { timeout: 15000 });
  });
});
