import { test, expect } from '@playwright/test';

// Helper: open System Overview tab from sidebar for the first server.
async function openSystemOverview(page) {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const overviewItem = page.locator('.sidebar-group-item[data-type="overview"]').first();
    await expect(overviewItem).toBeVisible({ timeout: 10000 });

    const overviewResponse = page.waitForResponse(
        resp => resp.url().includes('/api/servers/') && resp.url().includes('/overview'),
        { timeout: 15000 }
    );

    await overviewItem.click();
    await overviewResponse;
    await page.waitForTimeout(1000);
}

test('FB Status panel shows nodes and filters by name', async ({ page }) => {
    await openSystemOverview(page);

    const serverId = await page.evaluate(() =>
        Object.keys((window as any).overviewInstances)[0]
    );
    expect(serverId).toBeTruthy();

    const panel = page.locator('.fb-status-panel');
    await expect(panel).toBeVisible();

    // Ensure the list has been rendered (nodes populated from mock server).
    const initialCount = await panel.locator('.fb-card').count();
    expect(initialCount).toBeGreaterThan(0);

    const search = page.locator(`#fb-status-search-${serverId}`);
    await search.fill('nonexistent-xyz');
    await expect(panel.locator('.fb-empty')).toBeVisible();

    await search.fill('');
    const restored = await panel.locator('.fb-card').count();
    expect(restored).toBe(initialCount);
});

test('FB Status card click highlights node on canvas', async ({ page }) => {
    await openSystemOverview(page);

    const serverId = await page.evaluate(() =>
        Object.keys((window as any).overviewInstances)[0]
    );
    expect(serverId).toBeTruthy();

    const firstCard = page.locator('.fb-status-panel .fb-card').first();
    await firstCard.click();

    const active = await page.evaluate(
        sid => (window as any).overviewInstances[sid]._hiActive,
        serverId
    );
    expect(active).toBe(true);
});
