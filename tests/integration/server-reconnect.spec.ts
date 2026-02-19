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

  test('sidebar должен показать disconnect на объектах и восстановиться при reconnect', async ({ page }) => {
    // 1. Загружаем страницу, ждём появления списка объектов
    await page.goto('/');
    await page.waitForSelector('.sidebar-group-item[data-type="object"]', { timeout: 15000 });

    // 2. Объекты изначально подключены (зелёная точка — нет класса .disconnected)
    const objectDot = page.locator('.sidebar-group-item[data-type="object"] .sidebar-group-status').first();
    await expect(objectDot).toBeVisible({ timeout: 10000 });
    await expect(objectDot).not.toHaveClass(/disconnected/, { timeout: 5000 });

    // 3. Имитируем падение сервера
    await mockDisconnect();

    // 4. Ждём, пока backend health check обнаружит сбой и обновит sidebar через SSE
    await expect(objectDot).toHaveClass(/disconnected/, { timeout: 10000 });

    // 5. Имитируем восстановление сервера
    await mockReconnect();

    // 6. Ждём автоматического восстановления sidebar БЕЗ ручного refresh
    await expect(objectDot).not.toHaveClass(/disconnected/, { timeout: 15000 });
  });

  test('статус объектов в sidebar должен отражать disconnect/reconnect сервера', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.sidebar-group-item[data-type="object"]', { timeout: 15000 });

    // Точка статуса объекта в sidebar
    const objectDot = page.locator('.sidebar-group-item[data-type="object"] .sidebar-group-status').first();
    await expect(objectDot).toBeVisible({ timeout: 10000 });
    await expect(objectDot).not.toHaveClass(/disconnected/, { timeout: 5000 });

    // Disconnect
    await mockDisconnect();

    // Объекты должны показать disconnected
    await expect(objectDot).toHaveClass(/disconnected/, { timeout: 10000 });

    // Reconnect
    await mockReconnect();

    // Объекты должны автоматически восстановиться
    await expect(objectDot).not.toHaveClass(/disconnected/, { timeout: 15000 });
  });
});
